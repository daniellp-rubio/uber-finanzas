import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { maskDMY, parseDMY, toDMY, formatLongDate } from '../src/format';

// Fecha escrita como DD/MM/AAAA (sin selector nativo: no obliga a sacar APK).
// Debajo repite la fecha en palabras para que se vea si quedó bien escrita.

interface Props {
  value:    string | null;                   // YYYY-MM-DD
  onChange: (date: string | null) => void;   // null mientras la fecha esté incompleta o no exista
}

export default function DateField({ value, onChange }: Props) {
  const [text, setText] = useState(value ? toDMY(value) : '');
  const parsed = parseDMY(text);

  const handleChange = (t: string) => {
    const masked = maskDMY(t);
    setText(masked);
    onChange(parseDMY(masked));
  };

  return (
    <View style={s.wrap}>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={handleChange}
        keyboardType="number-pad"
        placeholder="DD/MM/AAAA"
        placeholderTextColor="#444"
        maxLength={10}
      />
      <Text style={[s.echo, !parsed && text.length === 10 && s.echoBad]}>
        {parsed
          ? formatLongDate(parsed)
          : text.length === 10 ? 'Esa fecha no existe' : 'Ejemplo: 15/09/2027'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:     { marginBottom: 20 },
  input:    { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1 },
  echo:     { color: '#888', fontSize: 13, marginTop: 6, marginLeft: 4, textTransform: 'capitalize' },
  echoBad:  { color: '#F44336', textTransform: 'none' },
});
