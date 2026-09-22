import type { Vehicle, MaintenancePlan, MaintenanceRecord, VehicleDoc } from './db';
import { addMonths, daysBetween, formatDate, formatKm } from './format';

// Solo constantes y cálculos puros: sin acceso a la DB (db.ts importa de aquí)

// ─── Tipos de energía y valores iniciales ─────────────────────────────────────

export type EnergyType = 'gasoline' | 'electric';

export const ENERGY_TYPES: { id: EnergyType; label: string; icon: string }[] = [
  { id: 'gasoline', label: 'Gasolina',  icon: '⛽' },
  { id: 'electric', label: 'Eléctrico', icon: '⚡' },
];

export function energyIcon(energy: EnergyType): string {
  return energy === 'electric' ? '⚡' : '⛽';
}

export const VEHICLE_PRESETS = {
  gasoline: {
    kmPerGallon:     35,     // rendimiento promedio Colombia
    gasPrice:        15827,  // precio galón corriente 2025
    picoPlacaDays:   1,      // Medellín: 1 día por semana
    maintCostPerKm:  80,     // provisión mantenimiento preventivo
  },
  electric: {
    kwhPer100km:     17.5,   // BYD Yuan Plus, ficha técnica
    kwhPrice:        958,    // EPM residencial 2026, por encima de subsistencia
    picoPlacaDays:   0,      // eléctricos exentos en Medellín (Ley 1964/2019)
    maintCostPerKm:  150,    // servicio BYD ~48 + alineación ~14 + llantas 215/55 R18 ~73 + otros ~15 (2026-09); ajustar con facturas
  },
};

// Costo de energía por km (gasolina o electricidad)
export function energyCostPerKm(v: Pick<Vehicle, 'energy' | 'km_per_gallon' | 'gas_price' | 'kwh_per_100km' | 'kwh_price'>): number {
  if (v.energy === 'electric') return (v.kwh_per_100km / 100) * v.kwh_price;
  return v.km_per_gallon > 0 ? v.gas_price / v.km_per_gallon : 0;
}

// ─── Mantenimientos ──────────────────────────────────────────────────────────

export const MAINTENANCE_KINDS = [
  { id: 'service',   label: 'Mantenimiento general', icon: '🛠️' },
  { id: 'oil',       label: 'Cambio de aceite',      icon: '🛢️' },
  { id: 'tires',     label: 'Llantas',               icon: '⭕' },
  { id: 'brakes',    label: 'Frenos',                icon: '🛑' },
  { id: 'alignment', label: 'Alineación y balanceo', icon: '🎯' },
  { id: 'battery',   label: 'Batería',               icon: '🔋' },
  { id: 'repair',    label: 'Arreglo o daño',        icon: '🔧' },
  { id: 'other',     label: 'Otro',                  icon: '📝' },
] as const;

export function maintenanceLabel(kind: string): string {
  return MAINTENANCE_KINDS.find(k => k.id === kind)?.label ?? kind;
}

export function maintenanceIcon(kind: string): string {
  return MAINTENANCE_KINDS.find(k => k.id === kind)?.icon ?? '🔧';
}

// Recordatorio que se crea con cada carro nuevo.
// Renault: cada 10.000 km o 1 año.
// BYD: 12.000 km o 1 año, lo que ocurra primero: es el plan del concesionario (Motorysa), que manda
// para la garantía. El manual dice 20.000 km, así que se usa el menor. Lo que el manual pide más
// espaciado (líquido de frenos y aceite del reductor a 40.000 km, refrigerante a 100.000 km) lo
// hace el concesionario en el servicio que corresponda.
export const DEFAULT_PLANS: Record<EnergyType, { kind: string; everyKm: number; everyMonths: number }[]> = {
  gasoline: [{ kind: 'service', everyKm: 10000, everyMonths: 12 }],
  electric: [{ kind: 'service', everyKm: 12000, everyMonths: 12 }],
};

// ─── Documentos con vencimiento ──────────────────────────────────────────────

export const DOC_KINDS = [
  { id: 'soat',      label: 'SOAT',               icon: '🛡️' },
  { id: 'rtm',       label: 'Técnico-mecánica',   icon: '🔍' },
  { id: 'tax',       label: 'Impuesto vehicular', icon: '🏛️' },
  { id: 'insurance', label: 'Seguro todo riesgo', icon: '📄' },
] as const;

export function docLabel(kind: string): string {
  return DOC_KINDS.find(k => k.id === kind)?.label ?? kind;
}

// ─── Estado: qué está vencido o por vencer ───────────────────────────────────

export const WARN_DAYS         = 30;    // aviso amarillo 30 días antes
export const WARN_KM           = 1000;  // aviso amarillo 1.000 km antes
export const ODOMETER_STALE    = 15;    // pedir km actualizado cada 15 días

export type Level = 'red' | 'yellow' | 'ok' | 'unknown';

