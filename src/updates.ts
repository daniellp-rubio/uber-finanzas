import * as Updates from 'expo-updates';
import * as Application from 'expo-application';

// ─── Config ──────────────────────────────────────────────────────────────────
// El repo es público: el APK se descarga sin cuenta de GitHub.
const REPO            = 'daniellp-rubio/uber-finanzas';
export const APK_URL  = `https://github.com/${REPO}/releases/latest/download/uber-finanzas.apk`;
const LATEST_RELEASE  = `https://api.github.com/repos/${REPO}/releases/latest`;

const CHECK_TIMEOUT_MS = 4000;   // sin internet no se bloquea el arranque
const FETCH_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

// ── Update OTA: se aplica al arrancar, antes de mostrar la app ────────────────
// Si hay versión nueva la descarga y reinicia la app; si falla o no hay red,
// sigue con la versión instalada.
export async function applyOtaUpdateIfAvailable(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const check = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
    if (!check.isAvailable) return;
    const result = await withTimeout(Updates.fetchUpdateAsync(), FETCH_TIMEOUT_MS);
    if (result.isNew) await Updates.reloadAsync();
  } catch {
    // Sin red o servidor caído: no es un error para el usuario.
  }
}

// ── APK nuevo: los releases se etiquetan "build-<versionCode>" ────────────────
export async function isNewApkAvailable(): Promise<boolean> {
  if (__DEV__) return false;
  try {
    const res = await withTimeout(
      fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } }),
      CHECK_TIMEOUT_MS,
    );
    if (!res.ok) return false;
    const { tag_name } = await res.json() as { tag_name?: string };
    const latest  = Number(String(tag_name ?? '').replace(/^build-/, ''));
    const current = Number(Application.nativeBuildVersion);
    return Number.isFinite(latest) && Number.isFinite(current) && latest > current;
  } catch {
    return false;
  }
}

// ── Texto de versión (para soporte: "¿qué versión tienes?") ───────────────────
export function versionLabel(): string {
  const app    = Application.nativeApplicationVersion ?? '?';
  const build  = Application.nativeBuildVersion ?? '?';
  const update = Updates.updateId && !Updates.isEmbeddedLaunch
    ? ` · act. ${Updates.updateId.slice(0, 8)}`
    : '';
  return `Versión ${app} (build ${build})${update}`;
}
