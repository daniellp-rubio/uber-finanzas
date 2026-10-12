import type { Rental, RentalPayment, Vehicle, VehicleDoc, Debt } from './db';
import type { Level, VehicleAlert } from './fleet';
import { addDays, daysBetween, formatCurrency } from './format';

// Solo constantes y cálculos puros del arriendo: sin acceso a la DB

// ─── Contrato de arriendo de la Duster (v4, 2026-10-11; ver references/arquitectura.md) ──

export const RENTAL_DEFAULTS = {
  weeklyFee:     550000,   // canon cada 7 días desde el primer día de pago
  deposit:       550000,   // de contado al entregar; se devuelve al terminar, menos multas y daños
  kmPerWeek:     1800,     // km incluidos por semana, acumulables
  extraKmPrice:  250,      // COP por km de más
  lateFeePerDay: 0,        // el contrato de la Duster no cobra mora; el campo queda para otros contratos
};

export const GRACE_DAYS      = 1;        // 24 h para pagar sin que cuente como retraso
export const MAX_LATE_DAYS   = 7;        // si un contrato cobra pena por día, máximo 7 días por cada cuota
export const RECOVER_DAY     = 8;        // con más de una semana de atraso el contrato permite recoger el carro
export const WEEKS_PER_MONTH = 52 / 12;  // 4,33
export const WORK_DAYS_MONTH = 24;       // igual que el objetivo diario de Balance

export const PAYMENT_KINDS: { id: RentalPayment['kind']; label: string; icon: string }[] = [
  { id: 'rent',    label: 'Cuota semanal',          icon: '🔑' },
  { id: 'fee',     label: 'Mora, km extra o daños', icon: '⚠️' },
  { id: 'deposit', label: 'Depósito',               icon: '🔒' },
  { id: 'credit',  label: 'Días sin cobrar',        icon: '⏸️' },
];

export function paymentLabel(kind: string): string {
  return PAYMENT_KINDS.find(k => k.id === kind)?.label ?? kind;
}

export function paymentIcon(kind: string): string {
  return PAYMENT_KINDS.find(k => k.id === kind)?.icon ?? '🔑';
}

const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

// 0 = domingo … 6 = sábado
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// "martes": el día de la semana en que le toca pagar
export function payDayName(payDate: string): string {
  return WEEKDAYS[weekdayOf(payDate)];
}

// Primer día de pago con ese día de la semana, desde la entrega (la misma fecha si coincide)
export function firstPayDateFor(startDate: string, weekday: number): string {
  return addDays(startDate, (weekday - weekdayOf(startDate) + 7) % 7);
}

// Día de las cuotas semanales: el de la entrega, salvo que el contrato fije otro
export function firstPayDate(r: Pick<Rental, 'start_date' | 'first_pay_date'>): string {
  return r.first_pay_date && r.first_pay_date > r.start_date ? r.first_pay_date : r.start_date;
}

// Si el día de pago no es el de la entrega, la primera cuota cubre solo los días desde la entrega
// hasta el primer día de pago, a la séptima parte de la cuota por día
export function firstInstallment(r: Pick<Rental, 'start_date' | 'first_pay_date' | 'weekly_fee'>): { days: number; amount: number } {
  const days = daysBetween(r.start_date, firstPayDate(r));
  return days > 0 ? { days, amount: Math.round(r.weekly_fee * days / 7) } : { days: 7, amount: r.weekly_fee };
}

// ─── Estado de los pagos ──────────────────────────────────────────────────────

export interface RentStatus {
  weeksDue:    number;          // cuotas que ya tocaba pagar (incluida la que vence hoy; la primera puede ser parcial)
  paidRent:    number;
  owed:        number;          // > 0 debe; <= 0 al día (negativo = pagó por adelantado)
  nextDue:     string | null;   // cuota más vieja sin pagar completa (null: terminó y quedó al día)
  daysLate:    number;          // días desde nextDue, solo si debe
  lateFee:     number;          // mora sugerida
  canRecover:  boolean;         // atraso suficiente para recoger el carro según el contrato
  depositPaid: number;
  level:       Level;
}

// Inicio del periodo que cubre la cuota k (0 = el que empieza el día de la entrega)
function installmentDate(r: Rental, k: number): string {
  const pay = firstPayDate(r);
  if (pay === r.start_date) return addDays(r.start_date, 7 * k);
  return k === 0 ? r.start_date : addDays(pay, 7 * (k - 1));
}

