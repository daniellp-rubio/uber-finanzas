import * as SQLite from 'expo-sqlite';
import { RENT_CATEGORY, CHARGE_CATEGORY, TransactionType } from './categories';
import { VEHICLE_PRESETS, DEFAULT_PLANS, EnergyType } from './fleet';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  category: string;
  note: string | null;
  date: string;
}

export interface DailySummary {
  date: string;
  income: number;
  expense: number;
  net: number;
  rent: number;  // parte del ingreso que es arriendo del carro (no es trabajo del día)
}

export interface FixedExpense {
  id: number;
  name: string;
  amount: number;
  category: string;
  active: number;
}

export interface Debt {
  id: number;
  name: string;
  monthly_payment: number;
  months_remaining: number | null;
  active: number;
}

export interface Fund {
  id: number;
  name: string;
  icon: string;
  color: string;
  balance: number;
  active: number;
}

export interface FundMovement {
  id: number;
  fund_id: number;
  amount: number;
  note: string | null;
  date: string;
}

export interface Vehicle {
  id: number;
  name: string;
  plate: string | null;
  energy: EnergyType;
  km_per_gallon: number;       // gasolina
  gas_price: number;           // gasolina, COP por galón
  kwh_per_100km: number;       // eléctrico
  kwh_price: number;           // eléctrico, COP por kWh
  pico_placa_days: number;     // días por semana sin poder trabajar
  maint_cost_per_km: number;   // provisión de mantenimiento, COP por km
  odometer_km: number | null;  // último kilometraje conocido
  odometer_date: string | null;
  debt_id: number | null;      // crédito del carro (fila de debts, sale en Balance)
  extra_monthly_cost: number;  // GPS, parqueadero y otros fijos del carro, COP al mes
  active: number;
}

export type VehicleInput = Omit<Vehicle, 'id' | 'odometer_km' | 'odometer_date' | 'debt_id' | 'extra_monthly_cost' | 'active'>;

export interface Rental {
  id: number;
  vehicle_id: number;
  driver_name: string;
  driver_phone: string | null;
  weekly_fee: number;             // cuota prepagada cada 7 días desde start_date
  start_date: string;
  start_km: number | null;        // kilometraje al entregar el carro
  km_per_week: number | null;     // km incluidos por semana (NULL = sin límite)
  extra_km_price: number;         // COP por km de más
  late_fee_per_day: number;       // mora por día después de la gracia
  deposit: number;                // depósito acordado
  end_date: string | null;        // día en que devolvió el carro (NULL = vigente)
  deposit_returned: number | null;
  note: string | null;
  active: number;
}

export type RentalInput = Omit<Rental, 'id' | 'end_date' | 'deposit_returned' | 'active'>;

export interface RentalPayment {
  id: number;
  rental_id: number;
  kind: 'rent' | 'fee' | 'deposit';  // cuota semanal / mora, km extra o daños / depósito
  amount: number;
  date: string;
  note: string | null;
  transaction_id: number | null;     // ingreso creado con el pago (el depósito no crea ingreso)
  active: number;
}

export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  kind: string;
  date: string;
  km: number | null;
  cost: number;
  shop: string | null;
  note: string | null;
  transaction_id: number | null;  // gasto creado junto con el mantenimiento
  active: number;
}

export interface MaintenancePlan {
  id: number;
  vehicle_id: number;
  kind: string;
  every_km: number | null;
  every_months: number | null;
  active: number;
}

export interface VehicleDoc {
  id: number;
  vehicle_id: number;
  kind: string;
  due_date: string | null;
  cost: number | null;
}

export interface Charge {
  id: number;
  vehicle_id: number;
  date: string;
  kwh: number | null;
  amount: number;
  place: string | null;
  transaction_id: number | null;
}

// Jornada: de "Empecemos el día" a "Día finalizado", en hora local "YYYY-MM-DD HH:MM"
export interface WorkSession {
  id: number;
  start_at: string;
  end_at: string | null;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('DB not initialized');
  return _db;
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  _db = await SQLite.openDatabaseAsync('uber-finanzas.db');
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT    NOT NULL,
      amount    REAL    NOT NULL,
      category  TEXT    NOT NULL,
      note      TEXT,
      date      TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_date ON transactions(date);

