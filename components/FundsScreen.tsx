import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFunds, getFundMovements, addFundMovement, Fund, FundMovement } from '../src/db';
import { formatCurrency, todayString, formatShortDate } from '../src/format';

// ─── Modal agregar / retirar ──────────────────────────────────────────────────

interface FundActionModalProps {
  fund: Fund;
  action: 'deposit' | 'withdraw';
  onClose: () => void;
  onSaved: () => void;
}

function FundActionModal({ fund, action, onClose, onSaved }: FundActionModalProps) {
  const [raw, setRaw]   = useState('');
  const [note, setNote] = useState('');
  const isDeposit       = action === 'deposit';
  const display         = raw ? Number(raw).toLocaleString('es-CO') : '';

  const handleSave = () => {
    const amount = Number(raw);
    if (!amount || amount <= 0) { Alert.alert('Error', 'Ingresa un monto válido'); return; }
    if (!isDeposit && amount > fund.balance) {
      Alert.alert('Error', `Solo tienes ${formatCurrency(fund.balance)} en este fondo`);
      return;
    }
    addFundMovement(fund.id, isDeposit ? amount : -amount, note.trim() || null, todayString());
    onSaved();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={fs.container}>
        <View style={fs.topBar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={fs.cancelTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={fs.topTitle}>
            {isDeposit ? `Agregar a ${fund.name}` : `Usar de ${fund.name}`}
          </Text>
          <View style={{ width: 80 }} />
        </View>

        <View style={fs.body}>
          <Text style={fs.fundIcon}>{fund.icon}</Text>
          <Text style={[fs.fundBalance, { color: fund.color }]}>
            Disponible: {formatCurrency(fund.balance)}
          </Text>

          <Text style={fs.label}>MONTO</Text>
          <View style={fs.amountBox}>
            <Text style={fs.curr}>{isDeposit ? '+' : '-'}$</Text>
            <TextInput
              style={fs.amountInput}
              value={display}
              onChangeText={t => setRaw(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#333"
              autoFocus
            />
          </View>

          <Text style={fs.label}>NOTA (opcional)</Text>
          <TextInput
            style={fs.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ej: revisión 20.000 km..."
            placeholderTextColor="#444"
          />

          <TouchableOpacity
            style={[fs.saveBtn, { backgroundColor: isDeposit ? '#00C853' : '#F44336' }]}
            onPress={handleSave}
          >
            <Text style={fs.saveTxt}>{isDeposit ? 'GUARDAR' : 'RETIRAR'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const fs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  cancelTxt:   { color: '#888', fontSize: 15, width: 80 },
  topTitle:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  body:        { flex: 1, padding: 24, alignItems: 'center' },
  fundIcon:    { fontSize: 48, marginBottom: 8 },
  fundBalance: { fontSize: 16, fontWeight: '600', marginBottom: 28 },
  label:       { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10, alignSelf: 'flex-start' },
  amountBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e',
    borderRadius: 16, padding: 18, marginBottom: 20, width: '100%',
  },
  curr:        { color: '#aaa', fontSize: 28, marginRight: 6 },
  amountInput: { flex: 1, color: '#fff', fontSize: 36, fontWeight: '800' },
  noteInput: {
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 14,
    color: '#fff', fontSize: 15, width: '100%', marginBottom: 28,
  },
  saveBtn:     { width: '100%', height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  saveTxt:     { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
});

// ─── Fund Detail Modal ────────────────────────────────────────────────────────

interface FundDetailProps {
  fund: Fund;
  onClose: () => void;
  onMoved: () => void;
}

function FundDetailModal({ fund, onClose, onMoved }: FundDetailProps) {
  const [action, setAction]       = useState<'deposit' | 'withdraw' | null>(null);
  const [movements, setMovements] = useState<FundMovement[]>([]);

  React.useEffect(() => {
    setMovements(getFundMovements(fund.id));
  }, [fund.id]);

  const handleMoved = () => {
    setAction(null);
    setMovements(getFundMovements(fund.id));
    onMoved();
  };

  if (action) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAction(null)}>
        <FundActionModal fund={fund} action={action} onClose={() => setAction(null)} onSaved={handleMoved} />
      </Modal>
    );
  }

  return (
    <SafeAreaView style={fd.container}>
      <View style={fd.topBar}>
        <TouchableOpacity onPress={onClose}>
          <Text style={fd.backTxt}>← Volver</Text>
        </TouchableOpacity>
        <Text style={fd.title}>{fund.icon} {fund.name}</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={[fd.balanceCard, { borderColor: fund.color }]}>
        <Text style={fd.balanceLabel}>Disponible en este fondo</Text>
        <Text style={[fd.balanceAmt, { color: fund.color }]}>{formatCurrency(fund.balance)}</Text>
        <Text style={fd.disclaimer}>⚠️ Este dinero está en tu billetera — la app solo lleva el registro.</Text>
      </View>

      <View style={fd.btnRow}>
        <TouchableOpacity style={[fd.actionBtn, fd.depositBtn]} onPress={() => setAction('deposit')}>
          <Text style={fd.actionBtnTxt}>+ Agregar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[fd.actionBtn, fd.withdrawBtn, fund.balance <= 0 && fd.disabledBtn]}
          onPress={() => fund.balance > 0 && setAction('withdraw')}
        >
          <Text style={fd.actionBtnTxt}>- Usar</Text>
        </TouchableOpacity>
      </View>

      <Text style={fd.sectionTitle}>MOVIMIENTOS</Text>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {movements.length === 0 ? (
          <Text style={fd.empty}>Sin movimientos aún.</Text>
        ) : (
          movements.map(m => (
            <View key={m.id} style={fd.mvRow}>
              <View style={fd.mvLeft}>
                <Text style={fd.mvDate}>{formatShortDate(m.date)}</Text>
                {m.note ? <Text style={fd.mvNote}>{m.note}</Text> : null}
              </View>
              <Text style={[fd.mvAmt, { color: m.amount >= 0 ? '#00C853' : '#F44336' }]}>
                {m.amount >= 0 ? '+' : ''}{formatCurrency(m.amount)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const fd = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#121212' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  backTxt:     { color: '#00C853', fontSize: 15, width: 70 },
  title:       { color: '#fff', fontSize: 17, fontWeight: '700' },
  balanceCard: {
    margin: 16, borderRadius: 20, borderWidth: 2,
    padding: 20, alignItems: 'center', backgroundColor: '#1a1a1a',
  },
  balanceLabel:  { color: '#888', fontSize: 14, marginBottom: 8 },
  balanceAmt:    { fontSize: 40, fontWeight: '800', marginBottom: 8 },
  disclaimer:    { color: '#666', fontSize: 11, textAlign: 'center', lineHeight: 16 },
  btnRow:        { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  actionBtn:     { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  depositBtn:    { backgroundColor: '#00C853' },
  withdrawBtn:   { backgroundColor: '#F44336' },
  disabledBtn:   { opacity: 0.3 },
  actionBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle:  { color: '#555', fontSize: 12, letterSpacing: 1, paddingHorizontal: 16, marginBottom: 4 },
  empty:         { color: '#444', fontSize: 14, textAlign: 'center', marginTop: 24 },
  mvRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e1e1e', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  mvLeft:  { flex: 1 },
  mvDate:  { color: '#aaa', fontSize: 13 },
  mvNote:  { color: '#666', fontSize: 12, marginTop: 2 },
  mvAmt:   { fontSize: 15, fontWeight: '700' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FundsScreen() {
  const [funds, setFunds]           = useState<Fund[]>([]);
  const [selected, setSelected]     = useState<Fund | null>(null);

  const load = useCallback(() => setFunds(getFunds()), []);
  React.useEffect(() => { load(); }, [load]);

  const totalSaved = funds.reduce((s, f) => s + f.balance, 0);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Mis Fondos</Text>
        <Text style={s.subtitle}>Ahorros para imprevistos</Text>
      </View>

      {totalSaved > 0 && (
        <View style={s.totalBanner}>
          <Text style={s.totalLabel}>Total guardado</Text>
          <Text style={s.totalAmt}>{formatCurrency(totalSaved)}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.infoText}>
          💡 Cada fondo es un "sobre" virtual. El dinero sigue en tu billetera — la app solo lleva la cuenta de cuánto has separado.
        </Text>

        {funds.map(fund => (
          <TouchableOpacity
            key={fund.id}
            style={s.fundCard}
            onPress={() => setSelected(fund)}
            activeOpacity={0.75}
          >
            <View style={s.fundLeft}>
              <Text style={s.fundIcon}>{fund.icon}</Text>
              <View>
                <Text style={s.fundName}>{fund.name}</Text>
                <Text style={s.fundTap}>Toca para ver detalles</Text>
              </View>
            </View>
            <View style={s.fundRight}>
              <Text style={[s.fundBalance, { color: fund.color }]}>
                {formatCurrency(fund.balance)}
              </Text>
              <View style={[s.fundDot, { backgroundColor: fund.color }]} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={s.tipsBox}>
          <Text style={s.tipsTitle}>¿Cuánto separar?</Text>
          <Text style={s.tip}>🛡️ Emergencias — 10% de tus ingresos diarios</Text>
          <Text style={s.tip}>🔧 Mecánico — $300.000/mes mínimo</Text>
          <Text style={s.tip}>⚖️ Multas — $200.000/mes (zona gris legal)</Text>
          <Text style={s.tip}>🏦 Pensión — 16% de tus ingresos (cotización voluntaria)</Text>
        </View>
      </ScrollView>

      {/* Fund detail modal */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <FundDetailModal
            fund={selected}
            onClose={() => setSelected(null)}
            onMoved={() => {
              load();
              // refresh selected fund data
              const updated = getFunds().find(f => f.id === selected.id);
              if (updated) setSelected(updated);
            }}
          />
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#121212' },
  header:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title:       { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle:    { color: '#666', fontSize: 14, marginTop: 2 },
  totalBanner: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#0a2e1a', borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { color: '#4caf7a', fontSize: 14 },
  totalAmt:   { color: '#00C853', fontSize: 22, fontWeight: '800' },
  scroll:     { padding: 16, paddingBottom: 40 },
  infoText:   { color: '#555', fontSize: 13, lineHeight: 20, marginBottom: 16, fontStyle: 'italic' },
  fundCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e1e1e', borderRadius: 18, padding: 18, marginBottom: 10,
  },
  fundLeft:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fundIcon:    { fontSize: 28 },
  fundName:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  fundTap:     { color: '#555', fontSize: 12, marginTop: 2 },
  fundRight:   { alignItems: 'flex-end', gap: 6 },
  fundBalance: { fontSize: 18, fontWeight: '800' },
  fundDot:     { width: 8, height: 8, borderRadius: 4 },
  tipsBox: {
    backgroundColor: '#1a1a1a', borderRadius: 18, padding: 18, marginTop: 12,
  },
  tipsTitle: { color: '#888', fontSize: 12, letterSpacing: 1, marginBottom: 12 },
  tip:       { color: '#aaa', fontSize: 14, marginBottom: 8, lineHeight: 20 },
});
