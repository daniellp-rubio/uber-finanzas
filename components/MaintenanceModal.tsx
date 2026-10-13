import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Pressable } from 'react-native';
import { addMaintenance, Vehicle } from '../src/db';
import { MAINTENANCE_KINDS, maintenanceLabel } from '../src/fleet';
import { todayString } from '../src/format';
import { C, T, S, R } from '../src/theme';
import { Icon, SwitchMark } from './ui';
import DateField from './DateField';
import SheetFrame, { ms, MoneyField, ChoiceTile } from './SheetFrame';

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
    <SheetFrame title="Mantenimiento" onClose={onClose} onSave={handleSave} saveLabel="Guardar mantenimiento">
      <Text style={ms.mVehicle}>{vehicle.name}</Text>

      <Text style={ms.mLabel}>¿Qué se le hizo?</Text>
      <View style={ms.mGrid}>
        {MAINTENANCE_KINDS.map(k => (
          <ChoiceTile key={k.id} icon={k.icon} label={k.label} selected={kind === k.id} tone="warn" onPress={() => setKind(k.id)} />
        ))}
      </View>

      <Text style={ms.mLabel}>Fecha</Text>
      <DateField value={date} onChange={setDate} />

      <Text style={ms.mLabel}>Kilometraje (lo que marca el tablero)</Text>
      <TextInput
        style={ms.mInput}
        value={km}
        onChangeText={t => setKm(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="Ej.: 45000"
        placeholderTextColor={C.textFaint}
      />

      <Text style={ms.mLabel}>¿Cuánto costó?</Text>
      <MoneyField raw={rawCost} onChange={setRawCost} label="Cuánto costó" />

      {cost > 0 && (
        <Pressable
          style={[s.toggle, asExpense && { backgroundColor: C.spendContainer }]}
          onPress={() => setExpense(v => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: asExpense }}
        >
          <Icon name="receipt-text-outline" size={24} color={asExpense ? C.spend : C.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={T.titleSm}>Anotarlo también como gasto</Text>
            <Text style={T.labelSm}>Sale en tus gastos como Mecánico, con la fecha del mantenimiento.</Text>
          </View>
          <SwitchMark on={asExpense} tone="spend" />
        </Pressable>
      )}

      <Text style={ms.mLabel}>Taller (opcional)</Text>
      <TextInput
        style={ms.mInput}
        value={shop}
        onChangeText={setShop}
        placeholder="Ej.: Concesionario Renault"
        placeholderTextColor={C.textFaint}
      />

      <Text style={ms.mLabel}>Nota (opcional)</Text>
      <TextInput
        style={[ms.mInput, s.note]}
        value={note}
        onChangeText={setNote}
        placeholder="Ej.: cambiaron pastillas delanteras"
        placeholderTextColor={C.textFaint}
        multiline
        numberOfLines={3}
      />
    </SheetFrame>
  );
}

const s = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.md, padding: S.md, minHeight: 64, marginBottom: S.xl },
  note:   { fontSize: 16, fontWeight: '400', minHeight: 88, textAlignVertical: 'top', paddingTop: S.md },
});
