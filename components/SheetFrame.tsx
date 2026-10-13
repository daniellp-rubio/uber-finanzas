import React from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, T, S, R, TOUCH } from '../src/theme';
import { Button, IconButton, Tone } from './ui';

// Marco común de los formularios: barra superior con cerrar, contenido con scroll y botón grande abajo.
// `ms` son los estilos compartidos del contenido; MoneyField y ChoiceTile, piezas de formulario.

interface Props {
  title:      string;
  onClose:    () => void;
  onSave:     () => void;
  saveLabel?: string;
  saveTone?:  Tone;
  children:   React.ReactNode;
}

export default function SheetFrame({ title, onClose, onSave, saveLabel = 'Guardar', saveTone = 'money', children }: Props) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={fs.container}>
        <View style={fs.topBar}>
          <IconButton name="close" label="Cancelar" color={C.text} onPress={onClose} />
          <Text style={[T.title, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
        </View>
        <ScrollView contentContainerStyle={fs.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={fs.saveWrap}>
          <Button label={saveLabel} tone={saveTone} big onPress={onSave} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// Monto en pesos con puntos de miles mientras se escribe; `raw` son solo dígitos
export function MoneyField({ raw, onChange, autoFocus, label }: {
  raw: string; onChange: (digits: string) => void; autoFocus?: boolean; label: string;
}) {
  return (
    <View style={ms.mMoney}>
      <Text style={[T.headline, { color: C.textMuted }]}>$</Text>
      <TextInput
        style={[T.headline, { flex: 1, paddingVertical: 0 }]}
        value={raw ? Number(raw).toLocaleString('es-CO') : ''}
        onChangeText={t => onChange(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={C.textFaint}
        autoFocus={autoFocus}
        accessibilityLabel={label}
      />
    </View>
  );
}

// Opción con ícono para grillas de categorías (3 por fila)
export function ChoiceTile({ icon, label, selected, onPress, tone = 'primary' }: {
  icon: string; label: string; selected: boolean; onPress: () => void; tone?: Tone;
}) {
  const fg = tone === 'money' ? C.money : tone === 'spend' ? C.spend : tone === 'warn' ? C.warn : C.primary;
  const bg = tone === 'money' ? C.moneyContainer : tone === 'spend' ? C.spendContainer : tone === 'warn' ? C.warnContainer : C.primaryContainer;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[ms.mTile, selected && { backgroundColor: bg, borderColor: fg }]}
    >
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={[T.labelSm, { textAlign: 'center' }, selected && { color: C.text, fontWeight: '700' }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const fs = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  topBar:    { flexDirection: 'row', alignItems: 'center', gap: S.xs, paddingHorizontal: S.xs, minHeight: 64 },
  scroll:    { paddingHorizontal: S.xl, paddingTop: S.sm, paddingBottom: S.lg },
  saveWrap:  { paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.bg },
});

const input = { ...T.title, backgroundColor: C.surfaceHigh, borderRadius: R.md, paddingHorizontal: S.lg, minHeight: 56 } as const;

export const ms = StyleSheet.create({
  mVehicle:    { ...T.headline, marginBottom: S.lg },
  mKind:       { ...T.title, marginBottom: S.lg },
  mLabel:      { ...T.label, marginBottom: S.sm },
  mHint:       { ...T.labelSm, color: C.textFaint, marginBottom: S.xl, marginTop: -S.sm },
  mInput:      { ...input, fontSize: 18, fontWeight: '600', marginBottom: S.lg },
  mBigInput:   { ...input, ...T.headline, minHeight: 64, marginBottom: S.lg },
  mMoney:      { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.surfaceHigh, borderRadius: R.md, paddingHorizontal: S.lg, minHeight: 64, marginBottom: S.lg },
  mGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.xl },
  mTile:       { width: '31%', minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: S.xs, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.outline, padding: S.sm },
  mChip:       { minHeight: 40, justifyContent: 'center', borderRadius: R.sm, borderWidth: 1, borderColor: C.outline, paddingHorizontal: S.md },
  mChipOn:     { backgroundColor: C.primaryContainer, borderColor: C.primary },
  mChipTxt:    { ...T.label, color: C.textMuted },
  mChipTxtOn:  { color: C.text },
  mRow:        { flexDirection: 'row', alignItems: 'center', gap: S.md, marginBottom: S.md },
  mRowLabel:   { ...T.body, color: C.textMuted, width: 64 },
  mSmallInput: { ...input, width: 120, textAlign: 'center' },
  deleteTxt:   { ...T.label, color: C.spend, textAlign: 'center', paddingVertical: S.md, minHeight: TOUCH },
});
