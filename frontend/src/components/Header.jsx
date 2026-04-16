import { RefreshCw, TrendingUp, Clock, Download, Eye, FileText } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Header({ lastRefresh, onRefresh, isRefreshing, currentPage, setCurrentPage }) {
  const formatted = lastRefresh
    ? lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

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
            onClick={() => setCurrentPage?.('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentPage !== 'watchlist' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentPage?.('watchlist')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentPage === 'watchlist' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
            }`}
          >
            <Eye size={11} />
            Watchlist
          </button>
          <button
            onClick={() => setCurrentPage?.('notes')}
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
        </div>
      </div>
    </header>
  );
}
