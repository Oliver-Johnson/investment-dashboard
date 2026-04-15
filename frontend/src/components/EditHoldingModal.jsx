import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { formatGBP } from './HoldingRow';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function EditHoldingModal({ holding, onClose, onSaved }) {
  const [units, setUnits] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (holding) setUnits(String(holding.unit_count ?? ''));
  }, [holding]);

  if (!holding) return null;

  const preview = (parseFloat(units) || 0) * (holding.current_price ?? 0);
  const hasChanged = parseFloat(units) !== holding.unit_count;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/portfolio/holdings/${holding.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_count: parseFloat(units) }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Edit Holding</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{holding.ticker}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium">Unit Count</label>
            <input
              type="number"
              value={units}
              onChange={e => setUnits(e.target.value)}
              step="0.0001"
              min="0"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
              placeholder="0.0000"
              autoFocus
            />
          </div>

          {/* Preview */}
          <div className="flex items-center justify-between px-3 py-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div>
              <div className="text-xs text-slate-500">Current price</div>
              <div className="text-sm font-mono text-slate-300">{formatGBP(holding.current_price)}</div>
            </div>
            <div className="text-slate-600">×</div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Estimated value</div>
              <div className="text-sm font-mono font-semibold text-emerald-400">{formatGBP(preview)}</div>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanged || !units}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
