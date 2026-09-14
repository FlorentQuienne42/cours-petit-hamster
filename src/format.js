// Petites fonctions de formatage et de dates (fuseau local, sans dépendance).

export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/** 305 → "5:05" (secondes par km → mm:ss) */
export function fmtPace(secPerKm) {
  const s = Math.round(secPerKm);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** 3300 → "55:00", 14370 → "3:59:30" */
export function fmtTime(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

/** 2400 → "40 min", 5400 → "1h30" */
export function fmtDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

/** 6.5 → "6,5 km" */
export function fmtKm(km) {
  const v = Math.round(km * 10) / 10;
  return `${v.toLocaleString('fr-FR')} km`;
}

/** 0.8 → "800 m", 1.5 → "1,5 km" */
export function fmtDist(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : fmtKm(km);
}

export function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-10-11" → Date locale à midi (évite les surprises de changement d'heure) */
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Jour ISO : 1 = lundi … 7 = dimanche */
export function isoWeekday(d) {
  return ((d.getDay() + 6) % 7) + 1;
}

export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

export function fmtDateFr(d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('fr-FR', opts).format(d);
}
