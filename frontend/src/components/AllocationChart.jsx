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
  const pct = item.payload?.percent ?? item.percent ?? 0;
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

function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0)
         : max === g ? (b - r) / d + 2
         : (r - g) / d + 4;
  return (h / 6) * 360;
}

// Interleave sorted array so adjacent slices have maximally different hues
function interleave(arr) {
  const mid = Math.ceil(arr.length / 2);
  const result = [];
  for (let i = 0; i < mid; i++) {
    result.push(arr[i]);
    if (arr[mid + i]) result.push(arr[mid + i]);
  }
  return result;
}

export default function AllocationChart({ accounts }) {
  const data = interleave(
    (accounts || [])
      .map(a => ({ name: a.name, value: a.total_value_gbp ?? 0, colour: a.colour || '#6366f1' }))
      .filter(d => d.value > 0)
      .sort((a, b) => hexToHue(a.colour) - hexToHue(b.colour))
  );

  if (!data.length) return null;

  const total = data.reduce((s, d) => s + d.value, 0);
  // Pre-attach percent so it's always available on item.payload in the tooltip
  const dataWithPercent = data.map(d => ({ ...d, percent: d.value / total }));

  return (
    <div className="h-full flex flex-col">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={dataWithPercent}
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
        payload={dataWithPercent.map(d => ({
          value: d.name,
          color: d.colour,
          payload: { percent: d.percent },
        }))}
      />
    </div>
  );
}
