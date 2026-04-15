import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import TotalValuePanel from './components/TotalValuePanel';
import ProviderCard from './components/ProviderCard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  const [providers, setProviders] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/portfolio`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setProviders(data.providers ?? []);
      setTotal(data.total_value ?? null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const computedTotal = total ?? providers.reduce(
    (sum, p) => sum + (p.total_value ?? p.holdings?.reduce(
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
      />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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
          !error && <TotalValuePanel providers={providers} total={computedTotal} />
        )}

        <div>
          <h2 className="text-xs text-slate-500 font-medium uppercase tracking-widest mb-4">
            Providers
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : providers.length === 0 && !error ? (
            <div className="text-center py-16 text-slate-600">
              <div className="text-4xl mb-3">📊</div>
              <div className="text-sm">No provider data available</div>
              <div className="text-xs mt-1">Check that the backend is running</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {providers.map(provider => (
                <ProviderCard
                  key={provider.id ?? provider.provider_name}
                  provider={provider}
                  onDataChanged={() => fetchData(true)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 mt-8 border-t border-slate-800/50">
        <p className="text-xs text-slate-700 text-center">
          Portfolio Dashboard · Auto-refreshes every 60s · Values in GBP
        </p>
      </footer>
    </div>
  );
}
