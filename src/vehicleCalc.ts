import {
  getSetting, setSetting, getActiveVehicle, getVehicles, getMaintenancePlans, getMaintenance,
  getVehicleDocs, getCurrentRental, getRentalPayments, getCharges, Vehicle,
} from './db';
import { VEHICLE_PRESETS, energyCostPerKm, vehicleAlerts, EnergyType, VehicleAlert } from './fleet';
import { rentStatus, rentalAlert } from './rental';
import { addDays, todayString } from './format';

// ─── Defaults Uber (Colombia) ─────────────────────────────────────────────────
// Gasolina, pico y placa y mantenimiento por km son de cada carro (fleet.ts → VEHICLE_PRESETS)
export const DEFAULTS = {
  uberCommissionPct: 25,      // comision uber colombia (solo sin Uber Pass)
  uberPassActive:    true,    // Uber cobra suscripcion (Uber Pass) en vez de comision
  uberPassPriceCOP:  90000,   // valor de cada cobro de Uber Pass
  uberPassPerWeek:   2,       // cobros de Uber Pass por semana
};

// ─── Settings helpers ─────────────────────────────────────────────────────────

export interface VehicleConfig {
  vehicleName:          string;
  energy:               EnergyType;
  energyCostPerKm:      number;   // gasolina o carga eléctrica por km
  picoPlacaDaysPerWeek: number;
  maintenanceCostPerKm: number;
  uberCommissionPct:    number;
  uberPassActive:       boolean;
  uberPassPriceCOP:     number;
}

// Datos del carro que maneja el usuario + su configuración de Uber
export function getVehicleConfig(): VehicleConfig {
  const v = getActiveVehicle();
  const g = VEHICLE_PRESETS.gasoline;
  return {
    vehicleName:          v?.name ?? 'Mi carro',
    energy:               v?.energy ?? 'gasoline',
    energyCostPerKm:      v ? vehicleEnergyCostPerKm(v) : g.gasPrice / g.kmPerGallon,
    picoPlacaDaysPerWeek: v?.pico_placa_days ?? g.picoPlacaDays,
    maintenanceCostPerKm: v?.maint_cost_per_km ?? g.maintCostPerKm,
    uberCommissionPct:    Number(getSetting('uber_commission_pct',    String(DEFAULTS.uberCommissionPct))),
    uberPassActive:       getSetting('uber_pass_active', DEFAULTS.uberPassActive ? '1' : '0') === '1',
    uberPassPriceCOP:     Number(getSetting('uber_pass_price_cop',    String(DEFAULTS.uberPassPriceCOP))),
  };
}

// ─── Precio real de la carga (carro eléctrico) ───────────────────────────────

const CHARGE_WINDOW_DAYS = 90;

// Precio promedio del kWh que pagó en las cargas anotadas con kWh de los últimos 90 días
export function realKwhPrice(vehicleId: number, today = todayString()): { price: number; charges: number } | null {
  const list = getCharges(vehicleId, addDays(today, -CHARGE_WINDOW_DAYS)).filter(c => c.kwh !== null && c.kwh > 0);
  const kwh = list.reduce((s, c) => s + (c.kwh ?? 0), 0);
  if (list.length === 0 || kwh <= 0) return null;
  const paid = list.reduce((s, c) => s + c.amount, 0);
  return { price: Math.round(paid / kwh), charges: list.length };
}

// Energía por km; en eléctricos usa el precio real de las cargas si ya hay alguna anotada con kWh
export function vehicleEnergyCostPerKm(v: Vehicle): number {
  if (v.energy !== 'electric') return energyCostPerKm(v);
  const real = realKwhPrice(v.id);
  return energyCostPerKm(real ? { ...v, kwh_price: real.price } : v);
}

export type UberConfig = Pick<VehicleConfig, 'uberCommissionPct' | 'uberPassActive' | 'uberPassPriceCOP'>;

export function saveUberConfig(cfg: Partial<UberConfig>): void {
  if (cfg.uberCommissionPct    !== undefined) setSetting('uber_commission_pct',     String(cfg.uberCommissionPct));
  if (cfg.uberPassActive       !== undefined) setSetting('uber_pass_active',        cfg.uberPassActive ? '1' : '0');
  if (cfg.uberPassPriceCOP     !== undefined) setSetting('uber_pass_price_cop',     String(cfg.uberPassPriceCOP));
}

