import React, { useState, useEffect } from 'react';
import { X, Building2, PieChart, ChevronDown, ChevronUp } from 'lucide-react';
import HoldingRow, { formatGBP } from './HoldingRow';
import FreshnessIndicator from './FreshnessIndicator';

const SUBTYPE_LABELS = {
  isa: 'ISA', cash_isa: 'Cash ISA', lisa: 'LISA', sipp: 'Pension', gia: 'GIA'
};
const SUBTYPE_COLOURS = {
  isa: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  cash_isa: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  lisa: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  sipp: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  gia: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
};

export default function AccountExpandModal({ account, onClose, onDataChanged, portfolioTotal }) {
  const [expandedPies, setExpandedPies] = useState(new Set());

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Open all pies by default in the modal
  useEffect(() => {
    if (!account?.holdings) return;
    const pieIds = new Set();
    for (const h of account.holdings) {
      if (h.pie) pieIds.add(h.pie.id);
    }
    setExpandedPies(pieIds);
  }, [account]);

  const isManual = !['t212', 't212_invest', 'etoro'].includes(account.account_type);
  const colour = account.colour || '#6366f1';
  const subtypeLabel = account.account_subtype ? SUBTYPE_LABELS[account.account_subtype] : null;
  const subtypeColour = account.account_subtype
    ? (SUBTYPE_COLOURS[account.account_subtype] || 'text-slate-400 border-slate-600 bg-slate-800')
    : '';

  const total = account.total_value_gbp ?? account.holdings?.reduce(
    (sum, h) => sum + (h.unit_count ?? 0) * (h.current_price ?? 0), 0
  ) ?? 0;

  const totalGainLoss = account.holdings?.reduce((sum, h) => {
    return h.gain_loss_gbp != null ? sum + h.gain_loss_gbp : sum;
  }, null);
  const hasGainLoss = totalGainLoss !== null;

  const sortHoldings = (arr) => [...arr].sort((a, b) => {
    const aCash = a.ticker === 'CASH' || a.ticker === 'CASH_GBP';
    const bCash = b.ticker === 'CASH' || b.ticker === 'CASH_GBP';
    if (aCash !== bCash) return aCash ? 1 : -1;
    const bv = b.value_gbp ?? 0;
    const av = a.value_gbp ?? 0;
    if (bv !== av) return bv - av;
    return (a.ticker ?? '').localeCompare(b.ticker ?? '');
  });

  const togglePie = (id) => setExpandedPies(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const isT212 = ['t212', 't212_invest'].includes(account.account_type);
  let pies = [];
  let flatHoldings = [];

  if (isT212 && account.holdings) {
    const pieMap = {};
    for (const h of account.holdings) {
      if (h.pie) {
        const key = h.pie.id;
        if (!pieMap[key]) pieMap[key] = { id: h.pie.id, name: h.pie.name, holdings: [] };
        pieMap[key].holdings.push(h);
      } else {
        flatHoldings.push(h);
      }
    }
    pies = Object.values(pieMap).sort((a, b) => {
      const aTotal = a.holdings.reduce((s, h) => s + (h.value_gbp ?? 0), 0);
      const bTotal = b.holdings.reduce((s, h) => s + (h.value_gbp ?? 0), 0);
      return bTotal - aTotal;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl bg-slate-900 border rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ borderColor: colour + '40' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-800/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0"
              style={{ border: `1px solid ${colour}40` }}
            >
              <Building2 size={18} style={{ color: colour }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-slate-100">{account.name}</h2>
                {subtypeLabel && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border font-medium ${subtypeColour}`}>
                    {subtypeLabel}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border font-medium ${
                  isManual
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  {isManual ? (
                    <><span className="w-1 h-1 rounded-full bg-slate-500" />Manual</>
                  ) : (
                    <><span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />Live API</>
                  )}
                </span>
                {isManual && account.last_updated && (
                  <FreshnessIndicator lastUpdated={account.last_updated} iconOnly />
                )}
              </div>
              <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                <span className="text-xl font-bold font-mono" style={{ color: colour }}>
                  {formatGBP(total)}
                </span>
                {hasGainLoss && (
                  <span className={`text-sm font-mono ${totalGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalGainLoss >= 0 ? '+' : ''}{formatGBP(totalGainLoss)}
                  </span>
                )}
                {portfolioTotal > 0 && (
                  <span className="text-xs text-slate-500 font-mono">
                    {((total / portfolioTotal) * 100).toFixed(1)}% of portfolio
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 ml-4"
          >
            <X size={16} />
          </button>
        </div>

        {/* Summary stats */}
        <div className="px-6 py-3 border-b border-slate-800/40 flex items-center gap-6 text-xs text-slate-500 flex-shrink-0">
          <span>{account.holdings?.length ?? 0} holding{account.holdings?.length !== 1 ? 's' : ''}</span>
          {account.cash_balance_gbp > 0 && (
            <span>GBP Cash: <span className="text-slate-300 font-mono">{formatGBP(account.cash_balance_gbp)}</span></span>
          )}
        </div>

        {/* Holdings table */}
        <div className="overflow-y-auto flex-1">
          {account.holdings && account.holdings.length > 0 ? (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-900 z-10 border-b border-slate-800/40">
                <tr className="text-xs text-slate-600 uppercase tracking-wider">
                  <th className="pb-2 pt-3 pl-6 pr-4 font-medium">Ticker</th>
                  <th className="pb-2 pt-3 px-4 text-right font-medium">Units</th>
                  <th className="pb-2 pt-3 px-4 text-right font-medium">Price</th>
                  <th className="pb-2 pt-3 pl-4 pr-6 text-right font-medium">Value</th>
                  <th className="pb-2 pt-3 px-4 text-right font-medium">Gain/Loss</th>
                  <th className="pb-2 pt-3 pr-6 w-16" />
                </tr>
              </thead>
              <tbody>
                {isT212 ? (
                  <>
                    {pies.map(pie => {
                      const pieTotal = pie.holdings.reduce((s, h) => s + (h.value_gbp ?? 0), 0);
                      const pieGainLoss = pie.holdings.some(h => h.gain_loss_gbp != null)
                        ? pie.holdings.reduce((s, h) => s + (h.gain_loss_gbp ?? 0), 0)
                        : null;
                      const isOpen = expandedPies.has(pie.id);
                      return (
                        <React.Fragment key={`pie-${pie.id}`}>
                          <tr
                            className="cursor-pointer bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
                            onClick={() => togglePie(pie.id)}
                          >
                            <td colSpan="3" className="py-2 pl-6 pr-4">
                              <div className="flex items-center gap-2">
                                {isOpen ? <ChevronUp size={11} className="text-slate-500" /> : <ChevronDown size={11} className="text-slate-500" />}
                                <PieChart size={11} className="text-slate-500" />
                                <span className="text-xs font-semibold text-slate-200">{pie.name}</span>
                                <span className="text-xs text-slate-500">{pie.holdings.length} holding{pie.holdings.length !== 1 ? 's' : ''}</span>
                              </div>
                            </td>
                            <td className="py-2 pl-4 pr-6 text-right">
                              <span className="font-mono text-xs font-semibold text-slate-200">{formatGBP(pieTotal)}</span>
                            </td>
                            <td className="py-2 px-4 text-right">
                              {pieGainLoss != null ? (
                                <div className={`font-mono text-xs ${pieGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {pieGainLoss >= 0 ? '+' : ''}{formatGBP(pieGainLoss)}
                                </div>
                              ) : (
                                <span className="text-slate-700 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-6 w-16" />
                          </tr>
                          {isOpen && sortHoldings(pie.holdings).map(holding => (
                            <HoldingRow
                              key={holding.id || holding.ticker}
                              holding={holding}
                              isManual={isManual}
                              onEdit={() => {}}
                              onDeleted={onDataChanged}
                              onShowHistory={() => {}}
                              indent
                              isPieHolding
                            />
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {sortHoldings(flatHoldings).map(holding => (
                      <HoldingRow
                        key={holding.id || holding.ticker}
                        holding={holding}
                        isManual={isManual}
                        onEdit={() => {}}
                        onDeleted={onDataChanged}
                        onShowHistory={() => {}}
                      />
                    ))}
                  </>
                ) : (
                  sortHoldings(account.holdings).map(holding => (
                    <HoldingRow
                      key={holding.id}
                      holding={holding}
                      isManual={isManual}
                      onEdit={() => {}}
                      onDeleted={onDataChanged}
                      onShowHistory={() => {}}
                    />
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-slate-600 text-sm">No holdings</div>
          )}
        </div>
      </div>
    </div>
  );
}
