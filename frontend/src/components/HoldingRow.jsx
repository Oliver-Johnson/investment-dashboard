import { Edit3 } from 'lucide-react';

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

export default function HoldingRow({ holding, isManual, onEdit }) {
  const value = (holding.unit_count ?? 0) * (holding.current_price ?? 0);

  return (
    <tr className="group border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors">
      <td className="py-2.5 pl-3 pr-4">
        <span className="font-mono text-xs font-semibold text-slate-200 tracking-wide">
          {holding.ticker}
        </span>
        {holding.name && (
          <div className="text-xs text-slate-500 truncate max-w-[120px]">{holding.name}</div>
        )}
      </td>
      <td className="py-2.5 px-4 text-right">
        <span className="font-mono text-xs text-slate-300">
          {formatNumber(holding.unit_count)}
        </span>
      </td>
      <td className="py-2.5 px-4 text-right">
        <span className="font-mono text-xs text-slate-400">
          {formatGBP(holding.current_price)}
        </span>
      </td>
      <td className="py-2.5 pl-4 pr-3 text-right">
        <span className="font-mono text-xs font-semibold text-slate-200">
          {formatGBP(value)}
        </span>
      </td>
      {isManual && (
        <td className="py-2.5 pr-3 text-right w-8">
          <button
            onClick={() => onEdit(holding)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-all"
            title="Edit holding"
          >
            <Edit3 size={11} />
          </button>
        </td>
      )}
    </tr>
  );
}

export { formatGBP };
