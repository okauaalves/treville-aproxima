export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type AdminOperationRow = {
  id: string;
  userId: string;
  email: string;
  contentType: string;
  operation: string;
  status: string;
  createdAt: string;
};

export type AdminTemplateRow = {
  id: string;
  name: string;
  type: string;
  useCount: number;
};

export type AdminOverview = {
  totalUsers: number;
  activeUsers7d: number;
  totalOperations: number;
  totalTemplates: number;
  users: AdminUserRow[];
  operationsByType: { contentType: string; count: number }[];
  recentOperations: AdminOperationRow[];
  topTemplates: AdminTemplateRow[];
  usage?: InvocationUsage | null;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Cota mensal de invocações de Edge Functions no plano Free do Supabase: 500.000.
 * Fonte: https://supabase.com/docs/guides/functions/pricing (consultado em 11/10/2026).
 * Cada scan é uma invocação da função `redirect`; a página de perfil soma mais uma (`?format=json`).
 */
export const FREE_PLAN_EDGE_INVOCATIONS = 500_000;
export const USAGE_WARNING_PERCENT = 70;

export type InvocationUsage = {
  scansThisMonth: number;
  limit: number;
  percent: number;
  warning: boolean;
  monthStart: string;
};

/** Início do mês corrente em UTC (o ciclo do Supabase também é mensal). */
export function monthStartIso(now: number = Date.now()): string {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

export function invocationUsage(scansThisMonth: number, limit: number = FREE_PLAN_EDGE_INVOCATIONS, now: number = Date.now()): InvocationUsage {
  const scans = Math.max(0, Math.floor(Number.isFinite(scansThisMonth) ? scansThisMonth : 0));
  const safeLimit = limit > 0 ? limit : FREE_PLAN_EDGE_INVOCATIONS;
  const ratio = (scans / safeLimit) * 100;
  return {
    scansThisMonth: scans,
    limit: safeLimit,
    percent: Math.round(ratio * 10) / 10,
    warning: ratio > USAGE_WARNING_PERCENT,
    monthStart: monthStartIso(now),
  };
}

export function aggregateAdmin(input: {
  users: AdminUserRow[];
  operations: AdminOperationRow[];
  templates: AdminTemplateRow[];
  totalOperations?: number;
  now?: number;
}): AdminOverview {
  const now = input.now ?? Date.now();
  const cutoff = now - 7 * DAY;
  const byType = new Map<string, number>();
  for (const row of input.operations) {
    const key = row.contentType || 'OUTRO';
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  const recent = [...input.operations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  const topTemplates = [...input.templates].sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name)).slice(0, 8);
  return {
    totalUsers: input.users.length,
    activeUsers7d: input.users.filter((user) => user.lastSignInAt && Date.parse(user.lastSignInAt) >= cutoff).length,
    totalOperations: input.totalOperations ?? input.operations.length,
    totalTemplates: input.templates.length,
    users: input.users,
    operationsByType: [...byType.entries()]
      .map(([contentType, count]) => ({ contentType, count }))
      .sort((a, b) => b.count - a.count),
    recentOperations: recent,
    topTemplates,
  };
}

function cell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function adminToCsv(overview: AdminOverview): string {
  const lines = ['secao,campo,valor'];
  lines.push(`resumo,usuarios,${overview.totalUsers}`);
  lines.push(`resumo,ativos_7d,${overview.activeUsers7d}`);
  lines.push(`resumo,operacoes,${overview.totalOperations}`);
  lines.push(`resumo,templates,${overview.totalTemplates}`);
  for (const user of overview.users) {
    lines.push(['usuario', cell(user.email), cell(user.name)].join(','));
  }
  for (const row of overview.recentOperations) {
    lines.push(['operacao', cell(row.email), cell(`${row.contentType} ${row.createdAt}`)].join(','));
  }
  return `${lines.join('\n')}\n`;
}
