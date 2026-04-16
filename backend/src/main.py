import threading
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.db import init_schema
from src.routes import portfolio, holdings, accounts, debug, export, dividends, contributions, disposals, snapshots, watchlist

app = FastAPI(title="Investment Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.on_event("startup")
def startup():
    init_schema()
    threading.Thread(target=_warmup_caches, daemon=True).start()


app.include_router(portfolio.router)
app.include_router(holdings.router)
app.include_router(accounts.router)
app.include_router(debug.router)
app.include_router(export.router)
app.include_router(dividends.router)
app.include_router(contributions.router)
app.include_router(disposals.router)
app.include_router(snapshots.router)
app.include_router(watchlist.router)


@app.get("/health")
def health():
    return {"status": "ok"}
