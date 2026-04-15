# Investment Dashboard

A self-hosted investment portfolio dashboard. Aggregate holdings across multiple brokers and accounts, with live prices via Trading 212, eToro, and Yahoo Finance.

## Features

- **Generic accounts model** — create any number of named accounts, assign holdings to each
- **Live broker sync** — T212 and eToro accounts pull positions directly from their APIs
- **Manual accounts** — enter holdings by ticker; prices fetched from Yahoo Finance (yfinance)
- **GBP normalisation** — all values converted to GBP regardless of source currency
- **Holding freshness** — visual green/amber/red indicator on manual accounts based on last update date
- **Price cache** — Yahoo Finance prices cached for 15 minutes to avoid rate limiting

## Account types

| Type | Description |
|------|-------------|
| `manual` | Holdings entered and updated by hand; prices fetched via yfinance |
| `t212` | Positions pulled live from the Trading 212 API (one API key supported) |
| `etoro` | Positions pulled live from the eToro API (one account supported) |

## Setup

### 1. Clone

```bash
git clone <repo-url>
cd investment-dashboard
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your credentials (see table below).

### 3. Start services

```bash
docker compose up -d
```

The backend runs migrations automatically on startup.

### 4. Open the dashboard

```
http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `T212_API_KEY` | T212 only | Trading 212 API key |
| `T212_API_SECRET` | T212 only | Trading 212 API secret |
| `T212_BASE_URL` | No | T212 API base URL (defaults to demo endpoint) |
| `ETORO_API_KEY` | eToro only | eToro Bearer token |
| `ETORO_USERNAME` | eToro only | eToro account username |

## eToro API — field name verification

The eToro provider is implemented in `backend/src/providers/etoro.py`. Because eToro's API varies by account tier, several field names are marked with `TODO` comments — check these against your actual API response before going live:

- Endpoint path (`/user/v1/users/{username}/portfolio`)
- Response wrapper key (`positions` / `openPositions`)
- Instrument identifier (`ticker` / `instrumentID` / `symbol`)
- Quantity field (`units` / `amount` / `quantity`)
- Price field (`currentRate` / `currentPrice` / `rate`)

## License

MIT
