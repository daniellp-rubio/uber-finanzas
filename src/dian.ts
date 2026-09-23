// Estimador de renta (DIAN) para persona natural residente. Orientativo.
// Normas vigentes a sep-2026 (investigación en references/arquitectura.md → DIAN).
import { getCategoryTotals, getFirstTransactionDate } from './db';
import { RENT_CATEGORY } from './categories';
import { daysBetween, todayString } from './format';

export const TAX_YEAR = 2026;
export const UVT      = 52374;   // UVT 2026, Res. DIAN 000238 de 2025

const UVT_INCOME_TO_FILE    = 1400;   // art. 592: ingresos brutos del año
const UVT_PATRIMONY_TO_FILE = 4500;   // art. 592: patrimonio bruto (sin restar deudas)
const UVT_EXEMPT_25_CAP     = 790;    // art. 206 num. 10
const UVT_EXEMPT_40_CAP     = 1340;   // art. 336: rentas exentas + deducciones
const MIN_DAYS              = 30;     // con menos de un mes de registros no se proyecta el año

// Art. 241: [desde UVT, tarifa marginal, impuesto base en UVT], tal como los trae la ley
const TABLE_241: [number, number, number][] = [
  [0,     0,    0],
  [1090,  0.19, 0],
  [1700,  0.28, 116],
  [4100,  0.33, 788],
  [8670,  0.35, 2296],
  [18970, 0.37, 5901],
  [31000, 0.39, 10352],
];

// Gastos que son costo de manejar (con soporte). Comida, celular y "otro" no cuentan.
export const COST_CATEGORIES = ['gas', 'charge', 'uber_pass', 'maint', 'wash', 'toll'];

export const INCOME_TO_FILE_COP    = UVT_INCOME_TO_FILE * UVT;      // $73.323.600
export const PATRIMONY_TO_FILE_COP = UVT_PATRIMONY_TO_FILE * UVT;   // $235.683.000

// Impuesto de la tabla del art. 241 sobre la renta líquida gravable (COP)
export function incomeTax(taxableCOP: number): number {
  const u = Math.max(taxableCOP, 0) / UVT;
  let row = TABLE_241[0];
  for (const r of TABLE_241) if (u > r[0]) row = r;
  const [from, rate, base] = row;
  return Math.round((base + (u - from) * rate) * UVT);
}

export interface DIANInput {
  income:      number;   // ingresos brutos del año (viajes + arriendo)
  driveIncome: number;   // solo lo de manejar (para el 25 % exento)
  costs:       number;   // costos de manejar anotados
}

export interface DIANEstimate extends DIANInput {
  mustFileByIncome: boolean;
  taxWithCosts:     number;          // restando los costos anotados (lo seguro)
  taxWithExempt:    number | null;   // con el 25 % exento, solo si da menos (depende de un contador)
}

export function calcDIANEstimate(input: DIANInput): DIANEstimate {
  const taxWithCosts = incomeTax(input.income - input.costs);
  const exempt = Math.min(
    input.driveIncome * 0.25,
    UVT_EXEMPT_25_CAP * UVT,
    input.income * 0.40,
    UVT_EXEMPT_40_CAP * UVT,
  );
  const withExempt = incomeTax(input.income - exempt);
  return {
    ...input,
    mustFileByIncome: input.income >= INCOME_TO_FILE_COP,
    taxWithCosts,
    taxWithExempt: withExempt < taxWithCosts ? withExempt : null,
  };
}

export interface YearProjection {
  input:    DIANInput;
  fromDate: string;   // primer registro del año
  days:     number;   // días con datos
}

// Proyecta el año con lo anotado desde el primer registro del año hasta hoy.
// null si hay menos de un mes de registros.
export function projectYear(today = todayString()): YearProjection | null {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const fromDate = getFirstTransactionDate(yearStart);
  if (!fromDate || fromDate > today) return null;
  const days = daysBetween(fromDate, today) + 1;
  if (days < MIN_DAYS) return null;

  let income = 0, rent = 0, costs = 0;
  for (const t of getCategoryTotals(fromDate, today)) {
    if (t.type === 'income') {
      income += t.total;
      if (t.category === RENT_CATEGORY) rent += t.total;
    } else if (COST_CATEGORIES.includes(t.category)) {
      costs += t.total;
    }
  }
  // Días que tiene el año, para no fallar en bisiestos
  const yearDays = daysBetween(yearStart, `${Number(today.slice(0, 4)) + 1}-01-01`);
  const factor = yearDays / days;
  return {
    fromDate,
    days,
    input: {
      income:      Math.round(income * factor),
      driveIncome: Math.round((income - rent) * factor),
      costs:       Math.round(costs * factor),
    },
  };
}

export const DIAN_DISCLAIMER =
  `Estimación orientativa con las normas vigentes a septiembre de ${TAX_YEAR}. ` +
  'No incluye lo que pagues de salud y pensión como independiente (eso baja el impuesto). ' +
  'La DIAN puede aceptar o no algunos gastos. Valídalo con un contador antes de declarar.';
