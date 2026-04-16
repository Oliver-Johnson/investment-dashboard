import { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { apiFetch } from '../config/api';

const PRESET_COLOURS = [
  { name: 'blue',   value: '#3b82f6' },
  { name: 'green',  value: '#10b981' },
  { name: 'purple', value: '#8b5cf6' },
  { name: 'teal',   value: '#14b8a6' },
  { name: 'orange', value: '#f97316' },
  { name: 'red',    value: '#ef4444' },
  { name: 'pink',   value: '#ec4899' },
  { name: 'slate',  value: '#64748b' },
];

const ACCOUNT_TYPES = [
  { value: 'manual',      label: 'Manual' },
  { value: 't212',        label: 'Trading 212 ISA' },
  { value: 't212_invest', label: 'Trading 212 Invest' },
  { value: 'etoro',       label: 'eToro' },
];

const SUBTYPES = [
  { value: '',         label: 'None / Unknown' },
  { value: 'isa',      label: 'Stocks & Shares ISA' },
  { value: 'cash_isa', label: 'Cash ISA' },
  { value: 'lisa',     label: 'Lifetime ISA (LISA)' },
  { value: 'sipp',     label: 'Pension (SIPP)' },
  { value: 'gia',      label: 'General (GIA) — taxable' },
];

export default function CreateAccountModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('manual');
  const [accountSubtype, setAccountSubtype] = useState('');
  const [colour, setColour] = useState(PRESET_COLOURS[0].value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          account_type: accountType,
          account_subtype: accountSubtype || null,
          colour,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Add Account</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Barclays Smart Investor"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Account Type</label>
              <select
                value={accountType}
                onChange={e => setAccountType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
              >
                {ACCOUNT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Tax Wrapper</label>
              <select
                value={accountSubtype}
                onChange={e => setAccountSubtype(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
              >
                {SUBTYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLOURS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColour(c.value)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    colour === c.value
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ background: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
