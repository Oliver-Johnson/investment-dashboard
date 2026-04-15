from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class HoldingCreate(BaseModel):
    provider: str
    ticker: str
    display_name: Optional[str] = None
    unit_count: Decimal
    currency: str = "GBP"
    notes: Optional[str] = None


class HoldingUpdate(BaseModel):
    unit_count: Optional[Decimal] = None
    display_name: Optional[str] = None
    notes: Optional[str] = None


class Holding(BaseModel):
    id: int
    provider: str
    ticker: str
    display_name: Optional[str]
    unit_count: Decimal
    currency: str
    last_holding_update: datetime
    notes: Optional[str]

    class Config:
        from_attributes = True


class ProviderHolding(BaseModel):
    ticker: str
    display_name: Optional[str] = None
    quantity: Decimal
    avg_price: Optional[Decimal] = None
    current_price_gbp: Optional[Decimal] = None
    market_value_gbp: Optional[Decimal] = None


class ProviderSummary(BaseModel):
    name: str
    label: str
    total_value_gbp: Decimal
    holdings: list[ProviderHolding]
    source: str  # 'api' | 'manual'
    last_updated: Optional[datetime] = None
    last_holding_update: Optional[datetime] = None
    freshness: Optional[str] = None  # green/amber/red (manual only)
    error: Optional[str] = None


class PortfolioSummary(BaseModel):
    total_value_gbp: Decimal
    providers: list[ProviderSummary]
