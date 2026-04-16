"""Unit tests for get_freshness in portfolio route."""
from datetime import datetime, timedelta, timezone

import pytest

from src.routes.portfolio import get_freshness


def _ago(**kw):
    return datetime.now(timezone.utc) - timedelta(**kw)


def test_fresh_well_within_14_days():
    assert get_freshness(_ago(days=10)) == "green"


def test_fresh_just_inside_14_day_boundary():
    # 13 days 23 hours is safely inside the green zone
    assert get_freshness(_ago(days=13, hours=23)) == "green"


def test_amber_just_past_14_days():
    # 14 days 1 hour is in the amber zone
    assert get_freshness(_ago(days=14, hours=1)) == "amber"


def test_amber_at_27_days():
    assert get_freshness(_ago(days=27)) == "amber"


def test_amber_just_inside_30_day_boundary():
    assert get_freshness(_ago(days=29, hours=23)) == "amber"


def test_red_beyond_30_days():
    assert get_freshness(_ago(days=31)) == "red"


def test_naive_datetime_treated_as_utc():
    """Naive datetime input should not crash and be treated as UTC."""
    last = datetime.utcnow() - timedelta(days=1)
    assert last.tzinfo is None
    result = get_freshness(last)
    assert result == "green"


def test_dst_spring_forward_utc_comparison():
    """Confirm get_freshness compares UTC times, not local/wall-clock times.

    Spring-forward DST: Europe/London clocks jump from 01:00→02:00 on 2024-03-31.
    A last_update 335h ago in UTC crosses this DST boundary but is still < 336h (14d).
    A naive local-time implementation might see 14 days (lost the spring-forward hour),
    but the UTC comparison should still return 'green'.
    """
    from unittest.mock import patch, MagicMock
    fixed_now = datetime(2024, 3, 31, 12, 0, 0, tzinfo=timezone.utc)
    last_update = fixed_now - timedelta(hours=335)  # 335h < 336h (14d) → green

    mock_dt = MagicMock(wraps=datetime)
    mock_dt.now.return_value = fixed_now
    with patch("src.routes.portfolio.datetime", mock_dt):
        result = get_freshness(last_update)

    assert result == "green"


def test_dst_autumn_fallback_utc_comparison():
    """Autumn fallback: clocks go back 1h on 2024-10-27. UTC comparison is unaffected.

    335h (< 14d) ago should be green whether or not local time skips an hour.
    """
    from unittest.mock import patch, MagicMock
    fixed_now = datetime(2024, 10, 27, 12, 0, 0, tzinfo=timezone.utc)
    last_update = fixed_now - timedelta(hours=335)  # 335h < 336h → green

    mock_dt = MagicMock(wraps=datetime)
    mock_dt.now.return_value = fixed_now
    with patch("src.routes.portfolio.datetime", mock_dt):
        result = get_freshness(last_update)

    assert result == "green"
