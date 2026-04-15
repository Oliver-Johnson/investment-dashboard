import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.db import init_schema
from src.routes import portfolio, holdings, accounts, debug

app = FastAPI(title="Investment Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _warmup_caches():
    """Pre-warm T212 metadata and eToro instrument names in the background."""
    try:
        from src.providers import t212, etoro
        t212._instrument_metadata()
    except Exception:
        pass
    try:
        from src.providers import etoro
        etoro._all_instrument_names()
    except Exception:
        pass
    try:
        etoro.fetch_portfolio()
    except Exception:
        pass
    try:
        t212.fetch_portfolio()
    except Exception:
        pass


@app.on_event("startup")
def startup():
    init_schema()
    # Pre-warm API caches in background so first user request is fast
    threading.Thread(target=_warmup_caches, daemon=True).start()


app.include_router(portfolio.router)
app.include_router(holdings.router)
app.include_router(accounts.router)
app.include_router(debug.router)


@app.get("/health")
def health():
    return {"status": "ok"}
