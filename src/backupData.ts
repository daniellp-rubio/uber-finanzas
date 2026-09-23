// Copia de seguridad: todas las tablas a JSON y de vuelta. Sin módulos nativos (se prueba en Node).
import { getDb, getSchemaVersion, getSetting, setSetting } from './db';
import { addDays } from './format';

const APP_ID = 'uber-finanzas';
const FORMAT = 1;

export const LAST_BACKUP_KEY  = 'last_backup_date';
const BACKUP_SINCE_KEY        = 'backup_reminder_since';  // primer día con esta función
const REMIND_EVERY_DAYS       = 7;
const REMIND_AGAIN_DAYS       = 3;   // si ya pasó la semana, insiste cada 3 días

export function lastBackupDate(): string | null {
  return getSetting(LAST_BACKUP_KEY, '') || null;
}

// Fecha y hora del próximo aviso de copia, a las 7:00 p.m. Fija (no se corre al abrir la app):
// una semana después de la última copia y luego cada 3 días. Sin copias, al día siguiente
// de tener la función, y luego cada 3 días.
export function nextBackupReminder(now: Date, today: string): Date {
  let since = getSetting(BACKUP_SINCE_KEY, '');
  if (!since) { since = today; setSetting(BACKUP_SINCE_KEY, today); }
  const last = lastBackupDate();
  let date = last ? addDays(last, REMIND_EVERY_DAYS) : addDays(since, 1);
  const at = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 19, 0, 0); };
  while (at(date).getTime() <= now.getTime()) date = addDays(date, REMIND_AGAIN_DAYS);
  return at(date);
}

// Orden fijo; una tabla nueva en una migración se agrega aquí
export const BACKUP_TABLES = [
  'transactions', 'fixed_expenses', 'debts', 'funds', 'fund_movements', 'app_settings',
  'vehicles', 'maintenance', 'maintenance_plan', 'vehicle_docs', 'rentals', 'rental_payments',
  'charges', 'work_sessions',
] as const;

type Value = string | number | null;
type Row = Record<string, Value>;

export interface Backup {
  app:        typeof APP_ID;
  format:     number;
  schema:     number;   // PRAGMA user_version de quien lo hizo
  created_at: string;   // "YYYY-MM-DD HH:MM" local
  tables:     Record<string, Row[]>;
}

function existingTables(): Set<string> {
  const rows = getDb().getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rows.map(r => r.name));
}

export function buildBackup(createdAt: string): Backup {
  const db = getDb();
  const present = existingTables();
  const tables: Record<string, Row[]> = {};
  for (const t of BACKUP_TABLES) {
    if (present.has(t)) tables[t] = db.getAllSync<Row>(`SELECT * FROM "${t}"`);
  }
  return { app: APP_ID, format: FORMAT, schema: getSchemaVersion(), created_at: createdAt, tables };
}

export interface BackupCheck {
  backup?:  Backup;
  error?:   string;   // mensaje para el usuario
  movements: number;
}

// Valida el archivo antes de tocar nada
export function checkBackup(text: string): BackupCheck {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { error: 'Ese archivo no es una copia de Uber Finanzas.', movements: 0 }; }
  const b = data as Partial<Backup>;
  if (!b || b.app !== APP_ID || typeof b.schema !== 'number' || !b.tables || typeof b.tables !== 'object') {
    return { error: 'Ese archivo no es una copia de Uber Finanzas.', movements: 0 };
  }
  if (b.format !== FORMAT || b.schema > getSchemaVersion()) {
    return { error: 'Esta copia es de una versión más nueva de la app. Actualiza la app y vuelve a intentar.', movements: 0 };
  }
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) {
      return { error: `La copia está dañada (${name}).`, movements: 0 };
    }
  }
  if (!Array.isArray(b.tables.transactions)) return { error: 'La copia está incompleta.', movements: 0 };
  return { backup: b as Backup, movements: b.tables.transactions.length };
}

// Reemplaza TODO por el contenido de la copia, en una sola transacción (si algo falla, no cambia nada).
// Solo copia las columnas que existen hoy; las que la copia no trae quedan con su valor por defecto.
export function restoreBackup(backup: Backup): void {
  const db = getDb();
  const present = existingTables();
  db.withTransactionSync(() => {
    for (const t of BACKUP_TABLES) {
      if (!present.has(t)) continue;
      db.runSync(`DELETE FROM "${t}"`);
      const rows = backup.tables[t];
      if (!rows) continue;
      const columns = new Set(db.getAllSync<{ name: string }>(`PRAGMA table_info("${t}")`).map(c => c.name));
      for (const row of rows) {
        const keys = Object.keys(row).filter(k => columns.has(k));
        if (keys.length === 0) continue;
        const values = keys.map(k => {
          const v = row[k];
          return typeof v === 'number' || typeof v === 'string' ? v : null;
        });
        db.runSync(
          `INSERT INTO "${t}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          ...values
        );
      }
    }
  });
}
