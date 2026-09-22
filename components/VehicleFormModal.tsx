import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addVehicle, updateVehicle, Vehicle, VehicleInput } from '../src/db';
import { ENERGY_TYPES, VEHICLE_PRESETS, EnergyType, energyCostPerKm } from '../src/fleet';
import { formatCurrency, todayString } from '../src/format';

interface Props {
  vehicle?: Vehicle;          // si viene, se edita; si no, se crea
  onClose:  () => void;
  onSaved:  () => void;
}

// Números con decimales (17,5 kWh): acepta coma o punto
const toNum = (t: string) => Number(t.replace(',', '.'));
const numText = (n: number) => String(n).replace('.', ',');

export default function VehicleFormModal({ vehicle, onClose, onSaved }: Props) {
  const g = VEHICLE_PRESETS.gasoline;
  const e = VEHICLE_PRESETS.electric;

  const [name, setName]       = useState(vehicle?.name ?? '');
  const [plate, setPlate]     = useState(vehicle?.plate ?? '');
  const [energy, setEnergy]   = useState<EnergyType>(vehicle?.energy ?? 'gasoline');
  const [kmGal, setKmGal]     = useState(numText(vehicle?.km_per_gallon ?? g.kmPerGallon));
  const [gasPrice, setGas]    = useState(String(vehicle?.gas_price ?? g.gasPrice));
  const [kwh100, setKwh100]   = useState(numText(vehicle?.kwh_per_100km ?? e.kwhPer100km));
  const [kwhPrice, setKwhP]   = useState(String(vehicle?.kwh_price ?? e.kwhPrice));
  const [pico, setPico]       = useState(String(vehicle?.pico_placa_days ?? g.picoPlacaDays));
  const [maint, setMaint]     = useState(String(vehicle?.maint_cost_per_km ?? g.maintCostPerKm));
  const [odometer, setOdo]    = useState('');

  // Al cambiar el tipo en un carro nuevo, se ponen los valores típicos de ese tipo
  const handleEnergy = (t: EnergyType) => {
    setEnergy(t);
    if (!vehicle) {
      const p = VEHICLE_PRESETS[t];
      setPico(String(p.picoPlacaDays));
      setMaint(String(p.maintCostPerKm));
    }
  };

  const input: VehicleInput = {
    name:              name.trim(),
    plate:             plate.trim().toUpperCase() || null,
    energy,
    km_per_gallon:     toNum(kmGal),
    gas_price:         toNum(gasPrice),
    kwh_per_100km:     toNum(kwh100),
    kwh_price:         toNum(kwhPrice),
    pico_placa_days:   toNum(pico),
    maint_cost_per_km: toNum(maint),
  };
  const costKm = energyCostPerKm(input);

  const handleSave = () => {
    if (!input.name) {
      Alert.alert('Falta el nombre', 'Escribe el nombre del carro. Ej: BYD Yuan Plus');
      return;
    }
    const energyOk = energy === 'electric'
      ? input.kwh_per_100km > 0 && input.kwh_price > 0
      : input.km_per_gallon > 0 && input.gas_price > 0;
    const picoOk  = Number.isFinite(input.pico_placa_days) && input.pico_placa_days >= 0 && input.pico_placa_days <= 7;
    const maintOk = Number.isFinite(input.maint_cost_per_km) && input.maint_cost_per_km >= 0;
    if (!energyOk || !picoOk || !maintOk) {
      Alert.alert('Revisa los números', 'Hay un valor vacío o que no tiene sentido.');
      return;
    }
    if (vehicle) {
      updateVehicle(vehicle.id, input);
    } else {
      const km = Number(odometer);
      addVehicle(input, odometer && km > 0 ? km : null, todayString());
    }
    onSaved();
  };

  const fields = energy === 'electric'
    ? [
        { label: 'Consumo (kWh cada 100 km)', val: kwh100,   set: setKwh100, decimal: true },
        { label: 'Precio del kWh (COP)',      val: kwhPrice, set: setKwhP,   decimal: false },
      ]
    : [
        { label: 'Rendimiento (km por galón)', val: kmGal,    set: setKmGal, decimal: true },
        { label: 'Precio del galón (COP)',     val: gasPrice, set: setGas,   decimal: false },
      ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>{vehicle ? 'Editar carro' : 'Agregar carro'}</Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>NOMBRE</Text>
          <TextInput
            style={s.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Ej: BYD Yuan Plus"
            placeholderTextColor="#444"
          />

          <Text style={s.label}>PLACA (opcional)</Text>
          <TextInput
            style={s.textInput}
            value={plate}
            onChangeText={t => setPlate(t.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC123"
            placeholderTextColor="#444"
            autoCapitalize="characters"
          />

          <Text style={s.label}>¿CON QUÉ ANDA?</Text>
          <View style={s.typeRow}>
            {ENERGY_TYPES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[s.typeBtn, energy === t.id && s.typeBtnOn]}
                onPress={() => handleEnergy(t.id)}
              >
                <Text style={s.typeIcon}>{t.icon}</Text>
                <Text style={[s.typeTxt, energy === t.id && s.typeTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {[
            ...fields,
            { label: 'Días de pico y placa por semana', val: pico,  set: setPico,  decimal: false },
            { label: 'Mantenimiento (COP por km)',      val: maint, set: setMaint, decimal: false },
          ].map(row => (
            <View key={row.label} style={s.cfgRow}>
              <Text style={s.cfgLabel}>{row.label}</Text>
              <TextInput
                style={s.cfgInput}
                value={row.val}
                onChangeText={t => row.set(row.decimal ? t.replace(/[^\d,.]/g, '') : t.replace(/\D/g, ''))}
                keyboardType={row.decimal ? 'decimal-pad' : 'number-pad'}
              />
            </View>
          ))}

          {energy === 'electric' && (
            <Text style={s.hint}>Los eléctricos no tienen pico y placa en Medellín. Precio del kWh: el de tu recibo de EPM, o $1.680 si cargas en electrolinera rápida.</Text>
          )}

          {!vehicle && (
            <View style={s.cfgRow}>
              <Text style={s.cfgLabel}>Kilometraje actual (opcional)</Text>
              <TextInput
                style={s.cfgInput}
                value={odometer}
                onChangeText={t => setOdo(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#444"
              />
            </View>
          )}

          {costKm > 0 && (
            <View style={s.costBox}>
              <Text style={s.costLabel}>{energy === 'electric' ? 'Carga' : 'Gasolina'} por km</Text>
              <Text style={s.costVal}>{formatCurrency(costKm)}</Text>
            </View>
          )}
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
  container:  { flex: 1, backgroundColor: '#121212' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  closeBtn:   { width: 80 },
  closeTxt:   { color: '#888', fontSize: 15 },
  topTitle:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll:     { padding: 20, paddingBottom: 16 },
  label:      { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10 },
  textInput:  { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, color: '#fff', fontSize: 17, marginBottom: 22 },
  typeRow:    { flexDirection: 'row', gap: 12, marginBottom: 24 },
  typeBtn:    { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  typeBtnOn:  { backgroundColor: '#0a3020', borderWidth: 2, borderColor: '#00C853' },
  typeIcon:   { fontSize: 26, marginBottom: 6 },
  typeTxt:    { color: '#666', fontSize: 14, fontWeight: '700' },
  typeTxtOn:  { color: '#fff' },
  cfgRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cfgLabel:   { color: '#aaa', fontSize: 14, flex: 1 },
  cfgInput:   { backgroundColor: '#262626', borderRadius: 10, padding: 10, color: '#fff', fontSize: 16, fontWeight: '700', width: 110, textAlign: 'center' },
  hint:       { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  costBox:    { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginTop: 6 },
  costLabel:  { color: '#aaa', fontSize: 14 },
  costVal:    { color: '#FFC107', fontSize: 16, fontWeight: '800' },
  saveWrap: {
    padding: 16, paddingBottom: 8,
    backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1,
  },
  saveBtn:    { borderRadius: 18, height: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00C853' },
  saveTxt:    { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
});
