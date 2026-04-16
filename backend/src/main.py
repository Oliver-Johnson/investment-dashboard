import os
import threading
from concurrent.futures import ThreadPoolExecutor
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.auth import require_token
from src.db import init_schema
from src.routes import portfolio, holdings, accounts, debug, export, dividends, contributions, disposals, snapshots, watchlist, notes, health, admin
from src.scheduler import start_scheduler

app = FastAPI(title="Investment Dashboard API")

_default_origins = "http://192.168.1.232:3000,http://localhost:3000,http://localhost:5173"
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _warmup_caches():
    """Pre-warm T212 and eToro caches concurrently so first request is fast."""
    def warm_t212():
        try:
            from src.providers import t212
            t212._instrument_metadata("isa")
            t212.fetch_portfolio("isa")
        except Exception:
            pass
        try:
            from src.providers import t212
            if t212._CREDS["invest"]["api_key"]:
                t212._instrument_metadata("invest")
                t212.fetch_portfolio("invest")
        except Exception:
            pass

    def warm_etoro():
        try:
            from src.providers import etoro
            etoro._all_instrument_names()
            etoro.fetch_portfolio()
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=2) as ex:
        ex.submit(warm_t212)
        ex.submit(warm_etoro)


def _startup_backfill():
    try:
        from src.services.name_backfill import backfill_empty_names
        result = backfill_empty_names()
        import logging
        logging.getLogger(__name__).info("Startup backfill complete: %s", result)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Startup backfill failed: %s", exc)


@app.on_event("startup")
def startup():
    init_schema()
    threading.Thread(target=_warmup_caches, daemon=True).start()
    threading.Thread(target=_startup_backfill, daemon=True).start()
    start_scheduler()


_auth = [Depends(require_token)]

app.include_router(health.router)
app.include_router(portfolio.router, dependencies=_auth)
app.include_router(holdings.router, dependencies=_auth)
app.include_router(accounts.router, dependencies=_auth)
app.include_router(debug.router, dependencies=_auth)
app.include_router(export.router, dependencies=_auth)
app.include_router(dividends.router, dependencies=_auth)
app.include_router(contributions.router, dependencies=_auth)
app.include_router(disposals.router, dependencies=_auth)
app.include_router(snapshots.router, dependencies=_auth)
app.include_router(watchlist.router, dependencies=_auth)
app.include_router(notes.router, dependencies=_auth)
app.include_router(admin.router, dependencies=_auth)
