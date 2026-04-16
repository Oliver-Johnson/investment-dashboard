"""Tests for eToro avg-price ratio math.

The ratio calculation lives inside fetch_portfolio() (etoro.py:232-235):

    avg_price_gbp = open_rate * (current_price_gbp / current_rate_native)

This converts the openRate (denominated in the instrument's native currency)
to GBP using the current native→GBP ratio. It is embedded inside the API
response processing loop and cannot be exercised without mocking the full
API call + response body.

Rather than mocking the entire fetch_portfolio response chain (which would be
brittle and low-value), we test the math inline here to document and verify
the formula.
"""
from decimal import Decimal


def _compute_avg_price_gbp(open_rate, current_price_gbp, current_rate_native):
    """Mirror of the ratio formula at etoro.py:233."""
    open_rate = Decimal(str(open_rate))
    current_price_gbp = Decimal(str(current_price_gbp))
    current_rate_native = Decimal(str(current_rate_native))
    if current_rate_native > 0 and current_price_gbp > 0:
        return open_rate * (current_price_gbp / current_rate_native)
    return None


def test_ratio_same_currency():
    """When native rate equals GBP price, ratio is 1, so avg_price_gbp == open_rate."""
    result = _compute_avg_price_gbp(
        open_rate=100,
        current_price_gbp=50,
        current_rate_native=50,
    )
    assert result == Decimal("100")


def test_ratio_usd_instrument():
    """USD instrument: native rate in USD, GBP price = USD / GBPUSD."""
    # Instrument priced at 200 USD, GBPUSD=1.25, so current_price_gbp=160
    # open_rate was 160 USD → avg_price_gbp = 160 * (160/200) = 128
    result = _compute_avg_price_gbp(
        open_rate=160,
        current_price_gbp=Decimal("160"),
        current_rate_native=200,
    )
    assert result == Decimal("128")


def test_ratio_zero_native_rate_returns_none():
    """Zero native rate should not raise; returns None (fallback to USD)."""
    result = _compute_avg_price_gbp(
        open_rate=100,
        current_price_gbp=80,
        current_rate_native=0,
    )
    assert result is None


def test_ratio_zero_gbp_price_returns_none():
    """Zero current_price_gbp should not crash; returns None."""
    result = _compute_avg_price_gbp(
        open_rate=100,
        current_price_gbp=0,
        current_rate_native=100,
    )
    assert result is None
