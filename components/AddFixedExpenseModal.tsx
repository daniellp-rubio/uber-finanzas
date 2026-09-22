import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addFixedExpense } from '../src/db';

const CATEGORIES = [
  { id: 'rent',      label: 'Arriendo',   icon: '🏠' },
  { id: 'utilities', label: 'Servicios',  icon: '💡' },
  { id: 'internet',  label: 'Internet',   icon: '🌐' },
  { id: 'phone',     label: 'Celular',    icon: '📱' },
  { id: 'market',    label: 'Mercado',    icon: '🛒' },
  { id: 'transport', label: 'Transporte', icon: '🚌' },
  { id: 'health',    label: 'Salud',      icon: '🏥' },
  { id: 'other',     label: 'Otro',       icon: '📦' },
];

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function AddFixedExpenseModal({ onClose, onSaved }: Props) {
  const [name, setName]         = useState('');
  const [rawAmount, setRaw]     = useState('');
  const [category, setCategory] = useState('');

  const displayAmount = rawAmount
    ? Number(rawAmount).toLocaleString('es-CO')
    : '';

  const handleSave = () => {
    const trimName = name.trim();
    const amount   = Number(rawAmount);
    if (!trimName) { Alert.alert('Error', 'Escribe el nombre del gasto'); return; }
    if (!amount || amount <= 0) { Alert.alert('Error', 'Ingresa un monto válido'); return; }
    if (!category) { Alert.alert('Error', 'Selecciona una categoría'); return; }
    addFixedExpense(trimName, amount, category);
    onSaved();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.cancelTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Gasto fijo mensual</Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>NOMBRE</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Arriendo, Servicios..."
            placeholderTextColor="#444"
            autoFocus
          />

          <Text style={s.label}>MONTO MENSUAL</Text>
          <View style={s.amountBox}>
            <Text style={s.currSign}>$</Text>
            <TextInput
              style={s.amountInput}
              value={displayAmount}
              onChangeText={t => setRaw(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#333"
            />
          </View>

          <Text style={s.label}>CATEGORÍA</Text>
          <View style={s.catGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[s.catBtn, category === cat.id && s.catActive]}
                onPress={() => setCategory(cat.id)}
              >
                <Text style={s.catIcon}>{cat.icon}</Text>
                <Text style={[s.catLabel, category === cat.id && s.catLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={s.saveWrap}>
          <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
            <Text style={s.saveTxt}>GUARDAR</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#121212' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  cancelTxt:    { color: '#888', fontSize: 15, width: 80 },
  topTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll:       { padding: 20, paddingBottom: 16 },
  label:        { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10, marginTop: 4 },
  input: {
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16,
    color: '#fff', fontSize: 18, marginBottom: 24,
  },
  amountBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e',
    borderRadius: 14, padding: 16, marginBottom: 24,
  },
  currSign:     { color: '#aaa', fontSize: 28, marginRight: 8 },
  amountInput:  { flex: 1, color: '#fff', fontSize: 32, fontWeight: '700' },
  catGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catBtn: {
    backgroundColor: '#1e1e1e', borderRadius: 14, paddingVertical: 12,
    paddingHorizontal: 12, alignItems: 'center', minWidth: 80,
  },
  catActive:      { backgroundColor: '#0a2e1a', borderWidth: 2, borderColor: '#00C853' },
  catIcon:        { fontSize: 24, marginBottom: 4 },
  catLabel:       { color: '#666', fontSize: 12, fontWeight: '600' },
  catLabelActive: { color: '#fff' },
  saveWrap: {
    padding: 16, paddingBottom: 8,
    backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1,
  },
  saveBtn:  { backgroundColor: '#00C853', borderRadius: 18, height: 60, alignItems: 'center', justifyContent: 'center' },
  saveTxt:  { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
});
