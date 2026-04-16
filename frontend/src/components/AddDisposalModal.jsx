import { useState } from 'react';
import { X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function formatGBP(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

export default function AddDisposalModal({ accounts, onClose, onAdded }) {
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    account_id: accounts?.[0]?.id ?? '',
    ticker: '',
    display_name: '',
    quantity: '',
    sale_price_gbp: '',
    cost_basis_gbp: '',
    sale_date: today,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const qty = parseFloat(form.quantity);
  const salePrice = parseFloat(form.sale_price_gbp);
  const costBasis = parseFloat(form.cost_basis_gbp);
  const previewGain = (!isNaN(qty) && !isNaN(salePrice) && !isNaN(costBasis) && form.cost_basis_gbp !== '')
    ? (salePrice - costBasis) * qty
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        account_id: parseInt(form.account_id),
        ticker: form.ticker.toUpperCase().trim(),
        display_name: form.display_name || null,
        quantity: parseFloat(form.quantity),
        sale_price_gbp: parseFloat(form.sale_price_gbp),
        cost_basis_gbp: form.cost_basis_gbp !== '' ? parseFloat(form.cost_basis_gbp) : null,
        sale_date: form.sale_date,
        notes: form.notes || null,
      };
      const res = await fetch(`${API_URL}/api/disposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onAdded();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Log Disposal</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Account</label>
            <select
              value={form.account_id}
              onChange={e => set('account_id', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              required
            >
              {accounts?.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Quantity</label>
              <input
                type="number"
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
                placeholder="100"
                min="0"
                step="any"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Sale Price (£/unit)</label>
              <input
                type="number"
                value={form.sale_price_gbp}
                onChange={e => set('sale_price_gbp', e.target.value)}
                placeholder="10.50"
                min="0"
                step="any"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cost Basis (£/unit)</label>
              <input
                type="number"
                value={form.cost_basis_gbp}
                onChange={e => set('cost_basis_gbp', e.target.value)}
                placeholder="8.00"
                min="0"
                step="any"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Sale Date</label>
            <input
              type="date"
              value={form.sale_date}
              onChange={e => set('sale_date', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any notes..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {previewGain !== null && (
            <div className={`text-sm font-medium rounded-lg px-3 py-2 ${previewGain >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              Gain/Loss: {formatGBP(previewGain)}
            </div>
          )}

          {error && <div className="text-xs text-red-400">{error}</div>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log Disposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
