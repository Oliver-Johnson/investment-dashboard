import { useState } from 'react';
import { Building2, TrendingUp, Globe, Leaf, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import HoldingRow, { formatGBP } from './HoldingRow';
import FreshnessIndicator from './FreshnessIndicator';
import EditHoldingModal from './EditHoldingModal';

const PROVIDER_ICONS = {
  barclays: Building2,
  't212': TrendingUp,
  'trading212': TrendingUp,
  freetrade: Leaf,
  columbia: Globe,
  etoro: BarChart2,
};

const PROVIDER_COLORS = {
  barclays: { from: 'from-blue-900/30', border: 'border-blue-800/30', accent: 'text-blue-400', badge: 'bg-blue-900/40 text-blue-300 border-blue-800/50' },
  't212': { from: 'from-indigo-900/30', border: 'border-indigo-800/30', accent: 'text-indigo-400', badge: 'bg-indigo-900/40 text-indigo-300 border-indigo-800/50' },
  'trading212': { from: 'from-indigo-900/30', border: 'border-indigo-800/30', accent: 'text-indigo-400', badge: 'bg-indigo-900/40 text-indigo-300 border-indigo-800/50' },
  freetrade: { from: 'from-emerald-900/30', border: 'border-emerald-800/30', accent: 'text-emerald-400', badge: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50' },
  columbia: { from: 'from-purple-900/30', border: 'border-purple-800/30', accent: 'text-purple-400', badge: 'bg-purple-900/40 text-purple-300 border-purple-800/50' },
  etoro: { from: 'from-teal-900/30', border: 'border-teal-800/30', accent: 'text-teal-400', badge: 'bg-teal-900/40 text-teal-300 border-teal-800/50' },
};

function getKey(name) {
  return name?.toLowerCase().replace(/[\s-]/g, '') ?? '';
}

function getDefaults() {
  return { from: 'from-slate-800/50', border: 'border-slate-700/50', accent: 'text-slate-400', badge: 'bg-slate-800 text-slate-400 border-slate-700' };
}

export default function ProviderCard({ provider, onDataChanged }) {
  const [editingHolding, setEditingHolding] = useState(null);
  const [expanded, setExpanded] = useState(true);

  const key = getKey(provider.provider_name);
  const colors = PROVIDER_COLORS[key] ?? getDefaults();
  const Icon = PROVIDER_ICONS[key] ?? Building2;

  const isManual = provider.source === 'manual';
  const total = provider.holdings?.reduce(
    (sum, h) => sum + (h.unit_count ?? 0) * (h.current_price ?? 0),
    0
  ) ?? provider.total_value ?? 0;

  const lastUpdated = provider.holdings?.[0]?.last_holding_update ?? provider.last_updated;

  return (
    <>
      <div className={`bg-gradient-to-b ${colors.from} to-slate-900 border ${colors.border} bg-slate-900 rounded-xl overflow-hidden`}>
        {/* Card header */}
        <div className="px-5 py-4 border-b border-slate-800/60">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={colors.accent} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">{provider.provider_name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {/* Source badge */}
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border font-medium ${
                    isManual
                      ? 'bg-slate-800 text-slate-400 border-slate-700'
                      : `bg-emerald-500/10 text-emerald-400 border-emerald-500/20`
                  }`}>
                    {isManual ? (
                      <><span className="w-1 h-1 rounded-full bg-slate-500" />Manual</>
                    ) : (
                      <><span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />Live API</>
                    )}
                  </span>
                  {isManual && lastUpdated && (
                    <FreshnessIndicator lastUpdated={lastUpdated} expiryHours={48} />
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={`text-xl font-bold font-mono ${colors.accent}`}>
                {formatGBP(total)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {provider.holdings?.length ?? 0} holding{provider.holdings?.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Holdings table */}
        {provider.holdings && provider.holdings.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-slate-500 hover:text-slate-400 hover:bg-slate-800/30 transition-colors"
            >
              <span>Holdings</span>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {expanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-slate-600 uppercase tracking-wider">
                      <th className="pb-2 pl-3 pr-4 font-medium">Ticker</th>
                      <th className="pb-2 px-4 text-right font-medium">Units</th>
                      <th className="pb-2 px-4 text-right font-medium">Price</th>
                      <th className="pb-2 pl-4 pr-3 text-right font-medium">Value</th>
                      {isManual && <th className="pb-2 pr-3 w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {provider.holdings.map(holding => (
                      <HoldingRow
                        key={holding.id}
                        holding={holding}
                        isManual={isManual}
                        onEdit={setEditingHolding}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {(!provider.holdings || provider.holdings.length === 0) && (
          <div className="px-5 py-6 text-center text-xs text-slate-600">
            No holdings found
          </div>
        )}
      </div>

      <EditHoldingModal
        holding={editingHolding}
        onClose={() => setEditingHolding(null)}
        onSaved={onDataChanged}
      />
    </>
  );
}
