import { DollarSign } from 'lucide-react';
import AllocationChart from './AllocationChart';

function formatGBP(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatGBPShort(value) {
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(2)}K`;
  return formatGBP(value);
}

export default function TotalValuePanel({ accounts, total }) {
  const accountCount = accounts?.length ?? 0;
  const holdingCount = accounts?.reduce((s, a) => s + (a.holdings?.length ?? 0), 0) ?? 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-start justify-between gap-8">
        {/* Left: headline value */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center">
              <DollarSign size={13} className="text-emerald-400" />
            </div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Total Portfolio Value</span>
          </div>

          <div className="text-5xl font-bold text-slate-50 tracking-tight leading-none mb-1 font-mono">
            {formatGBPShort(total ?? 0)}
          </div>
          <div className="text-sm text-slate-500 font-mono mt-2">
            {formatGBP(total ?? 0)}
          </div>

          <div className="flex items-center gap-6 mt-6 pt-4 border-t border-slate-800">
            <div>
              <div className="text-lg font-semibold text-slate-200">{accountCount}</div>
              <div className="text-xs text-slate-500">Accounts</div>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div>
              <div className="text-lg font-semibold text-slate-200">{holdingCount}</div>
              <div className="text-xs text-slate-500">Holdings</div>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div>
              <div className="text-xs font-mono text-emerald-400 font-semibold">GBP</div>
              <div className="text-xs text-slate-500">Currency</div>
            </div>
          </div>
        </div>

        {/* Right: allocation chart */}
        <div className="w-64 flex-shrink-0">
          <div className="text-xs text-slate-500 font-medium uppercase tracking-widest mb-3">Allocation</div>
          <AllocationChart accounts={accounts} />
        </div>
      </div>
    </div>
  );
}
