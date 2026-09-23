import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { getSetting, setSetting } from '../src/db';
import { lastBackupDate } from '../src/backupData';
import { shareBackup, pickBackup, restoreWithSafetyCopy } from '../src/backup';
import { buildIncomeReport, incomeReportHtml } from '../src/incomeReport';
import { sharePdf } from '../src/pdf';
import { refreshBackupReminder, refreshVehicleReminders } from '../src/notifications';
import { daysBetween, formatDate, formatMonth, todayString } from '../src/format';
import SheetFrame, { ms } from './SheetFrame';

const OWNER_NAME_KEY = 'owner_name';
const OWNER_ID_KEY   = 'owner_id';

interface Props {
  onRestored: () => void;   // recargar la pantalla después de recuperar una copia
}

// Copia de seguridad, recuperar una copia y resumen de ingresos en PDF
export default function MyDataSection({ onRestored }: Props) {
  const [last, setLast]         = useState(lastBackupDate());
  const [busy, setBusy]         = useState(false);
  const [showPdf, setShowPdf]   = useState(false);

  const today = todayString();
  const daysSince = last ? daysBetween(last, today) : null;
  const overdue = daysSince === null || daysSince > 7;

  const handleBackup = async () => {
    setBusy(true);
    try {
      const ok = await shareBackup();
      if (!ok) { Alert.alert('No se pudo', 'Este celular no deja compartir archivos.'); return; }
      setLast(lastBackupDate());
      refreshBackupReminder().catch(() => {});
    } catch {
      Alert.alert('No se pudo', 'No se pudo crear la copia. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    let check;
    try {
      check = await pickBackup();
    } catch {
      Alert.alert('No se pudo', 'No se pudo abrir ese archivo.');
      return;
    }
    if (!check) return;  // canceló
    if (check.error || !check.backup) { Alert.alert('No se puede usar', check.error ?? 'Archivo no válido.'); return; }
    const backup = check.backup;
    Alert.alert(
      'Recuperar copia',
      `Copia del ${formatDate(backup.created_at.slice(0, 10))} con ${check.movements} movimientos.\n\n` +
      'Esto REEMPLAZA todo lo que hay ahora en este celular por lo de la copia.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, reemplazar', style: 'destructive', onPress: () => {
          try {
            restoreWithSafetyCopy(check);
          } catch {
            Alert.alert('No se pudo', 'No se cambió nada. Intenta de nuevo.');
            return;
          }
          setLast(lastBackupDate());
          refreshVehicleReminders().catch(() => {});
          refreshBackupReminder().catch(() => {});
          onRestored();
          Alert.alert('Listo', 'Tus datos quedaron como en la copia.');
        }},
      ],
    );
  };

  return (
    <View style={s.section}>
      <Text style={s.title}>📁 MIS DATOS</Text>

      <TouchableOpacity style={[s.bigBtn, overdue && s.bigBtnWarn]} onPress={handleBackup} disabled={busy} activeOpacity={0.8}>
        <Text style={[s.bigTitle, overdue && { color: '#FFC107' }]}>💾 Guardar copia de seguridad</Text>
        <Text style={s.bigSub}>
          {last
            ? `Última copia: ${daysSince === 0 ? 'hoy' : daysSince === 1 ? 'ayer' : `hace ${daysSince} días`}`
            : 'Nunca has guardado una copia'}
          {' · '}Mándala a tu WhatsApp o a Drive
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.bigBtn} onPress={() => setShowPdf(true)} activeOpacity={0.8}>
        <Text style={s.bigTitle}>📄 Resumen de ingresos (PDF)</Text>
        <Text style={s.bigSub}>Promedio de 3 o 6 meses, para el banco</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleRestore} style={s.linkBtn}>
        <Text style={s.linkTxt}>Recuperar una copia (celular nuevo)</Text>
      </TouchableOpacity>

      <Modal visible={showPdf} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPdf(false)}>
        <IncomePdfModal onClose={() => setShowPdf(false)} />
      </Modal>
    </View>
  );
}

