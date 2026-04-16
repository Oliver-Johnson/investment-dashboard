import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

function getStatus(lastUpdated, nearingHours = 360, expiryHours = 672) {
  if (!lastUpdated) return { level: 'stale', label: 'Stale — update required' };
  const hoursAgo = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60);

  if (hoursAgo < nearingHours) return { level: 'fresh', label: 'Up to date' };
  if (hoursAgo < expiryHours) return { level: 'nearing', label: 'Nearing expiry' };
  return { level: 'stale', label: 'Stale — update required' };
}

const CONFIG = {
  fresh: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
    icon: CheckCircle,
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  nearing: {
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    icon: Clock,
    bg: 'bg-amber-400/10 border-amber-400/20',
  },
  stale: {
    dot: 'bg-red-500',
    text: 'text-red-400',
    icon: AlertCircle,
    bg: 'bg-red-500/10 border-red-500/20',
  },
};

export default function FreshnessIndicator({ lastUpdated, nearingHours, expiryHours, iconOnly }) {
  const { level, label } = getStatus(lastUpdated, nearingHours, expiryHours);
  const { dot, text, icon: Icon, bg } = CONFIG[level];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${level === 'stale' ? 'animate-pulse' : ''}`} />
      <span className={iconOnly ? 'hidden sm:inline' : undefined}>{label}</span>
    </div>
  );
}

export { getStatus };
