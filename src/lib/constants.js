export const ROLES = {
  admin: {
    value: 'admin',
    label: 'Administrator',
    shortLabel: 'Admin',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/45',
  },
  dev: {
    value: 'dev',
    label: 'Developer (Dev)',
    shortLabel: 'Dev',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/45',
  },
  user: {
    value: 'user',
    label: 'Standard User',
    shortLabel: 'User',
    badgeClass: 'bg-neutral-700/70 text-neutral-100 border-neutral-500/50',
  },
};

export const STATUSES = {
  open: {
    value: 'open',
    label: 'Open',
    badgeClass: 'bg-red-500/20 text-red-200 border-red-400/45',
    dotClass: 'bg-red-400',
    columnBorder: 'border-red-500/35 bg-neutral-900',
  },
  in_progress: {
    value: 'in_progress',
    label: 'In Progress',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/45',
    dotClass: 'bg-amber-400',
    columnBorder: 'border-amber-500/35 bg-neutral-900',
  },
  testing: {
    value: 'testing',
    label: 'Ready for Verification',
    badgeClass: 'bg-lime-500/20 text-lime-200 border-lime-400/45',
    dotClass: 'bg-lime-400',
    columnBorder: 'border-lime-500/35 bg-neutral-900',
  },
  resolved: {
    value: 'resolved',
    label: 'Resolved',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/45',
    dotClass: 'bg-emerald-400',
    columnBorder: 'border-emerald-500/35 bg-neutral-900',
  },
  rejected: {
    value: 'rejected',
    label: 'Rejected',
    badgeClass: 'bg-neutral-700/70 text-neutral-200 border-neutral-500/50',
    dotClass: 'bg-neutral-400',
    columnBorder: 'border-neutral-700 bg-neutral-900',
  },
};

export const STATUS_LIST = Object.values(STATUSES);

export const PRIORITIES = {
  low: {
    value: 'low',
    label: 'Low',
    badgeClass: 'bg-neutral-800 text-neutral-200 border-neutral-600',
  },
  medium: {
    value: 'medium',
    label: 'Medium',
    badgeClass: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/45',
  },
  high: {
    value: 'high',
    label: 'High',
    badgeClass: 'bg-orange-500/20 text-orange-200 border-orange-400/45',
  },
  critical: {
    value: 'critical',
    label: 'Critical',
    badgeClass: 'bg-red-500/25 text-red-200 border-red-400/55 font-bold',
  },
};

export const PRIORITY_LIST = Object.values(PRIORITIES);

export const PROJECT_COLORS = [
  '#10b981',
  '#16a34a',
  '#84cc16',
  '#eab308',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#a3a3a3',
];

export function formatDateTime(dateStr, locale = 'en-US') {
  if (!dateStr) return '—';
  const str = String(dateStr);
  const normalized = str.includes('T') ? str : str.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return str;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return str;
  }
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
