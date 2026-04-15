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


@app.on_event("startup")
def startup():
    init_schema()


app.include_router(portfolio.router)
app.include_router(holdings.router)
app.include_router(accounts.router)
app.include_router(debug.router)


@app.get("/health")
def health():
    return {"status": "ok"}
