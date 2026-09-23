import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addMaintenance, Vehicle } from '../src/db';
import { MAINTENANCE_KINDS, maintenanceLabel } from '../src/fleet';
import { todayString } from '../src/format';
import DateField from './DateField';

interface Props {
  vehicle:      Vehicle;
  initialKind?: string;       // viene elegido si se abrió desde un recordatorio
  onClose:      () => void;
  onSaved:      () => void;
}

export default function MaintenanceModal({ vehicle, initialKind, onClose, onSaved }: Props) {
  const [kind, setKind]         = useState(initialKind ?? '');
  const [date, setDate]         = useState<string | null>(todayString());
  const [km, setKm]             = useState(vehicle.odometer_km ? String(Math.round(vehicle.odometer_km)) : '');
  const [rawCost, setRawCost]   = useState('');
  const [shop, setShop]         = useState('');
  const [note, setNote]         = useState('');
  const [asExpense, setExpense] = useState(true);

  const cost = Number(rawCost);

  const handleSave = () => {
    if (!kind) {
      Alert.alert('Falta el tipo', 'Toca qué se le hizo al carro.');
      return;
    }
    if (!date) {
      Alert.alert('Revisa la fecha', 'Escríbela completa: día/mes/año.');
      return;
    }
    if (date > todayString()) {
      Alert.alert('Revisa la fecha', 'La fecha no puede ser después de hoy.');
      return;
    }
    const kmNum = Number(km);
    addMaintenance(
      {
        vehicle_id: vehicle.id,
        kind,
        date,
        km:   km && kmNum > 0 ? kmNum : null,
        cost: cost > 0 ? cost : 0,
        shop: shop.trim() || null,
        note: note.trim() || null,
      },
      asExpense ? `${maintenanceLabel(kind)} · ${vehicle.name}` : null,
    );
    onSaved();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Mantenimiento</Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.vehicleName}>{vehicle.name}</Text>

          <Text style={s.label}>¿QUÉ SE LE HIZO?</Text>
          <View style={s.catGrid}>
            {MAINTENANCE_KINDS.map(k => (
              <TouchableOpacity
                key={k.id}
                style={[s.catBtn, kind === k.id && s.catOn]}
                onPress={() => setKind(k.id)}
              >
                <Text style={s.catIcon}>{k.icon}</Text>
                <Text style={[s.catLabel, kind === k.id && s.catLabelOn]}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>FECHA</Text>
          <DateField value={date} onChange={setDate} />

          <Text style={s.label}>KILOMETRAJE (lo que marca el tablero)</Text>
          <TextInput
            style={s.textInput}
            value={km}
            onChangeText={t => setKm(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="Ej: 45000"
            placeholderTextColor="#444"
          />

          <Text style={s.label}>¿CUÁNTO COSTÓ?</Text>
          <View style={s.amountBox}>
            <Text style={s.currencySign}>$</Text>
            <TextInput
              style={s.amountInput}
              value={rawCost ? Number(rawCost).toLocaleString('es-CO') : ''}
              onChangeText={t => setRawCost(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#333"
            />
          </View>

          {cost > 0 && (
            <TouchableOpacity
              style={[s.toggle, asExpense && s.toggleOn]}
              onPress={() => setExpense(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={s.toggleIcon}>🔧</Text>
              <View style={s.toggleText}>
                <Text style={[s.toggleTitle, asExpense && s.toggleTitleOn]}>Anotarlo también como gasto</Text>
                <Text style={s.toggleSub}>Sale en tus gastos como Mecánico, con la fecha del mantenimiento.</Text>
              </View>
              <View style={[s.dot, asExpense && s.dotOn]} />
            </TouchableOpacity>
          )}

          <Text style={s.label}>TALLER (opcional)</Text>
          <TextInput
            style={s.textInput}
            value={shop}
            onChangeText={setShop}
            placeholder="Ej: Concesionario Renault"
            placeholderTextColor="#444"
          />

          <Text style={s.label}>NOTA (opcional)</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ej: cambiaron pastillas delanteras"
            placeholderTextColor="#444"
            multiline
            numberOfLines={3}
          />
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
  closeBtn:     { width: 80 },
  closeTxt:     { color: '#888', fontSize: 15 },
  topTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll:       { padding: 20, paddingBottom: 16 },
  vehicleName:  { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 20 },
  label:        { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10 },
  catGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  catBtn:       { backgroundColor: '#1e1e1e', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', width: '31%' },
  catOn:        { backgroundColor: '#2a1f00', borderWidth: 2, borderColor: '#FFC107' },
  catIcon:      { fontSize: 24, marginBottom: 6 },
  catLabel:     { color: '#666', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  catLabelOn:   { color: '#fff' },
  textInput:    { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, color: '#fff', fontSize: 17, marginBottom: 22 },
  amountBox:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 18, padding: 16, marginBottom: 14 },
  currencySign: { color: '#aaa', fontSize: 26, marginRight: 8, fontWeight: '300' },
  amountInput:  { flex: 1, color: '#fff', fontSize: 32, fontWeight: '800' },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 14, marginBottom: 22,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  toggleOn:      { borderColor: '#F44336', backgroundColor: '#2e0a0a' },
  toggleIcon:    { fontSize: 22 },
  toggleText:    { flex: 1 },
  toggleTitle:   { color: '#888', fontSize: 15, fontWeight: '600' },
  toggleTitleOn: { color: '#fff' },
  toggleSub:     { color: '#666', fontSize: 11, marginTop: 2, lineHeight: 16 },
  dot:           { width: 18, height: 18, borderRadius: 9, backgroundColor: '#333', borderWidth: 2, borderColor: '#555' },
  dotOn:         { backgroundColor: '#F44336', borderColor: '#F44336' },
  noteInput: {
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16,
    color: '#fff', fontSize: 15, minHeight: 90, textAlignVertical: 'top',
  },
  saveWrap: {
    padding: 16, paddingBottom: 8,
    backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1,
  },
  saveBtn:      { borderRadius: 18, height: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00C853' },
  saveTxt:      { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
});
