import type { ChargeExpense, DafelMove } from './db';

// Cuenta con Dafel, puro (sin DB). Uber le paga al papá en el Bancolombia de Dafel y las cargas se pagan
// con la tarjeta de crédito de Dafel (Puntos Colombia), así que se le restan de su plata ahí.
// Saldo = inicial + Uber pagó − Dafel le pasó − préstamos pagados − cargas, todo desde el día del saldo
// inicial (lo de antes ya está dentro de ese saldo). Un préstamo no mueve el saldo: queda pendiente
// hasta que lo paga, y el pago sale del saldo.

export interface DafelLoan {
  id:      number;
  amount:  number;
  date:    string;
  note:    string | null;
  paid:    number;
  pending: number;   // nunca negativo
}

export interface DafelEntry {
  key:      string;
  date:     string;
  label:    string;
  note:     string | null;
  amount:   number;          // + entra a su saldo, − sale
  moveId:   number | null;   // null = carga (se borra desde Hoy)
}

export interface DafelAccount {
  started:      boolean;
  startDate:    string | null;
  balance:      number;   // negativo = le debe a Dafel
  chargesTotal: number;
  loans:        DafelLoan[];   // pendientes primero, luego los más nuevos
  pendingLoans: number;
  entries:      DafelEntry[];  // más nuevos primero
}

const LABEL: Record<Exclude<DafelMove['kind'], 'loan'>, string> = {
  start:     'Saldo inicial',
  uber:      'Uber pagó',
  out:       'Dafel te pasó',
  loan_paid: 'Pagaste un préstamo',
};

export function computeDafelAccount(moves: DafelMove[], charges: ChargeExpense[]): DafelAccount {
  const start = moves.find(m => m.kind === 'start') ?? null;

  const loans: DafelLoan[] = moves
    .filter(m => m.kind === 'loan')
    .map(l => {
      const paid = moves.filter(m => m.kind === 'loan_paid' && m.loan_id === l.id).reduce((s, m) => s + m.amount, 0);
      return { id: l.id, amount: l.amount, date: l.date, note: l.note, paid, pending: Math.max(l.amount - paid, 0) };
    })
    .sort((a, b) => Number(b.pending > 0) - Number(a.pending > 0) || b.date.localeCompare(a.date) || b.id - a.id);
  const pendingLoans = loans.reduce((s, l) => s + l.pending, 0);

  if (!start) {
    return { started: false, startDate: null, balance: 0, chargesTotal: 0, loans, pendingLoans, entries: [] };
  }

  const since = start.date;
  const counted = charges.filter(c => c.date >= since);
  const entries: DafelEntry[] = [
    ...moves.filter(m => m.kind !== 'loan' && m.kind !== 'start' && m.date >= since).map(m => ({
      key:    `m${m.id}`,
      date:   m.date,
      label:  LABEL[m.kind as Exclude<DafelMove['kind'], 'loan'>],
      note:   m.note,
      amount: m.kind === 'uber' ? m.amount : -m.amount,
      moveId: m.id,
    })),
    ...counted.map(c => ({
      key: `c${c.id}`, date: c.date, label: '⚡ Carga con la tarjeta de Dafel', note: c.note, amount: -c.amount, moveId: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  // El saldo inicial va de último: es el punto de partida
  entries.push({ key: `m${start.id}`, date: since, label: LABEL.start, note: null, amount: start.amount, moveId: start.id });

  return {
    started: true,
    startDate: since,
    balance: entries.reduce((s, e) => s + e.amount, 0),
    chargesTotal: counted.reduce((s, c) => s + c.amount, 0),
    loans,
    pendingLoans,
    entries,
  };
}