// Día en que se paga la cuota k: al empezar su periodo (por adelantado) o al terminarlo (semana
// vencida; con el carro devuelto antes, el día de la devolución)
function dueDate(r: Rental, k: number): string {
  if (!r.in_arrears) return installmentDate(r, k);
  const next = installmentDate(r, k + 1);
  return r.end_date && r.end_date < next ? r.end_date : next;
}

// Cuotas que ya tocaba pagar a hoy: su periodo empezó mientras tenía el carro y ya llegó su día de pago
function installmentsDueUntil(r: Rental, asOf: string, today: string): number {
  let n = 0;
  while (installmentDate(r, n) <= asOf && dueDate(r, n) <= today) n++;
  return n;
}

// Valor de la cuota k: cuota × días que cubre / 7. La primera puede ser parcial (día de pago
// distinto al de la entrega) y, con el carro devuelto antes de la siguiente cuota, la última
// se cobra solo por los días que lo tuvo (cláusulas 5b y 20f del contrato)
function installmentAmount(r: Rental, k: number): number {
  const next  = installmentDate(r, k + 1);
  const until = r.end_date && r.end_date < next ? r.end_date : next;
  return Math.round(r.weekly_fee * Math.max(daysBetween(installmentDate(r, k), until), 0) / 7);
}

// Cuántas cuotas completas cubre lo pagado (las adelantadas también cuentan)
function installmentsCovered(r: Rental, paidRent: number, due: number): number {
  if (!(r.weekly_fee > 0)) return due;
  let covered = 0, acc = 0;
  for (let amount = installmentAmount(r, 0); amount > 0 && acc + amount <= paidRent; amount = installmentAmount(r, covered)) {
    acc += amount;
    covered++;
  }
  return covered;
}

export function rentStatus(r: Rental, payments: RentalPayment[], today: string): RentStatus {
  // Con el carro devuelto, solo cuentan las cuotas de los días que lo tuvo
  const lastDay = r.end_date ? addDays(r.end_date, -1) : today;
  const asOf    = lastDay < today ? lastDay : today;

  const sum = (kind: RentalPayment['kind']) =>
    payments.filter(p => p.kind === kind).reduce((s, p) => s + p.amount, 0);
  // Los días sin cobrar (D12, causa del dueño, taller) se descuentan como si los hubiera pagado
  const paidRent    = sum('rent') + sum('credit');
  const depositPaid = sum('deposit');

  const weeksDue = installmentsDueUntil(r, asOf, today);
  let totalDue = 0;
  for (let k = 0; k < weeksDue; k++) totalDue += installmentAmount(r, k);
  const owed     = totalDue - paidRent;
  const covered  = installmentsCovered(r, paidRent, weeksDue);
  const nextDue  = r.end_date && installmentDate(r, covered) >= r.end_date ? null : dueDate(r, covered);

  if (owed <= 0 || nextDue === null) {
    return { weeksDue, paidRent, owed, nextDue, daysLate: 0, lateFee: 0, canRecover: false, depositPaid, level: 'ok' };
  }

  const daysLate = Math.max(daysBetween(nextDue, today), 0);

  // Pena del contrato: cada cuota sin pagar completa suma desde el día siguiente a la gracia
  // hasta hoy o hasta la devolución del carro, con un máximo de MAX_LATE_DAYS días por cuota
  const feeUntil = r.end_date && r.end_date < today ? r.end_date : today;
  let lateDays = 0;
  for (let k = covered; k < weeksDue; k++) {
    const late = daysBetween(dueDate(r, k), feeUntil) - GRACE_DAYS;
    lateDays += Math.min(Math.max(late, 0), MAX_LATE_DAYS);
  }

  return {
    weeksDue, paidRent, owed, nextDue, daysLate,
    lateFee:    lateDays * r.late_fee_per_day,
    canRecover: !r.end_date && daysLate >= RECOVER_DAY,
    depositPaid,
    level:      daysLate > GRACE_DAYS ? 'red' : 'yellow',
  };
}

// Las próximas cuotas sin pagar completas, con su día de pago y su valor (para los avisos)
export function upcomingInstallments(r: Rental, payments: RentalPayment[], count: number): { date: string; amount: number }[] {
  if (!(r.weekly_fee > 0)) return [];
  const paid = payments.filter(p => p.kind === 'rent' || p.kind === 'credit').reduce((s, p) => s + p.amount, 0);
  const list: { date: string; amount: number }[] = [];
  for (let k = installmentsCovered(r, paid, 0); list.length < count; k++) {
    if (r.end_date && installmentDate(r, k) >= r.end_date) break;
    list.push({ date: dueDate(r, k), amount: installmentAmount(r, k) });
  }
  return list;
}

