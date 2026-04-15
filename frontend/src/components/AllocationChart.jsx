import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

function formatGBP(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const name = item.name ?? item.payload?.name ?? '';
  const value = item.value ?? 0;
  // recharts may put percent on payload directly or on payload.payload
  const pct = item.percent ?? item.payload?.percent ?? 0;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="font-semibold text-slate-200">{name}</div>
      <div className="text-slate-400 mt-0.5">{formatGBP(value)} <span className="text-slate-500">({(isNaN(pct) ? 0 : (pct * 100)).toFixed(1)}%)</span></div>
    </div>
  );
};

const CustomLegend = ({ payload }) => (
  <ul className="flex flex-col gap-1.5 mt-2">
    {payload.map((entry, i) => (
      <li key={i} className="flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-slate-400">{entry.value}</span>
        </div>
        <span className="font-mono text-slate-300 font-medium">
          {(isNaN(entry.payload.percent) ? 0 : (entry.payload.percent * 100)).toFixed(1)}%
        </span>
      </li>
    ))}
  </ul>
);

export default function AllocationChart({ accounts }) {
  const data = (accounts || [])
    .map(a => ({ name: a.name, value: a.total_value_gbp ?? 0, colour: a.colour || '#6366f1' }))
    .filter(d => d.value > 0);

  if (!data.length) return null;

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-full flex flex-col">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.colour} opacity={0.9} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <CustomLegend
        payload={data.map(d => ({
          value: d.name,
          color: d.colour,
          payload: { percent: d.value / total },
        }))}
      />
    </div>
  );
}