    CREATE TABLE IF NOT EXISTS fixed_expenses (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL,
      amount   REAL    NOT NULL,
      category TEXT    NOT NULL,
      active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS debts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      monthly_payment  REAL    NOT NULL,
      months_remaining INTEGER,
      active           INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS funds (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT    NOT NULL,
      icon    TEXT    NOT NULL,
      color   TEXT    NOT NULL,
      balance REAL    NOT NULL DEFAULT 0,
      active  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fund_movements (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id INTEGER NOT NULL,
      amount  REAL    NOT NULL,
      note    TEXT,
      date    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Fondos por defecto si no existen
  const existing = _db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM funds');
  if (!existing || existing.c === 0) {
    await _db.execAsync(`
      INSERT INTO funds (name, icon, color) VALUES ('Emergencias',  '🛡️', '#F44336');
      INSERT INTO funds (name, icon, color) VALUES ('Mecánico',     '🔧', '#FFC107');
      INSERT INTO funds (name, icon, color) VALUES ('Multas/Legal', '⚖️', '#FF9800');
      INSERT INTO funds (name, icon, color) VALUES ('Pensión',      '🏦', '#2196F3');
    `);
  }

  runMigrations(_db);
}

// ─── Migraciones ─────────────────────────────────────────────────────────────
// Solo aditivas (ver references/arquitectura.md). Nunca editar ni reordenar una ya publicada:
// siempre se agrega al final. Cada una corre una sola vez, en transacción, junto con user_version.

const MIGRATIONS: ((db: SQLite.SQLiteDatabase) => void)[] = [
  /* 1: carros, mantenimientos y vencimientos */ db => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        name              TEXT    NOT NULL,
        plate             TEXT,
        energy            TEXT    NOT NULL DEFAULT 'gasoline',
        km_per_gallon     REAL    NOT NULL DEFAULT 35,
        gas_price         REAL    NOT NULL DEFAULT 15827,
        kwh_per_100km     REAL    NOT NULL DEFAULT 17.5,
        kwh_price         REAL    NOT NULL DEFAULT 958,
        pico_placa_days   REAL    NOT NULL DEFAULT 1,
        maint_cost_per_km REAL    NOT NULL DEFAULT 80,
        odometer_km       REAL,
        odometer_date     TEXT,
        active            INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS maintenance (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id     INTEGER NOT NULL,
        kind           TEXT    NOT NULL,
        date           TEXT    NOT NULL,
        km             REAL,
        cost           REAL    NOT NULL DEFAULT 0,
        shop           TEXT,
        note           TEXT,
        transaction_id INTEGER,
        active         INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle ON maintenance(vehicle_id);

      CREATE TABLE IF NOT EXISTS maintenance_plan (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id   INTEGER NOT NULL,
        kind         TEXT    NOT NULL,
        every_km     REAL,
        every_months INTEGER,
        active       INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS vehicle_docs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL,
        kind       TEXT    NOT NULL,
        due_date   TEXT,
        cost       REAL,
        UNIQUE (vehicle_id, kind)
      );
    `);

    // El carro actual del papá (Renault Duster) hereda la configuración que ya tenía guardada
    const setting = (key: string, fallback: number): number => {
      const row = db.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
      const n = Number(row?.value);
      return row && Number.isFinite(n) ? n : fallback;
    };
    const g = VEHICLE_PRESETS.gasoline;
    const { lastInsertRowId } = db.runSync(
      `INSERT INTO vehicles (name, energy, km_per_gallon, gas_price, pico_placa_days, maint_cost_per_km)
       VALUES (?, 'gasoline', ?, ?, ?, ?)`,
      'Renault Duster',
      setting('km_per_gallon', g.kmPerGallon),
      setting('gas_price_cop', g.gasPrice),
      1,  // pico y placa en Medellín: 1 día por semana (el valor guardado podía ser el 2 viejo)
      setting('maintenance_cost_per_km', g.maintCostPerKm),
    );
    seedPlans(db, lastInsertRowId, 'gasoline');
    db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', 'active_vehicle_id', String(lastInsertRowId));
  },

  /* 2: arriendo de carros y costos fijos por carro */ db => {
    db.execSync(`
      ALTER TABLE vehicles ADD COLUMN debt_id INTEGER;
      ALTER TABLE vehicles ADD COLUMN extra_monthly_cost REAL NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS rentals (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id       INTEGER NOT NULL,
        driver_name      TEXT    NOT NULL,
        driver_phone     TEXT,
        weekly_fee       REAL    NOT NULL,
        start_date       TEXT    NOT NULL,
        start_km         REAL,
        km_per_week      REAL,
        extra_km_price   REAL    NOT NULL DEFAULT 0,
        late_fee_per_day REAL    NOT NULL DEFAULT 0,
        deposit          REAL    NOT NULL DEFAULT 0,
        end_date         TEXT,
        deposit_returned REAL,
        note             TEXT,
        active           INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_rentals_vehicle ON rentals(vehicle_id);

      CREATE TABLE IF NOT EXISTS rental_payments (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        rental_id      INTEGER NOT NULL,
        kind           TEXT    NOT NULL,
        amount         REAL    NOT NULL,
        date           TEXT    NOT NULL,
        note           TEXT,
        transaction_id INTEGER,
        active         INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_rental_payments_rental ON rental_payments(rental_id);
    `);
  },

  /* 3: cargas del carro eléctrico y horas de trabajo */ db => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS charges (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id     INTEGER NOT NULL,
        date           TEXT    NOT NULL,
        kwh            REAL,
        amount         REAL    NOT NULL,
        place          TEXT,
        transaction_id INTEGER,
        active         INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_charges_vehicle ON charges(vehicle_id, date);

      CREATE TABLE IF NOT EXISTS work_sessions (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        start_at TEXT    NOT NULL,
        end_at   TEXT
      );
    `);
  },
];

export function getSchemaVersion(): number {
  return getDb().getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

function runMigrations(db: SQLite.SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      MIGRATIONS[v](db);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

function seedPlans(db: SQLite.SQLiteDatabase, vehicleId: number, energy: EnergyType): void {
  for (const p of DEFAULT_PLANS[energy]) {
    db.runSync(
      'INSERT INTO maintenance_plan (vehicle_id, kind, every_km, every_months) VALUES (?, ?, ?, ?)',
      vehicleId, p.kind, p.everyKm, p.everyMonths
    );
  }
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export function getTransactionsByDate(date: string): Transaction[] {
  return getDb().getAllSync<Transaction>(
    'SELECT * FROM transactions WHERE date = ? ORDER BY id DESC',
    date
  );
}

export function getDailySummaries(from: string, to: string): DailySummary[] {
  return getDb().getAllSync<DailySummary>(
    `SELECT
       date,
       SUM(CASE WHEN type='income'  THEN amount ELSE 0    END) AS income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0    END) AS expense,
       SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net,
       SUM(CASE WHEN type='income' AND category = ? THEN amount ELSE 0 END) AS rent
     FROM transactions
     WHERE date BETWEEN ? AND ?
     GROUP BY date
     ORDER BY date DESC`,
    RENT_CATEGORY,
    from,
    to
  );
}

export function getMonthStats(yearMonth: string): {
  income: number; expense: number; net: number; daysWorked: number;
} {
  const row = getDb().getFirstSync<{ income: number; expense: number; net: number; days: number }>(
    `SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0    END) AS income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0    END) AS expense,
       SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net,
       COUNT(DISTINCT CASE WHEN type='income' AND category <> ? THEN date END) AS days
     FROM transactions
     WHERE date LIKE ?`,
    RENT_CATEGORY,  // cobrar el arriendo no es un día trabajado
    yearMonth + '-%'
  );
  return {
    income:     row?.income    ?? 0,
    expense:    row?.expense   ?? 0,
    net:        row?.net       ?? 0,
    daysWorked: row?.days      ?? 0,
  };
}

export function addTransaction(
  type: TransactionType,
  amount: number,
  category: string,
  note: string | null,
  date: string
): void {
  getDb().runSync(
    'INSERT INTO transactions (type, amount, category, note, date) VALUES (?, ?, ?, ?, ?)',
    type, amount, category, note, date
  );
}

// Total por tipo y categoría entre dos fechas (incluidas)
export function getCategoryTotals(from: string, to: string): { type: TransactionType; category: string; total: number }[] {
  return getDb().getAllSync<{ type: TransactionType; category: string; total: number }>(
    `SELECT type, category, SUM(amount) AS total FROM transactions
     WHERE date BETWEEN ? AND ? GROUP BY type, category`,
    from, to
  );
}

// Fecha del primer movimiento desde `from`; null si no hay ninguno
export function getFirstTransactionDate(from: string): string | null {
  return getDb().getFirstSync<{ d: string | null }>(
    'SELECT MIN(date) AS d FROM transactions WHERE date >= ?', from
  )?.d ?? null;
}

export function deleteTransaction(id: number): void {
  getDb().runSync('DELETE FROM transactions WHERE id = ?', id);
}

// ─── Fixed Expenses ───────────────────────────────────────────────────────────

export function getFixedExpenses(): FixedExpense[] {
  return getDb().getAllSync<FixedExpense>(
    'SELECT * FROM fixed_expenses WHERE active = 1 ORDER BY id ASC'
  );
}

export function addFixedExpense(name: string, amount: number, category: string): void {
  getDb().runSync(
    'INSERT INTO fixed_expenses (name, amount, category) VALUES (?, ?, ?)',
    name, amount, category
  );
}

export function deleteFixedExpense(id: number): void {
  getDb().runSync('UPDATE fixed_expenses SET active = 0 WHERE id = ?', id);
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export function getDebts(): Debt[] {
  return getDb().getAllSync<Debt>(
    'SELECT * FROM debts WHERE active = 1 ORDER BY id ASC'
  );
}

export function getDebt(id: number): Debt | null {
  return getDb().getFirstSync<Debt>('SELECT * FROM debts WHERE id = ? AND active = 1', id);
}

export function addDebt(
  name: string,
  monthly_payment: number,
  months_remaining: number | null
): number {
  return getDb().runSync(
    'INSERT INTO debts (name, monthly_payment, months_remaining) VALUES (?, ?, ?)',
    name, monthly_payment, months_remaining
  ).lastInsertRowId;
}

export function decrementDebtMonth(id: number, currentMonths: number | null): void {
  if (currentMonths === null) return;
  if (currentMonths <= 1) {
    getDb().runSync('UPDATE debts SET active = 0 WHERE id = ?', id);
  } else {
    getDb().runSync('UPDATE debts SET months_remaining = ? WHERE id = ?', currentMonths - 1, id);
  }
}

export function deleteDebt(id: number): void {
  getDb().runSync('UPDATE debts SET active = 0 WHERE id = ?', id);
}

// ─── Funds ────────────────────────────────────────────────────────────────────

export function getFunds(): Fund[] {
  return getDb().getAllSync<Fund>(
    'SELECT * FROM funds WHERE active = 1 ORDER BY id ASC'
  );
}

export function getFundMovements(fundId: number, limit = 20): FundMovement[] {
  return getDb().getAllSync<FundMovement>(
    'SELECT * FROM fund_movements WHERE fund_id = ? ORDER BY id DESC LIMIT ?',
    fundId, limit
  );
}

export function addFundMovement(
  fundId: number,
  amount: number,
  note: string | null,
  date: string
): void {
  getDb().runSync(
    'INSERT INTO fund_movements (fund_id, amount, note, date) VALUES (?, ?, ?, ?)',
    fundId, amount, note, date
  );
  getDb().runSync(
    'UPDATE funds SET balance = balance + ? WHERE id = ?',
    amount, fundId
  );
}

export function addCustomFund(name: string, icon: string, color: string): void {
  getDb().runSync(
    'INSERT INTO funds (name, icon, color) VALUES (?, ?, ?)',
    name, icon, color
  );
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export function getSetting(key: string, defaultValue: string): string {
  const row = getDb().getFirstSync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    key
  );
  return row?.value ?? defaultValue;
}

export function setSetting(key: string, value: string): void {
  getDb().runSync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    key, value
  );
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().getAllSync<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings'
  );
  const out: Record<string, string> = {};
  rows.forEach(r => { out[r.key] = r.value; });
  return out;
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export function getVehicles(): Vehicle[] {
  return getDb().getAllSync<Vehicle>('SELECT * FROM vehicles WHERE active = 1 ORDER BY id ASC');
}

export function getVehicle(id: number): Vehicle | null {
  return getDb().getFirstSync<Vehicle>('SELECT * FROM vehicles WHERE id = ? AND active = 1', id);
}

// El carro que maneja el usuario: de ahí salen gasolina/carga, pico y placa y mantenimiento por km
export function getActiveVehicle(): Vehicle | null {
  const id = Number(getSetting('active_vehicle_id', '0'));
  return getVehicle(id) ?? getVehicles()[0] ?? null;
}

export function setActiveVehicle(id: number): void {
  setSetting('active_vehicle_id', String(id));
}

export function addVehicle(v: VehicleInput, odometerKm: number | null, today: string): number {
  const db = getDb();
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      `INSERT INTO vehicles (name, plate, energy, km_per_gallon, gas_price, kwh_per_100km, kwh_price,
         pico_placa_days, maint_cost_per_km, odometer_km, odometer_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      v.name, v.plate, v.energy, v.km_per_gallon, v.gas_price, v.kwh_per_100km, v.kwh_price,
      v.pico_placa_days, v.maint_cost_per_km, odometerKm, odometerKm !== null ? today : null
    ).lastInsertRowId;
    seedPlans(db, id, v.energy);
  });
  return id;
}

export function updateVehicle(id: number, v: VehicleInput): void {
  getDb().runSync(
    `UPDATE vehicles SET name = ?, plate = ?, energy = ?, km_per_gallon = ?, gas_price = ?,
       kwh_per_100km = ?, kwh_price = ?, pico_placa_days = ?, maint_cost_per_km = ?
     WHERE id = ?`,
    v.name, v.plate, v.energy, v.km_per_gallon, v.gas_price, v.kwh_per_100km, v.kwh_price,
    v.pico_placa_days, v.maint_cost_per_km, id
  );
}

export function updateOdometer(id: number, km: number, date: string): void {
  getDb().runSync('UPDATE vehicles SET odometer_km = ?, odometer_date = ? WHERE id = ?', km, date, id);
}

export function deleteVehicle(id: number): void {
  getDb().runSync('UPDATE vehicles SET active = 0 WHERE id = ?', id);
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

export function getMaintenance(vehicleId: number): MaintenanceRecord[] {
  return getDb().getAllSync<MaintenanceRecord>(
    'SELECT * FROM maintenance WHERE vehicle_id = ? AND active = 1 ORDER BY date DESC, id DESC',
    vehicleId
  );
}

// Guarda el mantenimiento; opcionalmente lo anota como gasto 🔧 del día en que se hizo.
// Si el km es mayor al último conocido, actualiza el kilometraje del carro.
export function addMaintenance(
  rec: Omit<MaintenanceRecord, 'id' | 'transaction_id' | 'active'>,
  expenseNote: string | null,
): void {
  const db = getDb();
  db.withTransactionSync(() => {
    let txId: number | null = null;
    if (expenseNote !== null && rec.cost > 0) {
      txId = db.runSync(
        'INSERT INTO transactions (type, amount, category, note, date) VALUES (?, ?, ?, ?, ?)',
        'expense', rec.cost, 'maint', expenseNote, rec.date
      ).lastInsertRowId;
    }
    db.runSync(
      `INSERT INTO maintenance (vehicle_id, kind, date, km, cost, shop, note, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      rec.vehicle_id, rec.kind, rec.date, rec.km, rec.cost, rec.shop, rec.note, txId
    );
    if (rec.km !== null) raiseOdometer(rec.vehicle_id, rec.km, rec.date);
  });
}

// Borra el mantenimiento y el gasto que se creó con él
export function deleteMaintenance(rec: MaintenanceRecord): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('UPDATE maintenance SET active = 0 WHERE id = ?', rec.id);
    if (rec.transaction_id !== null) db.runSync('DELETE FROM transactions WHERE id = ?', rec.transaction_id);
  });
}

// ─── Maintenance plan ─────────────────────────────────────────────────────────

export function getMaintenancePlans(vehicleId: number): MaintenancePlan[] {
  return getDb().getAllSync<MaintenancePlan>(
    'SELECT * FROM maintenance_plan WHERE vehicle_id = ? AND active = 1 ORDER BY id ASC',
    vehicleId
  );
}

export function addMaintenancePlan(vehicleId: number, kind: string, everyKm: number | null, everyMonths: number | null): void {
  getDb().runSync(
    'INSERT INTO maintenance_plan (vehicle_id, kind, every_km, every_months) VALUES (?, ?, ?, ?)',
    vehicleId, kind, everyKm, everyMonths
  );
}

export function updateMaintenancePlan(id: number, everyKm: number | null, everyMonths: number | null): void {
  getDb().runSync('UPDATE maintenance_plan SET every_km = ?, every_months = ? WHERE id = ?', everyKm, everyMonths, id);
}

export function deleteMaintenancePlan(id: number): void {
  getDb().runSync('UPDATE maintenance_plan SET active = 0 WHERE id = ?', id);
}

// ─── Vehicle docs (SOAT, técnico-mecánica, impuesto, seguro) ──────────────────

export function getVehicleDocs(vehicleId: number): VehicleDoc[] {
  return getDb().getAllSync<VehicleDoc>('SELECT * FROM vehicle_docs WHERE vehicle_id = ?', vehicleId);
}

export function setVehicleDoc(vehicleId: number, kind: string, dueDate: string | null, cost: number | null): void {
  getDb().runSync(
    `INSERT INTO vehicle_docs (vehicle_id, kind, due_date, cost) VALUES (?, ?, ?, ?)
     ON CONFLICT (vehicle_id, kind) DO UPDATE SET due_date = excluded.due_date, cost = excluded.cost`,
    vehicleId, kind, dueDate, cost
  );
}

// ─── Costos fijos del carro (crédito vinculado + GPS y otros) ─────────────────

export function setVehicleCosts(id: number, debtId: number | null, extraMonthly: number): void {
  getDb().runSync('UPDATE vehicles SET debt_id = ?, extra_monthly_cost = ? WHERE id = ?', debtId, extraMonthly, id);
}

// ─── Arriendo ─────────────────────────────────────────────────────────────────

// El contrato vigente del carro (sin fecha de devolución)
export function getCurrentRental(vehicleId: number): Rental | null {
  return getDb().getFirstSync<Rental>(
    'SELECT * FROM rentals WHERE vehicle_id = ? AND active = 1 AND end_date IS NULL ORDER BY id DESC',
    vehicleId
  );
}

export function addRental(r: RentalInput): number {
  const db = getDb();
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      `INSERT INTO rentals (vehicle_id, driver_name, driver_phone, weekly_fee, start_date, start_km,
         km_per_week, extra_km_price, late_fee_per_day, deposit, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.vehicle_id, r.driver_name, r.driver_phone, r.weekly_fee, r.start_date, r.start_km,
      r.km_per_week, r.extra_km_price, r.late_fee_per_day, r.deposit, r.note
    ).lastInsertRowId;
    if (r.start_km !== null) raiseOdometer(r.vehicle_id, r.start_km, r.start_date);
  });
  return id;
}

export function updateRental(id: number, r: RentalInput): void {
  getDb().runSync(
    `UPDATE rentals SET driver_name = ?, driver_phone = ?, weekly_fee = ?, start_date = ?, start_km = ?,
       km_per_week = ?, extra_km_price = ?, late_fee_per_day = ?, deposit = ?, note = ?
     WHERE id = ?`,
    r.driver_name, r.driver_phone, r.weekly_fee, r.start_date, r.start_km,
    r.km_per_week, r.extra_km_price, r.late_fee_per_day, r.deposit, r.note, id
  );
}

// Solo para un contrato creado por error y sin pagos
export function deleteRental(id: number): void {
  getDb().runSync('UPDATE rentals SET active = 0 WHERE id = ?', id);
}

// Devolución del carro. Lo que se queda del depósito (multas, daños) entra como ingreso 🔑.
export function endRental(
  rental: Rental, vehicleName: string, endDate: string, endKm: number | null,
  depositPaid: number, depositReturned: number,
): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('UPDATE rentals SET end_date = ?, deposit_returned = ? WHERE id = ?', endDate, depositReturned, rental.id);
    const kept = depositPaid - depositReturned;
    if (kept > 0) {
      insertRentalPayment(db, rental, 'fee', kept, endDate, 'Parte del depósito que no se devolvió', `Depósito retenido · ${vehicleName}`);
    }
    if (endKm !== null) raiseOdometer(rental.vehicle_id, endKm, endDate);
  });
}

// Pagos vivos del contrato. Si el ingreso se borró desde Hoy, el pago deja de contar.
export function getRentalPayments(rentalId: number): RentalPayment[] {
  return getDb().getAllSync<RentalPayment>(
    `SELECT p.* FROM rental_payments p
     LEFT JOIN transactions t ON t.id = p.transaction_id
     WHERE p.rental_id = ? AND p.active = 1 AND (p.transaction_id IS NULL OR t.id IS NOT NULL)
     ORDER BY p.date DESC, p.id DESC`,
    rentalId
  );
}

// La cuota y la mora se anotan también como ingreso 🔑 del día del pago; el depósito no (se devuelve)
export function addRentalPayment(
  rental: Rental, vehicleName: string, kind: RentalPayment['kind'], amount: number, date: string, note: string | null,
): void {
  const db = getDb();
  db.withTransactionSync(() => {
    const txNote = kind === 'rent' ? `Arriendo · ${vehicleName}` : kind === 'fee' ? `Mora o cobro extra · ${vehicleName}` : null;
    insertRentalPayment(db, rental, kind, amount, date, note, txNote);
  });
}

// Borra el pago y el ingreso que se creó con él
export function deleteRentalPayment(p: RentalPayment): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('UPDATE rental_payments SET active = 0 WHERE id = ?', p.id);
    if (p.transaction_id !== null) db.runSync('DELETE FROM transactions WHERE id = ?', p.transaction_id);
  });
}

function insertRentalPayment(
  db: SQLite.SQLiteDatabase, rental: Rental, kind: RentalPayment['kind'],
  amount: number, date: string, note: string | null, txNote: string | null,
): void {
  const txId = txNote === null ? null : db.runSync(
    'INSERT INTO transactions (type, amount, category, note, date) VALUES (?, ?, ?, ?, ?)',
    'income', amount, RENT_CATEGORY, txNote, date
  ).lastInsertRowId;
  db.runSync(
    'INSERT INTO rental_payments (rental_id, kind, amount, date, note, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
    rental.id, kind, amount, date, note, txId
  );
}

// ─── Cargas (carro eléctrico) ─────────────────────────────────────────────────

// La carga se anota como gasto ⚡ del día y, aparte, con sus kWh y el lugar para sacar el precio real
export function addCharge(
  vehicleId: number, amount: number, kwh: number | null, place: string | null, note: string | null, date: string,
): void {
  const db = getDb();
  const kwhTxt = kwh ? `${String(kwh).replace('.', ',')} kWh` : null;
  const txNote = [kwhTxt, place, note].filter(Boolean).join(' · ') || null;
  db.withTransactionSync(() => {
    const { lastInsertRowId } = db.runSync(
      'INSERT INTO transactions (type, amount, category, note, date) VALUES (?, ?, ?, ?, ?)',
      'expense', amount, CHARGE_CATEGORY, txNote, date
    );
    db.runSync(
      'INSERT INTO charges (vehicle_id, date, kwh, amount, place, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
      vehicleId, date, kwh, amount, place, lastInsertRowId
    );
  });
}

// Solo las cargas cuyo gasto sigue existiendo (si se borra desde Hoy, deja de contar)
export function getCharges(vehicleId: number, from: string): Charge[] {
  return getDb().getAllSync<Charge>(
    `SELECT c.id, c.vehicle_id, c.date, c.kwh, c.amount, c.place, c.transaction_id
     FROM charges c JOIN transactions t ON t.id = c.transaction_id
     WHERE c.vehicle_id = ? AND c.active = 1 AND c.date >= ?
     ORDER BY c.date DESC, c.id DESC`,
    vehicleId, from
  );
}

// ─── Jornadas ─────────────────────────────────────────────────────────────────

export function startWorkSession(at: string): void {
  getDb().runSync('INSERT INTO work_sessions (start_at) VALUES (?)', at);
}

// Cierra la última jornada si sigue abierta (si no hay, no hace nada)
export function endWorkSession(at: string): void {
  getDb().runSync(
    `UPDATE work_sessions SET end_at = ?
     WHERE id = (SELECT MAX(id) FROM work_sessions) AND end_at IS NULL`,
    at
  );
}

// Jornadas que empezaron entre dos fechas (incluidas)
export function getWorkSessions(from: string, to: string): WorkSession[] {
  return getDb().getAllSync<WorkSession>(
    'SELECT * FROM work_sessions WHERE substr(start_at, 1, 10) BETWEEN ? AND ? ORDER BY start_at ASC',
    from, to
  );
}

// Sube el kilometraje del carro si el dato nuevo es mayor (nunca lo baja)
function raiseOdometer(vehicleId: number, km: number, date: string): void {
  getDb().runSync(
    `UPDATE vehicles SET odometer_km = ?, odometer_date = ?
     WHERE id = ? AND (odometer_km IS NULL OR odometer_km < ?)`,
    km, date, vehicleId, km
  );
}
