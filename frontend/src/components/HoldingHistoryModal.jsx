import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../config/api';

const RANGES = ['1m', '3m', '6m', '1y', 'all'];

export default function HoldingHistoryModal({ symbol, name, isOpen, onClose }) {
  const [range, setRange] = useState('3m');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !symbol) return;
    setLoading(true);
    setError(null);
    apiFetch(`/api/ticker/${encodeURIComponent(symbol)}/history?range=${range}`)
      .then(res => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then(json => setData(json.data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, symbol, range]);

  if (!isOpen) return null;

  const minClose = data.length ? Math.min(...data.map(d => d.close)) : 0;
  const maxClose = data.length ? Math.max(...data.map(d => d.close)) : 0;
  const firstClose = data[0]?.close;
  const lastClose = data[data.length - 1]?.close;
  const gain = firstClose != null && lastClose != null ? lastClose - firstClose : null;
  const gainPct = gain != null && firstClose ? (gain / firstClose) * 100 : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{name || symbol}</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{symbol}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                range === r
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center h-40 gap-2 text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          {!loading && !error && data.length === 0 && (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-slate-500">No data available</p>
            </div>
          )}
          {!loading && !error && data.length > 0 && (
            <>
              {gainPct != null && (
                <div className={`text-sm font-mono font-semibold mb-3 ${gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {gain >= 0 ? '+' : ''}{gain.toFixed(4)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%)
                  <span className="text-xs text-slate-500 font-normal ml-2">over period</span>
                </div>
              )}
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={d => d.slice(5)}
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[minClose * 0.995, maxClose * 1.005]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    width={55}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v.toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    formatter={v => [v.toFixed(4), 'Close']}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={gain != null && gain >= 0 ? '#34d399' : '#f87171'}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
