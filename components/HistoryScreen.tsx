import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share,
} from 'react-native';
import { getDailySummaries, getWorkSessions, DailySummary, WorkSession } from '../src/db';
import {
  formatCurrency, dateRangeStrings, startOfMonthString, todayString, formatShortDate, formatMonth,
} from '../src/format';
import { buildWorkDays, hourlyStats, formatHours, HourStat } from '../src/workStats';
import { summaryText } from '../src/summary';

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
    ? `Resumen de la semana (${formatShortDate(from)} a ${formatShortDate(todayString())})`
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
        <Text style={s.title}>Historial</Text>

        <View style={s.toggle}>
          {(['week', 'month'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[s.toggleBtn, period === p && s.toggleActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[s.toggleText, period === p && s.toggleTextActive]}>
                {p === 'week' ? 'Esta semana' : 'Este mes'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Period totals */}
        <View style={s.totalsBox}>
          <View style={s.totalItem}>
            <Text style={s.totalLabel}>Gané</Text>
            <Text style={[s.totalAmt, { color: '#00C853' }]}>{formatCurrency(totalIncome)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.totalItem}>
            <Text style={s.totalLabel}>Gasté</Text>
            <Text style={[s.totalAmt, { color: '#F44336' }]}>{formatCurrency(totalExpense)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.totalItem}>
            <Text style={s.totalLabel}>Neto</Text>
            <Text style={[s.totalAmt, { color: totalNet >= 0 ? '#FFC107' : '#F44336' }]}>
              {formatCurrency(totalNet)}
            </Text>
          </View>
        </View>

        {bestDay && workNet(bestDay) > 0 && (
          <View style={s.bestDay}>
            <Text style={s.bestDayText}>
              🏆 Mejor día: {formatShortDate(bestDay.date)} — {formatCurrency(workNet(bestDay))} neto
            </Text>
          </View>
        )}

        {summaries.length > 0 && (
          <TouchableOpacity style={s.shareBtn} onPress={shareSummary} activeOpacity={0.8}>
            <Text style={s.shareTxt}>📤 Mandar resumen por WhatsApp</Text>
          </TouchableOpacity>
        )}

        {/* Ganancia por hora */}
        <View style={s.hoursBox}>
          <Text style={s.sectionTitle}>⏱️ ¿CUÁNTO TE DEJA CADA HORA?</Text>
          {!hours.total ? (
            <Text style={s.hoursHint}>
              Toca "¡Empecemos el día!" al salir y "Día finalizado" al terminar. Así la app sabe cuántas horas trabajas y cuánto te deja cada hora.
            </Text>
          ) : (
            <>
              <Text style={s.hoursMain}>{formatCurrency(hours.total.perHour)} <Text style={s.hoursUnit}>por hora</Text></Text>
              <Text style={s.hoursSub}>
                {formatHours(hours.total.hours)} en {hours.total.days} {hours.total.days === 1 ? 'jornada' : 'jornadas'} · neto sin arriendo
              </Text>
              <View style={s.shiftRow}>
                {([['day', '☀️ De día', hours.day], ['night', '🌙 De noche', hours.night]] as const).map(([key, label, st]) => (
                  <View key={key} style={[s.shiftCard, better === key && s.shiftBest]}>
                    <Text style={s.shiftLabel}>{label}</Text>
                    <Text style={[s.shiftVal, better === key && { color: '#00C853' }]}>
                      {st ? `${formatCurrency(st.perHour)}/h` : '—'}
                    </Text>
                    <Text style={s.shiftDays}>{st ? `${st.days} ${st.days === 1 ? 'jornada' : 'jornadas'}` : 'sin jornadas'}</Text>
                  </View>
                ))}
              </View>
              {weekdayRows.length > 1 && weekdayRows.map(w => (
                <View key={w.i} style={s.wdRow}>
                  <Text style={s.wdLabel}>{w.label}</Text>
                  <Text style={s.wdDays}>{w.stat.days} {w.stat.days === 1 ? 'jornada' : 'jornadas'}</Text>
                  <Text style={s.wdVal}>{formatCurrency(w.stat.perHour)}/h</Text>
                </View>
              ))}
              <Text style={s.hoursNote}>De día = la mitad de la jornada cae entre 6 a.m. y 6 p.m.</Text>
            </>
          )}
        </View>

        {/* Daily rows */}
        {summaries.length === 0 ? (
          <Text style={s.empty}>Sin registros en este período.{'\n'}Agrega ingresos y gastos en "Hoy".</Text>
        ) : (
          <>
            <Text style={s.sectionTitle}>DETALLE POR DÍA</Text>
            {summaries.map(day => (
              <View key={day.date} style={s.dayRow}>
                <Text style={s.dayDate}>{formatShortDate(day.date)}</Text>
                <View style={s.dayAmounts}>
                  <View style={s.amtCol}>
                    <Text style={s.amtLabel}>Gané</Text>
                    <Text style={[s.amtVal, { color: '#00C853' }]}>{formatCurrency(day.income)}</Text>
                  </View>
                  <View style={s.amtCol}>
                    <Text style={s.amtLabel}>Gasté</Text>
                    <Text style={[s.amtVal, { color: '#F44336' }]}>{formatCurrency(day.expense)}</Text>
                  </View>
                  <View style={s.amtCol}>
                    <Text style={s.amtLabel}>Neto</Text>
                    <Text style={[s.amtVal, { color: day.net >= 0 ? '#FFC107' : '#F44336', fontWeight: '700' }]}>
                      {day.net < 0 ? '-' : ''}{formatCurrency(day.net)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#121212' },
  header:      { padding: 20, paddingBottom: 12 },
  title:       { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 16 },
  toggle: {
    flexDirection: 'row', backgroundColor: '#1e1e1e',
    borderRadius: 14, padding: 4,
  },
  toggleBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  toggleActive:    { backgroundColor: '#333' },
  toggleText:      { color: '#555', fontSize: 14, fontWeight: '600' },
  toggleTextActive:{ color: '#fff' },
  scroll:          { padding: 16, paddingBottom: 40 },
  totalsBox: {
    flexDirection: 'row', backgroundColor: '#1e1e1e',
    borderRadius: 18, padding: 20, marginBottom: 14,
  },
  totalItem:   { flex: 1, alignItems: 'center' },
  totalLabel:  { color: '#888', fontSize: 12, marginBottom: 8 },
  totalAmt:    { fontSize: 16, fontWeight: '800' },
  divider:     { width: 1, backgroundColor: '#333' },
  bestDay: {
    backgroundColor: '#1a1a00', borderRadius: 14,
    padding: 14, marginBottom: 20,
  },
  bestDayText: { color: '#FFC107', fontSize: 14, fontWeight: '600' },
  empty: {
    color: '#555', textAlign: 'center',
    marginTop: 48, fontSize: 16, lineHeight: 26,
  },
  sectionTitle: { color: '#555', fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  shareBtn:     { backgroundColor: '#0a3020', borderRadius: 14, padding: 14, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#00C853' },
  shareTxt:     { color: '#00C853', fontSize: 15, fontWeight: '700' },
  hoursBox:     { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 20 },
  hoursHint:    { color: '#777', fontSize: 13, lineHeight: 19 },
  hoursMain:    { color: '#fff', fontSize: 26, fontWeight: '800' },
  hoursUnit:    { color: '#888', fontSize: 14, fontWeight: '600' },
  hoursSub:     { color: '#777', fontSize: 12, marginTop: 2, marginBottom: 12 },
  shiftRow:     { flexDirection: 'row', gap: 10, marginBottom: 10 },
  shiftCard:    { flex: 1, backgroundColor: '#222', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  shiftBest:    { borderColor: '#00C853', backgroundColor: '#0a1e12' },
  shiftLabel:   { color: '#aaa', fontSize: 13, marginBottom: 4 },
  shiftVal:     { color: '#fff', fontSize: 17, fontWeight: '800' },
  shiftDays:    { color: '#666', fontSize: 11, marginTop: 2 },
  wdRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#242424' },
  wdLabel:      { color: '#ccc', fontSize: 14, flex: 1 },
  wdDays:       { color: '#666', fontSize: 12, marginRight: 12 },
  wdVal:        { color: '#fff', fontSize: 14, fontWeight: '700', minWidth: 80, textAlign: 'right' },
  hoursNote:    { color: '#555', fontSize: 11, marginTop: 10 },
  dayRow: {
    backgroundColor: '#1e1e1e', borderRadius: 14,
    padding: 16, marginBottom: 8,
  },
  dayDate:    { color: '#aaa', fontSize: 14, marginBottom: 12, textTransform: 'capitalize' },
  dayAmounts: { flexDirection: 'row' },
  amtCol:     { flex: 1, alignItems: 'center' },
  amtLabel:   { color: '#666', fontSize: 11, marginBottom: 4 },
  amtVal:     { fontSize: 14, fontWeight: '600' },
});
