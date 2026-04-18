import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, Trash2 } from 'lucide-react';
import AddDividendModal from './AddDividendModal';
import { apiFetch } from '../config/api';

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

// Returns { start, end, label } for the UK tax year at offset 0 (current) or -1 (last)
function getTaxYearBounds(offset = 0) {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  // Tax year starts 6 Apr; if today is before 6 Apr we're still in previous year
  const baseYear = (month > 3 || (month === 3 && day >= 6)) ? now.getFullYear() : now.getFullYear() - 1;
  const startYear = baseYear + offset;
  const start = new Date(startYear, 3, 6); // 6 Apr
  const end = new Date(startYear + 1, 3, 5, 23, 59, 59, 999); // 5 Apr 23:59:59
  const label = `${startYear}/${String(startYear + 1).slice(2)}`;
  return { start, end, label };
}

export default function DividendPanel({ accounts }) {
  const [dividends, setDividends] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taxYearFilter, setTaxYearFilter] = useState('all');

  const fetchDividends = useCallback(async () => {
    try {
      const [dvRes, sumRes] = await Promise.all([
        apiFetch('/api/dividends'),
        apiFetch('/api/dividends/summary'),
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
    await apiFetch(`/api/dividends/${id}`, { method: 'DELETE' });
    fetchDividends();
  }

  const accountName = (id) => accounts?.find(a => a.id === id)?.name ?? `Account ${id}`;

  const currentBounds = getTaxYearBounds(0);
  const lastBounds = getTaxYearBounds(-1);

  const filteredDividends = dividends.filter(d => {
    if (taxYearFilter === 'all') return true;
    const bounds = taxYearFilter === 'current' ? currentBounds : lastBounds;
    const dateStr = d.pay_date || d.created_at;
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date >= bounds.start && date <= bounds.end;
  });

  const filteredTotal = filteredDividends.reduce((sum, d) => sum + (d.amount_gbp ?? 0), 0);

  const TAX_YEAR_PILLS = [
    { key: 'all', label: 'All time' },
    { key: 'current', label: currentBounds.label },
    { key: 'last', label: lastBounds.label },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 p-5 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0 sm:flex-1">
          <TrendingUp size={16} className="text-emerald-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-slate-200">Dividend Income</h2>
          {!loading && (
            <span className="text-sm font-mono font-bold text-emerald-400 ml-2">
              {formatGBP(taxYearFilter === 'all' && summary ? summary.total_gbp : filteredTotal)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
            {TAX_YEAR_PILLS.map(pill => (
              <button
                key={pill.key}
                onClick={() => setTaxYearFilter(pill.key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  taxYearFilter === pill.key
                    ? 'bg-slate-600 text-slate-100 font-medium'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus size={12} />
            Log Dividend
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-600 text-sm">Loading…</div>
      ) : filteredDividends.length === 0 ? (
        <div className="py-3 px-3 text-center text-slate-600 text-xs">
          {dividends.length === 0
            ? 'No dividends logged yet.'
            : 'No dividends in this period.'}
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
              {filteredDividends.map(d => (
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
