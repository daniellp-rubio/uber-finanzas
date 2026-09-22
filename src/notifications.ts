import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID       = 'uber-finanzas-reminders';
const INTERVAL_HOURS   = 2;
const MAX_REMINDERS    = 8; // hasta 16 horas de jornada

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
  // Cancelar notificaciones previas
  await Notifications.cancelAllScheduledNotificationsAsync();

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
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ── ¿Hay jornada activa? ──────────────────────────────────────────────────────
export async function isWorkDayActive(): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.length > 0;
}
