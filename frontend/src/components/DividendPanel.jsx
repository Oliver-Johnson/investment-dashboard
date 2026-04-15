import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, Trash2 } from 'lucide-react';
import AddDividendModal from './AddDividendModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function formatGBP(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DividendPanel({ accounts }) {
  const [dividends, setDividends] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDividends = useCallback(async () => {
    try {
      const [dvRes, sumRes] = await Promise.all([
        fetch(`${API_URL}/api/dividends`),
        fetch(`${API_URL}/api/dividends/summary`),
      ]);
      if (dvRes.ok) setDividends(await dvRes.json());
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (e) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDividends(); }, [fetchDividends]);

  async function handleDelete(id) {
    if (!confirm('Delete this dividend record?')) return;
    await fetch(`${API_URL}/api/dividends/${id}`, { method: 'DELETE' });
    fetchDividends();
  }

  const accountName = (id) => accounts?.find(a => a.id === id)?.name ?? `Account ${id}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200">Dividend Income</h2>
          {summary && (
            <span className="text-sm font-mono font-bold text-emerald-400 ml-2">
              {formatGBP(summary.total_gbp)}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus size={12} />
          Log Dividend
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-600 text-sm">Loading…</div>
      ) : dividends.length === 0 ? (
        <div className="p-6 text-center text-slate-600 text-sm">
          No dividends logged yet. Use "Log Dividend" to record income.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-400">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="pb-2 pl-5 pr-4 text-left font-medium py-3">Holding</th>
                <th className="pb-2 px-4 text-left font-medium">Account</th>
                <th className="pb-2 px-4 text-right font-medium">Amount</th>
                <th className="pb-2 px-4 text-right font-medium">Pay Date</th>
                <th className="pb-2 px-4 text-right font-medium">Ex-Date</th>
                <th className="pb-2 pr-4 w-8" />
              </tr>
            </thead>
            <tbody>
              {dividends.map(d => (
                <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 pl-5 pr-4">
                    <div className="font-mono font-semibold text-slate-200">{d.ticker}</div>
                    {d.display_name && d.display_name !== d.ticker && (
                      <div className="text-slate-500 text-xs">{d.display_name}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-400">{accountName(d.account_id)}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-400">
                    {formatGBP(d.amount_gbp)}
                  </td>
                  <td className="py-2.5 px-4 text-right">{formatDate(d.pay_date)}</td>
                  <td className="py-2.5 px-4 text-right">{formatDate(d.ex_date)}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-slate-700 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddDividendModal
          accounts={accounts}
          onClose={() => setShowAdd(false)}
          onSaved={fetchDividends}
        />
      )}
    </div>
  );
}