// ─── Cálculo ganancia real ────────────────────────────────────────────────────

export interface RealEarnings {
  grossIncome:       number;  // lo que muestra Uber (bruto)
  uberCommission:    number;  // comisión Uber (0 con Uber Pass)
  uberPassDaily:     number;  // Uber Pass repartido por día trabajado (0 sin Uber Pass)
  energyCost:        number;  // gasolina o carga eléctrica
  maintenanceCost:   number;  // provisión mantenimiento
  netReal:           number;  // lo que queda de verdad
  costPerKm:         number;  // costo total por km
}

export function calcRealEarnings(
  grossIncome: number,
  kmDriven: number,
  cfg: VehicleConfig
): RealEarnings {
  const uberCommission  = cfg.uberPassActive ? 0 : grossIncome * (cfg.uberCommissionPct / 100);
  const uberPassDaily   = cfg.uberPassActive ? calcUberPassPerWorkDay(cfg) : 0;
  const energyCost      = kmDriven * cfg.energyCostPerKm;
  const maintenanceCost = kmDriven * cfg.maintenanceCostPerKm;
  const netReal         = grossIncome - uberCommission - uberPassDaily - energyCost - maintenanceCost;
  const totalCost       = uberCommission + uberPassDaily + energyCost + maintenanceCost;
  const costPerKm       = kmDriven > 0 ? totalCost / kmDriven : 0;

  return {
    grossIncome,
    uberCommission:  Math.round(uberCommission),
    uberPassDaily,
    energyCost:      Math.round(energyCost),
    maintenanceCost: Math.round(maintenanceCost),
    netReal:         Math.round(netReal),
    costPerKm:       Math.round(costPerKm),
  };
}

// ─── Avisos de todos los carros (arriendo, vencimientos y mantenimientos) ────

// Avisos de un carro, incluido el pago del arriendo si está arrendado
export function getVehicleAlerts(v: Vehicle, today = todayString()): VehicleAlert[] {
  const alerts = vehicleAlerts(v, getMaintenancePlans(v.id), getMaintenance(v.id), getVehicleDocs(v.id), today);
  const rental = getCurrentRental(v.id);
  const rent   = rental ? rentalAlert(v, rentStatus(rental, getRentalPayments(rental.id), today)) : null;
  return (rent ? [rent, ...alerts] : alerts)
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
}

export function getFleetAlerts(): VehicleAlert[] {
  const today = todayString();
  return getVehicles()
    .flatMap(v => getVehicleAlerts(v, today))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
}

// ─── Uber Pass ────────────────────────────────────────────────────────────────

// Costo semanal del Uber Pass repartido entre los días que se trabaja (7 menos pico y placa)
export function calcUberPassPerWorkDay(cfg: VehicleConfig): number {
  const workDays = Math.max(7 - cfg.picoPlacaDaysPerWeek, 1);
  return Math.round((cfg.uberPassPriceCOP * DEFAULTS.uberPassPerWeek) / workDays);
}

// ─── Comisión en efectivo ─────────────────────────────────────────────────────

export function calcCashCommission(cashAmount: number, cfg: VehicleConfig): number {
  if (cfg.uberPassActive) return 0;  // con Uber Pass no hay comisión por viaje
  return Math.round(cashAmount * (cfg.uberCommissionPct / 100));
}

// ─── Pico y Placa ─────────────────────────────────────────────────────────────

export interface PicoPlacaImpact {
  daysBlockedThisMonth: number;
  estimatedLostIncome:  number;  // basado en promedio diario ingresado
  workedDaysAvailable:  number;
}

export function calcPicoPlacaImpact(
  avgDailyNet: number,
  cfg: VehicleConfig
): PicoPlacaImpact {
  const today             = new Date();
  const daysInMonth       = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const weeksInMonth      = daysInMonth / 7;
  const daysBlockedTotal  = Math.round(cfg.picoPlacaDaysPerWeek * weeksInMonth);
  const workedDaysAvail   = daysInMonth - daysBlockedTotal;
  const estimatedLost     = Math.round(daysBlockedTotal * avgDailyNet);

  return {
    daysBlockedThisMonth: daysBlockedTotal,
    estimatedLostIncome:  estimatedLost,
    workedDaysAvailable:  workedDaysAvail,
  };
}
