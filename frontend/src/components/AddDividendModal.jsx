import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../config/api';

export default function AddDividendModal({ accounts, onClose, onSaved }) {
  const [accountId, setAccountId] = useState(accounts?.[0]?.id ?? '');
  const [ticker, setTicker] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [amount, setAmount] = useState('');
  const [exDate, setExDate] = useState('');
  const [payDate, setPayDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!ticker.trim() || !amount.trim() || !accountId) return;
    setSaving(true);
    try {
      const body = {
        account_id: parseInt(accountId),
        ticker: ticker.trim().toUpperCase(),
        amount_gbp: parseFloat(amount),
      };
      if (displayName.trim()) body.display_name = displayName.trim();
      if (exDate) body.ex_date = exDate;
      if (payDate) body.pay_date = payDate;
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiFetch('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      alert(`Failed to save dividend: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Log Dividend Payment</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-blue-500"
            >
              {(accounts ?? []).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={e => setTicker(e.target.value)}
                placeholder="e.g. FCIT.L"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Amount (£)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Display Name <span className="text-slate-600">(optional)</span></label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. City of London Investment Trust"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Ex-Dividend Date</label>
              <input
                type="date"
                value={exDate}
                onChange={e => setExDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Notes <span className="text-slate-600">(optional)</span></label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !ticker.trim() || !amount.trim() || !accountId}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Log Dividend'}
          </button>
        </div>
      </div>
    </div>
  );
}
