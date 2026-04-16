from datetime import datetime, timezone
from fastapi import APIRouter
from src.db import get_db
from src.models import AccountSummary, HoldingWithPrice, PortfolioSummary
from src.providers import t212, etoro
from src.providers.yfinance_client import get_price_gbp

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


def get_freshness(last_update: datetime) -> str:
    now = datetime.now(timezone.utc)
    if last_update.tzinfo is None:
        last_update = last_update.replace(tzinfo=timezone.utc)
    delta = now - last_update
    hours = delta.total_seconds() / 3600
    if hours <= 14 * 24:
        return "green"
    if hours <= 30 * 24:
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
        if row.get("manual_price_gbp"):
            price_gbp = float(row["manual_price_gbp"])
            value_gbp = unit_count * price_gbp
        else:
            try:
                price_gbp = get_price_gbp(row["ticker"])
                value_gbp = unit_count * price_gbp
            except Exception:
                pass
    freshness = get_freshness(row["last_holding_update"])
    avg_cost_gbp = float(row["avg_cost_gbp"]) if row.get("avg_cost_gbp") else None
    gain_loss_gbp = None
    gain_loss_pct = None
    if avg_cost_gbp and price_gbp and unit_count > 0:
        cost_basis = avg_cost_gbp * unit_count
        gain_loss_gbp = (price_gbp - avg_cost_gbp) * unit_count
        gain_loss_pct = (gain_loss_gbp / cost_basis) * 100 if cost_basis else None
    return HoldingWithPrice(
        id=row["id"],
        account_id=row["account_id"],
        ticker=row["ticker"],
        display_name=row.get("display_name"),
        unit_count=unit_count,
        currency=row.get("currency", "GBP"),
        price_gbp=price_gbp,
        value_gbp=value_gbp,
        avg_cost_gbp=avg_cost_gbp,
        gain_loss_gbp=gain_loss_gbp,
        gain_loss_pct=gain_loss_pct,
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

                is_loading = False

                if account_type in ("t212", "t212_invest"):
                    t212_account = "invest" if account_type == "t212_invest" else "isa"
                    t212_tickers: set[str] = set()
                    t212_positions = t212.fetch_portfolio_cached(t212_account)
                    if t212_positions is None:
                        is_loading = True
                        t212_positions = []

                    for pos in t212_positions:
                        t212_tickers.add(pos["ticker"])
                        price_gbp = float(pos["current_price_gbp"]) if pos.get("current_price_gbp") else None
                        unit_count = float(pos.get("quantity", 0))
                        avg_cost_gbp = float(pos["avg_price"]) if pos.get("avg_price") else None
                        gain_loss_gbp = None
                        gain_loss_pct = None
                        if avg_cost_gbp and price_gbp and unit_count > 0:
                            cost_basis = avg_cost_gbp * unit_count
                            gain_loss_gbp = (price_gbp - avg_cost_gbp) * unit_count
                            gain_loss_pct = (gain_loss_gbp / cost_basis) * 100 if cost_basis else None
                        holdings_out.append(HoldingWithPrice(
                            id=0,  # T212 positions don't have a DB id
                            account_id=account_id,
                            ticker=pos["ticker"],
                            display_name=pos.get("display_name"),
                            unit_count=unit_count,
                            currency=pos.get("currency", "GBP"),
                            price_gbp=price_gbp,
                            value_gbp=float(pos["market_value_gbp"]) if pos.get("market_value_gbp") else None,
                            avg_cost_gbp=avg_cost_gbp,
                            gain_loss_gbp=gain_loss_gbp,
                            gain_loss_pct=gain_loss_pct,
                            last_holding_update=now,
                            freshness="green",
                        ))

                    # Also include any DB holdings not covered by T212 (manual additions)
                    for row in db_holdings:
                        if row["ticker"] not in t212_tickers:
                            holdings_out.append(holding_with_price_from_row(row))

                    # Append cash balance as a pseudo-holding
                    cash = t212.fetch_cash_balance(t212_account)
                    if cash and cash.get("free", 0) > 0.01:
                        holdings_out.append(HoldingWithPrice(
                            id=0, account_id=account_id,
                            ticker="CASH", display_name="Cash Balance",
                            unit_count=1.0, currency=cash["currency"],
                            price_gbp=cash["free"], value_gbp=cash["free"],
                            last_holding_update=now, freshness="green",
                        ))

                elif account_type == "etoro":
                    etoro_tickers: set[str] = set()
                    etoro_positions = etoro.fetch_portfolio_cached()
                    if etoro_positions is None:
                        is_loading = True
                        etoro_positions = []

                    for pos in etoro_positions:
                        etoro_tickers.add(pos["ticker"])
                        price_gbp = float(pos["current_price_gbp"]) if pos.get("current_price_gbp") else None
                        unit_count = float(pos.get("quantity", 0))
                        avg_cost_gbp = float(pos["avg_price_gbp"]) if pos.get("avg_price_gbp") else None
                        gain_loss_gbp = None
                        gain_loss_pct = None
                        # Prefer eToro's direct netProfit field (USD P&L already converted to GBP).
                        # Fall back to (price - avg_cost) * qty for positions without netProfit.
                        if pos.get("net_profit_gbp") is not None:
                            gain_loss_gbp = float(pos["net_profit_gbp"])
                            market_val = float(pos["market_value_gbp"]) if pos.get("market_value_gbp") else None
                            cost_basis = (market_val - gain_loss_gbp) if market_val is not None else None
                            gain_loss_pct = (gain_loss_gbp / cost_basis) * 100 if cost_basis else None
                        elif avg_cost_gbp and price_gbp and unit_count > 0:
                            cost_basis = avg_cost_gbp * unit_count
                            gain_loss_gbp = (price_gbp - avg_cost_gbp) * unit_count
                            gain_loss_pct = (gain_loss_gbp / cost_basis) * 100 if cost_basis else None
                        holdings_out.append(HoldingWithPrice(
                            id=0,  # eToro positions don't have a DB id
                            account_id=account_id,
                            ticker=pos["ticker"],
                            display_name=pos.get("display_name"),
                            unit_count=unit_count,
                            currency=pos.get("currency", "USD"),
                            price_gbp=price_gbp,
                            value_gbp=float(pos["market_value_gbp"]) if pos.get("market_value_gbp") else None,
                            avg_cost_gbp=avg_cost_gbp,
                            gain_loss_gbp=gain_loss_gbp,
                            gain_loss_pct=gain_loss_pct,
                            last_holding_update=now,
                            freshness="green",
                        ))

                    # Also include any DB holdings not covered by eToro (manual additions)
                    for row in db_holdings:
                        if row["ticker"] not in etoro_tickers:
                            holdings_out.append(holding_with_price_from_row(row))

                    # Append cash balance as a pseudo-holding
                    cash = etoro.fetch_cash_balance()
                    if cash and cash.get("free", 0) > 0.01:
                        holdings_out.append(HoldingWithPrice(
                            id=0, account_id=account_id,
                            ticker="CASH", display_name="Cash Balance",
                            unit_count=1.0, currency=cash["currency"],
                            price_gbp=cash["free"], value_gbp=cash["free"],
                            last_holding_update=now, freshness="green",
                        ))

                else:
                    # manual: use DB holdings + yfinance prices
                    for row in db_holdings:
                        holdings_out.append(holding_with_price_from_row(row))

                # Manual cash balance (user-set, for accounts where API doesn't expose it e.g. eToro GBP)
                manual_cash = account.get("cash_balance_gbp")
                if manual_cash and float(manual_cash) > 0.01:
                    holdings_out.append(HoldingWithPrice(
                        id=0, account_id=account_id,
                        ticker="CASH_GBP", display_name="Cash Balance (GBP)",
                        unit_count=1.0, currency="GBP",
                        price_gbp=float(manual_cash), value_gbp=float(manual_cash),
                        last_holding_update=now, freshness="green",
                    ))

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
                    account_subtype=account.get("account_subtype"),
                    colour=account["colour"],
                    total_value_gbp=account_total,
                    holdings=holdings_out,
                    freshness=account_freshness,
                    last_updated=last_updated,
                    loading=is_loading,
                ))

    return PortfolioSummary(
        total_value_gbp=total_value,
        accounts=account_summaries,
    )
