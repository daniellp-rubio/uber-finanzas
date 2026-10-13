import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Modal, TextInput, Pressable } from 'react-native';
import {
  getFixedExpenses, getDebts, deleteFixedExpense, deleteDebt, decrementDebtMonth,
  getTransactionsByDate, getSetting, setSetting, FixedExpense, Debt,
} from '../src/db';
import { computeBalance, calcDailyGoal, BalanceResult, BalanceStatus, DailyGoal } from '../src/financeCalc';
import { formatCurrency, todayString } from '../src/format';
import AddFixedExpenseModal from './AddFixedExpenseModal';
import AddDebtModal from './AddDebtModal';
import {
  getVehicleConfig, saveUberConfig, calcPicoPlacaImpact, VehicleConfig,
} from '../src/vehicleCalc';
import DianSection from './DianSection';
import MyDataSection from './MyDataSection';
import { versionLabel } from '../src/updates';
import { C, T, S, R } from '../src/theme';
import { Button, Collapsible, Hint, Icon, IconButton, Pill, Section, SwitchMark, Tone } from './ui';

// ─── Category icons for fixed expenses ───────────────────────────────────────
const CAT_ICONS: Record<string, string> = {
  rent: '🏠', utilities: '💡', internet: '🌐', phone: '📱',
  market: '🛒', transport: '🚌', health: '🏥', other: '📦',
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ─── Estado del mes ───────────────────────────────────────────────────────────
const STATUS: Record<BalanceStatus, { label: string; tone: Tone }> = {
  none:    { label: 'Sin gastos del mes anotados', tone: 'neutral' },
  no_data: { label: 'Sin datos este mes aún',      tone: 'warn' },
  green:   { label: 'Vas bien',                    tone: 'money' },
  yellow:  { label: 'Cuidado, puedes mejorar',     tone: 'warn' },
  red:     { label: 'Estás en riesgo',             tone: 'spend' },
};
const TONE_COLOR: Record<Tone, string> = {
  neutral: C.textMuted, primary: C.primary, money: C.money, warn: C.warn, spend: C.spend,
};

// Cuota de una deuda ya marcada como pagada este mes: setting "debt_paid_<id>" = "YYYY-MM"
const paidKey = (id: number) => `debt_paid_${id}`;

export default function BalanceScreen() {
  const [balance, setBalance]           = useState<BalanceResult | null>(null);
  const [goal, setGoal]                 = useState<DailyGoal | null>(null);
  const [fixedExpenses, setFixed]       = useState<FixedExpense[]>([]);
  const [debts, setDebts]               = useState<Debt[]>([]);
  const [paidThisMonth, setPaid]        = useState<Set<number>>(new Set());
  const [showAddFixed, setShowAddFixed] = useState(false);
  const [showAddDebt, setShowAddDebt]   = useState(false);
  const [cfg, setCfg]                   = useState<VehicleConfig>(getVehicleConfig());

  // Config Uber (editable). Gasolina, pico y placa y mantenimiento están en cada carro (tab Carros)
  const [cfgComm, setCfgComm]           = useState(String(cfg.uberCommissionPct));
  const [cfgPass, setCfgPass]           = useState(String(cfg.uberPassPriceCOP));

  const today     = todayString();
  const yearMonth = today.slice(0, 7);
  const monthName = MONTHS[Number(today.slice(5, 7)) - 1];

  const load = useCallback(() => {
    const b = computeBalance();
    setBalance(b);
    // La misma meta que muestra Hoy
    const todayNet = getTransactionsByDate(today).reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    setGoal(b.status === 'none' ? null : calcDailyGoal(b.monthlyObligations, b.currentMonthNet, todayNet, b.workingDaysEstLeft));
    setFixed(getFixedExpenses());
    const ds = getDebts();
    setDebts(ds);
    setPaid(new Set(ds.filter(d => getSetting(paidKey(d.id), '') === yearMonth).map(d => d.id)));
    const updated = getVehicleConfig();
    setCfg(updated);
    setCfgComm(String(updated.uberCommissionPct));
    setCfgPass(String(updated.uberPassPriceCOP));
  }, [today, yearMonth]);

  React.useEffect(() => { load(); }, [load]);

  const saveConfig = () => {
    // La comisión sí puede ser 0; el Uber Pass en 0 no tiene sentido
    const comm = Number(cfgComm);
    saveUberConfig({
      uberCommissionPct: cfgComm.trim() !== '' && Number.isFinite(comm) ? comm : cfg.uberCommissionPct,
      uberPassPriceCOP:  Number(cfgPass) || cfg.uberPassPriceCOP,
    });
    load();
    Alert.alert('Guardado', 'Se guardó la configuración de Uber.');
  };

  // Se guarda al tocar, sin pasar por "Guardar"
  const toggleUberPass = () => {
    saveUberConfig({ uberPassActive: !cfg.uberPassActive });
    setCfg(getVehicleConfig());
  };

  const handleDeleteFixed = (exp: FixedExpense) =>
    Alert.alert(`Borrar "${exp.name}"`, '¿Quitar este gasto fijo del mes?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { deleteFixedExpense(exp.id); load(); } },
    ]);

  const confirmDeleteDebt = (debt: Debt) =>
    Alert.alert(`Borrar "${debt.name}"`, 'Se quita la deuda del balance. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { deleteDebt(debt.id); load(); } },
    ]);

  const markPaid = (debt: Debt) => {
    decrementDebtMonth(debt.id, debt.months_remaining);
    setSetting(paidKey(debt.id), yearMonth);
    load();
  };

  // Tocar una deuda: acciones a la vista, sin gestos escondidos
  const handleDebt = (debt: Debt) => {
    const paid = paidThisMonth.has(debt.id);
    const detail = [
      `${formatCurrency(debt.monthly_payment)} al mes`,
      debt.months_remaining !== null
        ? `${debt.months_remaining} ${debt.months_remaining === 1 ? 'cuota pendiente' : 'cuotas pendientes'}`
        : 'Sin fecha de fin',
      paid ? `La cuota de ${monthName} ya está marcada como pagada.` : null,
    ].filter(Boolean).join('\n');
    Alert.alert(debt.name, detail, [
      ...(paid ? [] : [{ text: `Ya pagué ${monthName}`, onPress: () => markPaid(debt) }]),
      { text: 'Borrar deuda', style: 'destructive' as const, onPress: () => confirmDeleteDebt(debt) },
      { text: 'Cerrar', style: 'cancel' as const },
    ]);
  };

  const totalFixed = fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const totalDebts = debts.reduce((s, d) => s + d.monthly_payment, 0);

  const b  = balance;
  const st = STATUS[b?.status ?? 'none'];
  const coveredPct = b ? Math.min(Math.max(b.coveredPct, 0), 1) : 0;

  const pp = cfg.picoPlacaDaysPerWeek > 0
    ? calcPicoPlacaImpact(b && b.daysWorked > 0 ? b.dailyAvg : 0, cfg) : null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={T.headline} accessibilityRole="header">Balance</Text>
        <Text style={T.bodySm}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)} {today.slice(0, 4)}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── Cómo va el mes ── */}
        {b && (
          <View style={s.hero}>
            <Pill text={st.label} tone={st.tone} />
            {b.status === 'none' ? (
              <Text style={[T.body, { marginTop: S.md }]}>
                Anota abajo tus gastos fijos y deudas del mes y te digo cuánto necesitas hacer cada día.
              </Text>
            ) : (
              <>
                {b.netIsNegative && (
                  <View style={s.inline}>
                    <Icon name="alert-circle" size={20} color={C.spend} />
                    <Text style={[T.label, { color: C.spend, flex: 1 }]}>Este mes llevas más gastos que ingresos</Text>
                  </View>
                )}
                <Text style={[T.label, { marginTop: S.md }]}>Meta de hoy</Text>
                {goal && (goal.monthCovered || goal.left === 0) ? (
                  <View style={s.inline}>
                    <Icon name="check-circle" size={28} color={C.money} />
                    <Text style={[T.headline, { color: C.money }]}>
                      {goal.monthCovered ? 'Mes cubierto' : 'Cumplida'}
                    </Text>
                  </View>
                ) : (
                  <Text style={T.display}>{formatCurrency(goal?.goal ?? 0)}</Text>
                )}
                <Text style={T.bodySm}>La misma de Hoy: lo que falta del mes repartido en los días que quedan.</Text>

                <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(coveredPct * 100) }}>
                  <View style={[s.barFill, { width: `${Math.round(coveredPct * 100)}%`, backgroundColor: TONE_COLOR[st.tone] }]} />
                </View>
                <Text style={T.body}>
                  Llevas <Text style={{ fontWeight: '700' }}>{formatCurrency(Math.max(b.currentMonthNet, 0))}</Text> de {formatCurrency(b.monthlyObligations)} ({Math.round(coveredPct * 100)} %)
                </Text>

                <View style={s.avgRow}>
                  <Text style={[T.body, { flex: 1 }]}>Tu promedio por día</Text>
                  <Text style={[T.amount, { color: TONE_COLOR[st.tone] }]}>
                    {b.status === 'no_data' ? 'Sin datos' : formatCurrency(b.dailyAvg)}
                  </Text>
                </View>
                <Text style={T.labelSm}>
                  {b.daysWorked} {b.daysWorked === 1 ? 'día trabajado' : 'días trabajados'} · quedan {b.calendarDaysLeft} días del mes · vas bien con un promedio de {formatCurrency(b.dailyTarget)} o más
                </Text>
              </>
            )}
          </View>
        )}

        {/* ── Gastos fijos ── */}
        <Section title="Gastos fijos" right={<Text style={T.amount}>{formatCurrency(totalFixed)}<Text style={T.labelSm}> al mes</Text></Text>}>
          {fixedExpenses.length === 0 ? (
            <Text style={[T.bodySm, s.empty]}>Todavía no hay gastos fijos (arriendo, servicios, mercado…).</Text>
          ) : fixedExpenses.map((exp, i) => (
            <View key={exp.id} style={[s.row, i < fixedExpenses.length - 1 && s.divider]}>
              <Text style={s.glyph}>{CAT_ICONS[exp.category] ?? '📦'}</Text>
              <Text style={[T.body, { flex: 1 }]} numberOfLines={2}>{exp.name}</Text>
              <Text style={T.amount}>{formatCurrency(exp.amount)}</Text>
              <IconButton name="trash-can-outline" label={`Borrar ${exp.name}`} onPress={() => handleDeleteFixed(exp)} />
            </View>
          ))}
          <Button label="Agregar gasto fijo" icon="plus" variant="tonal" tone="neutral" onPress={() => setShowAddFixed(true)} style={s.addBtn} />
        </Section>

        {/* ── Deudas ── */}
        <Section title="Deudas" right={<Text style={T.amount}>{formatCurrency(totalDebts)}<Text style={T.labelSm}> al mes</Text></Text>}>
          {debts.length === 0 ? (
            <Text style={[T.bodySm, s.empty]}>Sin deudas anotadas.</Text>
          ) : debts.map((debt, i) => {
            const paid = paidThisMonth.has(debt.id);
            return (
              <Pressable
                key={debt.id}
                style={({ pressed }) => [s.row, i < debts.length - 1 && s.divider, pressed && { opacity: 0.85 }]}
                onPress={() => handleDebt(debt)}
                accessibilityRole="button"
                accessibilityHint="Marcar la cuota del mes como pagada o borrar la deuda"
              >
                <Text style={s.glyph}>💳</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.body} numberOfLines={2}>{debt.name}</Text>
                  <Text style={T.labelSm}>
                    {debt.months_remaining !== null
                      ? `${debt.months_remaining} ${debt.months_remaining === 1 ? 'cuota pendiente' : 'cuotas pendientes'}`
                      : 'Sin fecha de fin'}
                  </Text>
                  {paid && <Pill text={`Pagada en ${monthName}`} tone="money" />}
                </View>
                <Text style={T.amount}>{formatCurrency(debt.monthly_payment)}</Text>
                <Icon name="chevron-right" size={22} color={C.textFaint} />
              </Pressable>
            );
          })}
          <Button label="Agregar deuda" icon="plus" variant="tonal" tone="neutral" onPress={() => setShowAddDebt(true)} style={s.addBtn} />
          {debts.length > 0 && <Hint>Toca una deuda cuando pagues la cuota del mes.</Hint>}
        </Section>

        {/* ── Total ── */}
        {(fixedExpenses.length > 0 || debts.length > 0) && (
          <Section>
            <View style={s.totalRow}>
              <Text style={T.titleSm}>Total del mes</Text>
              <Text style={T.headline}>{formatCurrency(totalFixed + totalDebts)}</Text>
            </View>
            <Text style={T.labelSm}>Gastos fijos {formatCurrency(totalFixed)} + deudas {formatCurrency(totalDebts)}</Text>
          </Section>
        )}

        {/* ── Pico y placa ── */}
        <Section title="Pico y placa">
          {!pp ? (
            <View style={s.inline}>
              <Icon name="check-circle" size={20} color={C.money} />
              <Text style={[T.body, { flex: 1 }]}>{cfg.vehicleName} no tiene pico y placa: puedes trabajar todos los días.</Text>
            </View>
          ) : (
            <>
              <View style={s.stats}>
                <View style={s.stat}>
                  <Text style={T.labelSm}>Días sin trabajar este mes</Text>
                  <Text style={T.title}>{pp.daysBlockedThisMonth}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={T.labelSm}>Días disponibles</Text>
                  <Text style={T.title}>{pp.workedDaysAvailable}</Text>
                </View>
              </View>
              {b && b.daysWorked > 0 && (
                <View style={[s.totalRow, { marginTop: S.md }]}>
                  <Text style={T.body}>Ingreso que dejas de hacer</Text>
                  <Text style={[T.amount, { color: C.spend }]}>{formatCurrency(pp.estimatedLostIncome)}</Text>
                </View>
              )}
              <Hint>{cfg.vehicleName}: {cfg.picoPlacaDaysPerWeek} {cfg.picoPlacaDaysPerWeek === 1 ? 'día' : 'días'} por semana. Se cambia en Carros.</Hint>
            </>
          )}
        </Section>

        {/* ── Estimador de renta ── */}
        <DianSection />

        {/* ── Copia de seguridad y resumen de ingresos ── */}
        <MyDataSection onRestored={load} />

        {/* ── Configuración de Uber ── */}
        <Collapsible title="Configurar Uber" summary={cfg.uberPassActive ? `Con Uber Pass de ${formatCurrency(cfg.uberPassPriceCOP)}` : `Comisión del ${cfg.uberCommissionPct} %`}>
          <Pressable
            style={[s.passToggle, cfg.uberPassActive && s.passToggleOn]}
            onPress={toggleUberPass}
            accessibilityRole="switch"
            accessibilityState={{ checked: cfg.uberPassActive }}
          >
            <View style={{ flex: 1 }}>
              <Text style={T.titleSm}>Tengo Uber Pass</Text>
              <Text style={T.labelSm}>
                {cfg.uberPassActive ? 'Uber no te cobra comisión por viaje.' : 'Uber te cobra comisión por viaje.'}
              </Text>
            </View>
            <SwitchMark on={cfg.uberPassActive} />
          </Pressable>
          <Text style={[T.label, { marginTop: S.lg }]}>
            {cfg.uberPassActive ? 'Valor de cada Uber Pass (pesos)' : 'Comisión de Uber (%)'}
          </Text>
          <TextInput
            style={s.input}
            value={cfg.uberPassActive ? cfgPass : cfgComm}
            onChangeText={cfg.uberPassActive ? setCfgPass : setCfgComm}
            keyboardType="number-pad"
            accessibilityLabel={cfg.uberPassActive ? 'Valor de cada Uber Pass' : 'Comisión de Uber'}
          />
          <Button label="Guardar" onPress={saveConfig} style={{ marginTop: S.md }} />
          <Hint>Gasolina o carga, pico y placa y mantenimiento son de cada carro: Carros → {cfg.vehicleName} → Datos del carro.</Hint>
        </Collapsible>

        <Text style={s.version}>{versionLabel()}</Text>
      </ScrollView>

      <Modal visible={showAddFixed} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddFixed(false)}>
        <AddFixedExpenseModal
          onClose={() => setShowAddFixed(false)}
          onSaved={() => { setShowAddFixed(false); load(); }}
        />
      </Modal>

      <Modal visible={showAddDebt} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddDebt(false)}>
        <AddDebtModal
          onClose={() => setShowAddDebt(false)}
          onSaved={() => { setShowAddDebt(false); load(); }}
        />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.sm },
  scroll:    { paddingHorizontal: S.lg, paddingBottom: S.xl },
  hero:      { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md },
  inline:    { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.sm },
  bar:       { height: 10, backgroundColor: C.surfaceHigh, borderRadius: R.pill, marginTop: S.lg, marginBottom: S.sm, overflow: 'hidden' },
  barFill:   { height: 10, borderRadius: R.pill },
  stats:     { flexDirection: 'row', gap: S.md, marginTop: S.md },
  stat:      { flex: 1, backgroundColor: C.surfaceHigh, borderRadius: R.md, padding: S.md, gap: 2 },
  avgRow:    { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginTop: S.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.outline },
  row:       { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingVertical: S.xs },
  divider:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
  glyph:     { fontSize: 22, width: 28, textAlign: 'center' },
  empty:     { paddingVertical: S.sm },
  addBtn:    { marginTop: S.md, alignSelf: 'flex-start' },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  passToggle:{ flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surfaceHigh, borderRadius: R.md, padding: S.md, minHeight: 64 },
  passToggleOn: { backgroundColor: C.primaryContainer },
  input:     { ...T.title, backgroundColor: C.surfaceHigh, borderRadius: R.md, paddingHorizontal: S.lg, minHeight: 56, marginTop: S.sm },
  version:   { ...T.labelSm, color: C.textFaint, textAlign: 'center', marginTop: S.lg },
});
