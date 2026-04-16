"""Unit tests for T212 _price_to_gbp."""
from decimal import Decimal
from unittest.mock import patch

from src.providers.t212 import _price_to_gbp


def _ref():
    """Fresh gbpusd_ref list."""
    return [None]


def test_gbp_passthrough():
    price = Decimal("123.45")
    assert _price_to_gbp(price, "GBP", _ref()) == price


def test_gbx_divides_by_100():
    price = Decimal("1500")
    result = _price_to_gbp(price, "GBX", _ref())
    assert result == Decimal("15")


def test_gbp_lowercase_divides_by_100():
    price = Decimal("200")
    result = _price_to_gbp(price, "GBp", _ref())
    assert result == Decimal("2")


def test_usd_divides_by_gbpusd_rate():
    price = Decimal("126.0")
    with patch("src.providers.t212._get_gbpusd_rate", return_value=1.26):
        result = _price_to_gbp(price, "USD", _ref())
    assert result == Decimal("100")


def test_usd_uses_cached_ref():
    """If gbpusd_ref already populated, should NOT call _get_gbpusd_rate again."""
    price = Decimal("100.0")
    ref = [Decimal("2.0")]
    with patch("src.providers.t212._get_gbpusd_rate", side_effect=AssertionError("should not call")):
        result = _price_to_gbp(price, "USD", ref)
    assert result == Decimal("50")


def test_unknown_currency_passthrough():
    """Unknown currency returns price unchanged (safe fallback)."""
    price = Decimal("99.99")
    result = _price_to_gbp(price, "EUR", _ref())
    assert result == price


def test_dot_l_ticker_gbp_metadata_divides_by_100():
    """London-listed tickers with GBp metadata should divide by 100."""
    price = Decimal("500")
    result = _price_to_gbp(price, "GBp", _ref())
    assert result == Decimal("5")
