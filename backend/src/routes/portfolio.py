from datetime import datetime
from fastapi import APIRouter
from src.db import get_db
from src.models import AccountSummary, HoldingWithPrice, PortfolioSummary
from src.providers import t212, etoro
from src.providers.yfinance_client import get_price_gbp

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


def get_freshness(last_update: datetime) -> str:
    days = (datetime.utcnow() - last_update.replace(tzinfo=None)).days
    if days <= 14:
        return "green"
    if days <= 30:
        return "amber"
    return "red"


FRESHNESS_ORDER = {"red": 0, "amber": 1, "green": 2}


def worst_freshness(values: list[str]) -> str:
    if not values:
        return "red"
    return min(values, key=lambda f: FRESHNESS_ORDER.get(f, 0))


def holding_with_price_from_row(row: dict) -> HoldingWithPrice:
    unit_count = float(row["unit_count"])
    price_gbp = None
    value_gbp = None
    if unit_count > 0:
        try:
            price_gbp = get_price_gbp(row["ticker"])
            value_gbp = unit_count * price_gbp
        except Exception:
            pass
    freshness = get_freshness(row["last_holding_update"])
    return HoldingWithPrice(
        id=row["id"],
        account_id=row["account_id"],
        ticker=row["ticker"],
        display_name=row.get("display_name"),
        unit_count=unit_count,
        currency=row.get("currency", "GBP"),
        price_gbp=price_gbp,
        value_gbp=value_gbp,
        last_holding_update=row["last_holding_update"],
        freshness=freshness,
    )


@router.get("/summary", response_model=PortfolioSummary)
def portfolio_summary():
    now = datetime.utcnow()
    account_summaries: list[AccountSummary] = []
    total_value = 0.0

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM accounts ORDER BY created_at")
            accounts = [dict(r) for r in cur.fetchall()]

            for account in accounts:
                account_id = account["id"]
                account_type = account["account_type"]

                # Fetch DB holdings for this account
                cur.execute(
                    "SELECT * FROM holdings WHERE account_id = %s ORDER BY ticker",
                    (account_id,),
                )
                db_holdings = [dict(r) for r in cur.fetchall()]

                holdings_out: list[HoldingWithPrice] = []

                if account_type == "t212":
                    # Get live positions from T212
                    t212_tickers: set[str] = set()
                    try:
                        t212_positions = t212.fetch_portfolio()
                    except Exception:
                        t212_positions = []

                    for pos in t212_positions:
                        t212_tickers.add(pos["ticker"])
                        holdings_out.append(HoldingWithPrice(
                            id=0,  # T212 positions don't have a DB id
                            account_id=account_id,
                            ticker=pos["ticker"],
                            display_name=pos.get("display_name"),
                            unit_count=float(pos.get("quantity", 0)),
                            currency=pos.get("currency", "GBP"),
                            price_gbp=float(pos["current_price_gbp"]) if pos.get("current_price_gbp") else None,
                            value_gbp=float(pos["market_value_gbp"]) if pos.get("market_value_gbp") else None,
                            last_holding_update=now,
                            freshness="green",
                        ))

                    # Also include any DB holdings not covered by T212 (manual additions)
                    for row in db_holdings:
                        if row["ticker"] not in t212_tickers:
                            holdings_out.append(holding_with_price_from_row(row))

                elif account_type == "etoro":
                    # Get live positions from eToro API
                    etoro_tickers: set[str] = set()
                    try:
                        etoro_positions = etoro.fetch_portfolio()
                    except Exception:
                        etoro_positions = []

                    for pos in etoro_positions:
                        etoro_tickers.add(pos["ticker"])
                        holdings_out.append(HoldingWithPrice(
                            id=0,  # eToro positions don't have a DB id
                            account_id=account_id,
                            ticker=pos["ticker"],
                            display_name=pos.get("display_name"),
                            unit_count=float(pos.get("quantity", 0)),
                            currency=pos.get("currency", "USD"),
                            price_gbp=float(pos["current_price_gbp"]) if pos.get("current_price_gbp") else None,
                            value_gbp=float(pos["market_value_gbp"]) if pos.get("market_value_gbp") else None,
                            last_holding_update=now,
                            freshness="green",
                        ))

                    # Also include any DB holdings not covered by eToro (manual additions)
                    for row in db_holdings:
                        if row["ticker"] not in etoro_tickers:
                            holdings_out.append(holding_with_price_from_row(row))

                else:
                    # manual: use DB holdings + yfinance prices
                    for row in db_holdings:
                        holdings_out.append(holding_with_price_from_row(row))

                account_total = sum(h.value_gbp or 0.0 for h in holdings_out)
                total_value += account_total

                # Freshness only meaningful for manual accounts (API accounts are always live)
                freshness_vals = [h.freshness for h in holdings_out] if account_type == "manual" else []
                account_freshness = worst_freshness(freshness_vals) if freshness_vals else None

                last_updated = now
                if db_holdings:
                    last_updated = max(
                        r["last_holding_update"] for r in db_holdings
                    )

                account_summaries.append(AccountSummary(
                    id=account_id,
                    name=account["name"],
                    account_type=account_type,
                    colour=account["colour"],
                    total_value_gbp=account_total,
                    holdings=holdings_out,
                    freshness=account_freshness,
                    last_updated=last_updated,
                ))

    return PortfolioSummary(
        total_value_gbp=total_value,
        accounts=account_summaries,
    )
