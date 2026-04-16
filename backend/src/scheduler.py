import logging
import threading
import time
from datetime import date, datetime, timezone

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_LONDON = pytz.timezone("Europe/London")


def _wait_for_warmup(timeout: int = 60, poll_interval: float = 2.0) -> list:
    """Poll until all provider caches are populated. Returns list of still-loading account types."""
    from src.db import get_db
    from src.providers import t212, etoro

    deadline = time.monotonic() + timeout
    while True:
        loading = []
        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT account_type FROM accounts")
                    for row in cur.fetchall():
                        at = row["account_type"]
                        if at in ("t212", "t212_invest"):
                            acct = "invest" if at == "t212_invest" else "isa"
                            if t212.fetch_portfolio_cached(acct) is None:
                                loading.append(at)
                        elif at == "etoro":
                            if etoro.fetch_portfolio_cached() is None:
                                loading.append(at)
        except Exception as exc:
            logger.warning("Warmup check error: %s", exc)

        if not loading or time.monotonic() >= deadline:
            return loading
        time.sleep(poll_interval)


def _provider_error_within(minutes: int = 10) -> str | None:
    """Return first provider that had an error in the last N minutes, or None."""
    from src.providers.status import snapshot as pstatus
    now = datetime.now(timezone.utc)
    for provider_name, info in pstatus().items():
        err_ts = info.get("last_error_ts")
        if err_ts:
            last_err = datetime.fromisoformat(err_ts)
            if (now - last_err).total_seconds() < minutes * 60:
                return provider_name
    return None


def _last_snapshot_total() -> float | None:
    """Return most recent portfolio-level snapshot value, or None if no prior snapshot."""
    from src.db import get_db
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT value_gbp FROM portfolio_snapshots WHERE account_id IS NULL "
                    "ORDER BY snapshot_date DESC LIMIT 1"
                )
                row = cur.fetchone()
        return float(row["value_gbp"]) if row else None
    except Exception:
        return None


def _run_snapshot():
    """Fetch fresh portfolio data from all providers and record a snapshot."""
    logger.info("Running pre-market snapshot...")
    try:
        from src.providers import t212, etoro
        from src.providers.status import record_ok, record_err

        # Fetch providers; record errors if any
        try:
            t212.fetch_portfolio("isa")
            if t212._CREDS.get("invest", {}).get("api_key"):
                t212.fetch_portfolio("invest")
        except Exception as e:
            record_err("t212", str(e))
            logger.warning("T212 fetch failed during snapshot: %s", e)

        try:
            etoro.fetch_portfolio()
        except Exception as e:
            record_err("etoro", str(e))
            logger.warning("eToro fetch failed during snapshot: %s", e)

        # Guard: wait for warmup (up to 60s)
        still_loading = _wait_for_warmup(timeout=60, poll_interval=2)
        if still_loading:
            logger.warning("SKIP snapshot: accounts still loading after 60s: %s", still_loading)
            return

        # Guard: reject if any provider had an error within the last 10min
        bad_provider = _provider_error_within(minutes=10)
        if bad_provider:
            logger.warning(
                "SKIP snapshot: provider %s had an error in the last 10min", bad_provider
            )
            return

        # Compute proposed portfolio total
        from src.routes.portfolio import portfolio_summary
        summary = portfolio_summary()
        new_total = summary.total_value_gbp

        # Guard: reject if new total deviates >40% from last snapshot (skip check on first run)
        last_total = _last_snapshot_total()
        if last_total is not None and last_total > 0:
            deviation = abs(new_total - last_total) / last_total
            if deviation > 0.40:
                logger.warning(
                    "SKIP snapshot: proposed total %.2f deviates %.1f%% from last %.2f (>40%%)",
                    new_total, deviation * 100, last_total,
                )
                return

        # All guards passed — capture
        from src.routes.snapshots import _do_capture
        result = _do_capture(precomputed_summary=summary)
        logger.info("Snapshot complete: %s", result)

        # Record ok for each provider that contributed non-zero value
        contributing = set()
        for acc in summary.accounts:
            if acc.total_value_gbp and acc.total_value_gbp > 0:
                if acc.account_type in ("t212", "t212_invest"):
                    contributing.add("t212")
                elif acc.account_type == "etoro":
                    contributing.add("etoro")
        for provider in contributing:
            record_ok(provider)

    except Exception as e:
        logger.error("Snapshot job failed: %s", e)


def _today_snapshot_exists() -> bool:
    try:
        from src.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM portfolio_snapshots WHERE account_id IS NULL AND snapshot_date = %s",
                    (date.today(),),
                )
                return cur.fetchone() is not None
    except Exception:
        return False


def start_scheduler():
    scheduler = BackgroundScheduler(timezone=_LONDON)
    scheduler.add_job(
        _run_snapshot,
        CronTrigger(hour=7, minute=30, day_of_week="mon-fri", timezone=_LONDON),
        id="daily_pre_market_snapshot",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Snapshot scheduler started — 07:30 Europe/London Mon–Fri")

    # Catch-up: if today's pre-market has passed and no snapshot yet, run now
    now_london = datetime.now(_LONDON)
    cutoff = now_london.replace(hour=7, minute=30, second=0, microsecond=0)
    if now_london >= cutoff and not _today_snapshot_exists():
        logger.info("No snapshot for today yet (past 07:30 London) — running catch-up")
        threading.Thread(target=_run_snapshot, daemon=True).start()

    return scheduler
