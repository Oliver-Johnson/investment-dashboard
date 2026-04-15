import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import HoldingRow, { formatGBP } from './HoldingRow';
import FreshnessIndicator from './FreshnessIndicator';
import EditHoldingModal from './EditHoldingModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AccountCard({ account, onDataChanged, onAddHolding }) {
  const [editingHolding, setEditingHolding] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const isManual = !['t212', 'etoro'].includes(account.account_type);
  const colour = account.colour || '#6366f1';

  const total = account.total_value_gbp ?? account.holdings?.reduce(
    (sum, h) => sum + (h.unit_count ?? 0) * (h.current_price ?? 0),
    0
  ) ?? 0;

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
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0"
                style={{ border: `1px solid ${colour}40` }}
              >
                <Building2 size={16} style={{ color: colour }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">{account.name}</h3>
                <div className="flex items-center gap-2 mt-1">
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
                    <FreshnessIndicator lastUpdated={account.last_updated} expiryHours={48} />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="text-right">
                <div className="text-xl font-bold font-mono" style={{ color: colour }}>
                  {formatGBP(total)}
                </div>
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

        {/* Holdings table */}
        {account.holdings && account.holdings.length > 0 && (
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

        {/* Footer: empty state + add holding */}
        <div className="px-5 py-3 flex items-center justify-between border-t border-slate-800/40">
          {(!account.holdings || account.holdings.length === 0) ? (
            <span className="text-xs text-slate-600">No holdings</span>
          ) : (
            <span />
          )}
          <button
            onClick={() => onAddHolding(account)}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
          >
            + Add holding
          </button>
        </div>
      </div>

      <EditHoldingModal
        holding={editingHolding}
        onClose={() => setEditingHolding(null)}
        onSaved={onDataChanged}
      />
    </>
  );
}
