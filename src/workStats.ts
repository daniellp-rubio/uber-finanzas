// Horas trabajadas y ganancia por hora, a partir de las jornadas ("Empecemos el día" → "Día finalizado").
// Puro: recibe los datos, no toca la base de datos.
import type { DailySummary, WorkSession } from './db';
import { addDays } from './format';

// Una jornada abierta o de más de 16 h es un "Día finalizado" que no se tocó: no se cuenta
export const MAX_SESSION_HOURS = 16;

export type Shift = 'day' | 'night';

export interface WorkDay {
  date:    string;   // día en que empezó la jornada
  hours:   number;
  net:     number;   // neto de trabajar (sin el arriendo del carro)
  shift:   Shift;
  weekday: number;   // 0 = domingo
}

export interface HourStat {
  days:    number;
  hours:   number;
  net:     number;
  perHour: number;
}

function parseAt(at: string): Date {
  const [date, time = '00:00'] = at.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

// De día si la mitad de la jornada cae entre las 6:00 y las 18:00
function shiftOf(start: Date, end: Date): Shift {
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  const hour = mid.getHours() + mid.getMinutes() / 60;
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}

// Junta las jornadas por día. El neto de un día que no tuvo jornada propia se suma a la jornada
// de la noche anterior si esa terminó ese día (los ingresos de madrugada quedan con fecha del día siguiente).
export function buildWorkDays(sessions: WorkSession[], summaries: DailySummary[]): WorkDay[] {
  const acc = new Map<string, { hours: number; dayHours: number; lastEnd: string }>();
  for (const s of sessions) {
    if (!s.end_at) continue;
    const start = parseAt(s.start_at);
    const end   = parseAt(s.end_at);
    const hours = (end.getTime() - start.getTime()) / 3600000;
    if (!(hours > 0) || hours > MAX_SESSION_HOURS) continue;
    const date = s.start_at.slice(0, 10);
    const a = acc.get(date) ?? { hours: 0, dayHours: 0, lastEnd: date };
    a.hours += hours;
    if (shiftOf(start, end) === 'day') a.dayHours += hours;
    const endDate = s.end_at.slice(0, 10);
    if (endDate > a.lastEnd) a.lastEnd = endDate;
    acc.set(date, a);
  }

  const netByDate = new Map(summaries.map(d => [d.date, d.net - d.rent]));
  const claimed = new Set<string>();
  const days: WorkDay[] = [];
  for (const date of [...acc.keys()].sort()) {
    const a = acc.get(date)!;
    let net = netByDate.get(date) ?? 0;
    claimed.add(date);
    for (let d = addDays(date, 1); d <= a.lastEnd; d = addDays(d, 1)) {
      if (acc.has(d) || claimed.has(d)) continue;
      net += netByDate.get(d) ?? 0;
      claimed.add(d);
    }
    const [y, m, dd] = date.split('-').map(Number);
    days.push({
      date,
      hours:   a.hours,
      net,
      shift:   a.dayHours * 2 >= a.hours ? 'day' : 'night',
      weekday: new Date(y, m - 1, dd).getDay(),
    });
  }
  return days;
}

export function summarize(days: WorkDay[]): HourStat | null {
  if (days.length === 0) return null;
  const hours = days.reduce((s, d) => s + d.hours, 0);
  const net   = days.reduce((s, d) => s + d.net, 0);
  return { days: days.length, hours, net, perHour: hours > 0 ? Math.round(net / hours) : 0 };
}

export interface HourlyStats {
  total:     HourStat | null;
  day:       HourStat | null;
  night:     HourStat | null;
  byWeekday: (HourStat | null)[];   // índice 0 = domingo
}

export function hourlyStats(days: WorkDay[]): HourlyStats {
  return {
    total:     summarize(days),
    day:       summarize(days.filter(d => d.shift === 'day')),
    night:     summarize(days.filter(d => d.shift === 'night')),
    byWeekday: [0, 1, 2, 3, 4, 5, 6].map(w => summarize(days.filter(d => d.weekday === w))),
  };
}

// 7.5 → "7 h 30 min"
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : h === 0 ? `${m} min` : `${h} h ${m} min`;
}
