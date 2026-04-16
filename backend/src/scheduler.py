import logging
import threading
from datetime import date, datetime

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_LONDON = pytz.timezone("Europe/London")


def _run_snapshot():
    """Fetch fresh portfolio data from all providers and record a snapshot."""
    logger.info("Running pre-market snapshot...")
    try:
        try:
            from src.providers import t212
            t212.fetch_portfolio("isa")
            if t212._CREDS.get("invest", {}).get("api_key"):
                t212.fetch_portfolio("invest")
        except Exception as e:
            logger.warning("T212 fetch failed during snapshot: %s", e)

        try:
            from src.providers import etoro
            etoro.fetch_portfolio()
        except Exception as e:
            logger.warning("eToro fetch failed during snapshot: %s", e)

        from src.routes.snapshots import _do_capture
        result = _do_capture()
        logger.info("Snapshot complete: %s", result)
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
