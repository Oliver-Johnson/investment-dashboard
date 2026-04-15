import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@postgres:5432/investment_db")

SEED_HOLDINGS = [
    {"provider": "freetrade", "ticker": "FCIT.L", "display_name": "Foreign & Colonial Investment Trust", "unit_count": 0, "currency": "GBP"},
    {"provider": "columbia", "ticker": "FCIT.L", "display_name": "Foreign & Colonial Investment Trust (Columbia)", "unit_count": 0, "currency": "GBP"},
    {"provider": "barclays", "ticker": "FCIT.L", "display_name": "Foreign & Colonial Investment Trust (Barclays)", "unit_count": 0, "currency": "GBP"},
    {"provider": "etoro", "ticker": "FCIT.L", "display_name": "Foreign & Colonial Investment Trust (eToro)", "unit_count": 0, "currency": "GBP"},
]


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS holdings (
                    id SERIAL PRIMARY KEY,
                    provider VARCHAR(50) NOT NULL,
                    ticker VARCHAR(20) NOT NULL,
                    display_name VARCHAR(100),
                    unit_count DECIMAL(15,4) NOT NULL,
                    currency VARCHAR(3) DEFAULT 'GBP',
                    last_holding_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    notes TEXT
                );

                CREATE TABLE IF NOT EXISTS price_cache (
                    ticker VARCHAR(20) PRIMARY KEY,
                    price_gbp DECIMAL(15,4),
                    last_fetched TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)


def seed_holdings():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as count FROM holdings")
            row = cur.fetchone()
            if row["count"] > 0:
                return
            for h in SEED_HOLDINGS:
                cur.execute(
                    """INSERT INTO holdings (provider, ticker, display_name, unit_count, currency)
                       VALUES (%(provider)s, %(ticker)s, %(display_name)s, %(unit_count)s, %(currency)s)""",
                    h
                )
