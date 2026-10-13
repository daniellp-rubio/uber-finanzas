import React, { useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import { addFixedExpense } from '../src/db';
import { C } from '../src/theme';
import SheetFrame, { ms, MoneyField, ChoiceTile } from './SheetFrame';

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

  const handleSave = () => {
    const trimName = name.trim();
    const amount   = Number(rawAmount);
    if (!trimName) { Alert.alert('Falta el nombre', 'Escribe qué gasto es (ej.: Arriendo).'); return; }
    if (!amount || amount <= 0) { Alert.alert('Falta el valor', 'Escribe cuánto pagas cada mes.'); return; }
    if (!category) { Alert.alert('Falta el tipo', 'Elige qué tipo de gasto es.'); return; }
    addFixedExpense(trimName, amount, category);
    onSaved();
  };

  return (
    <SheetFrame title="Gasto fijo del mes" onClose={onClose} onSave={handleSave}>
      <Text style={ms.mLabel}>¿Qué gasto es?</Text>
      <TextInput
        style={ms.mInput}
        value={name}
        onChangeText={setName}
        placeholder="Ej.: Arriendo, Servicios"
        placeholderTextColor={C.textFaint}
        autoFocus
      />

      <Text style={ms.mLabel}>Valor de cada mes</Text>
      <MoneyField raw={rawAmount} onChange={setRaw} label="Valor de cada mes" />

      <Text style={ms.mLabel}>Tipo</Text>
      <View style={ms.mGrid}>
        {CATEGORIES.map(cat => (
          <ChoiceTile key={cat.id} icon={cat.icon} label={cat.label} selected={category === cat.id} onPress={() => setCategory(cat.id)} />
        ))}
      </View>
    </SheetFrame>
  );
}
