import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Marco común de los modales pequeños (Carros y arriendo): barra superior, contenido con scroll y botón grande abajo.
// `ms` son los estilos compartidos del contenido.

interface Props {
  title:      string;
  onClose:    () => void;
  onSave:     () => void;
  saveLabel?: string;
  children:   React.ReactNode;
}

export default function SheetFrame({ title, onClose, onSave, saveLabel = 'GUARDAR', children }: Props) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={fs.container}>
        <View style={fs.topBar}>
          <TouchableOpacity onPress={onClose} style={fs.closeBtn}>
            <Text style={fs.closeTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={fs.topTitle}>{title}</Text>
          <View style={{ width: 80 }} />
        </View>
        <ScrollView contentContainerStyle={fs.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={fs.saveWrap}>
          <TouchableOpacity style={fs.saveBtn} onPress={onSave}>
            <Text style={fs.saveTxt}>{saveLabel}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const fs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  closeBtn:  { width: 80 },
  closeTxt:  { color: '#888', fontSize: 15 },
  topTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll:    { padding: 20, paddingBottom: 16 },
  saveWrap: {
    padding: 16, paddingBottom: 8,
    backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1,
  },
  saveBtn:   { borderRadius: 18, height: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00C853' },
  saveTxt:   { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
});

export const ms = StyleSheet.create({
  mVehicle:    { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 20 },
  mKind:       { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 20 },
  mLabel:      { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10 },
  mHint:       { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 22, marginTop: -8 },
  mInput:      { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 14 },
  mBigInput:   { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 18, color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 14 },
  mGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  mChip:       { backgroundColor: '#1e1e1e', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  mChipOn:     { backgroundColor: '#2a1f00', borderWidth: 2, borderColor: '#FFC107' },
  mChipTxt:    { color: '#888', fontSize: 13, fontWeight: '600' },
  mChipTxtOn:  { color: '#fff' },
  mRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  mRowLabel:   { color: '#aaa', fontSize: 16, width: 60 },
  mSmallInput: { backgroundColor: '#262626', borderRadius: 10, padding: 12, color: '#fff', fontSize: 18, fontWeight: '700', width: 120, textAlign: 'center' },
  deleteTxt:   { color: '#F44336', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 14 },
});
