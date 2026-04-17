import time
from fastapi import APIRouter, HTTPException
import yfinance as yf

router = APIRouter(prefix="/api/ticker", tags=["ticker"])

_cache: dict = {}
_CACHE_TTL = 3600

_RANGE_MAP = {
    "1m": "1mo",
    "3m": "3mo",
    "6m": "6mo",
    "1y": "1y",
    "all": "max",
}


@router.get("/{symbol}/history")
def get_ticker_history(symbol: str, range: str = "1m"):
    if range not in _RANGE_MAP:
        raise HTTPException(status_code=400, detail=f"Invalid range. Use: {', '.join(_RANGE_MAP)}")

    sym = symbol.upper()
    key = f"{sym}:{range}"
    now = time.time()

    if key in _cache and now - _cache[key]["ts"] < _CACHE_TTL:
        return _cache[key]["data"]

    try:
        hist = yf.Ticker(sym).history(period=_RANGE_MAP[range])
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data found for: {sym}")

        data = [
            {"date": str(idx.date()), "close": round(float(row["Close"]), 4)}
            for idx, row in hist.iterrows()
        ]
        result = {"symbol": sym, "range": range, "data": data}
        _cache[key] = {"ts": now, "data": result}
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {e}")