export interface PlanStatus {
  plan:      MaintenancePlan;
  last:      MaintenanceRecord | null;  // último registro de ese tipo
  nextKm:    number | null;
  nextDate:  string | null;
  kmLeft:    number | null;             // negativo = ya se pasó
  daysLeft:  number | null;
  level:     Level;
}

function levelFor(daysLeft: number | null, kmLeft: number | null): Level {
  if ((daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft < 0)) return 'red';
  if ((daysLeft !== null && daysLeft <= WARN_DAYS) || (kmLeft !== null && kmLeft <= WARN_KM)) return 'yellow';
  if (daysLeft === null && kmLeft === null) return 'unknown';
  return 'ok';
}

export function planStatus(
  plan: MaintenancePlan,
  records: MaintenanceRecord[],
  odometerKm: number | null,
  today: string,
): PlanStatus {
  const sameKind = records.filter(r => r.kind === plan.kind);
  // El más reciente por fecha; en empate, el de más km
  const last = sameKind.reduce<MaintenanceRecord | null>((best, r) => {
    if (!best) return r;
    if (r.date !== best.date) return r.date > best.date ? r : best;
    return (r.km ?? 0) > (best.km ?? 0) ? r : best;
  }, null);

  const nextKm   = last?.km != null && plan.every_km ? last.km + plan.every_km : null;
  const nextDate = last && plan.every_months ? addMonths(last.date, plan.every_months) : null;
  const kmLeft   = nextKm !== null && odometerKm !== null ? nextKm - odometerKm : null;
  const daysLeft = nextDate !== null ? daysBetween(today, nextDate) : null;

  return { plan, last, nextKm, nextDate, kmLeft, daysLeft, level: last ? levelFor(daysLeft, kmLeft) : 'unknown' };
}

export function docStatus(doc: VehicleDoc | undefined, today: string): { daysLeft: number | null; level: Level } {
  if (!doc?.due_date) return { daysLeft: null, level: 'unknown' };
  const daysLeft = daysBetween(today, doc.due_date);
  return { daysLeft, level: levelFor(daysLeft, null) };
}

// "vence en 12 días", "venció hace 3 días", "vence hoy"
export function describeDays(daysLeft: number, future = 'vence', past = 'venció'): string {
  if (daysLeft === 0) return `${future} hoy`;
  if (daysLeft === 1) return `${future} mañana`;
  if (daysLeft > 0)   return `${future} en ${daysLeft} días`;
  return `${past} hace ${-daysLeft} ${daysLeft === -1 ? 'día' : 'días'}`;
}

// Texto corto de cuándo toca un mantenimiento
export function describePlan(st: PlanStatus): string {
  if (!st.last) return 'Registra el último que le hiciste';
  const parts: string[] = [];
  if (st.kmLeft !== null) {
    parts.push(st.kmLeft >= 0 ? `faltan ${formatKm(st.kmLeft)} km` : `se pasó por ${formatKm(-st.kmLeft)} km`);
  } else if (st.nextKm !== null) {
    parts.push(`a los ${formatKm(st.nextKm)} km`);
  }
  if (st.daysLeft !== null) {
    parts.push(st.daysLeft >= 0 ? `antes del ${formatDate(st.nextDate!)}` : `se pasó la fecha (${formatDate(st.nextDate!)})`);
  }
  return parts.join(' · ') || 'Sin intervalo definido';
}

export interface VehicleAlert {
  vehicleId: number;
  level:     'red' | 'yellow';
  icon:      string;
  text:      string;
}

export function vehicleAlerts(
  vehicle: Vehicle,
  plans: MaintenancePlan[],
  records: MaintenanceRecord[],
  docs: VehicleDoc[],
  today: string,
): VehicleAlert[] {
  const out: VehicleAlert[] = [];
  const name = vehicle.name;

  for (const kind of DOC_KINDS) {
    const { daysLeft, level } = docStatus(docs.find(d => d.kind === kind.id), today);
    if ((level === 'red' || level === 'yellow') && daysLeft !== null) {
      out.push({ vehicleId: vehicle.id, level, icon: kind.icon, text: `${name}: ${kind.label} ${describeDays(daysLeft)}` });
    }
  }

  for (const plan of plans) {
    const st = planStatus(plan, records, vehicle.odometer_km, today);
    if (st.level === 'red' || st.level === 'yellow') {
      out.push({ vehicleId: vehicle.id, level: st.level, icon: maintenanceIcon(plan.kind), text: `${name}: ${maintenanceLabel(plan.kind)}, ${describePlan(st)}` });
    }
  }

  // Sin km al día no se puede avisar por kilometraje
  const usesKm = plans.some(p => p.every_km);
  const stale  = !vehicle.odometer_date || daysBetween(vehicle.odometer_date, today) > ODOMETER_STALE;
  if (usesKm && stale) {
    out.push({ vehicleId: vehicle.id, level: 'yellow', icon: '📍', text: `${name}: actualiza el kilometraje` });
  }

  // Primero lo vencido
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
}
