import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import AllocationChart from './AllocationChart';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  const [contribSummary, setContribSummary] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/contributions/summary`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setContribSummary(d); })
      .catch(() => {});
  }, []);

  const accountCount = accounts?.length ?? 0;
  const holdingCount = accounts?.reduce((s, a) => s + (a.holdings?.length ?? 0), 0) ?? 0;

  const cashTotal = accounts?.reduce((s, a) =>
    s + (a.holdings ?? []).filter(h => h.ticker === 'CASH' || h.ticker === 'CASH_GBP').reduce((cs, h) => cs + (h.value_gbp ?? 0), 0), 0
  ) ?? 0;
  const investedTotal = (total ?? 0) - cashTotal;

  // GIA unrealised gains (computed first, used in wrapperTotals and CGT tracker)
  const giaHoldings = (accounts ?? [])
    .filter(a => a.account_subtype === 'gia')
    .flatMap(a => a.holdings ?? [])
    .filter(h => h.gain_loss_gbp != null);
  const giaGains = giaHoldings.filter(h => h.gain_loss_gbp > 0).reduce((s, h) => s + h.gain_loss_gbp, 0);
  const giaLosses = giaHoldings.filter(h => h.gain_loss_gbp < 0).reduce((s, h) => s + Math.abs(h.gain_loss_gbp), 0);
  const giaNetGains = giaGains - giaLosses;
  const showCGT = giaHoldings.length > 0;
  const giaTotalValue = (accounts ?? []).filter(a => a.account_subtype === 'gia').reduce((s, a) => s + (a.total_value_gbp ?? 0), 0);

  const wrapperTotals = WRAPPER_GROUPS.map(g => {
    // For GIA (Taxable): show unrealised gains if available, otherwise total value
    if (g.subtypes.includes('gia')) {
      const value = showCGT ? giaNetGains : giaTotalValue;
      const label = showCGT ? 'Gains (GIA)' : 'Taxable';
      return { ...g, label, value };
    }
    return {
      ...g,
      value: (accounts ?? [])
        .filter(a => g.subtypes.includes(a.account_subtype))
        .reduce((s, a) => s + (a.total_value_gbp ?? 0), 0),
    };
  }).filter(g => g.value !== 0 && (g.subtypes.includes('gia') ? giaTotalValue > 0 : g.value > 0));

  // Allowance trackers — use current-tax-year contributions only
  function contribForSubtypes(subtypes) {
    if (!contribSummary) return null;
    const ids = new Set((accounts ?? []).filter(a => subtypes.includes(a.account_subtype)).map(a => a.id));
    return (contribSummary.by_account_current_tax_year ?? [])
      .filter(b => ids.has(b.account_id))
      .reduce((s, b) => s + b.total_gbp, 0);
  }

  const isaContributed = contribForSubtypes(['isa', 'cash_isa', 'lisa']) ??
    (accounts ?? []).filter(a => ['isa', 'cash_isa', 'lisa'].includes(a.account_subtype)).reduce((s, a) => s + (a.total_value_gbp ?? 0), 0);
  const lisaContributed = contribForSubtypes(['lisa']) ??
    (accounts ?? []).filter(a => a.account_subtype === 'lisa').reduce((s, a) => s + (a.total_value_gbp ?? 0), 0);
  const pensionContributed = contribForSubtypes(['sipp']) ??
    (accounts ?? []).filter(a => a.account_subtype === 'sipp').reduce((s, a) => s + (a.total_value_gbp ?? 0), 0);

  const ISA_LIMIT = 20000;
  const LISA_LIMIT = 4000;
  const PENSION_LIMIT = 60000;
  const CGT_EXEMPT = 3000;

  const allowances = [
    { label: 'ISA', contributed: isaContributed, limit: ISA_LIMIT, colour: 'bg-emerald-500' },
    { label: 'LISA', contributed: lisaContributed, limit: LISA_LIMIT, colour: 'bg-violet-500' },
    { label: 'Pension', contributed: pensionContributed, limit: PENSION_LIMIT, colour: 'bg-blue-500' },
  ].filter(a => a.contributed > 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 md:gap-8">
        {/* Left: headline value */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center">
              <DollarSign size={13} className="text-emerald-400" />
            </div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Total Portfolio Value</span>
          </div>

          <div className="text-4xl md:text-5xl font-bold text-slate-50 tracking-tight leading-none mb-1 font-mono">
            {formatGBPShort(total ?? 0)}
          </div>
          <div className="text-sm text-slate-500 font-mono mt-2">
            {formatGBP(total ?? 0)}
          </div>

          {cashTotal > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs font-mono text-slate-500">
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

          {allowances.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-500 font-medium uppercase tracking-widest mb-3">Tax Year Allowances</div>
              <div className="space-y-2.5">
                {allowances.map(a => {
                  const pct = Math.min(100, (a.contributed / a.limit) * 100);
                  const remaining = Math.max(0, a.limit - a.contributed);
                  return (
                    <div key={a.label}>
                      <div className="flex flex-wrap justify-between gap-x-2 text-xs mb-1">
                        <span className="text-slate-400 font-medium">{a.label}</span>
                        <span className="font-mono text-slate-400 text-right">
                          {formatGBP(a.contributed)} / {formatGBP(a.limit)}
                          {remaining > 0 && <span className="text-slate-600 hidden sm:inline"> · {formatGBP(remaining)} left</span>}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : a.colour}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showCGT && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-500 font-medium uppercase tracking-widest mb-3">CGT (GIA)</div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400 font-medium">Unrealised Gains (GIA)</span>
                  <span className={`font-mono font-medium ${giaNetGains >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {giaNetGains >= 0 ? '' : '-'}{formatGBP(Math.abs(giaNetGains))}
                    <span className="text-slate-600"> / {formatGBP(CGT_EXEMPT)}</span>
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${giaNetGains > CGT_EXEMPT ? 'bg-red-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, (giaNetGains / CGT_EXEMPT) * 100))}%` }}
                  />
                </div>
                <div className="text-xs text-slate-600 mt-1">£3,000 annual CGT exempt amount · 18%/24% on gains above</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 pt-4 border-t border-slate-800">
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
        <div className="w-full md:w-64 md:flex-shrink-0 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
          <div className="text-xs text-slate-500 font-medium uppercase tracking-widest mb-3">Allocation</div>
          <AllocationChart accounts={accounts} />
        </div>
      </div>
    </div>
  );
}
