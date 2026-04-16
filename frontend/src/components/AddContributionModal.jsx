import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../config/api';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AddContributionModal({ accounts, onClose, onSaved }) {
  const [accountId, setAccountId] = useState(accounts?.[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!amount.trim() || !accountId || !date) return;
    setSaving(true);
    try {
      const body = {
        account_id: parseInt(accountId),
        amount_gbp: parseFloat(amount),
        date,
      };
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiFetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      alert(`Failed to save contribution: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-widest">Log Contribution</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">Account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
            >
              {(accounts ?? []).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">Amount (£)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Monthly contribution"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !amount || !accountId || !date}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
