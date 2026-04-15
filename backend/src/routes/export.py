import csv
import io
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from src.db import get_db
from src.routes.portfolio import portfolio_summary

router = APIRouter(prefix="/api/export", tags=["export"])

SUBTYPE_LABELS = {
    'isa': 'Stocks & Shares ISA',
    'cash_isa': 'Cash ISA',
    'lisa': 'Lifetime ISA (LISA)',
    'sipp': 'Pension (SIPP)',
    'gia': 'General (GIA)',
    None: 'Unclassified',
}

TAX_STATUS = {
    'isa': 'Tax-free',
    'cash_isa': 'Tax-free',
    'lisa': 'Tax-free',
    'sipp': 'Pension',
    'gia': 'Taxable',
    None: 'Unknown',
}


@router.get("/csv")
def export_csv():
    """Export all holdings as CSV grouped by account and wrapper type."""
    summary = portfolio_summary()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        'Account', 'Wrapper', 'Tax Status', 'Ticker', 'Name',
        'Units', 'Price (£)', 'Value (£)',
    ])

    for account in summary.accounts:
        subtype = account.account_subtype
        wrapper = SUBTYPE_LABELS.get(subtype, 'Unclassified')
        tax_status = TAX_STATUS.get(subtype, 'Unknown')

        for h in account.holdings:
            writer.writerow([
                account.name,
                wrapper,
                tax_status,
                h.ticker,
                h.display_name or h.ticker,
                f"{h.unit_count:.4f}" if h.unit_count else '',
                f"{h.price_gbp:.4f}" if h.price_gbp else '',
                f"{h.value_gbp:.2f}" if h.value_gbp else '',
            ])

    output.seek(0)
    date_str = datetime.now().strftime('%Y-%m-%d')
    filename = f"portfolio_{date_str}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
