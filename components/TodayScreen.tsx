import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, RefreshControl, ActivityIndicator, TextInput, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getTransactionsByDate, deleteTransaction, getFunds, addFundMovement, getSetting, setSetting,
  startWorkSession, endWorkSession, getWorkSessions, Transaction,
} from '../src/db';
import { formatCurrency, formatLongDate, formatKm, nowString, todayString } from '../src/format';
import { getCategoryLabel, getCategoryIcon, RENT_CATEGORY } from '../src/categories';
import {
  requestNotificationPermission, startWorkDay, endWorkDay, isWorkDayActive,
} from '../src/notifications';
import { getVehicleConfig, getFleetAlerts } from '../src/vehicleCalc';
import type { VehicleAlert } from '../src/fleet';
import { computeBalance, calcDailyGoal, DailyGoal, mechanicShare, MECHANIC_PCT } from '../src/financeCalc';
import { C, T, S, R, TOUCH } from '../src/theme';
import { Amount, Banner, Button, Icon, Section, Hint } from './ui';

// Ahorro para el mecánico ya hecho hoy: "fecha|monto"
const MAINT_SAVED_KEY = 'maint_saved_today';
// Km del día escritos por el usuario: "fecha|km"
const KM_TODAY_KEY = 'km_today';

interface Props {
  onAddIncome:   () => void;
  onAddExpense:  () => void;
  onOpenVehicle: (vehicleId: number) => void;
  refreshTrigger: number;
}

// "YYYY-MM-DD HH:MM" → minutos desde medianoche del día de inicio
const minutesBetween = (a: string, b: string) =>
  Math.max((new Date(b.replace(' ', 'T')).getTime() - new Date(a.replace(' ', 'T')).getTime()) / 60000, 0);

