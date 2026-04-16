import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, Trash2 } from 'lucide-react';
import AddDisposalModal from './AddDisposalModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const CGT_EXEMPT = 3000;

function formatGBP(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2,
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

export default function DisposalPanel({ accounts }) {
  const [disposals, setDisposals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taxYearFilter, setTaxYearFilter] = useState('current');

  const fetchData = useCallback(async () => {
    try {
      const [listRes, summRes] = await Promise.all([
        fetch(`${API_URL}/api/disposals`),
        fetch(`${API_URL}/api/disposals/summary`),
      ]);
      if (listRes.ok) setDisposals(await listRes.json());
      if (summRes.ok) setSummary(await summRes.json());
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getAccountName = (id) => accounts?.find(a => a.id === id)?.name ?? `Account ${id}`;

  const currentBounds = getTaxYearBounds(0);
  const lastBounds = getTaxYearBounds(-1);

  const filteredDisposals = disposals.filter(d => {
    if (taxYearFilter === 'all') return true;
    const bounds = taxYearFilter === 'current' ? currentBounds : lastBounds;
    if (!d.sale_date) return false;
    const date = new Date(d.sale_date);
    return date >= bounds.start && date <= bounds.end;
  });

  const filteredGain = filteredDisposals.reduce((sum, d) => sum + (d.gain_loss_gbp ?? 0), 0);
  const currentYearGain = summary?.current_tax_year_gain_gbp ?? 0;
  const cgtProgress = Math.min((currentYearGain / CGT_EXEMPT) * 100, 100);
  const cgtExceeded = currentYearGain > CGT_EXEMPT;

  const TAX_YEAR_PILLS = [
    { key: 'all', label: 'All time' },
    { key: 'current', label: currentBounds.label },
    { key: 'last', label: lastBounds.label },
  ];

  async function handleDelete(id) {
    if (!confirm('Delete this disposal?')) return;
    await fetch(`${API_URL}/api/disposals/${id}`, { method: 'DELETE' });
    fetchData();
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <TrendingUp size={13} className="text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">Realised Gains</div>
            <div className={`text-xs font-medium mt-0.5 ${currentYearGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatGBP(currentYearGain)} this tax year
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
        >
          <Plus size={12} />
          Log Disposal
        </button>
      </div>

      {/* CGT tracker */}
      <div className="mb-4 bg-slate-800/60 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">CGT allowance used</span>
          <span className={`text-xs font-medium ${cgtExceeded ? 'text-red-400' : 'text-slate-300'}`}>
            {formatGBP(currentYearGain)} / {formatGBP(CGT_EXEMPT)}
          </span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${cgtExceeded ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${cgtProgress}%` }}
          />
        </div>
        {cgtExceeded && (
          <div className="text-xs text-red-400 mt-1">
            Exceeded by {formatGBP(currentYearGain - CGT_EXEMPT)}
          </div>
        )}
        <div className="text-xs text-slate-600 mt-1">£3,000 annual CGT exempt amount</div>
      </div>

      {/* Tax year filter pills */}
      <div className="flex gap-1.5 mb-4">
        {TAX_YEAR_PILLS.map(p => (
          <button
            key={p.key}
            onClick={() => setTaxYearFilter(p.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              taxYearFilter === p.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-slate-800 rounded animate-pulse" />
          ))}
        </div>
      ) : filteredDisposals.length === 0 ? (
        <div className="text-center py-8 text-slate-600">
          <div className="text-2xl mb-2">📋</div>
          <div className="text-xs">No disposals logged{taxYearFilter !== 'all' ? ' for this period' : ''}</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left pb-2 px-2 font-medium text-slate-500">Date</th>
                <th className="text-left pb-2 px-2 font-medium text-slate-500">Ticker</th>
                <th className="text-right pb-2 px-2 font-medium text-slate-500">Qty</th>
                <th className="text-right pb-2 px-2 font-medium text-slate-500">Sale</th>
                <th className="text-right pb-2 px-2 font-medium text-slate-500">Cost</th>
                <th className="text-right pb-2 px-2 font-medium text-slate-500">Gain/Loss</th>
                <th className="text-left pb-2 px-2 font-medium text-slate-500">Account</th>
                <th className="pb-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {filteredDisposals.map(d => (
                <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2 px-2 text-slate-400">{formatDate(d.sale_date)}</td>
                  <td className="py-2 px-2">
                    <div className="font-medium text-slate-200">{d.ticker}</div>
                    {d.display_name && <div className="text-slate-500 truncate max-w-[80px]">{d.display_name}</div>}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-300">{parseFloat(d.quantity).toLocaleString()}</td>
                  <td className="py-2 px-2 text-right text-slate-300">{formatGBP(d.sale_price_gbp)}</td>
                  <td className="py-2 px-2 text-right text-slate-400">
                    {d.cost_basis_gbp != null ? formatGBP(d.cost_basis_gbp) : '—'}
                  </td>
                  <td className={`py-2 px-2 text-right font-medium ${
                    d.gain_loss_gbp == null ? 'text-slate-500' :
                    d.gain_loss_gbp >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {d.gain_loss_gbp != null ? formatGBP(d.gain_loss_gbp) : '—'}
                  </td>
                  <td className="py-2 px-2 text-slate-400 max-w-[80px] truncate">{getAccountName(d.account_id)}</td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700">
                <td colSpan={5} className="pt-2 px-2 text-slate-500 text-xs">Total</td>
                <td className={`pt-2 px-2 text-right font-semibold text-xs ${
                  filteredGain >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {formatGBP(filteredGain)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showAdd && (
        <AddDisposalModal
          accounts={accounts}
          onClose={() => setShowAdd(false)}
          onAdded={() => { fetchData(); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
