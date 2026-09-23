// Copia de seguridad: guardar el archivo (WhatsApp, Drive…) y recuperarlo en otro celular
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { setSetting } from './db';
import { buildBackup, checkBackup, restoreBackup, BackupCheck, LAST_BACKUP_KEY } from './backupData';
import { nowString, todayString } from './format';

// Arma el archivo y abre "Compartir" para mandarlo a WhatsApp, Drive o correo.
// Devuelve false si no se pudo abrir "Compartir".
export async function shareBackup(): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const now  = nowString();
  const file = new File(Paths.cache, `uber-finanzas-copia-${now.slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(buildBackup(now)));
  await Sharing.shareAsync(file.uri, {
    mimeType:    'application/json',
    dialogTitle: 'Guarda la copia (WhatsApp, Drive…)',
  });
  // No se sabe si la guardó de verdad; se cuenta como hecha al abrir "Compartir"
  setSetting(LAST_BACKUP_KEY, todayString());
  return true;
}

// Abre el selector de archivos y revisa la copia elegida. null si canceló.
export async function pickBackup(): Promise<BackupCheck | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const text = await new File(res.assets[0].uri).text();
  return checkBackup(text);
}

// Antes de restaurar guarda lo que hay en el celular, por si eligió el archivo equivocado
export function restoreWithSafetyCopy(check: BackupCheck): void {
  if (!check.backup) return;
  const safety = new File(Paths.document, 'antes-de-restaurar.json');
  safety.create({ overwrite: true });
  safety.write(JSON.stringify(buildBackup(nowString())));
  restoreBackup(check.backup);
}
