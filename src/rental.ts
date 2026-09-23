import type { Rental, RentalPayment, Vehicle, VehicleDoc, Debt } from './db';
import type { Level, VehicleAlert } from './fleet';
import { addDays, daysBetween, formatCurrency } from './format';

// Solo constantes y cálculos puros del arriendo: sin acceso a la DB

// ─── Contrato recomendado (investigado 2026-09, ver references/arquitectura.md) ──

export const RENTAL_DEFAULTS = {
  weeklyFee:     600000,   // prepagada, cada 7 días desde el día de entrega
  deposit:       1200000,  // se devuelve al terminar, menos multas y daños
  kmPerWeek:     1200,     // km incluidos por semana
  extraKmPrice:  250,      // COP por km de más
  lateFeePerDay: 30000,    // mora por día, después de la gracia
};

export const GRACE_DAYS      = 1;        // 24 h para pagar sin mora
export const RECOVER_DAY     = 3;        // al día 3 de atraso el contrato permite recoger el carro
export const WEEKS_PER_MONTH = 52 / 12;  // 4,33
export const WORK_DAYS_MONTH = 24;       // igual que el objetivo diario de Balance

export const PAYMENT_KINDS: { id: RentalPayment['kind']; label: string; icon: string }[] = [
  { id: 'rent',    label: 'Cuota semanal',          icon: '🔑' },
  { id: 'fee',     label: 'Mora, km extra o daños', icon: '⚠️' },
  { id: 'deposit', label: 'Depósito',               icon: '🔒' },
];

export function paymentLabel(kind: string): string {
  return PAYMENT_KINDS.find(k => k.id === kind)?.label ?? kind;
}

export function paymentIcon(kind: string): string {
  return PAYMENT_KINDS.find(k => k.id === kind)?.icon ?? '🔑';
}

const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

// "lunes": el día de la semana en que le toca pagar (el mismo del día de entrega)
export function payDayName(startDate: string): string {
  const [y, m, d] = startDate.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// ─── Estado de los pagos ──────────────────────────────────────────────────────

export interface RentStatus {
  weeksDue:    number;          // cuotas que ya tocaba pagar (incluida la que vence hoy)
  paidRent:    number;
  owed:        number;          // > 0 debe; <= 0 al día (negativo = pagó por adelantado)
  nextDue:     string | null;   // cuota más vieja sin pagar completa (null: terminó y quedó al día)
  daysLate:    number;          // días desde nextDue, solo si debe
  lateFee:     number;          // mora sugerida
  canRecover:  boolean;         // atraso suficiente para recoger el carro según el contrato
  depositPaid: number;
  level:       Level;
}

function weeksDueUntil(r: Rental, asOf: string): number {
  if (asOf < r.start_date) return 0;
  return Math.floor(daysBetween(r.start_date, asOf) / 7) + 1;
}

export function rentStatus(r: Rental, payments: RentalPayment[], today: string): RentStatus {
  // Con el carro devuelto, solo cuentan las semanas que lo tuvo
  const lastDay = r.end_date ? addDays(r.end_date, -1) : today;
  const asOf    = lastDay < today ? lastDay : today;

  const sum = (kind: RentalPayment['kind']) =>
    payments.filter(p => p.kind === kind).reduce((s, p) => s + p.amount, 0);
  const paidRent    = sum('rent');
  const depositPaid = sum('deposit');

  const weeksDue = weeksDueUntil(r, asOf);
  const owed     = weeksDue * r.weekly_fee - paidRent;
  const covered  = r.weekly_fee > 0 ? Math.floor(paidRent / r.weekly_fee) : weeksDue;
  const due      = addDays(r.start_date, 7 * covered);
  const nextDue  = r.end_date && due >= r.end_date ? null : due;

  if (owed <= 0 || nextDue === null) {
    return { weeksDue, paidRent, owed, nextDue, daysLate: 0, lateFee: 0, canRecover: false, depositPaid, level: 'ok' };
  }

  const daysLate = Math.max(daysBetween(nextDue, today), 0);
  const lateDays = Math.max(daysLate - GRACE_DAYS, 0);
  return {
    weeksDue, paidRent, owed, nextDue, daysLate,
    lateFee:    lateDays * r.late_fee_per_day,
    canRecover: !r.end_date && daysLate >= RECOVER_DAY,
    depositPaid,
    level:      lateDays > 0 ? 'red' : 'yellow',
  };
}

// "Debe $600.000 · 2 días de atraso", "Hoy paga $600.000", "Al día"
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
    .filter(p => p.kind !== 'deposit' && p.date.startsWith(yearMonth))
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
