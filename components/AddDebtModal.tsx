import React, { useState } from 'react';
import { Text, TextInput, Alert } from 'react-native';
import { addDebt } from '../src/db';
import { C } from '../src/theme';
import SheetFrame, { ms, MoneyField } from './SheetFrame';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function AddDebtModal({ onClose, onSaved }: Props) {
  const [name, setName]      = useState('');
  const [rawPayment, setRaw] = useState('');
  const [months, setMonths]  = useState('');

  const handleSave = () => {
    const trimName = name.trim();
    const payment  = Number(rawPayment);
    if (!trimName) { Alert.alert('Falta el nombre', 'Escribe de qué es la deuda (ej.: Moto, Tarjeta).'); return; }
    if (!payment || payment <= 0) { Alert.alert('Falta la cuota', 'Escribe cuánto pagas cada mes.'); return; }
    const monthsNum = months.trim() ? parseInt(months.trim(), 10) : null;
    if (months.trim() && (isNaN(monthsNum!) || monthsNum! < 1)) {
      Alert.alert('Revisa los meses', 'Escribe cuántas cuotas faltan (1 o más), o déjalo vacío.');
      return;
    }
    addDebt(trimName, payment, monthsNum);
    onSaved();
  };

  return (
    <SheetFrame title="Agregar deuda" onClose={onClose} onSave={handleSave} saveLabel="Guardar deuda">
      <Text style={ms.mLabel}>¿De qué es?</Text>
      <TextInput
        style={ms.mInput}
        value={name}
        onChangeText={setName}
        placeholder="Ej.: Moto, Tarjeta, Préstamo"
        placeholderTextColor={C.textFaint}
        autoFocus
      />

      <Text style={ms.mLabel}>Cuota de cada mes</Text>
      <MoneyField raw={rawPayment} onChange={setRaw} label="Cuota de cada mes" />

      <Text style={ms.mLabel}>¿Cuántas cuotas faltan? (opcional)</Text>
      <TextInput
        style={ms.mInput}
        value={months}
        onChangeText={t => setMonths(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="Ej.: 12"
        placeholderTextColor={C.textFaint}
      />
      <Text style={ms.mHint}>Si no sabes cuántas quedan, déjalo vacío.</Text>
    </SheetFrame>
  );
}
