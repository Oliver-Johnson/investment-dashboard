import os
import psycopg2
from contextlib import contextmanager
from psycopg2.extras import RealDictCursor


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@postgres:5432/investment_db")


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
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS accounts (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    account_type VARCHAR(20) NOT NULL,
                    colour VARCHAR(7) DEFAULT '#6366f1',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS holdings (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    ticker VARCHAR(20) NOT NULL,
                    display_name VARCHAR(100),
                    unit_count DECIMAL(15,4) NOT NULL DEFAULT 0,
                    currency VARCHAR(3) DEFAULT 'GBP',
                    last_holding_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    notes TEXT,
                    manual_price_gbp NUMERIC(20, 6)
                );
                ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_gbp NUMERIC(20, 6);

                CREATE TABLE IF NOT EXISTS price_cache (
                    ticker VARCHAR(20) PRIMARY KEY,
                    price_gbp DECIMAL(15,4),
                    last_fetched TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)
        conn.commit()
    finally:
        conn.close()
