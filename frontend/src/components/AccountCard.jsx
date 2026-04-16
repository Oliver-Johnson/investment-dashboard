import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Trash2, Loader2, Pencil } from 'lucide-react';
import HoldingRow, { formatGBP } from './HoldingRow';
import FreshnessIndicator from './FreshnessIndicator';
import EditHoldingModal from './EditHoldingModal';
import EditAccountModal from './EditAccountModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AccountCard({ account, onDataChanged, onAddHolding, portfolioTotal }) {
  const [editingHolding, setEditingHolding] = useState(null);
  const [editingAccount, setEditingAccount] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');

  const isManual = !['t212', 't212_invest', 'etoro'].includes(account.account_type);
  const colour = account.colour || '#6366f1';

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
  const subtypeLabel = account.account_subtype ? SUBTYPE_LABELS[account.account_subtype] : null;
  const subtypeColour = account.account_subtype ? (SUBTYPE_COLOURS[account.account_subtype] || 'text-slate-400 border-slate-600 bg-slate-800') : '';

  const total = account.total_value_gbp ?? account.holdings?.reduce(
    (sum, h) => sum + (h.unit_count ?? 0) * (h.current_price ?? 0),
    0
  ) ?? 0;

  const totalGainLoss = account.holdings?.reduce((sum, h) => {
    return h.gain_loss_gbp != null ? sum + h.gain_loss_gbp : sum;
  }, null);
  const hasGainLoss = totalGainLoss !== null;

  async function handleSaveCash() {
    const val = parseFloat(cashInput);
    await fetch(`${API_URL}/api/accounts/${account.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cash_balance_gbp: isNaN(val) ? null : val }),
    });
    setEditingCash(false);
    onDataChanged();
  }

  async function handleDeleteAccount() {
    if (!confirm(`Delete account "${account.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/accounts/${account.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      onDataChanged();
    } catch (e) {
      alert(`Failed to delete account: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="bg-slate-900 border rounded-xl overflow-hidden"
        style={{ borderColor: colour + '33' }}
      >
        {/* Card header */}
        <div className="px-5 py-4 border-b border-slate-800/60">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0"
                style={{ border: `1px solid ${colour}40` }}
              >
                <Building2 size={16} style={{ color: colour }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-100 break-words">{account.name}</h3>
                  <button
                    onClick={() => setEditingAccount(true)}
                    className="p-0.5 rounded hover:bg-slate-700 text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
                    title="Edit account"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border font-medium hidden sm:inline-flex ${
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
                  {subtypeLabel && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border font-medium ${subtypeColour}`}>
                      {subtypeLabel}
                    </span>
                  )}
                  {isManual && account.last_updated && (
                    <FreshnessIndicator lastUpdated={account.last_updated} expiryHours={336} iconOnly />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="text-right flex-shrink-0">
                <div className="text-lg md:text-xl font-bold font-mono" style={{ color: colour }}>
                  {formatGBP(total)}
                </div>
                {hasGainLoss && (
                  <div className={`text-xs font-mono mt-0.5 ${totalGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalGainLoss >= 0 ? '+' : ''}{formatGBP(totalGainLoss)}
                  </div>
                )}
                {portfolioTotal > 0 && (
                  <div className="text-xs text-slate-600 font-mono">
                    {((account.total_value_gbp / portfolioTotal) * 100).toFixed(1)}% of portfolio
                  </div>
                )}
                <div className="text-xs text-slate-500 mt-0.5">
                  {account.holdings?.length ?? 0} holding{account.holdings?.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="p-1.5 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"
                title="Delete account"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Loading state while live API data is being fetched */}
        {account.loading && (
          <div className="px-5 py-4 flex items-center gap-2 text-xs text-slate-500 border-b border-slate-800/40">
            <Loader2 size={12} className="animate-spin text-slate-600" />
            Fetching live data…
          </div>
        )}

        {/* Holdings table */}
        {!account.loading && account.holdings && account.holdings.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-slate-500 hover:text-slate-400 hover:bg-slate-800/30 transition-colors"
            >
              <span>Holdings</span>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {expanded && (
              <div className="overflow-x-auto overflow-y-auto max-h-96">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="text-xs text-slate-600 uppercase tracking-wider">
                      <th className="pb-2 pl-3 pr-4 font-medium">Ticker</th>
                      <th className="pb-2 px-4 text-right font-medium">Units</th>
                      <th className="pb-2 px-4 text-right font-medium">Price</th>
                      <th className="pb-2 pl-4 pr-3 text-right font-medium">Value</th>
                      <th className="pb-2 px-4 text-right font-medium hidden md:table-cell">Gain/Loss</th>
                      <th className="pb-2 pr-3 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {account.holdings.map(holding => (
                      <HoldingRow
                        key={holding.id}
                        holding={holding}
                        isManual={isManual}
                        onEdit={setEditingHolding}
                        onDeleted={onDataChanged}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer: cash balance + add holding */}
        <div className="px-5 py-3 border-t border-slate-800/40 space-y-2">
          {/* Manual GBP cash balance row (shown for all account types) */}
          <div className="flex items-center justify-between">
            {editingCash ? (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-slate-400">GBP Cash £</span>
                <input
                  type="number"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveCash(); if (e.key === 'Escape') setEditingCash(false); }}
                  autoFocus
                  step="0.01"
                  min="0"
                  className="w-28 px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
                <button onClick={handleSaveCash} className="text-xs text-emerald-400 hover:text-emerald-300 px-1">Save</button>
                <button onClick={() => setEditingCash(false)} className="text-xs text-slate-500 hover:text-slate-400 px-1">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => { setCashInput(account.cash_balance_gbp != null ? String(account.cash_balance_gbp) : ''); setEditingCash(true); }}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                {account.cash_balance_gbp > 0
                  ? `GBP Cash: ${formatGBP(account.cash_balance_gbp)}`
                  : <><span className="sm:hidden">+ Set cash</span><span className="hidden sm:inline">+ Set GBP cash balance</span></>}
              </button>
            )}
            <button
              onClick={() => onAddHolding(account)}
              className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
            >
              + Add holding
            </button>
          </div>
        </div>
      </div>

      <EditHoldingModal
        holding={editingHolding}
        onClose={() => setEditingHolding(null)}
        onSaved={onDataChanged}
      />

      {editingAccount && (
        <EditAccountModal
          account={account}
          onClose={() => setEditingAccount(false)}
          onSaved={() => { setEditingAccount(false); onDataChanged(); }}
        />
      )}
    </>
  );
}
