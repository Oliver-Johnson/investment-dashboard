"""Unit tests for snapshot capture logic in scheduler._run_snapshot and snapshots._do_capture."""
from contextlib import contextmanager
from unittest.mock import MagicMock, patch, call

import pytest

from src.scheduler import _run_snapshot


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_summary(total=10000.0, accounts=None):
    """Build a minimal PortfolioSummary-like object."""
    summary = MagicMock()
    summary.total_value_gbp = total
    summary.accounts = accounts or []
    return summary


def _noop_providers():
    """Context managers that prevent real API calls to t212/etoro."""
    return [
        patch("src.providers.t212.fetch_portfolio"),
        patch("src.providers.etoro.fetch_portfolio"),
    ]


# ---------------------------------------------------------------------------
# Guard: refuse when warmup not complete (is_loading accounts)
# ---------------------------------------------------------------------------

def test_refuse_when_still_loading():
    with (
        patch("src.scheduler._wait_for_warmup", return_value=["t212"]),
        patch("src.scheduler._provider_error_within", return_value=None),
        patch("src.scheduler._last_snapshot_total", return_value=None),
        patch("src.routes.portfolio.portfolio_summary") as mock_ps,
        patch("src.providers.t212.fetch_portfolio"),
        patch("src.providers.etoro.fetch_portfolio"),
        patch("src.routes.snapshots._do_capture") as mock_cap,
    ):
        _run_snapshot()
        mock_ps.assert_not_called()
        mock_cap.assert_not_called()


# ---------------------------------------------------------------------------
# Guard: refuse when provider had recent error
# ---------------------------------------------------------------------------

def test_refuse_on_provider_error():
    with (
        patch("src.scheduler._wait_for_warmup", return_value=[]),
        patch("src.scheduler._provider_error_within", return_value="t212"),
        patch("src.scheduler._last_snapshot_total", return_value=None),
        patch("src.routes.portfolio.portfolio_summary") as mock_ps,
        patch("src.providers.t212.fetch_portfolio"),
        patch("src.providers.etoro.fetch_portfolio"),
        patch("src.routes.snapshots._do_capture") as mock_cap,
    ):
        _run_snapshot()
        mock_ps.assert_not_called()
        mock_cap.assert_not_called()


# ---------------------------------------------------------------------------
# Guard: refuse when deviation > 40% (and last total > 0)
# ---------------------------------------------------------------------------

def test_refuse_high_deviation_downward():
    """New total 50% below last should be rejected."""
    last_total = 10000.0
    new_total = 5000.0  # 50% drop > 40% threshold

    with (
        patch("src.scheduler._wait_for_warmup", return_value=[]),
        patch("src.scheduler._provider_error_within", return_value=None),
        patch("src.scheduler._last_snapshot_total", return_value=last_total),
        patch("src.routes.portfolio.portfolio_summary", return_value=_make_summary(new_total)),
        patch("src.providers.t212.fetch_portfolio"),
        patch("src.providers.etoro.fetch_portfolio"),
        patch("src.routes.snapshots._do_capture") as mock_cap,
    ):
        _run_snapshot()
        mock_cap.assert_not_called()


def test_refuse_high_deviation_upward():
    """New total 51% above last should be rejected."""
    last_total = 10000.0
    new_total = 15100.0  # 51% gain > 40% threshold

    with (
        patch("src.scheduler._wait_for_warmup", return_value=[]),
        patch("src.scheduler._provider_error_within", return_value=None),
        patch("src.scheduler._last_snapshot_total", return_value=last_total),
        patch("src.routes.portfolio.portfolio_summary", return_value=_make_summary(new_total)),
        patch("src.providers.t212.fetch_portfolio"),
        patch("src.providers.etoro.fetch_portfolio"),
        patch("src.routes.snapshots._do_capture") as mock_cap,
    ):
        _run_snapshot()
        mock_cap.assert_not_called()


# ---------------------------------------------------------------------------
# Accept: first snapshot (last total = None or 0) skips deviation check
# ---------------------------------------------------------------------------

def test_accept_first_snapshot_last_none():
    """No prior snapshot → skip deviation check and capture."""
    with (
        patch("src.scheduler._wait_for_warmup", return_value=[]),
        patch("src.scheduler._provider_error_within", return_value=None),
        patch("src.scheduler._last_snapshot_total", return_value=None),
        patch("src.routes.portfolio.portfolio_summary", return_value=_make_summary(10000.0)),
        patch("src.providers.t212.fetch_portfolio"),
        patch("src.providers.etoro.fetch_portfolio"),
        patch("src.routes.snapshots._do_capture") as mock_cap,
    ):
        _run_snapshot()
        mock_cap.assert_called_once()


def test_accept_first_snapshot_last_zero():
    """Last snapshot total = 0 → skip deviation check and capture."""
    with (
        patch("src.scheduler._wait_for_warmup", return_value=[]),
        patch("src.scheduler._provider_error_within", return_value=None),
        patch("src.scheduler._last_snapshot_total", return_value=0.0),
        patch("src.routes.portfolio.portfolio_summary", return_value=_make_summary(10000.0)),
        patch("src.providers.t212.fetch_portfolio"),
        patch("src.providers.etoro.fetch_portfolio"),
        patch("src.routes.snapshots._do_capture") as mock_cap,
    ):
        _run_snapshot()
        mock_cap.assert_called_once()


# ---------------------------------------------------------------------------
# Idempotency: _do_capture uses ON CONFLICT DO UPDATE (upsert)
# ---------------------------------------------------------------------------

def test_do_capture_idempotency():
    """Calling _do_capture twice with same data should both succeed (upsert, not insert)."""
    from src.routes.snapshots import _do_capture

    # Build mock DB stack
    cur_mock = MagicMock()
    cur_ctx = MagicMock()
    cur_ctx.__enter__ = MagicMock(return_value=cur_mock)
    cur_ctx.__exit__ = MagicMock(return_value=False)

    conn_mock = MagicMock()
    conn_mock.__enter__ = MagicMock(return_value=conn_mock)
    conn_mock.__exit__ = MagicMock(return_value=False)
    conn_mock.cursor = MagicMock(return_value=cur_ctx)

    @contextmanager
    def _db_ctx():
        yield conn_mock

    summary = _make_summary(total=12345.67, accounts=[])

    with patch("src.routes.snapshots.get_db", side_effect=_db_ctx):
        result1 = _do_capture(precomputed_summary=summary)
        result2 = _do_capture(precomputed_summary=summary)

    # Both succeed (0 accounts + 1 portfolio-level = 1 captured each call)
    assert result1 == {"captured": 1}
    assert result2 == {"captured": 1}
    # The SQL execute should have been called once per _do_capture (portfolio row only)
    assert cur_mock.execute.call_count == 2
