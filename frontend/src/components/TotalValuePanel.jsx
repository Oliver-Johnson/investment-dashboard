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

const WRAPPER_GROUPS = [
  { label: 'Tax-free', subtypes: ['isa', 'cash_isa', 'lisa'], colour: 'text-emerald-400' },
  { label: 'Pension', subtypes: ['sipp'], colour: 'text-blue-400' },
  { label: 'Taxable', subtypes: ['gia'], colour: 'text-amber-400' },
];

export default function TotalValuePanel({ accounts, total }) {
  const accountCount = accounts?.length ?? 0;
  const holdingCount = accounts?.reduce((s, a) => s + (a.holdings?.length ?? 0), 0) ?? 0;

  const cashTotal = accounts?.reduce((s, a) =>
    s + (a.holdings ?? []).filter(h => h.ticker === 'CASH' || h.ticker === 'CASH_GBP').reduce((cs, h) => cs + (h.value_gbp ?? 0), 0), 0
  ) ?? 0;
  const investedTotal = (total ?? 0) - cashTotal;

  const wrapperTotals = WRAPPER_GROUPS.map(g => ({
    ...g,
    value: (accounts ?? [])
      .filter(a => g.subtypes.includes(a.account_subtype))
      .reduce((s, a) => s + (a.total_value_gbp ?? 0), 0),
  })).filter(g => g.value > 0);

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

          {cashTotal > 0 && (
            <div className="flex items-center gap-4 mt-3 text-xs font-mono text-slate-500">
              <span>Invested <span className="text-slate-300">{formatGBP(investedTotal)}</span></span>
              <span className="text-slate-700">·</span>
              <span>Cash <span className="text-slate-300">{formatGBP(cashTotal)}</span></span>
            </div>
          )}

          {wrapperTotals.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs font-mono text-slate-500">
              {wrapperTotals.map((g, i) => (
                <span key={i}>
                  <span className={g.colour}>{g.label}</span>{' '}
                  <span className="text-slate-300">{formatGBP(g.value)}</span>
                </span>
              ))}
            </div>
          )}

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
