import { useState } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
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

export default function HoldingRow({ holding, isManual, onEdit, onDeleted, onShowHistory }) {
  const [deleting, setDeleting] = useState(false);
  const price = holding.price_gbp ?? holding.current_price ?? 0;
  const value = holding.value_gbp ?? ((holding.unit_count ?? 0) * price);

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

  return (
    <tr className="group border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors">
      <td className="py-2.5 pl-3 pr-4">
        <button
          onClick={() => onShowHistory && onShowHistory(holding)}
          className="text-left group/name"
          title="View price history"
        >
          <span className="text-xs font-semibold text-slate-200 leading-tight block truncate max-w-[120px] sm:max-w-none group-hover/name:text-blue-400 transition-colors">
            {holding.display_name || holding.name || holding.ticker}
          </span>
          <div className="text-xs text-slate-500 font-mono hidden sm:block">{holding.ticker}</div>
        </button>
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
  );
}

export { formatGBP };
