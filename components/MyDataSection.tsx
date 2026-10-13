import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Modal } from 'react-native';
import { getSetting, setSetting } from '../src/db';
import { lastBackupDate } from '../src/backupData';
import { shareBackup, pickBackup, restoreWithSafetyCopy } from '../src/backup';
import { buildIncomeReport, incomeReportHtml } from '../src/incomeReport';
import { sharePdf } from '../src/pdf';
import { refreshBackupReminder, refreshVehicleReminders } from '../src/notifications';
import { daysBetween, formatDate, formatMonth, todayString } from '../src/format';
import SheetFrame, { ms } from './SheetFrame';
import { C, T, S, R } from '../src/theme';
import { Chip, Row, Section } from './ui';

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
    <Section title="Mis datos">
      <Row
        icon="content-save-outline"
        tone={overdue ? 'warn' : 'neutral'}
        title="Guardar copia de seguridad"
        subtitle={`${last
          ? `Última copia: ${daysSince === 0 ? 'hoy' : daysSince === 1 ? 'ayer' : `hace ${daysSince} días`}`
          : 'Nunca has guardado una copia'} · mándala a tu WhatsApp o a Drive`}
        onPress={busy ? undefined : handleBackup}
      />
      <Row
        icon="file-pdf-box"
        title="Resumen de ingresos (PDF)"
        subtitle="Promedio de 3 o 6 meses, para el banco"
        onPress={() => setShowPdf(true)}
      />
      <Row
        icon="cellphone-arrow-down"
        title="Recuperar una copia"
        subtitle="Para pasar tus datos a un celular nuevo"
        onPress={handleRestore}
        last
      />

      <Modal visible={showPdf} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPdf(false)}>
        <IncomePdfModal onClose={() => setShowPdf(false)} />
      </Modal>
    </Section>
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
    <SheetFrame title="Resumen de ingresos" onClose={onClose} onSave={handleShare} saveLabel={busy ? 'Creando…' : 'Crear PDF'}>
      <Text style={ms.mLabel}>Nombre completo</Text>
      <TextInput style={ms.mInput} value={name} onChangeText={setName} placeholder="Como sale en la cédula" placeholderTextColor={C.textFaint} />
      <Text style={ms.mLabel}>Cédula (opcional)</Text>
      <TextInput
        style={ms.mInput} value={id} onChangeText={t => setId(t.replace(/\D/g, ''))}
        keyboardType="number-pad" placeholder="Solo números" placeholderTextColor={C.textFaint}
      />

      <Text style={ms.mLabel}>¿Cuántos meses?</Text>
      <View style={ms.mGrid}>
        {([3, 6] as const).map(m => (
          <Chip key={m} label={`Últimos ${m} meses`} selected={months === m} onPress={() => setMonths(m)} />
        ))}
      </View>

      {report ? (
        <View style={s.preview}>
          <Text style={T.bodySm}>
            {report.rows.length < months
              ? `Solo hay registros desde ${formatMonth(report.rows[0].month)}: salen ${report.rows.length} ${report.rows.length === 1 ? 'mes' : 'meses'}.`
              : `De ${formatMonth(report.rows[0].month)} a ${formatMonth(report.rows[report.rows.length - 1].month)}.`}
          </Text>
          <Text style={T.bodySm}>El mes actual no sale porque no ha terminado.</Text>
        </View>
      ) : (
        <Text style={T.bodySm}>No hay registros en esos meses. El mes actual no cuenta porque no ha terminado.</Text>
      )}
      <Text style={[ms.mHint, { marginTop: S.md }]}>
        Es un resumen hecho por ti con tus registros; no es un certificado de contador. Si el banco pide certificado, este resumen le sirve de soporte al contador.
      </Text>
    </SheetFrame>
  );
}

const s = StyleSheet.create({
  preview: { backgroundColor: C.surfaceHigh, borderRadius: R.md, padding: S.md, gap: S.xs },
});
