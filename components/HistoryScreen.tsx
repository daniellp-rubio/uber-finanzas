import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { getDailySummaries, DailySummary } from '../src/db';
import { formatCurrency, dateRangeStrings, startOfMonthString, todayString, formatShortDate } from '../src/format';

type Period = 'week' | 'month';

export default function HistoryScreen() {
  const [period, setPeriod] = useState<Period>('week');
  const [summaries, setSummaries] = useState<DailySummary[]>([]);

  const load = useCallback(() => {
    const today = todayString();
    const from = period === 'week'
      ? dateRangeStrings(6).from
      : startOfMonthString();
    setSummaries(getDailySummaries(from, today));
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
