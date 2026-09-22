import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput,
} from 'react-native';
import {
  getFixedExpenses, getDebts, deleteFixedExpense, deleteDebt,
  decrementDebtMonth, FixedExpense, Debt,
} from '../src/db';
import { computeBalance, BalanceResult, BalanceStatus } from '../src/financeCalc';
import { formatCurrency } from '../src/format';
import AddFixedExpenseModal from './AddFixedExpenseModal';
import AddDebtModal from './AddDebtModal';
import {
  getVehicleConfig, saveVehicleConfig, calcPicoPlacaImpact, calcDIANEstimate,
  VehicleConfig,
} from '../src/vehicleCalc';
import { versionLabel } from '../src/updates';

// ─── Category icons for fixed expenses ───────────────────────────────────────
const CAT_ICONS: Record<string, string> = {
  rent: '🏠', utilities: '💡', internet: '🌐', phone: '📱',
  market: '🛒', transport: '🚌', health: '🏥', other: '📦',
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<BalanceStatus, { bg: string; label: string; emoji: string }> = {
  none:    { bg: '#1e1e1e', label: 'Sin obligaciones configuradas', emoji: '⚙️' },
  no_data: { bg: '#1a1a00', label: 'Sin datos este mes aún',        emoji: '📊' },
  green:   { bg: '#0a2e1a', label: 'Vas bien',                      emoji: '🟢' },
  yellow:  { bg: '#2a1f00', label: 'Cuídado, puedes mejorar',       emoji: '🟡' },
  red:     { bg: '#2e0a0a', label: 'Estás en riesgo',               emoji: '🔴' },
};

const STATUS_TEXT_COLOR: Record<BalanceStatus, string> = {
  none:    '#888',
  no_data: '#FFC107',
  green:   '#00C853',
  yellow:  '#FFC107',
  red:     '#F44336',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function BalanceScreen() {
  const [balance, setBalance]             = useState<BalanceResult | null>(null);
  const [fixedExpenses, setFixed]         = useState<FixedExpense[]>([]);
  const [debts, setDebts]                 = useState<Debt[]>([]);
  const [showAddFixed, setShowAddFixed]   = useState(false);
  const [showAddDebt, setShowAddDebt]     = useState(false);
  const [showConfig, setShowConfig]       = useState(false);
  const [showDIAN, setShowDIAN]           = useState(false);
  const [cfg, setCfg]                     = useState<VehicleConfig>(getVehicleConfig());

  // Config fields (editable)
  const [cfgKm, setCfgKm]                 = useState(String(cfg.kmPerGallon));
  const [cfgGas, setCfgGas]               = useState(String(cfg.gasPriceCOP));
  const [cfgComm, setCfgComm]             = useState(String(cfg.uberCommissionPct));
  const [cfgPico, setCfgPico]             = useState(String(cfg.picoPlacaDaysPerWeek));
  const [cfgMaint, setCfgMaint]           = useState(String(cfg.maintenanceCostPerKm));

  const load = useCallback(() => {
    setFixed(getFixedExpenses());
    setDebts(getDebts());
    setBalance(computeBalance());
    const updated = getVehicleConfig();
    setCfg(updated);
    setCfgKm(String(updated.kmPerGallon));
    setCfgGas(String(updated.gasPriceCOP));
    setCfgComm(String(updated.uberCommissionPct));
    setCfgPico(String(updated.picoPlacaDaysPerWeek));
    setCfgMaint(String(updated.maintenanceCostPerKm));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const saveConfig = () => {
    saveVehicleConfig({
      kmPerGallon:          Number(cfgKm)   || cfg.kmPerGallon,
      gasPriceCOP:          Number(cfgGas)  || cfg.gasPriceCOP,
      uberCommissionPct:    Number(cfgComm) || cfg.uberCommissionPct,
      picoPlacaDaysPerWeek: Number(cfgPico) || cfg.picoPlacaDaysPerWeek,
      maintenanceCostPerKm: Number(cfgMaint)|| cfg.maintenanceCostPerKm,
    });
    load();
    setShowConfig(false);
  };

  const handleDeleteFixed = (id: number, name: string) => {
    Alert.alert(`Eliminar "${name}"`, '¿Quitar este gasto fijo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteFixedExpense(id); load(); } },
    ]);
  };

  const handleDeleteDebt = (id: number, name: string) => {
    Alert.alert(`Eliminar "${name}"`, '¿Quitar esta deuda?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteDebt(id); load(); } },
    ]);
  };

  const handleDecrementDebt = (debt: Debt) => {
    if (debt.months_remaining === null) return;
    Alert.alert(`Marcar cuota de "${debt.name}"`, 'Descontar 1 mes restante', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => { decrementDebtMonth(debt.id, debt.months_remaining); load(); } },
    ]);
  };

  const totalFixed = fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const totalDebts = debts.reduce((s, d) => s + d.monthly_payment, 0);

  const b = balance;
  const statusCfg = b ? STATUS_CONFIG[b.status] : STATUS_CONFIG.none;
  const textColor  = b ? STATUS_TEXT_COLOR[b.status] : '#888';

  const today = new Date();
  const monthName = today.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Balance mensual</Text>
        <Text style={s.subtitle}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* ── Status Card ── */}
        {b && (
          <View style={[s.statusCard, { backgroundColor: statusCfg.bg }]}>
            <View style={s.statusTop}>
              <Text style={s.statusEmoji}>{statusCfg.emoji}</Text>
              <Text style={[s.statusLabel, { color: textColor }]}>{statusCfg.label}</Text>
            </View>

            {b.status !== 'none' && (
              <>
                {b.netIsNegative && (
                  <View style={s.warningBanner}>
                    <Text style={s.warningText}>❗ Los gastos superan los ingresos este mes</Text>
                  </View>
                )}

                <View style={s.statsGrid}>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Objetivo diario</Text>
                    <Text style={[s.statVal, { color: '#fff' }]}>{formatCurrency(b.dailyTarget)}</Text>
                  </View>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Tu promedio</Text>
                    <Text style={[s.statVal, { color: textColor }]}>
                      {b.status === 'no_data' ? '—' : formatCurrency(b.dailyAvg)}
                    </Text>
                  </View>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Necesitas hoy</Text>
                    <Text style={[s.statVal, { color: '#FFC107' }]}>
                      {formatCurrency(b.dailyNeededNow)}
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                {b.monthlyObligations > 0 && (
                  <View style={s.progressSection}>
                    <View style={s.progressBar}>
                      <View
                        style={[
                          s.progressFill,
                          {
                            width: `${Math.min(Math.max(b.coveredPct, 0), 1) * 100}%` as any,
                            backgroundColor: textColor,
                          },
                        ]}
                      />
                    </View>
                    <Text style={s.progressText}>
                      {Math.round(b.coveredPct * 100)}% cubierto
                      {'  ·  '}
                      {formatCurrency(Math.max(b.currentMonthNet, 0))} de {formatCurrency(b.monthlyObligations)}
                    </Text>
                    <Text style={s.daysText}>
                      {b.daysWorked} días trabajados · {b.calendarDaysLeft} días calendario restantes
                    </Text>
                  </View>
                )}
              </>
            )}

            {b.status === 'none' && (
              <Text style={s.noneHint}>
                Configura tus gastos fijos y deudas abajo{'\n'}para ver tu objetivo diario.
              </Text>
            )}
          </View>
        )}

        {/* ── Gastos fijos ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>GASTOS FIJOS</Text>
            <Text style={s.sectionTotal}>{formatCurrency(totalFixed)}/mes</Text>
          </View>

          {fixedExpenses.length === 0 ? (
            <Text style={s.emptyRow}>Sin gastos fijos aún</Text>
          ) : (
            fixedExpenses.map(exp => (
              <TouchableOpacity
                key={exp.id}
                style={s.itemRow}
                onLongPress={() => handleDeleteFixed(exp.id, exp.name)}
                activeOpacity={0.7}
              >
                <Text style={s.itemIcon}>{CAT_ICONS[exp.category] ?? '📦'}</Text>
                <Text style={s.itemName}>{exp.name}</Text>
                <Text style={s.itemAmount}>{formatCurrency(exp.amount)}</Text>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={s.addBtn} onPress={() => setShowAddFixed(true)}>
            <Text style={s.addBtnTxt}>+ Agregar gasto fijo</Text>
          </TouchableOpacity>
          <Text style={s.longPressHint}>Mantén presionado para eliminar</Text>
        </View>

        {/* ── Deudas ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>DEUDAS</Text>
            <Text style={s.sectionTotal}>{formatCurrency(totalDebts)}/mes</Text>
          </View>

          {debts.length === 0 ? (
            <Text style={s.emptyRow}>Sin deudas registradas</Text>
          ) : (
            debts.map(debt => (
              <TouchableOpacity
                key={debt.id}
                style={s.itemRow}
                onLongPress={() => handleDeleteDebt(debt.id, debt.name)}
                onPress={() => debt.months_remaining !== null && handleDecrementDebt(debt)}
                activeOpacity={0.7}
              >
                <Text style={s.itemIcon}>💳</Text>
                <View style={s.debtInfo}>
                  <Text style={s.itemName}>{debt.name}</Text>
                  <Text style={s.debtMonths}>
                    {debt.months_remaining !== null
                      ? `${debt.months_remaining} ${debt.months_remaining === 1 ? 'mes' : 'meses'} restantes`
                      : 'Cuota indefinida'}
                  </Text>
                </View>
                <Text style={s.itemAmount}>{formatCurrency(debt.monthly_payment)}/mes</Text>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={[s.addBtn, s.addBtnRed]} onPress={() => setShowAddDebt(true)}>
            <Text style={s.addBtnTxt}>+ Agregar deuda</Text>
          </TouchableOpacity>
          <Text style={s.longPressHint}>Presiona para descontar 1 mes · Mantén para eliminar</Text>
        </View>

        {/* ── Total ── */}
        {(fixedExpenses.length > 0 || debts.length > 0) && (
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>TOTAL OBLIGACIONES MENSUALES</Text>
            <Text style={s.totalAmount}>{formatCurrency(totalFixed + totalDebts)}</Text>
            <Text style={s.totalSub}>
              Gastos fijos: {formatCurrency(totalFixed)}{'  +  '}
              Deudas: {formatCurrency(totalDebts)}
            </Text>
          </View>
        )}

        {/* ── Pico y Placa ── */}
        {(() => {
          const avgDaily = b && b.daysWorked > 0 ? b.dailyAvg : 0;
          const pp = calcPicoPlacaImpact(avgDaily, cfg);
          return (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>🚫 PICO Y PLACA</Text>
              </View>
              <Text style={s.ppDays}>
                Días sin trabajar este mes: <Text style={s.ppDaysNum}>{pp.daysBlockedThisMonth}</Text>
              </Text>
              <Text style={s.ppDays}>
                Días disponibles: <Text style={{ color: '#00C853', fontWeight: '700' }}>{pp.workedDaysAvailable}</Text>
              </Text>
              {avgDaily > 0 && (
                <View style={s.ppLoss}>
                  <Text style={s.ppLossLabel}>Ingreso perdido estimado</Text>
                  <Text style={s.ppLossAmt}>{formatCurrency(pp.estimatedLostIncome)}</Text>
                </View>
              )}
              <Text style={s.ppHint}>
                Configurado: {cfg.picoPlacaDaysPerWeek} días/semana sin trabajar.
              </Text>
            </View>
          );
        })()}

        {/* ── Estimador DIAN ── */}
        {b && b.daysWorked > 0 && (() => {
          const dian = calcDIANEstimate(b.dailyAvg * 24);
          return (
            <TouchableOpacity style={s.section} onPress={() => setShowDIAN(v => !v)} activeOpacity={0.8}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>🏛️ ESTIMADOR DIAN</Text>
                <Text style={s.chevron}>{showDIAN ? '▲' : '▼'}</Text>
              </View>
              <Text style={[s.dianStatus, { color: dian.isObligatedToFile ? '#F44336' : '#00C853' }]}>
                {dian.isObligatedToFile
                  ? '⚠️ Posiblemente debes declarar renta'
                  : '✓ Probablemente bajo el umbral de declaración'}
              </Text>
              {showDIAN && (
                <View style={s.dianDetail}>
                  <View style={s.bRow}>
                    <Text style={s.bLabel}>Ingreso anual estimado</Text>
                    <Text style={s.bValW}>{formatCurrency(dian.annualGrossEstimate)}</Text>
                  </View>
                  <View style={s.bRow}>
                    <Text style={s.bLabel}>Gastos deducibles (~40%)</Text>
                    <Text style={{ color: '#00C853', fontSize: 13, fontWeight: '600' }}>-{formatCurrency(dian.deductibleExpenses)}</Text>
                  </View>
                  <View style={s.bRow}>
                    <Text style={s.bLabel}>Impuesto estimado</Text>
                    <Text style={{ color: '#F44336', fontSize: 13, fontWeight: '600' }}>{formatCurrency(dian.estimatedTax)}</Text>
                  </View>
                  <Text style={s.dianDisclaimer}>{dian.disclaimer}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })()}

        {/* ── Config vehículo ── */}
        <TouchableOpacity style={s.configBtn} onPress={() => setShowConfig(v => !v)}>
          <Text style={s.configBtnTxt}>⚙️ Configurar mi vehículo</Text>
          <Text style={s.chevron}>{showConfig ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showConfig && (
          <View style={s.configBox}>
            {[
              { label: 'Rendimiento (km/galón)',      val: cfgKm,    set: setCfgKm },
              { label: 'Precio galón (COP)',           val: cfgGas,   set: setCfgGas },
              { label: 'Comisión Uber (%)',            val: cfgComm,  set: setCfgComm },
              { label: 'Días pico y placa por semana', val: cfgPico,  set: setCfgPico },
              { label: 'Costo mantenimiento (COP/km)', val: cfgMaint, set: setCfgMaint },
            ].map(row => (
              <View key={row.label} style={s.cfgRow}>
                <Text style={s.cfgLabel}>{row.label}</Text>
                <TextInput
                  style={s.cfgInput}
                  value={row.val}
                  onChangeText={row.set}
                  keyboardType="number-pad"
                />
              </View>
            ))}
            <TouchableOpacity style={s.cfgSaveBtn} onPress={saveConfig}>
              <Text style={s.cfgSaveTxt}>GUARDAR CONFIGURACIÓN</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.versionTxt}>{versionLabel()}</Text>
      </ScrollView>

      {/* ── Add Fixed Expense Modal ── */}
      <Modal visible={showAddFixed} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddFixed(false)}>
        <AddFixedExpenseModal
          onClose={() => setShowAddFixed(false)}
          onSaved={() => { setShowAddFixed(false); load(); }}
        />
      </Modal>

      {/* ── Add Debt Modal ── */}
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
  container:     { flex: 1, backgroundColor: '#121212' },
  header:        { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title:         { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle:      { color: '#666', fontSize: 14, marginTop: 2 },
  scroll:        { padding: 16, paddingBottom: 40 },

  statusCard:    { borderRadius: 20, padding: 20, marginBottom: 20 },
  statusTop:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  statusEmoji:   { fontSize: 24 },
  statusLabel:   { fontSize: 18, fontWeight: '700', flex: 1 },
  warningBanner: { backgroundColor: '#3d0000', borderRadius: 10, padding: 10, marginBottom: 14 },
  warningText:   { color: '#F44336', fontSize: 13, fontWeight: '600' },
  statsGrid:     { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statItem:      { flex: 1, alignItems: 'center' },
  statLabel:     { color: '#888', fontSize: 11, marginBottom: 6 },
  statVal:       { fontSize: 15, fontWeight: '700' },
  progressSection: { gap: 6 },
  progressBar:   { height: 8, backgroundColor: '#ffffff20', borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 4 },
  progressText:  { color: '#aaa', fontSize: 12 },
  daysText:      { color: '#666', fontSize: 11 },
  noneHint:      { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  section:       { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { color: '#888', fontSize: 12, letterSpacing: 1, fontWeight: '600' },
  sectionTotal:  { color: '#00C853', fontSize: 14, fontWeight: '700' },
  emptyRow:      { color: '#444', fontSize: 14, marginBottom: 12, paddingLeft: 4 },
  itemRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomColor: '#262626', borderBottomWidth: 1 },
  itemIcon:      { fontSize: 22 },
  itemName:      { flex: 1, color: '#fff', fontSize: 16 },
  itemAmount:    { color: '#aaa', fontSize: 15, fontWeight: '600' },
  debtInfo:      { flex: 1 },
  debtMonths:    { color: '#666', fontSize: 12, marginTop: 2 },

  addBtn:        { marginTop: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#00C853', borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center' },
  addBtnRed:     { borderColor: '#F44336' },
  addBtnTxt:     { color: '#aaa', fontSize: 15, fontWeight: '600' },
  longPressHint: { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 8 },

  totalBox:      { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 14 },
  totalLabel:    { color: '#666', fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  totalAmount:   { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 6 },
  totalSub:      { color: '#666', fontSize: 12 },
  chevron:       { color: '#888', fontSize: 12 },

  // Pico y placa
  ppDays:        { color: '#aaa', fontSize: 14, marginBottom: 6 },
  ppDaysNum:     { color: '#F44336', fontWeight: '700' },
  ppLoss:        { backgroundColor: '#2e0a0a', borderRadius: 12, padding: 12, marginVertical: 8, alignItems: 'center' },
  ppLossLabel:   { color: '#aaa', fontSize: 12, marginBottom: 4 },
  ppLossAmt:     { color: '#F44336', fontSize: 20, fontWeight: '800' },
  ppHint:        { color: '#555', fontSize: 11, marginTop: 6 },

  // DIAN
  dianStatus:    { fontSize: 14, fontWeight: '600', marginTop: 4 },
  dianDetail:    { backgroundColor: '#222', borderRadius: 12, padding: 12, marginTop: 12 },
  bRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  bLabel:        { color: '#aaa', fontSize: 13, flex: 1 },
  bValW:         { color: '#fff', fontSize: 13, fontWeight: '600' },
  dianDisclaimer:{ color: '#666', fontSize: 11, marginTop: 10, fontStyle: 'italic', lineHeight: 16 },

  // Config
  configBtn:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 10 },
  configBtnTxt:  { color: '#888', fontSize: 14, fontWeight: '600' },
  configBox:     { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  cfgRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cfgLabel:      { color: '#aaa', fontSize: 13, flex: 1 },
  cfgInput:      { backgroundColor: '#262626', borderRadius: 10, padding: 10, color: '#fff', fontSize: 16, fontWeight: '700', width: 100, textAlign: 'center' },
  cfgSaveBtn:    { backgroundColor: '#00C853', borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cfgSaveTxt:    { color: '#fff', fontSize: 14, fontWeight: '800' },
  versionTxt:    { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 12 },
});
