import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { addVehicle, updateVehicle, Vehicle, VehicleInput } from '../src/db';
import { ENERGY_TYPES, VEHICLE_PRESETS, EnergyType, energyCostPerKm } from '../src/fleet';
import { formatCurrency, todayString } from '../src/format';
import { C, T, S, R } from '../src/theme';
import SheetFrame, { ms, ChoiceTile } from './SheetFrame';

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
    <SheetFrame title={vehicle ? 'Editar carro' : 'Agregar carro'} onClose={onClose} onSave={handleSave}>
      <Text style={ms.mLabel}>Nombre</Text>
      <TextInput
        style={ms.mInput}
        value={name}
        onChangeText={setName}
        placeholder="Ej.: BYD Yuan Plus"
        placeholderTextColor={C.textFaint}
      />

      <Text style={ms.mLabel}>Placa (opcional)</Text>
      <TextInput
        style={ms.mInput}
        value={plate}
        onChangeText={t => setPlate(t.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
        placeholder="ABC123"
        placeholderTextColor={C.textFaint}
        autoCapitalize="characters"
      />

      <Text style={ms.mLabel}>¿Con qué anda?</Text>
      <View style={ms.mGrid}>
        {ENERGY_TYPES.map(t => (
          <ChoiceTile key={t.id} icon={t.icon} label={t.label} selected={energy === t.id} onPress={() => handleEnergy(t.id)} />
        ))}
      </View>

      {[
        ...fields,
        { label: 'Días de pico y placa por semana', val: pico,  set: setPico,  decimal: false },
        { label: 'Mantenimiento (pesos por km)',    val: maint, set: setMaint, decimal: false },
      ].map(row => (
        <View key={row.label} style={s.cfgRow}>
          <Text style={[T.body, { flex: 1 }]}>{row.label}</Text>
          <TextInput
            style={[ms.mSmallInput, { fontSize: 17 }]}
            value={row.val}
            onChangeText={t => row.set(row.decimal ? t.replace(/[^\d,.]/g, '') : t.replace(/\D/g, ''))}
            keyboardType={row.decimal ? 'decimal-pad' : 'number-pad'}
            accessibilityLabel={row.label}
          />
        </View>
      ))}

      {energy === 'electric' && (
        <Text style={ms.mHint}>Los eléctricos no tienen pico y placa en Medellín. Precio del kWh: el de tu recibo de EPM, o $1.680 si cargas en electrolinera rápida.</Text>
      )}

      {!vehicle && (
        <View style={s.cfgRow}>
          <Text style={[T.body, { flex: 1 }]}>Kilometraje actual (opcional)</Text>
          <TextInput
            style={[ms.mSmallInput, { fontSize: 17 }]}
            value={odometer}
            onChangeText={t => setOdo(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={C.textFaint}
            accessibilityLabel="Kilometraje actual"
          />
        </View>
      )}

      {costKm > 0 && (
        <View style={s.costBox}>
          <Text style={T.body}>{energy === 'electric' ? 'Carga' : 'Gasolina'} por km</Text>
          <Text style={T.amount}>{formatCurrency(costKm)}</Text>
        </View>
      )}
    </SheetFrame>
  );
}

const s = StyleSheet.create({
  cfgRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.md, marginBottom: S.md },
  costBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.md, padding: S.md, marginTop: S.sm },
});
