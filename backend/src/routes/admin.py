import logging
import re
import time

import yfinance as yf
from fastapi import APIRouter

from src.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


def _normalize_ticker(ticker: str) -> str | None:
    """Convert DB-stored ticker to a yfinance-compatible symbol.

    T212 stores tickers like AAPL_US_EQ (US) or VUSA_EQ (London).
    DB lowercases on write, so we work case-insensitively.
    Returns None for ambiguous/unsupported formats (crypto, ISINs).
    """
    t = ticker.strip().lower()

    # Skip obviously non-equity formats
    if "-" in t or len(t) > 15:
        return None
    # Skip ISINs (2 letters + 10 alphanums)
    if re.match(r'^[a-z]{2}[a-z0-9]{10}$', t):
        return None

    # US equity: aapl_us_eq → AAPL
    m = re.match(r'^([a-z0-9]+)_us_eq$', t)
    if m:
        return m.group(1).upper()

    # London equity: vusa_eq → VUSA.L (also catches sgbxl_eq → SGBXL.L)
    m = re.match(r'^([a-z0-9]+)_eq$', t)
    if m:
        return m.group(1).upper() + ".L"

    # Already looks like a yfinance symbol (letters/numbers/dots only)
    if re.match(r'^[a-z0-9.]+$', t):
        return t.upper()

    return None


def _fetch_name(yf_ticker: str) -> str | None:
    """Fetch longName or shortName from yfinance, with one retry."""
    for attempt in range(2):
        try:
            info = yf.Ticker(yf_ticker).info
            name = info.get("longName") or info.get("shortName")
            if name:
                return name
        except Exception:
            if attempt == 0:
                time.sleep(0.5)
    return None


@router.post("/backfill-names")
def backfill_names():
    """Scan holdings and watchlist for empty display_name and fill via yfinance."""
    holdings_filled = 0
    watchlist_filled = 0
    failed = []

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ticker FROM holdings WHERE display_name IS NULL OR display_name = ''"
            )
            holdings_rows = list(cur.fetchall())

            cur.execute(
                "SELECT id, ticker FROM watchlist WHERE display_name IS NULL OR display_name = ''"
            )
            watchlist_rows = list(cur.fetchall())

        logger.info(
            "backfill-names: %d holdings, %d watchlist rows need names",
            len(holdings_rows),
            len(watchlist_rows),
        )

        with conn.cursor() as cur:
            for row in holdings_rows:
                ticker = row["ticker"]
                yf_sym = _normalize_ticker(ticker)
                if not yf_sym:
                    failed.append({"ticker": ticker, "error": "unsupported format"})
                    continue

                name = _fetch_name(yf_sym)
                time.sleep(0.1)

                if name:
                    cur.execute(
                        "UPDATE holdings SET display_name = %s WHERE id = %s",
                        (name, row["id"]),
                    )
                    logger.info("holdings %s → %s", ticker, name)
                    holdings_filled += 1
                else:
                    failed.append({"ticker": ticker, "error": f"yfinance returned no name for {yf_sym}"})

            for row in watchlist_rows:
                ticker = row["ticker"]
                yf_sym = _normalize_ticker(ticker)
                if not yf_sym:
                    failed.append({"ticker": ticker, "error": "unsupported format"})
                    continue

                name = _fetch_name(yf_sym)
                time.sleep(0.1)

                if name:
                    cur.execute(
                        "UPDATE watchlist SET display_name = %s WHERE id = %s",
                        (name, row["id"]),
                    )
                    logger.info("watchlist %s → %s", ticker, name)
                    watchlist_filled += 1
                else:
                    failed.append({"ticker": ticker, "error": f"yfinance returned no name for {yf_sym}"})

    return {
        "holdings_filled": holdings_filled,
        "watchlist_filled": watchlist_filled,
        "failed": failed,
    }
