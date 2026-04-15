from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class AccountCreate(BaseModel):
    name: str
    account_type: str  # 'manual' | 't212' | 'etoro'
    account_subtype: Optional[str] = None  # 'isa' | 'lisa' | 'sipp' | 'gia' | 'cash_isa' | None
    colour: str = '#6366f1'


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    colour: Optional[str] = None
    account_subtype: Optional[str] = None
    cash_balance_gbp: Optional[float] = None


class Account(BaseModel):
    id: int
    name: str
    account_type: str
    account_subtype: Optional[str] = None
    colour: str
    cash_balance_gbp: Optional[float] = None
    created_at: datetime


class HoldingCreate(BaseModel):
    account_id: int
    ticker: str
    display_name: Optional[str] = None
    unit_count: float = 0
    currency: str = 'GBP'
    notes: Optional[str] = None
    manual_price_gbp: Optional[float] = None


class HoldingUpdate(BaseModel):
    unit_count: float
    display_name: Optional[str] = None
    notes: Optional[str] = None
    manual_price_gbp: Optional[float] = None


class HoldingWithPrice(BaseModel):
    id: int
    account_id: int
    ticker: str
    display_name: Optional[str]
    unit_count: float
    currency: str
    price_gbp: Optional[float]
    value_gbp: Optional[float]
    manual_price_gbp: Optional[float] = None
    last_holding_update: datetime
    freshness: str  # green/amber/red


class AccountSummary(BaseModel):
    id: int
    name: str
    account_type: str
    account_subtype: Optional[str] = None
    colour: str
    total_value_gbp: float
    holdings: List[HoldingWithPrice]
    freshness: Optional[str]  # worst freshness across holdings (manual accounts only)
    last_updated: datetime
    loading: bool = False  # True while live API data is being fetched in background


class PortfolioSummary(BaseModel):
    total_value_gbp: float
    accounts: List[AccountSummary]
