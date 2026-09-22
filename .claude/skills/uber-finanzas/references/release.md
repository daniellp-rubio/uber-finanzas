# Release: de un merge a main al celular del usuario

Verificado contra la documentación oficial el 2026-09-22 (EAS, GitHub, Google Play).

## Cómo funciona

Toda la lógica vive en `scripts/release.sh [auto|update|build|forecast]`. Los workflows solo lo llaman.

```
PR → CI (.github/workflows/ci.yml)
       check:            npm ci · tsc · expo-doctor · expo export android
       release-forecast: scripts/release.sh forecast → "ota" o "apk" en el summary
merge a main → Release (.github/workflows/release.yml) → scripts/release.sh auto
       eas fingerprint:generate (android, perfil production)
       ¿hay build production "finished" con ese fingerprint?
         sí → eas update --channel production          → la app lo aplica al abrir (src/updates.ts)
         no → eas build --profile production --wait --freeze-credentials
              → descarga el APK → gh release create build-<versionCode> uber-finanzas.apk --latest
              → la app instalada ve el release nuevo y muestra el aviso "📲 Hay una versión nueva"
```

- **Link fijo del APK** (repo público, no requiere cuenta):
  `https://github.com/daniellp-rubio/uber-finanzas/releases/latest/download/uber-finanzas.apk`
- **Runtime**: `runtimeVersion.policy = fingerprint`. Un update OTA solo llega a builds con el mismo fingerprint nativo; por eso el workflow decide solo.
- **Versionado**: `cli.appVersionSource = remote` + `autoIncrement` en `production`. El `versionCode` vive en EAS (se inicializó desde `app.json` = 2 → el primer build del pipeline es 3). El `versionCode` de `app.json` ya no manda. `expo.version` (1.0.0) es el nombre visible; súbelo a mano solo cuando quieras.
- **Updates en la app**: `checkAutomatically: ON_ERROR_RECOVERY`. El chequeo normal lo hace `applyOtaUpdateIfAvailable()` al arrancar (timeouts de 4 s y 15 s; sin red sigue con lo instalado). Expo solo chequea por su cuenta después de un crash, como red de seguridad.
- **Paths ignorados** por Release: `**/*.md`, `.claude/**`, `.github/**`. Un PR solo de docs no publica nada. Para forzar: `gh workflow run release.yml -f mode=update|build|auto`.

## Dos modos de publicar (mismo script)

| Modo | Cuándo | Cómo |
|---|---|---|
| **Actions** (preferido) | La cuenta de GitHub sin bloqueo de facturación y `EXPO_TOKEN` en los secrets | Automático al mergear. Se sigue con `gh run watch` |
| **Local** | Actions bloqueado ("account is locked due to a billing issue") o sin token | Claude, desde `main` limpio e igual a `origin/main`: `scripts/release.sh`. Necesita `npx eas-cli login` hecho y `gh` autenticado. Un APK tarda: correrlo en background |

Salvaguardas del script en local: se niega fuera de `main`, con cambios sin commitear, con `main` desfasado de `origin` o sin sesión de EAS. Imprime `RELEASE_RESULT=ota|apk` al final.

Publica siempre desde un solo lugar. El fingerprint está pensado para ser igual en Windows y en Linux (`.gitattributes` fuerza LF), pero si alguna vez un merge solo de JS dispara `apk` sin razón, compara el hash que imprime el script con el del último build (`eas build:list -e production`) antes de gastar cuota.

## Qué dispara un APK nuevo (y no un OTA)

Cambia el fingerprint, y por tanto exige APK:
- Agregar, quitar o actualizar un paquete con código nativo (`expo-*`, `react-native-*`, SDK).
- Cambiar `app.json`: plugins, permisos, icono, splash, nombre, package, `newArchEnabled`, orientación.
- Cambiar `eas.json` en campos que afectan el build nativo.

Viaja como OTA: todo lo que sea `.ts`/`.tsx` en `App.tsx`, `components/` y `src/`, y los assets que se importan desde JS.

Antes de pedir aprobación, di cuál de los dos será. Tras abrir el PR, confírmalo en el summary del job `release-forecast` (`gh pr checks`, `gh run view <id>`). Un APK es más fricción para el usuario (tocar el aviso e instalar) y gasta cuota. Si una funcionalidad se puede hacer sin dependencia nativa, prefiérela.

## Configuración inicial (una sola vez) — estado

