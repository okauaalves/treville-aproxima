export function formatDate(iso: string, now = new Date()): string {
  return formatWhen(iso, now);
}

export function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startToday.getTime() - startDate.getTime()) / 86400000);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) {
    return `Hoje, ${time}`;
  }
  if (diffDays === 1) {
    return `Ontem, ${time}`;
  }
  const day = date.toLocaleDateString('pt-BR');
  return `${day}, ${time}`;
}

export function formatDayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startToday.getTime() - startDate.getTime()) / 86400000);
  if (diffDays === 0) {
    return 'Hoje';
  }
  if (diffDays === 1) {
    return 'Ontem';
  }
  return date.toLocaleDateString('pt-BR');
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}

export function formatBytes(used: number, total: number): string {
  return `${used} / ${total} bytes`;
}

export function firstName(fullName: string | undefined, fallback = 'Usuário'): string {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.split(/\s+/)[0] ?? fallback;
}

export function initialLetter(fullName: string | undefined): string {
  const name = firstName(fullName, 'U');
  return name.slice(0, 1).toUpperCase();
}
