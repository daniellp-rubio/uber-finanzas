import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDebt } from '../src/db';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function AddDebtModal({ onClose, onSaved }: Props) {
  const [name, setName]       = useState('');
  const [rawPayment, setRaw]  = useState('');
  const [months, setMonths]   = useState('');

  const displayPayment = rawPayment
    ? Number(rawPayment).toLocaleString('es-CO')
    : '';

  const handleSave = () => {
    const trimName = name.trim();
    const payment  = Number(rawPayment);
    if (!trimName) { Alert.alert('Error', 'Escribe el nombre de la deuda'); return; }
    if (!payment || payment <= 0) { Alert.alert('Error', 'Ingresa una cuota mensual válida'); return; }
    const monthsNum = months.trim() ? parseInt(months.trim(), 10) : null;
    if (months.trim() && (isNaN(monthsNum!) || monthsNum! < 1)) {
      Alert.alert('Error', 'Los meses restantes deben ser un número mayor a 0');
      return;
    }
    addDebt(trimName, payment, monthsNum);
    onSaved();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.cancelTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Agregar deuda</Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>NOMBRE DE LA DEUDA</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: GPU, Moto, Tarjeta..."
            placeholderTextColor="#444"
            autoFocus
          />

          <Text style={s.label}>CUOTA MENSUAL</Text>
          <View style={s.amountBox}>
            <Text style={s.currSign}>$</Text>
            <TextInput
              style={s.amountInput}
              value={displayPayment}
              onChangeText={t => setRaw(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#333"
            />
          </View>

          <Text style={s.label}>MESES RESTANTES (opcional)</Text>
          <View style={s.rowBox}>
            <TextInput
              style={s.monthsInput}
              value={months}
              onChangeText={setMonths}
              keyboardType="number-pad"
              placeholder="Ej: 12"
              placeholderTextColor="#444"
            />
            <Text style={s.monthsLabel}>meses</Text>
          </View>
          <Text style={s.hint}>Si no sabes cuántos meses quedan, déjalo vacío.</Text>
        </ScrollView>

        <View style={s.saveWrap}>
          <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
            <Text style={s.saveTxt}>GUARDAR DEUDA</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#121212' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  cancelTxt:   { color: '#888', fontSize: 15, width: 80 },
  topTitle:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll:      { padding: 20, paddingBottom: 16 },
  label:       { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10, marginTop: 4 },
  input: {
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16,
    color: '#fff', fontSize: 18, marginBottom: 24,
  },
  amountBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e',
    borderRadius: 14, padding: 16, marginBottom: 24,
  },
  currSign:    { color: '#aaa', fontSize: 28, marginRight: 8 },
  amountInput: { flex: 1, color: '#fff', fontSize: 32, fontWeight: '700' },
  rowBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, marginBottom: 8,
  },
  monthsInput: { flex: 1, color: '#fff', fontSize: 24, fontWeight: '700' },
  monthsLabel: { color: '#888', fontSize: 16 },
  hint:        { color: '#444', fontSize: 12, marginBottom: 16 },
  saveWrap: {
    padding: 16, paddingBottom: 8,
    backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1,
  },
  saveBtn:  { backgroundColor: '#F44336', borderRadius: 18, height: 60, alignItems: 'center', justifyContent: 'center' },
  saveTxt:  { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
});
