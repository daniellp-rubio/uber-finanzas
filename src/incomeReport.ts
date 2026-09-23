// Resumen de ingresos de los últimos meses completos, para el banco. Arma el HTML del PDF.
import { getCategoryTotals, getMonthStats } from './db';
import { RENT_CATEGORY } from './categories';
import { addDays, addMonths, formatCurrency, formatDate, formatMonth } from './format';

export interface MonthRow {
  month:      string;   // "2026-08"
  daysWorked: number;
  drive:      number;   // ingresos por manejar
  rent:       number;   // arriendo del carro
  expense:    number;
  net:        number;
}

export interface IncomeReport {
  rows:    MonthRow[];   // del más viejo al más nuevo; empieza en el primer mes con registros
  total:   Omit<MonthRow, 'month'>;
  average: Omit<MonthRow, 'month'>;
}

// Los `months` meses completos antes del mes de `today`
export function buildIncomeReport(months: number, today: string): IncomeReport | null {
  const firstOfThisMonth = `${today.slice(0, 7)}-01`;
  const all: MonthRow[] = [];
  for (let i = months; i >= 1; i--) {
    const from = addMonths(firstOfThisMonth, -i);
    const to   = addDays(addMonths(from, 1), -1);
    let drive = 0, rent = 0, expense = 0;
    for (const t of getCategoryTotals(from, to)) {
      if (t.type === 'expense') expense += t.total;
      else if (t.category === RENT_CATEGORY) rent += t.total;
      else drive += t.total;
    }
    const month = from.slice(0, 7);
    all.push({ month, daysWorked: getMonthStats(month).daysWorked, drive, rent, expense, net: drive + rent - expense });
  }
  const start = all.findIndex(r => r.drive + r.rent + r.expense > 0);
  if (start < 0) return null;
  const rows = all.slice(start);

  const sum = (k: keyof Omit<MonthRow, 'month'>) => rows.reduce((s, r) => s + r[k], 0);
  const total = {
    daysWorked: sum('daysWorked'), drive: sum('drive'), rent: sum('rent'), expense: sum('expense'), net: sum('net'),
  };
  const n = rows.length;
  const average = {
    daysWorked: Math.round(total.daysWorked / n), drive: total.drive / n, rent: total.rent / n,
    expense: total.expense / n, net: total.net / n,
  };
  return { rows, total, average };
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function incomeReportHtml(r: IncomeReport, owner: { name: string; id: string }, today: string): string {
  const hasRent = r.total.rent > 0;
  const money = (n: number) => (n < 0 ? '-' : '') + formatCurrency(n);
  const cells = (x: Omit<MonthRow, 'month'>) => `
      <td class="n">${x.daysWorked}</td>
      <td class="n">${money(x.drive)}</td>
      ${hasRent ? `<td class="n">${money(x.rent)}</td>` : ''}
      <td class="n">${money(x.expense)}</td>
      <td class="n b">${money(x.net)}</td>`;
  const first = formatMonth(r.rows[0].month);
  const last  = formatMonth(r.rows[r.rows.length - 1].month);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 36px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 20px; }
  .who p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th, td { border-bottom: 1px solid #ccc; padding: 8px 6px; text-align: left; }
  th { background: #f2f2f2; font-size: 12px; }
  .n { text-align: right; white-space: nowrap; }
  .b { font-weight: bold; }
  tr.tot td { border-top: 2px solid #111; font-weight: bold; }
  tr.avg td { background: #f7f7f7; font-weight: bold; }
  .note { color: #555; font-size: 11px; margin-top: 22px; line-height: 1.5; }
  .sign { margin-top: 56px; }
  .sign div { border-top: 1px solid #111; width: 260px; padding-top: 4px; }
</style></head>
<body>
  <h1>Resumen de ingresos</h1>
  <p class="sub">${cap(first)}${first === last ? '' : ` a ${last}`} · ${r.rows.length} ${r.rows.length === 1 ? 'mes' : 'meses'}</p>
  <div class="who">
    ${owner.name ? `<p><b>Nombre:</b> ${esc(owner.name)}</p>` : ''}
    ${owner.id ? `<p><b>Cédula:</b> ${esc(owner.id)}</p>` : ''}
    <p><b>Actividad:</b> conductor independiente de plataforma de transporte${hasRent ? ' y arriendo de vehículo' : ''}</p>
  </div>
  <table>
    <tr>
      <th>Mes</th><th class="n">Días trabajados</th><th class="n">Ingresos por conducción</th>
      ${hasRent ? '<th class="n">Arriendo del carro</th>' : ''}
      <th class="n">Gastos</th><th class="n">Neto</th>
    </tr>
    ${r.rows.map(row => `<tr><td>${cap(formatMonth(row.month))}</td>${cells(row)}</tr>`).join('')}
    <tr class="tot"><td>Total</td>${cells(r.total)}</tr>
    <tr class="avg"><td>Promedio mensual</td>${cells(r.average)}</tr>
  </table>
  <p class="note">
    Elaborado el ${formatDate(today)} por el titular con la app Uber Finanzas, a partir de los ingresos y gastos
    que anota cada día. No es un certificado expedido por contador público ni por Uber. Si la entidad lo pide,
    un contador puede certificarlo con estos soportes y los extractos de la plataforma y del banco.
  </p>
  <div class="sign"><div>Firma del titular</div></div>
</body></html>`;
}
