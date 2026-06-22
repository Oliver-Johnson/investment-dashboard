import { useState } from 'react';
import { Edit3, Trash2, Tag, X, Plus, Check } from 'lucide-react';
import { apiFetch } from '../config/api';

function formatGBP(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatNumber(n, decimals = 4) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

// Colour coding: SEIS = green, EIS = blue, anything else = grey.
function tagStyle(tag) {
  const t = String(tag).toUpperCase();
  if (t === 'SEIS') return { color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)' };
  if (t === 'EIS') return { color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' };
  return { color: '#9ca3af', backgroundColor: 'rgba(107,114,128,0.15)', borderColor: 'rgba(107,114,128,0.4)' };
}

const PRESET_TAGS = ['SEIS', 'EIS'];

export default function HoldingRow({ holding, isManual, onEdit, onDeleted, onShowHistory, indent = false, isPieHolding = false }) {
  const [deleting, setDeleting] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const price = holding.price_gbp ?? holding.current_price ?? 0;
  const value = holding.value_gbp ?? ((holding.unit_count ?? 0) * price);
  const tags = holding.tags || [];
  const isCash = holding.ticker === 'CASH' || holding.ticker === 'CASH_GBP';

  async function handleDelete() {
    if (!confirm(`Delete holding "${holding.ticker}"?`)) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/holdings/${holding.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      onDeleted();
    } catch (e) {
      alert(`Failed to delete: ${e.message}`);
      setDeleting(false);
    }
  }

  function openTagEditor() {
    setDraftTags(tags);
    setTagInput('');
    setEditingTags(true);
  }

  function addTag(raw) {
    const tag = String(raw).trim();
    if (!tag) return;
    if (draftTags.some(t => t.toLowerCase() === tag.toLowerCase())) return;
    setDraftTags([...draftTags, tag]);
    setTagInput('');
  }

  function removeTag(tag) {
    setDraftTags(draftTags.filter(t => t !== tag));
  }

  async function handleSaveTags() {
    setSavingTags(true);
    try {
      const res = await apiFetch('/api/holdings/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: holding.account_id,
          ticker: holding.ticker,
          tags: draftTags,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setEditingTags(false);
      onDeleted();  // refresh portfolio data
    } catch (e) {
      alert(`Failed to save tags: ${e.message}`);
    } finally {
      setSavingTags(false);
    }
  }

  return (
    <>
      <tr className={`group border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors${isPieHolding ? ' bg-indigo-950/20' : ''}`}>
        <td className={`py-2.5 pr-4 min-w-0 ${indent ? 'pl-7' : 'pl-3'}`}>
          <button
            onClick={() => onShowHistory && onShowHistory(holding)}
            className="text-left group/name w-full"
            title="View price history"
          >
            <span className="text-xs font-semibold text-slate-200 leading-tight block break-words group-hover/name:text-blue-400 transition-colors">
              {holding.display_name || holding.name || holding.ticker}
              {isPieHolding && holding.pie?.name && (
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 align-middle">
                  {holding.pie.name}
                </span>
              )}
            </span>
            <div className="text-xs text-slate-500 font-mono hidden sm:block">{holding.ticker}</div>
          </button>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                  style={tagStyle(tag)}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="py-2.5 px-4 text-right">
          <span className="font-mono text-xs text-slate-300">
            {formatNumber(holding.unit_count)}
          </span>
        </td>
        <td className="py-2.5 px-4 text-right">
          <span className="font-mono text-xs text-slate-400">
            {formatGBP(price)}
          </span>
        </td>
        <td className="py-2.5 pl-4 pr-3 text-right">
          <span className="font-mono text-xs font-semibold text-slate-200">
            {formatGBP(value)}
          </span>
        </td>
        <td className="py-2.5 px-4 text-right hidden md:table-cell">
          {holding.gain_loss_gbp != null ? (
            <div className={`font-mono text-xs ${holding.gain_loss_gbp >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              <div>{holding.gain_loss_gbp >= 0 ? '+' : ''}{formatGBP(holding.gain_loss_gbp)}</div>
              {holding.gain_loss_pct != null && (
                <div className="text-xs opacity-75">
                  {holding.gain_loss_pct >= 0 ? '+' : ''}{holding.gain_loss_pct.toFixed(1)}%
                </div>
              )}
            </div>
          ) : (
            <span className="text-slate-700 text-xs">—</span>
          )}
        </td>
        <td className="py-2.5 pr-3 text-right w-16">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
            {!isCash && (
              <button
                onClick={openTagEditor}
                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
                title="Edit tags"
              >
                <Tag size={11} />
              </button>
            )}
            {isManual && (
              <button
                onClick={() => onEdit(holding)}
                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
                title="Edit holding"
              >
                <Edit3 size={11} />
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
              title="Delete holding"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </td>
      </tr>

      {editingTags && (
        <tr className="bg-slate-800/40 border-t border-slate-800/60">
          <td colSpan={6} className={`py-3 pr-3 ${indent ? 'pl-7' : 'pl-3'}`}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500 font-medium mr-1">Tags:</span>
                {draftTags.length === 0 && (
                  <span className="text-[11px] text-slate-600 italic">none</span>
                )}
                {draftTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                    style={tagStyle(tag)}
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:opacity-70" title="Remove">
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_TAGS.filter(p => !draftTags.some(t => t.toLowerCase() === p.toLowerCase())).map(preset => (
                  <button
                    key={preset}
                    onClick={() => addTag(preset)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-dashed hover:bg-slate-700/50 transition-colors"
                    style={tagStyle(preset)}
                  >
                    <Plus size={9} />{preset}
                  </button>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
                    if (e.key === 'Escape') setEditingTags(false);
                  }}
                  placeholder="Custom tag…"
                  className="w-28 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => addTag(tagInput)}
                  disabled={!tagInput.trim()}
                  className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
                <span className="flex-1" />
                <button
                  onClick={handleSaveTags}
                  disabled={savingTags}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
                >
                  <Check size={10} />{savingTags ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingTags(false)}
                  className="px-2 py-0.5 rounded text-[11px] text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export { formatGBP };
