import * as SQLite from 'expo-sqlite';
import type { TransactionType } from './categories';

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
       SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net
     FROM transactions
     WHERE date BETWEEN ? AND ?
     GROUP BY date
     ORDER BY date DESC`,
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
       COUNT(DISTINCT CASE WHEN type='income' THEN date END) AS days
     FROM transactions
     WHERE date LIKE ?`,
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

export function addDebt(
  name: string,
  monthly_payment: number,
  months_remaining: number | null
): void {
  getDb().runSync(
    'INSERT INTO debts (name, monthly_payment, months_remaining) VALUES (?, ?, ?)',
    name, monthly_payment, months_remaining
  );
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