// "Debe $550.000 · 2 días de atraso", "Hoy paga $550.000", "Al día"
export function describeRent(st: RentStatus): string {
  if (st.level === 'ok') return st.owed < 0 ? `Al día · adelantó ${formatCurrency(-st.owed)}` : 'Al día';
  if (st.daysLate === 0) return `Hoy paga ${formatCurrency(st.owed)}`;
  if (st.level === 'yellow') return `Venció ayer: hoy es el último día sin mora (${formatCurrency(st.owed)})`;
  return `Debe ${formatCurrency(st.owed)} · ${st.daysLate} días de atraso`;
}

export function rentalAlert(vehicle: Vehicle, st: RentStatus): VehicleAlert | null {
  if (st.level !== 'red' && st.level !== 'yellow') return null;
  return { vehicleId: vehicle.id, level: st.level, icon: '🔑', text: `${vehicle.name}: arriendo · ${describeRent(st)}` };
}

// Lo cobrado (cuotas y mora) en un mes 'YYYY-MM'
export function collectedInMonth(payments: RentalPayment[], yearMonth: string): number {
  return payments
    .filter(p => (p.kind === 'rent' || p.kind === 'fee') && p.date.startsWith(yearMonth))
    .reduce((s, p) => s + p.amount, 0);
}

// ─── Kilometraje del contrato ─────────────────────────────────────────────────

export interface KmStatus {
  driven:  number;  // km desde que se entregó el carro
  allowed: number;  // km incluidos hasta la fecha del último kilometraje
  excess:  number;
  charge:  number;  // excess × valor del km extra
}

// Se mide contra el último kilometraje anotado del carro, en total desde la entrega
export function kmStatus(r: Rental, v: Pick<Vehicle, 'odometer_km' | 'odometer_date'>): KmStatus | null {
  if (r.start_km === null || !r.km_per_week || v.odometer_km === null || !v.odometer_date) return null;
  if (v.odometer_date < r.start_date || v.odometer_km < r.start_km) return null;
  const driven  = v.odometer_km - r.start_km;
  const allowed = Math.round(r.km_per_week * Math.max(daysBetween(r.start_date, v.odometer_date), 1) / 7);
  const excess  = Math.max(driven - allowed, 0);
  return { driven, allowed, excess, charge: excess * r.extra_km_price };
}

// ─── ¿Cuánto deja o cuánto cuesta el carro al mes? ────────────────────────────

export interface Economics {
  loan:         number;         // cuota del crédito (0 sin crédito vinculado)
  loanMonths:   number | null;  // cuotas que faltan
  docs:         number;         // SOAT, técnico-mecánica, impuesto y seguro, repartidos por mes
  extra:        number;         // GPS, parqueadero y otros fijos
  fixed:        number;         // loan + docs + extra
  rent:         number;         // arriendo al mes (0 si no está arrendado)
  maintKm:      number;         // km al mes que se usan para estimar el mantenimiento
  maint:        number;         // mantenimiento estimado (solo arrendado: lo paga el dueño)
  net:          number;         // rent − fixed − maint
  netAfterLoan: number;         // lo mismo cuando termine el crédito
  perWorkDay:   number;         // fixed / 24: lo que cada día de trabajo debe dejar para el carro
}

export function vehicleEconomics(v: Vehicle, docs: VehicleDoc[], debt: Debt | null, rental: Rental | null): Economics {
  const loan    = debt?.monthly_payment ?? 0;
  const docsSum = docs.reduce((s, d) => s + (d.due_date && d.cost ? d.cost : 0), 0);
  const docsMo  = Math.round(docsSum / 12);
  const extra   = v.extra_monthly_cost;
  const fixed   = loan + docsMo + extra;

  const rent    = rental ? Math.round(rental.weekly_fee * WEEKS_PER_MONTH) : 0;
  const maintKm = rental ? Math.round((rental.km_per_week ?? RENTAL_DEFAULTS.kmPerWeek) * WEEKS_PER_MONTH) : 0;
  const maint   = Math.round(maintKm * v.maint_cost_per_km);
  const net     = rent - fixed - maint;

  return {
    loan, loanMonths: debt?.months_remaining ?? null, docs: docsMo, extra, fixed,
    rent, maintKm, maint, net, netAfterLoan: net + loan,
    perWorkDay: Math.round(fixed / WORK_DAYS_MONTH),
  };
}
