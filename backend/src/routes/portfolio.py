from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter
from src.db import get_db
from src.models import PortfolioSummary, ProviderSummary, ProviderHolding
from src.providers import t212
from src.providers.yfinance_client import get_price_gbp

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

MANUAL_PROVIDERS = {
    "barclays": "Barclays Smart Investor",
    "freetrade": "Freetrade",
    "columbia": "Columbia Threadneedle",
    "etoro": "eToro",
}


def get_freshness(last_update: datetime) -> str:
    days = (datetime.utcnow() - last_update.replace(tzinfo=None)).days
    if days <= 14:
        return "green"
    if days <= 30:
        return "amber"
    return "red"


def build_manual_provider_summary(provider: str, label: str, rows: list[dict]) -> ProviderSummary:
    holdings = []
    total = Decimal("0")
    last_update = None

    for row in rows:
        unit_count = Decimal(str(row["unit_count"]))
        price_gbp = None
        market_value = None

        if unit_count > 0:
            try:
                price_gbp = Decimal(str(get_price_gbp(row["ticker"])))
                market_value = unit_count * price_gbp
                total += market_value
            except Exception:
                pass

        holdings.append(ProviderHolding(
            ticker=row["ticker"],
            display_name=row.get("display_name"),
            quantity=unit_count,
            current_price_gbp=price_gbp,
            market_value_gbp=market_value,
        ))

        update_ts = row["last_holding_update"]
        if last_update is None or update_ts > last_update:
            last_update = update_ts

    freshness = get_freshness(last_update) if last_update else "red"

    return ProviderSummary(
        name=provider,
        label=label,
        total_value_gbp=total,
        holdings=holdings,
        source="manual",
        last_holding_update=last_update,
        freshness=freshness,
    )


@router.get("/summary", response_model=PortfolioSummary)
def portfolio_summary():
    provider_summaries = []
    total_value = Decimal("0")

    # Trading 212 (API)
    t212_error = None
    t212_holdings = []
    t212_total = Decimal("0")
    try:
        positions = t212.fetch_portfolio()
        for pos in positions:
            t212_holdings.append(ProviderHolding(
                ticker=pos["ticker"],
                quantity=pos["quantity"],
                avg_price=pos.get("avg_price"),
                current_price_gbp=pos.get("current_price_gbp"),
                market_value_gbp=pos.get("market_value_gbp"),
            ))
            t212_total += pos.get("market_value_gbp") or Decimal("0")
    except Exception as e:
        t212_error = str(e)

    provider_summaries.append(ProviderSummary(
        name="trading212",
        label="Trading 212",
        total_value_gbp=t212_total,
        holdings=t212_holdings,
        source="api",
        last_updated=datetime.utcnow(),
        error=t212_error,
    ))
    total_value += t212_total

    # Manual providers
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM holdings WHERE provider = ANY(%s) ORDER BY provider, ticker",
                (list(MANUAL_PROVIDERS.keys()),)
            )
            all_rows = cur.fetchall()

    by_provider: dict[str, list] = {p: [] for p in MANUAL_PROVIDERS}
    for row in all_rows:
        p = row["provider"]
        if p in by_provider:
            by_provider[p].append(dict(row))

    for provider, label in MANUAL_PROVIDERS.items():
        summary = build_manual_provider_summary(provider, label, by_provider[provider])
        provider_summaries.append(summary)
        total_value += summary.total_value_gbp

    return PortfolioSummary(
        total_value_gbp=total_value,
        providers=provider_summaries,
    )