const describeHours = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export default function TodayScreen({ onAddIncome, onAddExpense, onOpenVehicle, refreshTrigger }: Props) {
  const today = todayString();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing]     = useState(false);
  const [working, setWorking]           = useState(false);
  const [workLoading, setWorkLoading]   = useState(true);
  const [sheet, setSheet]               = useState<'mechanic' | 'close' | null>(null);
  const [km, setKm]                     = useState(0);
  const [alerts, setAlerts]             = useState<VehicleAlert[]>([]);
  const [goal, setGoal]                 = useState<DailyGoal | null>(null);
  const [savedToday, setSavedToday]     = useState(0);

  const load = useCallback(() => {
    const txs = getTransactionsByDate(today);
    setTransactions(txs);
    setAlerts(getFleetAlerts());
    // Meta del día: solo si hay gastos fijos o deudas anotados en Balance
    const b = computeBalance();
    const todayNet = txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    setGoal(b.status === 'none' ? null
      : calcDailyGoal(b.monthlyObligations, b.currentMonthNet, todayNet, b.workingDaysEstLeft));
    const [date, amount] = getSetting(MAINT_SAVED_KEY, '').split('|');
    setSavedToday(date === today ? Number(amount) || 0 : 0);
    const [kmDate, kmValue] = getSetting(KM_TODAY_KEY, '').split('|');
    setKm(kmDate === today ? Number(kmValue) || 0 : 0);
  }, [today]);

  useEffect(() => { load(); }, [load, refreshTrigger]);
  useEffect(() => {
    isWorkDayActive().then(a => { setWorking(a); setWorkLoading(false); });
  }, []);

  const onRefresh = () => { setRefreshing(true); load(); setRefreshing(false); };

  const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  // Solo lo ganado manejando gasta el carro (el arriendo de otro carro no cuenta)
  const driveIncome = transactions
    .filter(t => t.type === 'income' && t.category !== RENT_CATEGORY)
    .reduce((s, t) => s + t.amount, 0);
  const cfg      = getVehicleConfig();
  const mechanic = mechanicShare(driveIncome, km, cfg.maintenanceCostPerKm);
  const left     = income - expense - mechanic.amount;   // "Me queda"
  const toSave   = Math.max(mechanic.amount - savedToday, 0);

  const saveKm = (value: number) => {
    setSetting(KM_TODAY_KEY, `${today}|${value}`);
    setKm(value);
  };

  const handleDelete = (t: Transaction) =>
    Alert.alert('Borrar movimiento', `¿Borrar ${getCategoryLabel(t.type, t.category)} de ${formatCurrency(t.amount)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { deleteTransaction(t.id); load(); } },
    ]);

  const handleStartDay = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('Permiso requerido',
        'Permite las notificaciones en Configuración → Uber Finanzas → Notificaciones.');
      return;
    }
    setWorkLoading(true);
    startWorkSession(nowString());  // hora de inicio, para la ganancia por hora
    await startWorkDay();
    setWorking(true);
    setWorkLoading(false);
  };

  const handleEndDay = () =>
    Alert.alert('Terminar el día', 'Se apagan los recordatorios y te muestro el resumen del día.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', onPress: async () => {
        endWorkSession(nowString());
        setWorkLoading(true); await endWorkDay(); setWorking(false); setWorkLoading(false);
        setSheet('close');
      }},
    ]);

  // Fondo del mecánico (el que se creó por defecto; si lo renombraron, el del ícono 🔧)
  const saveForMechanic = (amount: number) => {
    const funds = getFunds();
    const fund = funds.find(f => f.name === 'Mecánico') ?? funds.find(f => f.icon === '🔧');
    if (!fund) {
      Alert.alert('Sin fondo', 'No encontré el fondo del mecánico. Créalo en Fondos.');
      return;
    }
    Alert.alert('Separar para el mecánico', `¿Pasar ${formatCurrency(amount)} al fondo ${fund.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, separar', onPress: () => {
        addFundMovement(fund.id, amount, mechanic.byKm ? `Mantenimiento · ${formatKm(km)} km` : `Mantenimiento · ${MECHANIC_PCT} % del día`, today);
        const total = savedToday + amount;
        setSetting(MAINT_SAVED_KEY, `${today}|${total}`);
        setSavedToday(total);
      }},
    ]);
  };

  const sessionsMin = getWorkSessions(today, today)
    .reduce((s, w) => s + minutesBetween(w.start_at, w.end_at ?? nowString()), 0);
  const goalPct = goal && goal.goal > 0 ? Math.min(Math.max(1 - goal.left / goal.goal, 0), 1) : 0;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={T.headline} accessibilityRole="header">Hoy</Text>
        <Text style={T.bodySm}>{formatLongDate(today)}</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.textMuted} />}
      >
        {/* ── Me queda ── */}
        <View style={s.hero}>
          <Text style={T.label}>Me queda hoy</Text>
          <Text style={[T.display, { color: left < 0 ? C.spend : C.text }]}>
            {left < 0 ? '−' : ''}{formatCurrency(left)}
          </Text>
          <View style={s.heroRows}>
            <View style={s.heroRow}>
              <Text style={T.bodySm}>Gané</Text>
              <Amount value={income} kind="in" />
            </View>
            <View style={s.heroRow}>
              <Text style={T.bodySm}>Gasté</Text>
              <Amount value={expense} kind="out" />
            </View>
            <Pressable
              style={({ pressed }) => [s.heroRow, s.heroTap, pressed && { opacity: 0.8 }]}
              onPress={() => setSheet('mechanic')}
              disabled={driveIncome === 0}
              accessibilityRole="button"
              accessibilityHint="Muestra cómo se calcula y deja escribir los km"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs }}>
                <Text style={T.bodySm}>Para el mecánico</Text>
                {driveIncome > 0 && <Icon name="information-outline" size={18} color={C.primary} />}
              </View>
              <Amount value={mechanic.amount} kind={mechanic.amount > 0 ? 'out' : 'neutral'} />
            </Pressable>
          </View>
          {driveIncome > 0 && (
            <Text style={[T.labelSm, { marginTop: S.xs }]}>
              {mechanic.byKm ? `Por ${formatKm(km)} km` : `${MECHANIC_PCT} % de lo de Uber · toca para poner los km`}
              {savedToday > 0 ? ` · ya separaste ${formatCurrency(savedToday)}` : ''}
            </Text>
          )}
        </View>

        {/* ── Avisos de los carros (una línea, lleva al carro) ── */}
        {alerts.length > 0 && (
          <Banner
            tone={alerts[0].level === 'red' ? 'spend' : 'warn'}
            icon={alerts[0].level === 'red' ? 'alert-circle' : 'alert'}
            text={alerts[0].text}
            detail={alerts.length > 1 ? `Y ${alerts.length - 1} aviso${alerts.length > 2 ? 's' : ''} más en Carros` : undefined}
            onPress={() => onOpenVehicle(alerts[0].vehicleId)}
          />
        )}

        {/* ── Meta del día ── */}
        {goal && (
          <Section>
            {goal.monthCovered ? (
              <View style={s.goalDone}>
                <Icon name="check-circle" color={C.money} />
                <Text style={[T.titleSm, { color: C.money, flex: 1 }]}>Ya cubriste los gastos del mes</Text>
              </View>
            ) : goal.left === 0 ? (
              <View style={s.goalDone}>
                <Icon name="check-circle" color={C.money} />
                <Text style={[T.titleSm, { color: C.money, flex: 1 }]}>Meta de hoy cumplida: {formatCurrency(goal.goal)}</Text>
              </View>
            ) : (
              <>
                <View style={s.goalHead}>
                  <Text style={T.titleSm}>Meta de hoy</Text>
                  <Text style={[T.amount, { fontVariant: ['tabular-nums'] }]}>{formatCurrency(goal.goal)}</Text>
                </View>
                <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(goalPct * 100) }}>
                  <View style={[s.barFill, { width: `${Math.round(goalPct * 100)}%` }]} />
                </View>
                <Text style={T.bodySm}>Te faltan {formatCurrency(goal.left)} para ir al día con los gastos del mes</Text>
              </>
            )}
          </Section>
        )}

        {/* ── Jornada ── */}
        <Section>
          {workLoading ? (
            <ActivityIndicator color={C.primary} style={{ minHeight: TOUCH }} />
          ) : working ? (
            <View style={s.workRow}>
              <View style={s.liveDot} />
              <View style={{ flex: 1 }}>
                <Text style={T.titleSm}>Estás trabajando</Text>
                <Text style={T.labelSm}>{describeHours(sessionsMin)} · te recuerdo anotar cada 2 horas</Text>
              </View>
              <Button label="Terminar" variant="tonal" tone="neutral" onPress={handleEndDay} />
            </View>
          ) : (
            <View style={s.workRow}>
              <View style={{ flex: 1 }}>
                <Text style={T.titleSm}>{sessionsMin > 0 ? 'Día terminado' : '¿Sales a trabajar?'}</Text>
                <Text style={T.labelSm}>
                  {sessionsMin > 0 ? `Trabajaste ${describeHours(sessionsMin)}` : 'Te recuerdo anotar cada 2 horas'}
                </Text>
              </View>
              {sessionsMin > 0
                ? <Button label="Resumen" variant="tonal" tone="neutral" onPress={() => setSheet('close')} />
                : <Button label="Empezar" icon="play" variant="tonal" tone="money" onPress={handleStartDay} />}
            </View>
          )}
        </Section>

        {/* ── Movimientos de hoy ── */}
        <Section title="Movimientos de hoy">
          {transactions.length === 0 ? (
            <Text style={[T.bodySm, { paddingVertical: S.md }]}>Todavía no anotas nada hoy. Usa los botones de abajo.</Text>
          ) : transactions.map((t, i) => (
            <View key={t.id} style={[s.txRow, i < transactions.length - 1 && s.txDivider]}>
              <Text style={s.txIcon}>{getCategoryIcon(t.type, t.category)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>{getCategoryLabel(t.type, t.category)}</Text>
                {t.note ? <Text style={T.labelSm} numberOfLines={1}>{t.note}</Text> : null}
              </View>
              <Amount value={t.amount} kind={t.type === 'income' ? 'in' : 'out'} />
              <Pressable
                onPress={() => handleDelete(t)}
                style={s.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={`Borrar ${getCategoryLabel(t.type, t.category)}`}
                hitSlop={4}
              >
                <Icon name="trash-can-outline" size={22} color={C.textFaint} />
              </Pressable>
            </View>
          ))}
        </Section>
      </ScrollView>

      {/* ── Botones acción ── */}
      <View style={s.actions}>
        <Button label="Ingreso" icon="plus" tone="money" big style={{ flex: 1 }} onPress={onAddIncome} />
        <Button label="Gasto" icon="minus" tone="spend" big style={{ flex: 1 }} onPress={onAddExpense} />
      </View>

      {/* ── Lo del mecánico / resumen del día ── */}
      <Modal visible={sheet !== null} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
        <Pressable style={s.scrim} onPress={() => setSheet(null)} accessibilityLabel="Cerrar" />
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <View style={s.handle} />
          {sheet === 'close' && (
            <>
              <Text style={T.title}>Resumen del día</Text>
              <View style={s.sumGrid}>
                <SumCell label="Trabajaste" value={sessionsMin > 0 ? describeHours(sessionsMin) : '—'} />
                <SumCell
                  label="Por hora"
                  value={sessionsMin >= 30 ? formatCurrency(left / (sessionsMin / 60)) : '—'}
                />
              </View>
            </>
          )}
          {sheet === 'mechanic' && <Text style={T.title}>Para el mecánico</Text>}

          <View style={s.sumLines}>
            <SumLine label="Gané" value={<Amount value={income} kind="in" />} />
            <SumLine label="Gasté" value={<Amount value={expense} kind="out" />} />
            <SumLine label="Para el mecánico" value={<Amount value={mechanic.amount} kind="out" />} />
            <View style={s.sumDivider} />
            <SumLine label="Me queda" bold value={
              <Text style={[T.headline, { color: left < 0 ? C.spend : C.text }]}>{left < 0 ? '−' : ''}{formatCurrency(left)}</Text>
            } />
          </View>

          <Text style={[T.label, { marginTop: S.lg }]}>Km que hiciste hoy (opcional)</Text>
          <View style={s.kmRow}>
            <TextInput
              style={s.kmInput}
              value={km > 0 ? String(km) : ''}
              onChangeText={v => saveKm(Number(v.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={C.textFaint}
              accessibilityLabel="Km que hiciste hoy"
            />
            <Text style={[T.bodySm, { flex: 1 }]}>
              {km > 0
                ? `${formatKm(km)} km × ${formatCurrency(cfg.maintenanceCostPerKm)} por km (${cfg.vehicleName})`
                : `Sin km separo el ${MECHANIC_PCT} % de lo que ganaste manejando`}
            </Text>
          </View>

          {toSave > 0 ? (
            <Button label={`Separar ${formatCurrency(toSave)} para el mecánico`} icon="wrench" variant="tonal" tone="warn" big onPress={() => saveForMechanic(toSave)} />
          ) : savedToday > 0 ? (
            <View style={s.goalDone}>
              <Icon name="check-circle" color={C.money} />
              <Text style={[T.label, { color: C.money }]}>Hoy ya separaste {formatCurrency(savedToday)} para el mecánico</Text>
            </View>
          ) : null}
          <Hint>Separar lo pasa al fondo Mecánico, en Fondos.</Hint>
          <Button label="Listo" variant="text" onPress={() => setSheet(null)} style={{ marginTop: S.sm }} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function SumCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.sumCell}>
      <Text style={T.labelSm}>{label}</Text>
      <Text style={[T.title, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

function SumLine({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <View style={s.sumLine}>
      <Text style={bold ? T.titleSm : T.body}>{label}</Text>
      {value}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.sm },
  scroll:    { paddingHorizontal: S.lg, paddingBottom: S.xl },
  hero:      { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, paddingTop: S.lg, marginBottom: S.md },
  heroRows:  { marginTop: S.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.outline, paddingTop: S.sm },
  heroRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  heroTap:   { minHeight: TOUCH },
  goalHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  goalDone:  { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.xs },
  bar:       { height: 10, backgroundColor: C.surfaceHigh, borderRadius: R.pill, marginVertical: S.sm, overflow: 'hidden' },
  barFill:   { height: 10, backgroundColor: C.money, borderRadius: R.pill },
  workRow:   { flexDirection: 'row', alignItems: 'center', gap: S.md },
  liveDot:   { width: 12, height: 12, borderRadius: 6, backgroundColor: C.money },
  txRow:     { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60 },
  txDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
  txIcon:    { fontSize: 22, width: 28, textAlign: 'center' },
  iconBtn:   { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -S.md },
  actions:   { flexDirection: 'row', gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.bg },
  scrim:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:     { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: S.xl, paddingBottom: S.lg },
  handle:    { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: C.textFaint, marginVertical: S.md },
  sumGrid:   { flexDirection: 'row', gap: S.md, marginTop: S.md },
  sumCell:   { flex: 1, backgroundColor: C.surfaceHigh, borderRadius: R.md, padding: S.md },
  sumLines:  { marginTop: S.md },
  sumLine:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  sumDivider:{ height: StyleSheet.hairlineWidth, backgroundColor: C.outline, marginVertical: S.sm },
  kmRow:     { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: S.sm, marginBottom: S.lg },
  kmInput:   { ...T.title, backgroundColor: C.surfaceHigh, borderRadius: R.md, paddingHorizontal: S.md, minHeight: 56, width: 110, textAlign: 'center' },
});
