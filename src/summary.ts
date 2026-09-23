// Texto del resumen de la semana o el mes, para mandar por WhatsApp
import type { DailySummary } from './db';
import { formatCurrency, formatShortDate } from './format';
import { formatHours, HourStat } from './workStats';

export function summaryText(
  title: string, summaries: DailySummary[], hours: HourStat | null,
): string {
  const income  = summaries.reduce((s, d) => s + d.income, 0);
  const expense = summaries.reduce((s, d) => s + d.expense, 0);
  const rent    = summaries.reduce((s, d) => s + d.rent, 0);
  const net     = income - expense;
  const workNet = (d: DailySummary) => d.net - d.rent;
  const worked  = summaries.filter(d => d.income - d.rent > 0);
  const best    = worked.length
    ? worked.reduce((b, d) => (workNet(d) > workNet(b) ? d : b), worked[0])
    : null;
  const money = (n: number) => (n < 0 ? '-' : '') + formatCurrency(n);

  const lines = [
    `📊 *${title}*`,
    `💵 Gané: ${formatCurrency(income)}`,
    `💸 Gasté: ${formatCurrency(expense)}`,
    `✅ Me quedó: ${money(net)}`,
    `🚗 Días trabajados: ${worked.length}`,
  ];
  if (rent > 0) lines.push(`🔑 Arriendo cobrado: ${formatCurrency(rent)} (incluido en lo que gané)`);
  if (hours && hours.hours > 0) lines.push(`⏱️ Horas: ${formatHours(hours.hours)} · ${money(hours.perHour)} por hora`);
  if (best && workNet(best) > 0) lines.push(`🏆 Mejor día: ${formatShortDate(best.date)}, ${formatCurrency(workNet(best))}`);
  lines.push('', '_Uber Finanzas_');
  return lines.join('\n');
}
