export function formatCurrency(amount: number): string {
  const rounded = Math.round(Math.abs(amount));
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '$' + formatted;
}

export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateRangeStrings(daysBack: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  return { from: formatDateStr(from), to: formatDateStr(to) };
}

export function startOfMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${days[d.getDay()]} ${day} ${months[month - 1]}`;
}

export function formatLongDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[d.getDay()]} ${day} de ${months[month - 1]}`;
}

// ─── Fechas de formularios (DD/MM/AAAA) ──────────────────────────────────────

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Solo dígitos → "DD/MM/AAAA" a medida que se escribe
export function maskDMY(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// "15/09/2027" → "2027-09-15"; null si la fecha no existe (31/02, mes 13, etc.)
export function parseDMY(text: string): string | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 2000 || year > 2100) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return formatDateStr(d);
}

// "2027-09-15" → "15/09/2027"
export function toDMY(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

// "2027-09-15" → "15 sep 2027"
export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${day} ${SHORT_MONTHS[month - 1]} ${year}`;
}

// Suma meses; si el día no existe en el mes destino, queda el último día (31 ene + 1 = 28/29 feb)
export function addMonths(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const lastDay = new Date(year, month - 1 + months + 1, 0).getDate();
  return formatDateStr(new Date(year, month - 1 + months, Math.min(day, lastDay)));
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return formatDateStr(new Date(year, month - 1, day + days));
}

// Días de `from` a `to` (negativo si `to` ya pasó)
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// 12345 → "12.345"
export function formatKm(km: number): string {
  return Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