// ─── Resumen de ingresos: nombre, cédula y cuántos meses ──────────────────────

function IncomePdfModal({ onClose }: { onClose: () => void }) {
  const [name, setName]     = useState(getSetting(OWNER_NAME_KEY, ''));
  const [id, setId]         = useState(getSetting(OWNER_ID_KEY, ''));
  const [months, setMonths] = useState<3 | 6>(3);
  const [busy, setBusy]     = useState(false);

  const today = todayString();
  const report = buildIncomeReport(months, today);

  const handleShare = async () => {
    if (!report) return;
    if (!name.trim()) { Alert.alert('Falta el nombre', 'Escribe tu nombre como sale en la cédula.'); return; }
    setSetting(OWNER_NAME_KEY, name.trim());
    setSetting(OWNER_ID_KEY, id.trim());
    setBusy(true);
    try {
      const ok = await sharePdf(incomeReportHtml(report, { name: name.trim(), id: id.trim() }, today), 'Resumen de ingresos');
      if (!ok) Alert.alert('No se pudo', 'Este celular no deja compartir archivos.');
      else onClose();
    } catch {
      Alert.alert('No se pudo', 'No se pudo crear el PDF. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetFrame title="Resumen de ingresos" onClose={onClose} onSave={handleShare} saveLabel={busy ? 'CREANDO…' : 'CREAR PDF'}>
      <Text style={ms.mLabel}>NOMBRE COMPLETO</Text>
      <TextInput style={ms.mInput} value={name} onChangeText={setName} placeholder="Como sale en la cédula" placeholderTextColor="#444" />
      <Text style={ms.mLabel}>CÉDULA (opcional)</Text>
      <TextInput
        style={ms.mInput} value={id} onChangeText={t => setId(t.replace(/\D/g, ''))}
        keyboardType="number-pad" placeholder="Solo números" placeholderTextColor="#444"
      />

      <Text style={ms.mLabel}>¿CUÁNTOS MESES?</Text>
      <View style={ms.mGrid}>
        {([3, 6] as const).map(m => (
          <TouchableOpacity key={m} style={[ms.mChip, months === m && ms.mChipOn]} onPress={() => setMonths(m)}>
            <Text style={[ms.mChipTxt, months === m && ms.mChipTxtOn]}>Últimos {m} meses</Text>
          </TouchableOpacity>
        ))}
      </View>

      {report ? (
        <View style={s.preview}>
          <Text style={s.previewTxt}>
            {report.rows.length < months
              ? `Solo hay registros desde ${formatMonth(report.rows[0].month)}: salen ${report.rows.length} ${report.rows.length === 1 ? 'mes' : 'meses'}.`
              : `De ${formatMonth(report.rows[0].month)} a ${formatMonth(report.rows[report.rows.length - 1].month)}.`}
          </Text>
          <Text style={s.previewTxt}>El mes actual no sale porque no ha terminado.</Text>
        </View>
      ) : (
        <Text style={s.previewTxt}>No hay registros en esos meses. El mes actual no cuenta porque no ha terminado.</Text>
      )}
      <Text style={ms.mHint}>
        {'\n'}Es un resumen hecho por ti con tus registros; no es un certificado de contador. Si el banco pide certificado, este resumen le sirve de soporte al contador.
      </Text>
    </SheetFrame>
  );
}

const s = StyleSheet.create({
  section:    { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  title:      { color: '#888', fontSize: 12, letterSpacing: 1, fontWeight: '600', marginBottom: 12 },
  bigBtn:     { backgroundColor: '#222', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  bigBtnWarn: { backgroundColor: '#1a1500', borderColor: '#FFC107' },
  bigTitle:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  bigSub:     { color: '#888', fontSize: 12, marginTop: 3 },
  linkBtn:    { paddingVertical: 10, alignItems: 'center' },
  linkTxt:    { color: '#888', fontSize: 13, textDecorationLine: 'underline' },
  preview:    { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 12 },
  previewTxt: { color: '#aaa', fontSize: 13, lineHeight: 19 },
});
