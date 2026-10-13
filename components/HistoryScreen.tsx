import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share } from 'react-native';
import { getDailySummaries, getWorkSessions, DailySummary, WorkSession } from '../src/db';
import {
  formatCurrency, dateRangeStrings, startOfMonthString, todayString, formatShortDate, formatMonth,
} from '../src/format';
import { buildWorkDays, hourlyStats, formatHours, HourStat } from '../src/workStats';
import { summaryText } from '../src/summary';
import { C, T, S, R } from '../src/theme';
import { Amount, Button, Chip, Icon, Section } from './ui';

// Lunes primero
const WEEKDAYS = [
  { i: 1, label: 'Lunes' }, { i: 2, label: 'Martes' }, { i: 3, label: 'Miércoles' }, { i: 4, label: 'Jueves' },
  { i: 5, label: 'Viernes' }, { i: 6, label: 'Sábado' }, { i: 0, label: 'Domingo' },
];

type Period = 'week' | 'month';

export default function HistoryScreen() {
  const [period, setPeriod] = useState<Period>('week');
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [sessions, setSessions]   = useState<WorkSession[]>([]);
  const [from, setFrom]           = useState(todayString());

  const load = useCallback(() => {
    const today = todayString();
    const start = period === 'week'
      ? dateRangeStrings(6).from
      : startOfMonthString();
    setFrom(start);
    setSummaries(getDailySummaries(start, today));
    setSessions(getWorkSessions(start, today));
  }, [period]);

  React.useEffect(() => { load(); }, [load]);

  const totalIncome  = summaries.reduce((s, d) => s + d.income, 0);
  const totalExpense = summaries.reduce((s, d) => s + d.expense, 0);
  const totalNet     = totalIncome - totalExpense;

  // Mejor día de trabajo: sin contar el arriendo del carro que se cobró ese día
  const workNet = (d: DailySummary) => d.net - d.rent;
  const bestDay = summaries.length
    ? summaries.reduce((best, d) => workNet(d) > workNet(best) ? d : best, summaries[0])
    : null;

  const hours = hourlyStats(buildWorkDays(sessions, summaries));
  const title = period === 'week'
    ? `Resumen de los últimos 7 días (${formatShortDate(from)} a ${formatShortDate(todayString())})`
    : `Resumen de ${formatMonth(from.slice(0, 7))} (hasta hoy)`;
  const shareSummary = () => { Share.share({ message: summaryText(title, summaries, hours.total) }).catch(() => {}); };

  // Turno que deja más por hora (solo si hay datos de los dos)
  const better = hours.day && hours.night
    ? (hours.day.perHour >= hours.night.perHour ? 'day' : 'night')
    : null;
  const weekdayRows = WEEKDAYS
    .map(w => ({ ...w, stat: hours.byWeekday[w.i] }))
    .filter((w): w is typeof w & { stat: HourStat } => w.stat !== null);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={T.headline} accessibilityRole="header">Historial</Text>
        <View style={s.chips} accessibilityRole="radiogroup">
          {(['week', 'month'] as Period[]).map(p => (
            <Chip key={p} label={p === 'week' ? 'Últimos 7 días' : 'Este mes'} selected={period === p} onPress={() => setPeriod(p)} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Totales del período */}
        <View style={s.hero}>
          <Text style={T.label}>Ingresos menos gastos</Text>
          <Text style={[T.display, { color: totalNet < 0 ? C.spend : C.text }]}>
            {totalNet < 0 ? '−' : ''}{formatCurrency(totalNet)}
          </Text>
          <View style={s.heroRows}>
            <View style={s.line}><Text style={T.bodySm}>Gané</Text><Amount value={totalIncome} kind="in" /></View>
            <View style={s.line}><Text style={T.bodySm}>Gasté</Text><Amount value={totalExpense} kind="out" /></View>
          </View>
          {bestDay && workNet(bestDay) > 0 && (
            <View style={s.best}>
              <Icon name="trophy-outline" size={20} color={C.warn} />
              <Text style={[T.bodySm, { color: C.text, flex: 1 }]}>
                Mejor día: {formatShortDate(bestDay.date)}, te quedaron {formatCurrency(workNet(bestDay))}
              </Text>
            </View>
          )}
          {summaries.length > 0 && (
            <Button label="Mandar resumen por WhatsApp" icon="share-variant" variant="tonal" tone="neutral" onPress={shareSummary} style={{ marginTop: S.md }} />
          )}
        </View>

        {/* Ganancia por hora */}
        <Section title="¿Cuánto te deja cada hora?">
          {!hours.total ? (
            <Text style={T.bodySm}>
              En Hoy toca "Empezar" al salir y "Terminar" al acabar. Así la app sabe cuántas horas trabajas y cuánto te deja cada hora.
            </Text>
          ) : (
            <>
              <Text style={T.headline}>{formatCurrency(hours.total.perHour)} <Text style={T.bodySm}>por hora</Text></Text>
              <Text style={T.labelSm}>
                {formatHours(hours.total.hours)} en {hours.total.days} {hours.total.days === 1 ? 'jornada' : 'jornadas'} · sin contar arriendos
              </Text>
              <View style={s.shifts}>
                {([['day', 'De día', 'white-balance-sunny', hours.day], ['night', 'De noche', 'weather-night', hours.night]] as const).map(([key, label, icon, st]) => (
                  <View key={key} style={[s.shift, better === key && s.shiftBest]}>
                    <View style={s.inline}>
                      <Icon name={icon} size={18} color={better === key ? C.money : C.textMuted} />
                      <Text style={T.labelSm}>{label}</Text>
                    </View>
                    <Text style={[T.title, { fontVariant: ['tabular-nums'] }, better === key && { color: C.money }]}>
                      {st ? `${formatCurrency(st.perHour)}/h` : 'Sin datos'}
                    </Text>
                    <Text style={T.labelSm}>{st ? `${st.days} ${st.days === 1 ? 'jornada' : 'jornadas'}` : 'Sin jornadas'}</Text>
                  </View>
                ))}
              </View>
              {weekdayRows.length > 1 && weekdayRows.map((w, i) => (
                <View key={w.i} style={[s.wdRow, i < weekdayRows.length - 1 && s.divider]}>
                  <Text style={[T.body, { flex: 1 }]}>{w.label}</Text>
                  <Text style={[T.labelSm, { width: 90 }]}>{w.stat.days} {w.stat.days === 1 ? 'jornada' : 'jornadas'}</Text>
                  <Text style={T.amount}>{formatCurrency(w.stat.perHour)}/h</Text>
                </View>
              ))}
              <Text style={[T.labelSm, { color: C.textFaint, marginTop: S.sm }]}>De día = la mitad de la jornada cae entre 6 a. m. y 6 p. m.</Text>
            </>
          )}
        </Section>

        {/* Día por día */}
        <Section title="Día por día">
          {summaries.length === 0 ? (
            <Text style={T.bodySm}>Sin registros en este período. Anota ingresos y gastos en Hoy.</Text>
          ) : summaries.map((day, i) => (
            <View key={day.date} style={[s.dayRow, i < summaries.length - 1 && s.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>{formatShortDate(day.date)}</Text>
                <Text style={T.labelSm}>
                  <Text style={{ color: C.money }}>+{formatCurrency(day.income)}</Text>
                  {'   '}
                  <Text style={{ color: C.spend }}>−{formatCurrency(day.expense)}</Text>
                </Text>
              </View>
              <Amount value={day.net} kind="neutral" style={{ color: day.net < 0 ? C.spend : C.text }} />
            </View>
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.md, gap: S.md },
  chips:     { flexDirection: 'row', gap: S.sm },
  scroll:    { paddingHorizontal: S.lg, paddingBottom: S.xl },
  hero:      { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md },
  heroRows:  { marginTop: S.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.outline, paddingTop: S.sm },
  line:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  best:      { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.sm },
  inline:    { flexDirection: 'row', alignItems: 'center', gap: S.xs },
  shifts:    { flexDirection: 'row', gap: S.md, marginVertical: S.md },
  shift:     { flex: 1, backgroundColor: C.surfaceHigh, borderRadius: R.md, padding: S.md, gap: 2, borderWidth: 1, borderColor: C.surfaceHigh },
  shiftBest: { borderColor: C.money },
  wdRow:     { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  dayRow:    { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: S.xs },
  divider:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
});
