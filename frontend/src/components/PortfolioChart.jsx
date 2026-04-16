import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Camera, RefreshCw } from 'lucide-react';
import { apiFetch } from '../config/api';

function formatGBP(value) {
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const TIME_RANGES = [
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
  { key: 365, label: '1y' },
  { key: 3650, label: 'All' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <div className="text-slate-400 mb-1">{formatDate(label)}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white font-medium">{formatGBP(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function PortfolioChart({ accounts }) {
  const [days, setDays] = useState(90);
  const [mode, setMode] = useState('total'); // 'total' | 'accounts'
  const [totalData, setTotalData] = useState([]);
  const [accountData, setAccountData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [totalRes, accRes] = await Promise.all([
        apiFetch(`/api/snapshots?days=${days}`),
        apiFetch(`/api/snapshots/accounts?days=${days}`),
      ]);
      if (totalRes.ok) setTotalData(await totalRes.json());
      if (accRes.ok) setAccountData(await accRes.json());
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { fetchData(false); }, [fetchData]);

  // Poll every 60s so UI reflects snapshots without a manual refresh
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Build chart data for total mode
  const totalChartData = totalData.map(s => ({
    date: s.snapshot_date,
    Total: s.value_gbp,
  }));

  // Build chart data for accounts mode — pivot by date
  const accountChartData = (() => {
    if (!accountData.length) return [];
    const byDate = {};
    for (const s of accountData) {
      if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = { date: s.snapshot_date };
      const acc = accounts?.find(a => a.id === s.account_id);
      const name = acc?.name ?? `Account ${s.account_id}`;
      byDate[s.snapshot_date][name] = s.value_gbp;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  })();

  const chartData = mode === 'total' ? totalChartData : accountChartData;
  const hasData = chartData.length >= 1;
  const isSinglePoint = chartData.length === 1;

  const lastSnapshot = totalData.length > 0 ? totalData[totalData.length - 1] : null;

  // Account names for multi-line
  const accountNames = [...new Set((accounts ?? []).map(a => a.name))];
  const accountColours = Object.fromEntries((accounts ?? []).map(a => [a.name, a.colour || '#6366f1']));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-slate-100">Portfolio Performance</div>
          {lastSnapshot && (
            <span className="text-xs text-slate-500">
              Last snapshot: {formatDate(lastSnapshot.snapshot_date)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(false)}
            disabled={loading || refreshing}
            title="Refresh"
            className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-30"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {/* Mode toggle */}
          <div className="flex gap-1">
            {['total', 'accounts'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === m ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {m === 'total' ? 'Total' : 'By Account'}
              </button>
            ))}
          </div>
          {/* Time range */}
          <div className="flex gap-1">
            {TIME_RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setDays(r.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  days === r.key ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-slate-800 rounded animate-pulse" />
      ) : !hasData ? (
        <div className="h-48 flex flex-col items-center justify-center text-slate-600">
          <Camera size={24} className="mb-2 opacity-40" />
          <div className="text-sm">Snapshots are recorded automatically at 07:30 each weekday</div>
        </div>
      ) : isSinglePoint ? (
        <div className="h-48 flex flex-col items-center justify-center">
          <div className="text-xs text-slate-500 mb-2">{formatDate(chartData[0].date)}</div>
          {mode === 'total' ? (
            <div className="text-3xl font-semibold text-slate-100 mb-2">
              {formatGBP(chartData[0].Total ?? 0)}
            </div>
          ) : (
            <div className="flex flex-col gap-1 mb-2 max-h-32 overflow-y-auto w-full max-w-xs">
              {accountNames.filter(name => chartData[0][name] != null).map(name => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accountColours[name] || '#6366f1' }} />
                  <span className="text-slate-400 flex-1 truncate">{name}</span>
                  <span className="text-slate-100 font-medium">{formatGBP(chartData[0][name])}</span>
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-slate-600">1 snapshot recorded — chart will appear as more data accumulates</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatGBP}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            {mode === 'total' ? (
              <Line
                type="monotone"
                dataKey="Total"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1' }}
              />
            ) : (
              accountNames.map(name => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={accountColours[name] || '#6366f1'}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
