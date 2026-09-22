import { getSetting, setSetting } from './db';

// ─── Defaults (Colombia 2025) ─────────────────────────────────────────────────
export const DEFAULTS = {
  kmPerGallon:       35,      // rendimiento promedio colombia
  gasPriceCOP:       15827,   // precio galon corriente 2025
  uberCommissionPct: 25,      // comision uber colombia
  picoPlacaDaysPerWeek: 2,    // dias de restriccion bogota
  maintenanceCostPerKm: 80,   // COP por km (mantenimiento preventivo estimado)
};

// ─── Settings helpers ─────────────────────────────────────────────────────────

export interface VehicleConfig {
  kmPerGallon:          number;
  gasPriceCOP:          number;
  uberCommissionPct:    number;
  picoPlacaDaysPerWeek: number;
  maintenanceCostPerKm: number;
}

export function getVehicleConfig(): VehicleConfig {
  return {
    kmPerGallon:          Number(getSetting('km_per_gallon',          String(DEFAULTS.kmPerGallon))),
    gasPriceCOP:          Number(getSetting('gas_price_cop',          String(DEFAULTS.gasPriceCOP))),
    uberCommissionPct:    Number(getSetting('uber_commission_pct',    String(DEFAULTS.uberCommissionPct))),
    picoPlacaDaysPerWeek: Number(getSetting('pico_placa_days_week',   String(DEFAULTS.picoPlacaDaysPerWeek))),
    maintenanceCostPerKm: Number(getSetting('maintenance_cost_per_km',String(DEFAULTS.maintenanceCostPerKm))),
  };
}

export function saveVehicleConfig(cfg: Partial<VehicleConfig>): void {
  if (cfg.kmPerGallon          !== undefined) setSetting('km_per_gallon',           String(cfg.kmPerGallon));
  if (cfg.gasPriceCOP          !== undefined) setSetting('gas_price_cop',           String(cfg.gasPriceCOP));
  if (cfg.uberCommissionPct    !== undefined) setSetting('uber_commission_pct',     String(cfg.uberCommissionPct));
  if (cfg.picoPlacaDaysPerWeek !== undefined) setSetting('pico_placa_days_week',    String(cfg.picoPlacaDaysPerWeek));
  if (cfg.maintenanceCostPerKm !== undefined) setSetting('maintenance_cost_per_km', String(cfg.maintenanceCostPerKm));
}

// ─── Cálculo ganancia real ────────────────────────────────────────────────────

export interface RealEarnings {
  grossIncome:       number;  // lo que muestra Uber (bruto)
  uberCommission:    number;  // comisión Uber
  fuelCost:          number;  // costo gasolina
  maintenanceCost:   number;  // provisión mantenimiento
  netReal:           number;  // lo que queda de verdad
  costPerKm:         number;  // costo total por km
}

export function calcRealEarnings(
  grossIncome: number,
  kmDriven: number,
  cfg: VehicleConfig
): RealEarnings {
  const uberCommission  = grossIncome * (cfg.uberCommissionPct / 100);
  const gallonsUsed     = kmDriven / cfg.kmPerGallon;
  const fuelCost        = gallonsUsed * cfg.gasPriceCOP;
  const maintenanceCost = kmDriven * cfg.maintenanceCostPerKm;
  const netReal         = grossIncome - uberCommission - fuelCost - maintenanceCost;
  const totalCost       = uberCommission + fuelCost + maintenanceCost;
  const costPerKm       = kmDriven > 0 ? totalCost / kmDriven : 0;

  return {
    grossIncome,
    uberCommission:  Math.round(uberCommission),
    fuelCost:        Math.round(fuelCost),
    maintenanceCost: Math.round(maintenanceCost),
    netReal:         Math.round(netReal),
    costPerKm:       Math.round(costPerKm),
  };
}

// ─── Comisión en efectivo ─────────────────────────────────────────────────────

export function calcCashCommission(cashAmount: number, cfg: VehicleConfig): number {
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

// ─── Estimador DIAN (orientativo) ─────────────────────────────────────────────

export interface DIANEstimate {
  annualGrossEstimate:  number;
  isObligatedToFile:    boolean;  // supera UVT 1340 (2025 ~$66.9M COP)
  estimatedTax:         number;
  deductibleExpenses:   number;
  disclaimer:           string;
}

const UVT_2025       = 49799;    // valor UVT 2025 Colombia
const MIN_UVT_FILE   = 1340;     // umbral para declarar renta 2025
const MIN_INCOME_COP = UVT_2025 * MIN_UVT_FILE; // ~$66.7M COP

export function calcDIANEstimate(monthlyNetAvg: number): DIANEstimate {
  const annualGross = monthlyNetAvg * 12;
  const isOblgated  = annualGross >= MIN_INCOME_COP;

  // Gastos deducibles estimados (gasolina + mantenimiento + celular + depreciación)
  const deductible  = Math.round(annualGross * 0.40);
  const taxableBase = Math.max(annualGross - deductible, 0);

  // Tarifa marginal simplificada (renta natural persona 2025, tramo básico ~0-19%)
  let tax = 0;
  if (taxableBase > UVT_2025 * 1090) {
    tax = (taxableBase - UVT_2025 * 1090) * 0.19;
  }

  return {
    annualGrossEstimate: Math.round(annualGross),
    isObligatedToFile:   isOblgated,
    estimatedTax:        Math.round(tax),
    deductibleExpenses:  deductible,
    disclaimer:          'Estimado orientativo. Consulta un contador para tu declaración real.',
  };
}
