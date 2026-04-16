import logging
import os
import psycopg2
from contextlib import contextmanager
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


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
                    account_subtype VARCHAR(20),
                    colour VARCHAR(7) DEFAULT '#6366f1',
                    cash_balance_gbp NUMERIC(20,6),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cash_balance_gbp NUMERIC(20,6);
                ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_subtype VARCHAR(20);

                CREATE TABLE IF NOT EXISTS holdings (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    ticker VARCHAR(20) NOT NULL,
                    display_name VARCHAR(100),
                    unit_count DECIMAL(15,4) NOT NULL DEFAULT 0,
                    currency VARCHAR(3) DEFAULT 'GBP',
                    last_holding_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    notes TEXT,
                    manual_price_gbp NUMERIC(20, 6),
                    avg_cost_gbp NUMERIC(20, 6)
                );
                ALTER TABLE holdings ADD COLUMN IF NOT EXISTS manual_price_gbp NUMERIC(20, 6);
                ALTER TABLE holdings ADD COLUMN IF NOT EXISTS avg_cost_gbp NUMERIC(20, 6);

                CREATE TABLE IF NOT EXISTS price_cache (
                    ticker VARCHAR(20) PRIMARY KEY,
                    price_gbp DECIMAL(15,4),
                    last_fetched TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS dividends (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    ticker VARCHAR(20) NOT NULL,
                    display_name VARCHAR(100),
                    amount_gbp NUMERIC(20, 6) NOT NULL,
                    ex_date DATE,
                    pay_date DATE,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS contributions (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    amount_gbp NUMERIC(20, 6) NOT NULL,
                    date DATE NOT NULL DEFAULT CURRENT_DATE,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS disposals (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    ticker VARCHAR(20) NOT NULL,
                    display_name VARCHAR(100),
                    quantity DECIMAL(15,4) NOT NULL,
                    sale_price_gbp NUMERIC(20,6) NOT NULL,
                    cost_basis_gbp NUMERIC(20,6),
                    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    value_gbp NUMERIC(20,6) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE UNIQUE INDEX IF NOT EXISTS portfolio_snapshots_unique
                ON portfolio_snapshots (COALESCE(account_id, -1), snapshot_date);

                CREATE TABLE IF NOT EXISTS watchlist (
                    id SERIAL PRIMARY KEY,
                    ticker VARCHAR(20) NOT NULL UNIQUE,
                    display_name VARCHAR(100),
                    target_price_gbp NUMERIC(20,6),
                    notes TEXT,
                    added_at TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS notes (
                    id SERIAL PRIMARY KEY,
                    content TEXT NOT NULL DEFAULT '',
                    colour VARCHAR(20) NOT NULL DEFAULT '#6366f1',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS note_accounts (
                    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    PRIMARY KEY (note_id, account_id)
                );

                CREATE TABLE IF NOT EXISTS note_tags (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE
                );

                CREATE TABLE IF NOT EXISTS note_tag_links (
                    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                    tag_id INTEGER NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
                    PRIMARY KEY (note_id, tag_id)
                );
            """)

            # Dedup duplicate holdings (keep lowest id per account+ticker)
            cur.execute("""
                DELETE FROM holdings h USING holdings h2
                WHERE h.id > h2.id
                  AND h.account_id = h2.account_id
                  AND lower(h.ticker) = lower(h2.ticker);
            """)
            if cur.rowcount:
                logger.warning("Deleted %d duplicate holding rows during schema init", cur.rowcount)

            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS holdings_account_ticker_lower
                ON holdings (account_id, lower(ticker));
            """)

        conn.commit()
    finally:
        conn.close()
