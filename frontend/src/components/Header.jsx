import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, TrendingUp, Clock, Download, Eye, FileText, Menu, X as MenuX } from 'lucide-react';
import { API_URL, apiFetch } from '../config/api';

function getHealthStatus(data) {
  if (!data) return 'red';
  const { hours_since_snapshot, gbpusd_age_s, providers } = data;
  const providerError = providers && Object.values(providers).some(
    p => p.last_error_ts && p.last_success_ts && p.last_error_ts > p.last_success_ts
  );
  if (hours_since_snapshot > 50 || gbpusd_age_s > 259200 || providerError) return 'red';
  if (hours_since_snapshot >= 26 || gbpusd_age_s >= 86400) return 'amber';
  return 'green';
}

function buildTooltip(data) {
  if (!data) return 'Health: fetch failed';
  const { hours_since_snapshot, gbpusd_age_s, providers } = data;
  const fxHours = (gbpusd_age_s / 3600).toFixed(1);
  const lines = [
    `Snapshot age: ${hours_since_snapshot?.toFixed(1)}h`,
    `GBP/USD age: ${fxHours}h`,
  ];
  if (providers) {
    Object.entries(providers).forEach(([name, p]) => {
      const hasError = p.last_error_ts && p.last_success_ts && p.last_error_ts > p.last_success_ts;
      lines.push(`${name}: ${hasError ? 'ERROR' : 'ok'}`);
    });
  }
  return lines.join('\n');
}

const DOT_COLOURS = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
};

export default function Header({ lastRefresh, onRefresh, isRefreshing, currentPage, setCurrentPage }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [healthFailed, setHealthFailed] = useState(false);

  useEffect(() => {
    const poll = () => apiFetch('/api/health')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setHealthData(d); setHealthFailed(!d); })
      .catch(() => { setHealthData(null); setHealthFailed(true); });
    poll();
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, []);

  const healthStatus = healthFailed ? 'red' : getHealthStatus(healthData);
  const healthTooltip = buildTooltip(healthFailed ? null : healthData);

  const formatted = lastRefresh
    ? lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const navigate = (page) => {
    setCurrentPage?.(page);
    setMobileOpen(false);
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-semibold text-slate-100 tracking-tight leading-none truncate">
              Portfolio Dashboard
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">Multi-provider investment tracker</p>
          </div>
        </div>

        <nav className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => navigate('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentPage !== 'watchlist' && currentPage !== 'notes' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate('watchlist')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentPage === 'watchlist' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
            }`}
          >
            <Eye size={11} />
            Watchlist
          </button>
          <button
            onClick={() => navigate('notes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentPage === 'notes' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
            }`}
          >
            <FileText size={11} />
            Notes
          </button>
        </nav>

        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <Clock size={12} />
            <span>Last updated: <span className="text-slate-400 font-mono">{formatted}</span></span>
            {healthData !== null || healthFailed ? (
              <span
                className={`w-2 h-2 rounded-full ${DOT_COLOURS[healthStatus]} flex-shrink-0`}
                title={healthTooltip}
              />
            ) : null}
          </div>
          <a
            href={`${API_URL}/api/export/csv`}
            download
            className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
            title="Export CSV"
          >
            <Download size={12} />
            <span className="hidden sm:inline">Export CSV</span>
          </a>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="sm:hidden p-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <MenuX size={14} /> : <Menu size={14} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="sm:hidden overflow-hidden border-t border-slate-800 bg-slate-950"
          >
            <nav className="px-3 py-3 flex flex-col gap-1">
              <button
                onClick={() => navigate('dashboard')}
                className={`flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors text-left ${
                  currentPage !== 'watchlist' && currentPage !== 'notes' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
                }`}
              >
                <TrendingUp size={15} />
                Dashboard
              </button>
              <button
                onClick={() => navigate('watchlist')}
                className={`flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors text-left ${
                  currentPage === 'watchlist' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
                }`}
              >
                <Eye size={15} />
                Watchlist
              </button>
              <button
                onClick={() => navigate('notes')}
                className={`flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors text-left ${
                  currentPage === 'notes' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
                }`}
              >
                <FileText size={15} />
                Notes
              </button>
              <div className="mt-2 px-3 py-2 text-xs text-slate-600 border-t border-slate-800/60">
                Last updated: <span className="font-mono text-slate-500">{formatted}</span>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
