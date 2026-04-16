import logging

from fastapi import APIRouter

from src.services.name_backfill import backfill_empty_names

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/backfill-names")
def backfill_names():
    """Scan holdings and watchlist for empty display_name and fill via yfinance."""
    return backfill_empty_names()
