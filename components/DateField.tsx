import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { maskDMY, parseDMY, toDMY, formatLongDate } from '../src/format';
import { C, T, S, R } from '../src/theme';

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
        placeholderTextColor={C.textFaint}
        maxLength={10}
        accessibilityLabel="Fecha, día mes y año"
      />
      <Text style={[s.echo, !parsed && text.length === 10 && { color: C.spend }]}>
        {parsed
          ? formatLongDate(parsed)
          : text.length === 10 ? 'Esa fecha no existe' : 'Ejemplo: 15/09/2027'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { marginBottom: S.xl },
  input: { ...T.title, fontVariant: ['tabular-nums'], letterSpacing: 1, backgroundColor: C.surfaceHigh, borderRadius: R.md, paddingHorizontal: S.lg, minHeight: 56 },
  echo:  { ...T.labelSm, marginTop: S.xs, marginLeft: S.xs },
});