| # | Paso | Quién | Estado 2026-09-22 |
|---|---|---|---|
| 0 | Resolver el bloqueo de facturación de GitHub (https://github.com/settings/billing). Mientras siga, Actions no corre y se publica en modo local | Dafel | **bloqueado** (visto el 2026-09-22) |
| 1 | Repo público `daniellp-rubio/uber-finanzas`, rama `main`, solo squash, borrar rama al mergear | Claude | hecho 2026-09-22 |
| 2 | `npx eas-cli login` en la máquina local | Dafel, en su terminal | pendiente |
| 3 | Access token en expo.dev → Account settings → Access tokens → secret `EXPO_TOKEN` del repo | Dafel: `gh secret set EXPO_TOKEN --repo daniellp-rubio/uber-finanzas` en su terminal | pendiente |
| 4 | Verificar llave: `npx eas-cli credentials -p android` → **una sola** keystore para `com.uberfinanzas.app`, la misma con que se firmó el APK que ya tiene el usuario (salió del perfil `preview`, versionCode ≤ 2) | Claude, con Dafel logueado | pendiente |
| 5 | Backup de la keystore: `eas credentials` → Android → `credentials.json` → Download → guardar FUERA del repo (gestor de contraseñas) | Dafel | pendiente |
| 6 | PR #1 `chore/release-pipeline` → merge → release construye build 3 | Claude | PR abierto como draft; espera los pasos 2, 4 y 5 |
| 7 | Mandarle al usuario el link fijo UNA vez (su app vieja no tiene aviso de updates) | Dafel | pendiente |

Actualiza esta tabla cuando cambie el estado.

## Comandos de operación

```bash
gh pr checks <n> --watch                       # esperar CI del PR
gh run list --workflow release.yml -L 3        # último release
gh run watch <run-id> --exit-status            # seguirlo hasta el final
gh run view <run-id> --log-failed              # por qué falló
gh release view --json tagName,assets          # último APK publicado
npx eas-cli update:list --branch production --limit 5 --non-interactive
npx eas-cli build:list -p android -e production --limit 5 --non-interactive
```

Tiempos: un OTA tarda ~3-5 min de CI. Un APK tarda la cola de EAS (plan gratis, baja prioridad: puede pasar de 90 min) + ~15 min de build. El job tiene tope de 180 min.

## Rollback

- **OTA malo**: `npx eas-cli update:rollback <group-id> --non-interactive -m "rollback: <motivo>"` republica el update anterior (o el embebido). El group id sale de `update:list`. Después se corrige con un PR normal.
- **APK malo**: Android no permite bajar de `versionCode`. Se corrige hacia adelante: si el arreglo es JS, sale como OTA sobre ese mismo build.
- Nunca rompas el esquema de la DB (ver `arquitectura.md` → Cambios de esquema): un rollback de JS no deshace una migración.

## Problemas conocidos

| Síntoma | Causa | Qué hacer |
|---|---|---|
| "App no instalada" / "conflicto con un paquete existente" | Firma distinta o `versionCode` menor | **No desinstalar.** Revisar la keystore en EAS (paso 4). Desinstalar borra la DB. |
| El APK no instala: "bloqueado por Play Protect / fuentes desconocidas" | Permiso de instalar apps de Chrome/WhatsApp | Ajustes → Apps → Chrome → Instalar apps desconocidas → permitir |
| Release falla en `eas build` con "credentials" | `--freeze-credentials` impidió crear credenciales | Correcto que falle: revisar `eas credentials`; nunca quitar el flag para "arreglarlo" |
| Release falla: "Not logged in" / 401 | `EXPO_TOKEN` vencido o ausente | Dafel crea otro token y lo carga con `gh secret set EXPO_TOKEN` |
| Jobs fallan en 2 s sin logs; anotación "account is locked due to a billing issue" | Bloqueo de facturación de la cuenta de GitHub. Actions se apaga incluso en repos públicos | Publicar en modo local. Dafel lo resuelve en https://github.com/settings/billing |
| El usuario no ve el cambio OTA | La app estaba abierta en segundo plano | Cerrarla del todo (quitarla de recientes) y abrirla |
| Cuota: "build limit reached" | Plan gratis: 15 builds Android/mes, se reinicia el día 1 | Esperar al mes siguiente, o hacer un build local en el runner (`eas build --local`; el runner ubuntu-24.04 trae JDK 17 y Android SDK) |

## Cuotas y límites (plan gratis EAS)

- Builds: 15 Android/mes. Cola de baja prioridad, timeout de 45 min por build.
- Updates: 1.000 usuarios activos/mes, 100 GiB de transferencia. Sobra para un solo usuario.
- Links de artefactos de EAS: expiran. Por eso el APK se re-publica en GitHub Releases.
- GitHub Actions: minutos ilimitados en repo público.

## Riesgo futuro: verificación de desarrolladores de Android

- Google exige desarrollador verificado para instalar APKs por fuera de Play en dispositivos certificados. Desde el 2026-09-30 aplica solo en Brasil, Indonesia, Singapur y Tailandia; el despliegue global está anunciado para 2027.
- Antes de que llegue a Colombia: registrar a Dafel en el Android Developer Console. La cuenta de "distribución limitada" es gratis y cubre hasta 20 dispositivos. Registrar ahí `com.uberfinanzas.app` con la misma keystore.
- Fuente: https://developer.android.com/developer-verification

## Por qué no Google Play (decisión 2026-09-22)

- Cuesta US$25 y exige verificación de identidad. La prueba interna usa AAB, no APK.
- Play re-firma con su propia llave por defecto: el APK instalado hoy (llave EAS) no se actualizaría desde Play sin desinstalar, y desinstalar pierde los datos.
- Si algún día se migra: en Play Console elegir "subir tu propia llave de firma" con la keystore de EAS.

## Mensaje para el usuario (APK nuevo)

> Papá, hay una versión nueva de Uber Finanzas. Abre la app y toca el aviso verde de arriba, o abre este link: https://github.com/daniellp-rubio/uber-finanzas/releases/latest/download/uber-finanzas.apk → Descargar → Instalar. NO desinstales la app vieja: se instala encima y tus datos quedan igual.

Para un update OTA no hace falta mensaje: le llega solo la próxima vez que abra la app.
