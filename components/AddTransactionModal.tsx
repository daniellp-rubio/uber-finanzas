import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addTransaction } from '../src/db';
import { todayString, formatCurrency } from '../src/format';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TransactionType } from '../src/categories';
import { getVehicleConfig, calcCashCommission } from '../src/vehicleCalc';

interface Props {
  initialType: TransactionType;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddTransactionModal({ initialType, onClose, onSaved }: Props) {
  const [type, setType]           = useState<TransactionType>(initialType);
  const [rawAmount, setRaw]       = useState('');
  const [category, setCategory]   = useState('');
  const [note, setNote]           = useState('');
  const [isCash, setIsCash]       = useState(false);
  const inputRef                  = useRef<TextInput>(null);

  const cfg = getVehicleConfig();
  const amount = Number(rawAmount);
  const cashCommission = isCash && type === 'income' && amount > 0
    ? calcCashCommission(amount, cfg)
    : 0;

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeChange = (t: TransactionType) => {
    setType(t);
    setCategory('');
  };

  const handleAmountChange = (text: string) => {
    const digits = text.replace(/\D/g, '');
    setRaw(digits);
  };

  const displayAmount = rawAmount
    ? Number(rawAmount).toLocaleString('es-CO')
    : '';

  const handleSave = () => {
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido mayor a cero');
      return;
    }
    if (!category) {
      Alert.alert('Error', 'Selecciona una categoría');
      return;
    }
    const today = todayString();
    addTransaction(type, amount, category, note.trim() || null, today);
    // Si fue en efectivo, registrar automáticamente la comisión de Uber como gasto
    if (isCash && type === 'income' && cashCommission > 0) {
      addTransaction('expense', cashCommission, 'other',
        `Comisión Uber en efectivo (${cfg.uberCommissionPct}%)`, today);
    }
    onSaved();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={s.container}>
        {/* Header */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Agregar registro</Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Type toggle */}
          <View style={s.typeRow}>
            <TouchableOpacity
              style={[s.typeBtn, type === 'income' && s.typeBtnGreen]}
              onPress={() => handleTypeChange('income')}
            >
              <Text style={[s.typeTxt, type === 'income' && s.typeTxtActive]}>+ Ingreso</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, type === 'expense' && s.typeBtnRed]}
              onPress={() => handleTypeChange('expense')}
            >
              <Text style={[s.typeTxt, type === 'expense' && s.typeTxtActive]}>- Gasto</Text>
            </TouchableOpacity>
          </View>

          {/* Amount */}
          <Text style={s.label}>¿CUÁNTO?</Text>
          <TouchableOpacity
            style={s.amountBox}
            onPress={() => inputRef.current?.focus()}
            activeOpacity={1}
          >
            <Text style={s.currencySign}>$</Text>
            <TextInput
              ref={inputRef}
              style={s.amountInput}
              value={displayAmount}
              onChangeText={handleAmountChange}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#333"
              autoFocus
              caretHidden={false}
            />
          </TouchableOpacity>

          {/* Category */}
          <Text style={s.label}>CATEGORÍA</Text>
          <View style={s.catGrid}>
            {categories.map(cat => {
              const active = category === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    s.catBtn,
                    active && (type === 'income' ? s.catGreen : s.catRed),
                  ]}
                  onPress={() => setCategory(cat.id)}
                >
                  <Text style={s.catIcon}>{cat.icon}</Text>
                  <Text style={[s.catLabel, active && s.catLabelActive]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Efectivo toggle (solo para ingresos) */}
          {type === 'income' && (
            <>
              <TouchableOpacity
                style={[s.cashToggle, isCash && s.cashToggleActive]}
                onPress={() => setIsCash(v => !v)}
              >
                <Text style={s.cashToggleIcon}>💵</Text>
                <View style={s.cashToggleText}>
                  <Text style={[s.cashToggleTitle, isCash && s.cashToggleTitleActive]}>
                    ¿Fue en efectivo?
                  </Text>
                  <Text style={s.cashToggleSub}>
                    {isCash && amount > 0
                      ? `Uber te cobrará ${formatCurrency(cashCommission)} — se registra automáticamente`
                      : 'Activa si el pasajero pagó en efectivo'}
                  </Text>
                </View>
                <View style={[s.cashDot, isCash && s.cashDotActive]} />
              </TouchableOpacity>
              {isCash && cashCommission > 0 && (
                <View style={s.cashAlert}>
                  <Text style={s.cashAlertTxt}>
                    ⚠️ Separa {formatCurrency(cashCommission)} para pagar a Uber. Se registrará como gasto automáticamente al guardar.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Note */}
          <Text style={s.label}>NOTA (opcional)</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ej: mal día de tráfico, llovió..."
            placeholderTextColor="#444"
            multiline
            numberOfLines={3}
          />
        </ScrollView>

        {/* Save */}
        <View style={s.saveWrap}>
          <TouchableOpacity
            style={[s.saveBtn, type === 'income' ? s.saveBtnGreen : s.saveBtnRed]}
            onPress={handleSave}
          >
            <Text style={s.saveTxt}>GUARDAR</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#121212' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  closeBtn:   { width: 80 },
  closeTxt:   { color: '#888', fontSize: 15 },
  topTitle:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll:     { padding: 20, paddingBottom: 16 },
  typeRow:    { flexDirection: 'row', gap: 12, marginBottom: 28 },
  typeBtn: {
    flex: 1, height: 52, borderRadius: 16, alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#1e1e1e',
  },
  typeBtnGreen:   { backgroundColor: '#00C853' },
  typeBtnRed:     { backgroundColor: '#F44336' },
  typeTxt:        { color: '#555', fontSize: 17, fontWeight: '700' },
  typeTxtActive:  { color: '#fff' },
  label:          { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10 },
  amountBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e',
    borderRadius: 18, padding: 20, marginBottom: 28,
  },
  currencySign: { color: '#aaa', fontSize: 30, marginRight: 8, fontWeight: '300' },
  amountInput:  { flex: 1, color: '#fff', fontSize: 40, fontWeight: '800' },
  catGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  catBtn: {
    backgroundColor: '#1e1e1e', borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 12, alignItems: 'center', minWidth: 80,
  },
  catGreen:      { backgroundColor: '#0a3020', borderWidth: 2, borderColor: '#00C853' },
  catRed:        { backgroundColor: '#3d0a0a', borderWidth: 2, borderColor: '#F44336' },
  catIcon:       { fontSize: 26, marginBottom: 6 },
  catLabel:      { color: '#666', fontSize: 12, fontWeight: '600' },
  catLabelActive:{ color: '#fff' },
  noteInput: {
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16,
    color: '#fff', fontSize: 15, minHeight: 90, textAlignVertical: 'top',
  },
  saveWrap: {
    padding: 16, paddingBottom: 8,
    backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1,
  },
  saveBtn:     { borderRadius: 18, height: 62, alignItems: 'center', justifyContent: 'center' },
  saveBtnGreen:{ backgroundColor: '#00C853' },
  saveBtnRed:  { backgroundColor: '#F44336' },
  saveTxt:     { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },

  cashToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  cashToggleActive:      { borderColor: '#FFC107', backgroundColor: '#1a1500' },
  cashToggleIcon:        { fontSize: 22 },
  cashToggleText:        { flex: 1 },
  cashToggleTitle:       { color: '#888', fontSize: 15, fontWeight: '600' },
  cashToggleTitleActive: { color: '#FFC107' },
  cashToggleSub:         { color: '#555', fontSize: 11, marginTop: 2 },
  cashDot:               { width: 18, height: 18, borderRadius: 9, backgroundColor: '#333', borderWidth: 2, borderColor: '#555' },
  cashDotActive:         { backgroundColor: '#FFC107', borderColor: '#FFC107' },
  cashAlert: {
    backgroundColor: '#1a1200', borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#FFC10760',
  },
  cashAlertTxt: { color: '#FFC107', fontSize: 13, lineHeight: 20 },
});
