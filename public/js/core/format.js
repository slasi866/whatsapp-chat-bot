/** Display formatting. All timestamps from the API are unix seconds. */

const LOCALE = 'id-ID';

export function fmtNumber(value) {
  return Number(value ?? 0).toLocaleString(LOCALE);
}

export function fmtDateTime(seconds) {
  if (!seconds) return '-';
  return new Date(seconds * 1000).toLocaleString(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Label for a chat day separator: today and yesterday get words. */
export function fmtDayLabel(seconds) {
  const date = new Date(seconds * 1000);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();

  if (sameDay(date, today)) return 'Hari ini';
  if (sameDay(date, yesterday)) return 'Kemarin';
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: 'long', year: 'numeric' });
}

export function dayKey(seconds) {
  return new Date(seconds * 1000).toDateString();
}

export function fmtRelative(seconds) {
  if (!seconds) return '';
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return 'baru';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hr`;
  return new Date(seconds * 1000).toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Meta only accepts free-form replies within 24 hours of the customer's last
 * message. Outside that window a pre-approved template is the only option.
 */
export function withinServiceWindow(lastInboundAt) {
  if (!lastInboundAt) return false;
  return Date.now() / 1000 - lastInboundAt < 86400;
}

export function serviceWindowLeft(lastInboundAt) {
  if (!lastInboundAt) return '';
  const remaining = 86400 - (Date.now() / 1000 - lastInboundAt);
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3600);
  if (hours >= 1) return `${hours} jam lagi`;
  return `${Math.max(1, Math.floor(remaining / 60))} menit lagi`;
}

export function initials(name) {
  const clean = String(name ?? '').trim();
  if (!clean) return '?';
  const words = clean.split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]).join('');
}

/** Deterministic avatar colour, so a contact keeps the same one over time. */
export function colorFor(seed) {
  let hash = 0;
  const text = String(seed ?? '');
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 46% 42%)`;
}
