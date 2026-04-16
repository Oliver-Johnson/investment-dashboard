"""Unit tests for get_freshness in portfolio route.

Thresholds (matching frontend FreshnessIndicator):
  < 15 days  → green  (fresh)
  < 28 days  → amber  (nearing expiry)
  >= 28 days → red    (stale)
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from src.routes.portfolio import get_freshness


def _ago(**kw):
    return datetime.now(timezone.utc) - timedelta(**kw)


def test_fresh_well_within_15_days():
    assert get_freshness(_ago(days=10)) == "green"


def test_fresh_just_inside_15_day_boundary():
    assert get_freshness(_ago(days=14, hours=23)) == "green"


def test_amber_just_past_15_days():
    assert get_freshness(_ago(days=15, hours=1)) == "amber"


def test_amber_at_20_days():
    assert get_freshness(_ago(days=20)) == "amber"


def test_amber_just_inside_28_day_boundary():
    assert get_freshness(_ago(days=27, hours=23)) == "amber"


def test_red_at_28_days():
    assert get_freshness(_ago(days=28)) == "red"


def test_red_beyond_28_days():
    assert get_freshness(_ago(days=35)) == "red"


def test_naive_datetime_treated_as_utc():
    """Naive datetime input should not crash and be treated as UTC."""
    last = datetime.utcnow() - timedelta(days=1)
    assert last.tzinfo is None
    result = get_freshness(last)
    assert result == "green"


def test_dst_spring_forward_utc_comparison():
    """Confirm get_freshness compares UTC times, not local/wall-clock times.

    Spring-forward DST: Europe/London clocks jump from 01:00→02:00 on 2024-03-31.
    A last_update 14 days 23 hours ago in UTC crosses this DST boundary but is < 15d.
    A naive local-time implementation might count 15 days (losing the spring-forward hour),
    but the UTC comparison should still return 'green'.
    """
    fixed_now = datetime(2024, 3, 31, 12, 0, 0, tzinfo=timezone.utc)
    last_update = fixed_now - timedelta(hours=(14 * 24) + 23)  # 359h < 360h (15d) → green

    mock_dt = MagicMock(wraps=datetime)
    mock_dt.now.return_value = fixed_now
    with patch("src.routes.portfolio.datetime", mock_dt):
        result = get_freshness(last_update)

    assert result == "green"


def test_dst_autumn_fallback_utc_comparison():
    """Autumn fallback: clocks go back 1h on 2024-10-27. UTC comparison is unaffected.

    359 hours (< 15d) ago should be green regardless of DST.
    """
    fixed_now = datetime(2024, 10, 27, 12, 0, 0, tzinfo=timezone.utc)
    last_update = fixed_now - timedelta(hours=359)  # 359h < 360h → green

    mock_dt = MagicMock(wraps=datetime)
    mock_dt.now.return_value = fixed_now
    with patch("src.routes.portfolio.datetime", mock_dt):
        result = get_freshness(last_update)

    assert result == "green"
