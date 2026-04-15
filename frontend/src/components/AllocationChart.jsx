import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const PROVIDER_COLORS = {
  't212': '#3b82f6',
  'trading212': '#3b82f6',
  'barclays': '#1e40af',
  'freetrade': '#10b981',
  'columbia': '#8b5cf6',
  'etoro': '#14b8a6',
};

function getColor(providerName, index) {
  const key = providerName?.toLowerCase().replace(/[\s-]/g, '');
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];
  const palette = ['#6366f1', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
  return palette[index % palette.length];
}

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
  const { name, value, percent } = payload[0];
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="font-semibold text-slate-200">{name}</div>
      <div className="text-slate-400 mt-0.5">{formatGBP(value)} <span className="text-slate-500">({(percent * 100).toFixed(1)}%)</span></div>
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
          {(entry.payload.percent * 100).toFixed(1)}%
        </span>
      </li>
    ))}
  </ul>
);

export default function AllocationChart({ providers }) {
  const data = (providers || [])
    .map(p => ({ name: p.provider_name, value: p.total_value }))
    .filter(d => d.value > 0);

  if (!data.length) return null;

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
              <Cell
                key={index}
                fill={getColor(entry.name, index)}
                opacity={0.9}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <CustomLegend
        payload={data.map((d, i) => ({
          value: d.name,
          color: getColor(d.name, i),
          payload: { percent: d.value / data.reduce((s, x) => s + x.value, 0) },
        }))}
      />
    </div>
  );
}
