import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getVehicles, getVehicleDocs, getMaintenancePlans, getMaintenance, getCurrentRental, getRentalPayments } from './db';
import { DOC_KINDS, planStatus, maintenanceLabel } from './fleet';
import { rentStatus } from './rental';
import { addDays, formatCurrency, formatDate, todayString } from './format';

const CHANNEL_ID       = 'uber-finanzas-reminders';
const INTERVAL_HOURS   = 2;
const MAX_REMINDERS    = 8; // hasta 16 horas de jornada
const VEHICLE_KIND     = 'vehicle'; // marca de los avisos de carros (no son de la jornada)

// ── Configura cómo se muestran las notificaciones cuando la app está abierta ──
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// ── Canal Android 8+ ──────────────────────────────────────────────────────────
export async function setupNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Recordatorios de trabajo',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

// ── Pedir permiso ─────────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Iniciar jornada ───────────────────────────────────────────────────────────
export async function startWorkDay(): Promise<void> {
  // Cancelar recordatorios previos de la jornada (los avisos de carros se quedan)
  await cancelWorkDayNotifications();

  // Notificación de confirmación (5 segundos)
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚗 ¡Jornada iniciada!',
      body: 'A partir de ahora te llegará una notificación cada 2 horas de recuerdo para que agregues tus ingresos y egresos.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
    },
  });

  // Recordatorios cada 2 horas
  for (let i = 1; i <= MAX_REMINDERS; i++) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Uber Finanzas',
        body: '¿Cómo vas? Recuerda registrar tus ingresos y egresos del día.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: i * INTERVAL_HOURS * 60 * 60,
      },
    });
  }
}

// ── Finalizar jornada ─────────────────────────────────────────────────────────
export async function endWorkDay(): Promise<void> {
  await cancelWorkDayNotifications();
}

// ── ¿Hay jornada activa? ──────────────────────────────────────────────────────
export async function isWorkDayActive(): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some(n => !isVehicleReminder(n));
}

// Todo lo que no es aviso de carro es de la jornada (incluye los programados antes de existir la marca)
function isVehicleReminder(n: Notifications.NotificationRequest): boolean {
  return n.content.data?.kind === VEHICLE_KIND;
}

async function cancelWorkDayNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter(n => !isVehicleReminder(n))
    .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

// ── Avisos de carros (arriendo, SOAT, técnico-mecánica, impuesto, seguro, mantenimiento por fecha) ──
// Se reprograman todos desde cero: al abrir la app y cada vez que cambia una fecha.
// Los mantenimientos por km no se pueden programar: salen como aviso dentro de la app.
export async function refreshVehicleReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter(isVehicleReminder)
    .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));

  const today = todayString();
  const items: { date: string; title: string; body: string }[] = [];

  for (const v of getVehicles()) {
    const docs = getVehicleDocs(v.id);
    for (const kind of DOC_KINDS) {
      const due = docs.find(d => d.kind === kind.id)?.due_date;
      if (!due) continue;
      const body = `${v.name}: ${kind.label} vence el ${formatDate(due)}.`;
      items.push({ date: addDays(due, -15), title: `${kind.icon} ${kind.label} vence en 15 días`, body });
      items.push({ date: addDays(due, -1),  title: `${kind.icon} ${kind.label} vence mañana`,     body });
    }

    const records = getMaintenance(v.id);
    for (const plan of getMaintenancePlans(v.id)) {
      const st = planStatus(plan, records, v.odometer_km, today);
      if (!st.nextDate) continue;
      const body = `${v.name}: toca ${maintenanceLabel(plan.kind).toLowerCase()} antes del ${formatDate(st.nextDate)}.`;
      items.push({ date: addDays(st.nextDate, -7), title: '🔧 Mantenimiento en 7 días', body });
    }

    // Arriendo: el día de cada una de las próximas 4 cuotas sin pagar
    const rental = getCurrentRental(v.id);
    if (rental) {
      const st = rentStatus(rental, getRentalPayments(rental.id), today);
      for (let i = 0; st.nextDue && i < 4; i++) {
        items.push({
          date:  addDays(st.nextDue, 7 * i),
          title: '🔑 Hoy paga el arriendo',
          body:  `${rental.driver_name} (${v.name}): cuota de ${formatCurrency(rental.weekly_fee)}.`,
        });
      }
    }
  }

  for (const it of items) {
    const [y, m, d] = it.date.split('-').map(Number);
    const when = new Date(y, m - 1, d, 9, 0, 0);  // 9:00 a.m.
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: it.title, body: it.body, sound: true, data: { kind: VEHICLE_KIND } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  }
}
