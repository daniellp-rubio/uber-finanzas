import { getFixedExpenses, getDebts, getMonthStats } from './db';

export type BalanceStatus = 'none' | 'no_data' | 'green' | 'yellow' | 'red';

export interface BalanceResult {
  status:               BalanceStatus;
  monthlyObligations:   number;
  dailyTarget:          number;
  dailyAvg:             number;
  dailyNeededNow:       number;
  currentMonthNet:      number;
  remainingToCover:     number;
  coveredPct:           number;   // 0–1
  daysWorked:           number;
  calendarDaysLeft:     number;
  workingDaysEstLeft:   number;
  netIsNegative:        boolean;
}

const WORKING_DAYS_PER_MONTH = 24;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function computeBalance(): BalanceResult {
  const today        = new Date();
  const year         = today.getFullYear();
  const month        = today.getMonth() + 1;
  const yearMonth    = `${year}-${String(month).padStart(2, '0')}`;
  const todayDay     = today.getDate();
  const totalDays    = daysInMonth(year, month);
  const calDaysLeft  = totalDays - todayDay;
  const workDaysLeft = Math.max(Math.round(calDaysLeft * 0.8), 1);

  const fixedExpenses       = getFixedExpenses();
  const debts               = getDebts();
  const monthlyFixedTotal   = fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const monthlyDebtTotal    = debts.reduce((s, d) => s + d.monthly_payment, 0);
  const monthlyObligations  = monthlyFixedTotal + monthlyDebtTotal;

  if (monthlyObligations === 0) {
    return {
      status: 'none', monthlyObligations: 0, dailyTarget: 0, dailyAvg: 0,
      dailyNeededNow: 0, currentMonthNet: 0, remainingToCover: 0,
      coveredPct: 0, daysWorked: 0, calendarDaysLeft: calDaysLeft,
      workingDaysEstLeft: workDaysLeft, netIsNegative: false,
    };
  }

  const stats         = getMonthStats(yearMonth);
  const { net, daysWorked } = stats;
  const netIsNegative = net < 0;

  if (daysWorked === 0) {
    return {
      status: 'no_data', monthlyObligations, dailyTarget: monthlyObligations / WORKING_DAYS_PER_MONTH,
      dailyAvg: 0, dailyNeededNow: monthlyObligations / workDaysLeft,
      currentMonthNet: net, remainingToCover: monthlyObligations,
      coveredPct: 0, daysWorked: 0, calendarDaysLeft: calDaysLeft,
      workingDaysEstLeft: workDaysLeft, netIsNegative: false,
    };
  }

  const dailyTarget      = monthlyObligations / WORKING_DAYS_PER_MONTH;
  const dailyAvg         = net / daysWorked;
  const remainingToCover = Math.max(monthlyObligations - net, 0);
  const dailyNeededNow   = remainingToCover / workDaysLeft;
  const coveredPct       = Math.min(net / monthlyObligations, 1);

  let status: BalanceStatus;
  if (netIsNegative) {
    status = 'red';
  } else if (dailyAvg >= dailyTarget * 0.90) {
    status = 'green';
  } else if (dailyAvg >= dailyTarget * 0.65) {
    status = 'yellow';
  } else {
    status = 'red';
  }

  return {
    status, monthlyObligations, dailyTarget, dailyAvg, dailyNeededNow,
    currentMonthNet: net, remainingToCover, coveredPct,
    daysWorked, calendarDaysLeft: calDaysLeft,
    workingDaysEstLeft: workDaysLeft, netIsNegative,
  };
}

// ─── Meta del día (Hoy) ───────────────────────────────────────────────────────

export interface DailyGoal {
  goal:        number;   // lo que hay que hacer hoy para ir al día con los gastos del mes
  left:        number;   // lo que falta hoy (0 si ya la cumplió)
  monthCovered: boolean; // lo del mes ya está cubierto con lo que llevaba antes de hoy
}

// Lo que falta del mes (sin contar lo de hoy) repartido entre hoy y los días de trabajo que quedan.
// Es el mismo reparto de "Necesitas hoy" en Balance: si hoy cumple la meta, mañana la meta es igual.
export function calcDailyGoal(
  monthlyObligations: number, monthNet: number, todayNet: number, workDaysLeftAfterToday: number,
): DailyGoal {
  const pending = Math.max(monthlyObligations - (monthNet - todayNet), 0);
  const goal    = Math.round(pending / (workDaysLeftAfterToday + 1));
  return { goal, left: Math.max(goal - todayNet, 0), monthCovered: pending === 0 };
}
