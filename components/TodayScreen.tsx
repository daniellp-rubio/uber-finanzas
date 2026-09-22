import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator, TextInput,
} from 'react-native';
import { getTransactionsByDate, deleteTransaction, Transaction } from '../src/db';
import { formatCurrency, formatLongDate, todayString } from '../src/format';
import { getCategoryLabel, getCategoryIcon, RENT_CATEGORY } from '../src/categories';
import {
  requestNotificationPermission, startWorkDay, endWorkDay, isWorkDayActive,
} from '../src/notifications';
import { getVehicleConfig, calcRealEarnings, getFleetAlerts } from '../src/vehicleCalc';
import type { VehicleAlert } from '../src/fleet';

interface Props {
  onAddIncome:    () => void;
  onAddExpense:   () => void;
  onOpenVehicles: () => void;
  refreshTrigger: number;
}

export default function TodayScreen({ onAddIncome, onAddExpense, onOpenVehicles, refreshTrigger }: Props) {
  const today = todayString();

  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [refreshing, setRefreshing]       = useState(false);
  const [working, setWorking]             = useState(false);
  const [workLoading, setWorkLoading]     = useState(true);
  const [showRealCalc, setShowRealCalc]   = useState(false);
  const [kmInput, setKmInput]             = useState('');
  const [alerts, setAlerts]               = useState<VehicleAlert[]>([]);

  const load = useCallback(() => {
    setTransactions(getTransactionsByDate(today));
    setAlerts(getFleetAlerts());
  }, [today]);

  useEffect(() => { load(); }, [load, refreshTrigger]);
  useEffect(() => {
    isWorkDayActive().then(a => { setWorking(a); setWorkLoading(false); });
  }, []);

  const onRefresh = () => { setRefreshing(true); load(); setRefreshing(false); };

  const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net     = income - expense;

  const handleDelete = (id: number) =>
    Alert.alert('Eliminar', '¿Eliminar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteTransaction(id); load(); } },
    ]);

  const handleStartDay = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('Permiso requerido',
        'Permite las notificaciones en Configuración → Uber Finanzas → Notificaciones.');
      return;
    }
    setWorkLoading(true);
    await startWorkDay();
    setWorking(true);
    setWorkLoading(false);
  };

  const handleEndDay = () =>
    Alert.alert('Finalizar jornada', '¿Detener los recordatorios del día?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, finalizar', style: 'destructive', onPress: async () => {
        setWorkLoading(true); await endWorkDay(); setWorking(false); setWorkLoading(false);
      }},
    ]);

  // Calculadora ganancia real: solo lo que se ganó manejando (el arriendo del carro no cuenta)
  const cfg = getVehicleConfig();
  const km  = Number(kmInput) || 0;
  const driveIncome = transactions
    .filter(t => t.type === 'income' && t.category !== RENT_CATEGORY)
    .reduce((s, t) => s + t.amount, 0);
  const real = driveIncome > 0 && km > 0 ? calcRealEarnings(driveIncome, km, cfg) : null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerDate}>{formatLongDate(today)}</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#aaa" />}
      >
        {/* ── Botón jornada ── */}
        {workLoading ? (
          <View style={s.workCardLoading}><ActivityIndicator color="#00C853" /></View>
        ) : !working ? (
          <TouchableOpacity style={s.startBtn} onPress={handleStartDay} activeOpacity={0.8}>
            <Text style={s.startIcon}>🚀</Text>
            <View>
              <Text style={s.startTitle}>¡Empecemos el día!</Text>
              <Text style={s.startSub}>Activa recordatorios cada 2 horas</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={s.workingCard}>
            <View style={s.workingLeft}>
              <View style={s.dot} />
              <View>
                <Text style={s.workingTitle}>Jornada activa</Text>
                <Text style={s.workingSub}>Recordatorios cada 2 horas</Text>
              </View>
            </View>
            <TouchableOpacity style={s.endBtn} onPress={handleEndDay}>
              <Text style={s.endBtnTxt}>Día finalizado</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Avisos de los carros (SOAT, mantenimientos…) ── */}
        {alerts.length > 0 && (
          <TouchableOpacity
            style={[s.alertCard, alerts[0].level === 'red' ? s.alertRed : s.alertYellow]}
            onPress={onOpenVehicles}
            activeOpacity={0.8}
          >
            {alerts.slice(0, 2).map((a, i) => (
              <Text key={i} style={[s.alertTxt, { color: a.level === 'red' ? '#F44336' : '#FFC107' }]}>
                {a.icon} {a.text}
              </Text>
            ))}
            <Text style={s.alertMore}>
              {alerts.length > 2 ? `+${alerts.length - 2} más · ` : ''}Toca para ver en Carros ›
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Cards resumen ── */}
        <View style={s.row}>
          <View style={[s.card, s.cardGreen]}>
            <Text style={s.cardLabel}>Lo que gané</Text>
            <Text style={s.cardAmount}>{formatCurrency(income)}</Text>
          </View>
          <View style={[s.card, s.cardRed]}>
            <Text style={s.cardLabel}>Lo que gasté</Text>
            <Text style={s.cardAmount}>{formatCurrency(expense)}</Text>
          </View>
        </View>

        <View style={[s.netCard, net >= 0 ? s.netPos : s.netNeg]}>
          <Text style={s.netLabel}>Me queda</Text>
          <Text style={s.netAmount}>{net < 0 ? '-' : ''}{formatCurrency(net)}</Text>
          {income > 0 && (
            <Text style={s.effText}>Eficiencia: {Math.round((net / income) * 100)}%</Text>
          )}
        </View>

        {/* ── Calculadora ganancia real ── */}
        {driveIncome > 0 && (
          <View style={s.realCard}>
            <TouchableOpacity style={s.realHeader} onPress={() => setShowRealCalc(v => !v)}>
              <Text style={s.realTitle}>🔍 ¿Cuánto gané de verdad?</Text>
              <Text style={s.realChevron}>{showRealCalc ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showRealCalc && (
              <View style={s.realBody}>
                <Text style={s.realHint}>Ingresa los km trabajados hoy ({cfg.vehicleName}) para calcular tu ganancia real descontando {cfg.energy === 'electric' ? 'la carga' : 'gasolina'}, {cfg.uberPassActive ? 'Uber Pass' : 'comisión Uber'} y mantenimiento.</Text>
                <View style={s.kmRow}>
                  <TextInput
                    style={s.kmInput}
                    value={kmInput}
                    onChangeText={t => setKmInput(t.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#444"
                  />
                  <Text style={s.kmLabel}>km recorridos hoy</Text>
                </View>

                {real ? (
                  <View style={s.breakdown}>
                    <View style={s.bRow}>
                      <Text style={s.bLabel}>Bruto (lo que muestra Uber)</Text>
                      <Text style={s.bValWhite}>{formatCurrency(real.grossIncome)}</Text>
                    </View>
                    {cfg.uberPassActive ? (
                      <View style={s.bRow}>
                        <Text style={s.bLabel}>Uber Pass (por día trabajado)</Text>
                        <Text style={s.bValRed}>-{formatCurrency(real.uberPassDaily)}</Text>
                      </View>
                    ) : (
                      <View style={s.bRow}>
                        <Text style={s.bLabel}>Comisión Uber ({cfg.uberCommissionPct}%)</Text>
                        <Text style={s.bValRed}>-{formatCurrency(real.uberCommission)}</Text>
                      </View>
                    )}
                    <View style={s.bRow}>
                      <Text style={s.bLabel}>{cfg.energy === 'electric' ? 'Carga eléctrica' : 'Gasolina'} ({km} km)</Text>
                      <Text style={s.bValRed}>-{formatCurrency(real.energyCost)}</Text>
                    </View>
                    <View style={s.bRow}>
                      <Text style={s.bLabel}>Provisión mecánico</Text>
                      <Text style={s.bValRed}>-{formatCurrency(real.maintenanceCost)}</Text>
                    </View>
                    <View style={s.bDivider} />
                    <View style={s.bRow}>
                      <Text style={s.bLabelBold}>Ganancia real</Text>
                      <Text style={[s.bValBold, { color: real.netReal >= 0 ? '#00C853' : '#F44336' }]}>
                        {real.netReal < 0 ? '-' : ''}{formatCurrency(real.netReal)}
                      </Text>
                    </View>
                    <Text style={s.costPerKm}>Costo por km: {formatCurrency(real.costPerKm)}</Text>
                  </View>
                ) : (
                  km > 0 ? null : <Text style={s.realHintSmall}>Escribe los km para ver el cálculo.</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Lista transacciones ── */}
        {transactions.length === 0 ? (
          <Text style={s.empty}>Sin registros hoy.{'\n'}Agrega tu primer ingreso o gasto.</Text>
        ) : (
          <View>
            <Text style={s.listTitle}>MOVIMIENTOS DE HOY</Text>
            {transactions.map(t => (
              <TouchableOpacity key={t.id} style={s.txRow} onLongPress={() => handleDelete(t.id)} activeOpacity={0.7}>
                <Text style={s.txIcon}>{getCategoryIcon(t.type, t.category)}</Text>
                <View style={s.txInfo}>
                  <Text style={s.txCat}>{getCategoryLabel(t.type, t.category)}</Text>
                  {t.note ? <Text style={s.txNote}>{t.note}</Text> : null}
                </View>
                <Text style={[s.txAmt, t.type === 'income' ? s.green : s.red]}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={s.hint}>Mantén presionado para eliminar</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Botones acción ── */}
      <View style={s.actions}>
        <TouchableOpacity style={[s.btn, s.btnGreen]} onPress={onAddIncome}>
          <Text style={s.btnText}>+ Ingreso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnRed]} onPress={onAddExpense}>
          <Text style={s.btnText}>+ Gasto</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#121212' },
  header:         { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  headerDate:     { color: '#aaa', fontSize: 16, textTransform: 'capitalize' },
  scroll:         { padding: 16, paddingBottom: 20 },
  workCardLoading:{ height: 68, backgroundColor: '#1a1a1a', borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  startBtn:       { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#0a3020', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1.5, borderColor: '#00C853' },
  startIcon:      { fontSize: 28 },
  startTitle:     { color: '#00C853', fontSize: 17, fontWeight: '800' },
  startSub:       { color: '#4caf7a', fontSize: 12, marginTop: 2 },
  workingCard:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0a1e12', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#1e4d2b' },
  workingLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dot:            { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00C853' },
  workingTitle:   { color: '#00C853', fontSize: 14, fontWeight: '700' },
  workingSub:     { color: '#4caf7a', fontSize: 11, marginTop: 2 },
  endBtn:         { backgroundColor: '#2a0a0a', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#F44336' },
  endBtnTxt:      { color: '#F44336', fontSize: 13, fontWeight: '700' },
  alertCard:      { borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1 },
  alertRed:       { backgroundColor: '#2e0a0a', borderColor: '#F44336' },
  alertYellow:    { backgroundColor: '#1a1a00', borderColor: '#FFC10760' },
  alertTxt:       { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 4 },
  alertMore:      { color: '#888', fontSize: 12, marginTop: 2 },
  row:            { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card:           { flex: 1, borderRadius: 16, padding: 16 },
  cardGreen:      { backgroundColor: '#0a2e1a' },
  cardRed:        { backgroundColor: '#2e0a0a' },
  cardLabel:      { color: '#aaa', fontSize: 13, marginBottom: 6 },
  cardAmount:     { color: '#fff', fontSize: 20, fontWeight: '700' },
  netCard:        { borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  netPos:         { backgroundColor: '#0d3320' },
  netNeg:         { backgroundColor: '#3d0a0a' },
  netLabel:       { color: '#aaa', fontSize: 16, marginBottom: 8 },
  netAmount:      { color: '#fff', fontSize: 38, fontWeight: '800' },
  effText:        { color: '#aaa', fontSize: 13, marginTop: 8 },
  realCard:       { backgroundColor: '#1a1a1a', borderRadius: 18, marginBottom: 16, overflow: 'hidden' },
  realHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  realTitle:      { color: '#FFC107', fontSize: 15, fontWeight: '700' },
  realChevron:    { color: '#FFC107', fontSize: 12 },
  realBody:       { padding: 16, paddingTop: 0 },
  realHint:       { color: '#666', fontSize: 13, lineHeight: 20, marginBottom: 14 },
  realHintSmall:  { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 8 },
  kmRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  kmInput:        { backgroundColor: '#262626', borderRadius: 12, padding: 12, color: '#fff', fontSize: 22, fontWeight: '700', width: 100, textAlign: 'center' },
  kmLabel:        { color: '#aaa', fontSize: 15 },
  breakdown:      { backgroundColor: '#222', borderRadius: 14, padding: 14 },
  bRow:           { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  bLabel:         { color: '#aaa', fontSize: 13, flex: 1 },
  bLabelBold:     { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  bValWhite:      { color: '#fff', fontSize: 13, fontWeight: '600' },
  bValRed:        { color: '#F44336', fontSize: 13, fontWeight: '600' },
  bValBold:       { fontSize: 16, fontWeight: '800' },
  bDivider:       { height: 1, backgroundColor: '#333', marginVertical: 6 },
  costPerKm:      { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 8 },
  empty:          { color: '#555', textAlign: 'center', marginTop: 48, fontSize: 16, lineHeight: 26 },
  listTitle:      { color: '#555', fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  txRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 14, padding: 14, gap: 12, marginBottom: 8 },
  txIcon:         { fontSize: 22 },
  txInfo:         { flex: 1 },
  txCat:          { color: '#fff', fontSize: 16, fontWeight: '600' },
  txNote:         { color: '#888', fontSize: 13, marginTop: 2 },
  txAmt:          { fontSize: 16, fontWeight: '700' },
  green:          { color: '#00C853' },
  red:            { color: '#F44336' },
  hint:           { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 4 },
  actions:        { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 8, backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1 },
  btn:            { flex: 1, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnGreen:       { backgroundColor: '#00C853' },
  btnRed:         { backgroundColor: '#F44336' },
  btnText:        { color: '#fff', fontSize: 17, fontWeight: '700' },
});
