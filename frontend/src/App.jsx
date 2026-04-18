import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import TotalValuePanel from './components/TotalValuePanel';
import AccountCard from './components/AccountCard';
import CreateAccountModal from './components/CreateAccountModal';
import AddHoldingModal from './components/AddHoldingModal';
import DividendPanel from './components/DividendPanel';
import ContributionPanel from './components/ContributionPanel';
import DisposalPanel from './components/DisposalPanel';
import PortfolioChart from './components/PortfolioChart';
import WatchlistPage from './components/WatchlistPage';
import NotesPage from './components/NotesPage';
import { apiFetch } from './config/api';

function SkeletonCard() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-slate-800" />
        <div className="flex-1">
          <div className="h-3.5 w-24 bg-slate-800 rounded mb-2" />
          <div className="h-2.5 w-16 bg-slate-800 rounded" />
        </div>
        <div className="h-6 w-20 bg-slate-800 rounded" />
      </div>
      <div className="space-y-2.5">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-2.5 bg-slate-800 rounded" style={{ width: `${70 + i * 7}%` }} />
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-red-400">Failed to load portfolio data</div>
        <div className="text-xs text-red-500/70 mt-0.5">{message}</div>
      </div>
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [addHoldingAccount, setAddHoldingAccount] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);
    try {
      const res = await apiFetch('/api/portfolio/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setTotal(data.total_value_gbp ?? null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 60-second background refresh
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fast-poll (3s) while any account is still loading live data
  const anyLoading = accounts.some(a => a.loading);
  useEffect(() => {
    if (!anyLoading) return;
    const interval = setInterval(() => fetchData(true), 3_000);
    return () => clearInterval(interval);
  }, [anyLoading, fetchData]);

  const computedTotal = total ?? accounts.reduce(
    (sum, a) => sum + (a.total_value_gbp ?? a.holdings?.reduce(
      (s, h) => s + (h.unit_count ?? 0) * (h.current_price ?? 0), 0
    ) ?? 0),
    0
  );

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <Header
        lastRefresh={lastRefresh}
        onRefresh={() => fetchData(true)}
        isRefreshing={isRefreshing}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />

      {currentPage === 'watchlist' && <WatchlistPage />}
      {currentPage === 'notes' && <NotesPage accounts={accounts} />}

      <main className={`max-w-7xl mx-auto px-3 md:px-6 py-5 md:py-8 space-y-6 md:space-y-8 ${currentPage !== 'dashboard' ? 'hidden' : ''}`}>
        {error && !loading && (
          <ErrorBanner message={error} onRetry={() => fetchData(true)} />
        )}

        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-pulse">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded bg-slate-800" />
              <div className="h-3 w-32 bg-slate-800 rounded" />
            </div>
            <div className="h-12 w-48 bg-slate-800 rounded mb-2" />
            <div className="h-3 w-36 bg-slate-800 rounded" />
          </div>
        ) : (
          !error && (
            <>
              <TotalValuePanel accounts={accounts} total={computedTotal} selectedSnapshot={selectedSnapshot} />
              <PortfolioChart accounts={accounts} onSnapshotClick={setSelectedSnapshot} />
            </>
          )
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs text-slate-500 font-medium uppercase tracking-widest">
              Accounts
            </h2>
            <button
              onClick={() => setShowCreateAccount(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              + Add Account
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : accounts.length === 0 && !error ? (
            <div className="text-center py-16 text-slate-600">
              <div className="text-4xl mb-3">📊</div>
              <div className="text-sm">No accounts yet</div>
              <div className="text-xs mt-1">Add an account to get started</div>
            </div>
          ) : (
            <>
              {accounts.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
                  <ContributionPanel accounts={accounts} />
                  <DividendPanel accounts={accounts} />
                  <DisposalPanel accounts={accounts} />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[...accounts].sort((a, b) => {
                  const aCash = a.account_subtype === 'cash_isa';
                  const bCash = b.account_subtype === 'cash_isa';
                  if (aCash !== bCash) return aCash ? 1 : -1;
                  return (b.total_value_gbp ?? 0) - (a.total_value_gbp ?? 0);
                }).map(account => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onDataChanged={() => fetchData(true)}
                    onAddHolding={setAddHoldingAccount}
                    portfolioTotal={computedTotal}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 mt-8 border-t border-slate-800/50">
        <p className="text-xs text-slate-700 text-center">
          Portfolio Dashboard · Auto-refreshes every 60s · Values in GBP
        </p>
      </footer>

      {showCreateAccount && (
        <CreateAccountModal
          onClose={() => setShowCreateAccount(false)}
          onCreated={() => { fetchData(true); setShowCreateAccount(false); }}
        />
      )}

      {addHoldingAccount && (
        <AddHoldingModal
          accounts={accounts}
          preselectedAccount={addHoldingAccount}
          onClose={() => setAddHoldingAccount(null)}
          onAdded={() => { fetchData(true); setAddHoldingAccount(null); }}
        />
      )}
    </div>
  );
}
