import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, Trash2 } from 'lucide-react';
import AddContributionModal from './AddContributionModal';
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

function getTaxYearBounds(offset = 0) {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  const baseYear = (month > 3 || (month === 3 && day >= 6)) ? now.getFullYear() : now.getFullYear() - 1;
  const startYear = baseYear + offset;
  const start = new Date(startYear, 3, 6);
  const end = new Date(startYear + 1, 3, 5, 23, 59, 59, 999);
  const label = `${startYear}/${String(startYear + 1).slice(2)}`;
  return { start, end, label };
}

export default function ContributionPanel({ accounts }) {
  const [contributions, setContributions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taxYearFilter, setTaxYearFilter] = useState('current');

  const getAccountName = (id) => accounts?.find(a => a.id === id)?.name ?? `Account ${id}`;

  const currentBounds = getTaxYearBounds(0);
  const lastBounds = getTaxYearBounds(-1);

  const load = useCallback(async () => {
    try {
      const [listRes, summaryRes] = await Promise.all([
        apiFetch('/api/contributions'),
        apiFetch('/api/contributions/summary'),
      ]);
      if (listRes.ok) setContributions(await listRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!confirm('Delete this contribution?')) return;
    await apiFetch(`/api/contributions/${id}`, { method: 'DELETE' });
    load();
  }

  const filteredContributions = contributions.filter(c => {
    if (taxYearFilter === 'all') return true;
    const bounds = taxYearFilter === 'current' ? currentBounds : lastBounds;
    const date = new Date(c.date);
    return date >= bounds.start && date <= bounds.end;
  });

  const filteredTotal = filteredContributions.reduce((sum, c) => sum + (c.amount_gbp ?? 0), 0);

  const TAX_YEAR_PILLS = [
    { key: 'all', label: 'All time' },
    { key: 'current', label: currentBounds.label },
    { key: 'last', label: lastBounds.label },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center">
            <TrendingUp size={13} className="text-emerald-400" />
          </div>
          <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Contributions</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-semibold text-slate-100">{formatGBP(filteredTotal)}</span>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            <Plus size={13} />
            Log Contribution
          </button>
        </div>
      </div>

      {/* Tax year filter pills */}
      <div className="flex items-center gap-2 mb-4">
        {TAX_YEAR_PILLS.map(pill => (
          <button
            key={pill.key}
            onClick={() => setTaxYearFilter(pill.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              taxYearFilter === pill.key
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-slate-800 rounded animate-pulse" />
          ))}
        </div>
      ) : filteredContributions.length === 0 ? (
        <div className="text-center py-3 text-slate-600 text-xs">No contributions for this period</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="text-left pb-2 font-medium">Date</th>
                <th className="text-left pb-2 font-medium">Account</th>
                <th className="text-right pb-2 font-medium">Amount</th>
                <th className="text-left pb-2 font-medium pl-4">Notes</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredContributions.map(c => (
                <tr key={c.id} className="group hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 pr-4 font-mono text-slate-400 whitespace-nowrap">{formatDate(c.date)}</td>
                  <td className="py-2 pr-4 text-slate-300 whitespace-nowrap">{getAccountName(c.account_id)}</td>
                  <td className="py-2 pr-4 text-right font-mono text-emerald-400 whitespace-nowrap">{formatGBP(c.amount_gbp)}</td>
                  <td className="py-2 pl-4 text-slate-500 truncate max-w-[160px]">{c.notes || '—'}</td>
                  <td className="py-2 pl-2">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddContributionModal
          accounts={accounts}
          onClose={() => setShowAdd(false)}
          onSaved={() => { load(); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
