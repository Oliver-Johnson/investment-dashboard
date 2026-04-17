import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Eye, RefreshCw } from 'lucide-react';
import { apiFetch } from '../config/api';
import HoldingHistoryModal from './HoldingHistoryModal';

function formatGBP(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(value);
}

function AddWatchlistModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ ticker: '', display_name: '', target_price_gbp: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        ticker: form.ticker.toUpperCase().trim(),
        display_name: form.display_name || null,
        target_price_gbp: form.target_price_gbp !== '' ? parseFloat(form.target_price_gbp) : null,
        notes: form.notes || null,
      };
      const res = await apiFetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      onAdded();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Add to Watchlist</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ticker</label>
              <input
                type="text"
                value={form.ticker}
                onChange={e => set('ticker', e.target.value)}
                placeholder="AAPL"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name (optional)</label>
              <input
                type="text"
                value={form.display_name}
                onChange={e => set('display_name', e.target.value)}
                placeholder="Apple Inc."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target Price (£, optional)</label>
            <input
              type="number"
              value={form.target_price_gbp}
              onChange={e => set('target_price_gbp', e.target.value)}
              placeholder="150.00"
              min="0"
              step="any"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Watching for a pullback..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await apiFetch('/api/watchlist');
      if (res.ok) setItems(await res.json());
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDelete(id) {
    if (!confirm('Remove from watchlist?')) return;
    await apiFetch(`/api/watchlist/${id}`, { method: 'DELETE' });
    fetchData();
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <main className="max-w-5xl mx-auto px-3 md:px-6 py-5 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Eye size={15} className="text-purple-400" />
            </div>
            <h1 className="text-lg font-semibold text-slate-100">Watchlist</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
            >
              <Plus size={12} />
              Add to Watchlist
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-800 rounded animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <Eye size={32} className="mx-auto mb-3 text-slate-700" />
              <div className="text-sm text-slate-500">No tickers on your watchlist yet</div>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                Add your first ticker
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-3 px-4 font-medium text-slate-500">Ticker</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-500">Name</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-500">Current Price</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-500">Target Price</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-500">% to Target</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-500">Notes</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const pct = item.pct_to_target;
                    const pctColor = pct == null ? 'text-slate-500'
                      : pct >= 0 ? 'text-emerald-400' : 'text-red-400';
                    return (
                      <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td
                          className="py-3 px-4 font-semibold text-slate-100 cursor-pointer hover:text-blue-400 transition-colors"
                          onClick={() => setHistoryItem(item)}
                        >{item.ticker}</td>
                        <td className="py-3 px-4 text-slate-400">{item.display_name || '—'}</td>
                        <td className="py-3 px-4 text-right text-slate-200">
                          {item.current_price_gbp != null ? formatGBP(item.current_price_gbp) : (
                            <span className="text-slate-600">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400">
                          {item.target_price_gbp != null ? formatGBP(item.target_price_gbp) : '—'}
                        </td>
                        <td className={`py-3 px-4 text-right font-medium ${pctColor}`}>
                          {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-[150px] truncate">{item.notes || '—'}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showAdd && (
        <AddWatchlistModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { fetchData(); setShowAdd(false); }}
        />
      )}

      <HoldingHistoryModal
        symbol={historyItem?.ticker ?? null}
        name={historyItem?.display_name ?? historyItem?.ticker ?? null}
        isOpen={historyItem != null}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}
