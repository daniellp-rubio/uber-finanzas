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
| **Actions** (default desde 2026-09-22) | Siempre que Actions arranque. Es gratis en repo público y `EXPO_TOKEN` está en los secrets | Automático al mergear a `main`. Se sigue con `gh run list --workflow release.yml -L 1` y `gh run watch <id> --exit-status` |
| **Local** (respaldo) | Solo si `release.yml` no arrancó (por ejemplo, vuelve el bloqueo de facturación) o falló por infraestructura, no por código | Claude, desde `main` limpio e igual a `origin/main`: `scripts/release.sh`. Necesita `npx eas-cli login` hecho y `gh` autenticado. Un APK tarda: correrlo en background |

**Nunca los dos para el mismo merge.** Si `release.yml` ya corrió o sigue corriendo, correr el script local construye otro APK y gasta cuota dos veces.

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
| 0 | Bloqueo de facturación de GitHub. Causa: la tarjeta guardada falló la retención de autorización ("authorization hold failed"). Sin deuda: plan Free, $0 de uso | Dafel | resuelto 2026-09-22: Dafel puso otra tarjeta; Claude creó el tope de Sandbox y dejó **6 topes en $0 con Stop usage** (Actions, Codespaces, Packages, Git LFS, AI credits, Sandbox). CI re-corrido en verde (run 35761386049) |
| 1 | Repo público `daniellp-rubio/uber-finanzas`, rama `main`, solo squash, borrar rama al mergear | Claude | hecho 2026-09-22 |
| 2 | `npx eas-cli login` en la máquina local | Dafel, en su terminal | hecho 2026-09-22 (cuenta daniellp-rubio) |
| 3 | *(Solo modo Actions)* Access token en expo.dev → Account settings → Access tokens → secret `EXPO_TOKEN` del repo | Dafel: `gh secret set EXPO_TOKEN --repo daniellp-rubio/uber-finanzas` en su terminal | hecho 2026-09-22; probado: `release-forecast` corrió en CI con el token |
| 4 | Verificar llave: `npx eas-cli credentials -p android` → **una sola** keystore para `com.uberfinanzas.app`, la misma con que se firmó el APK que ya tiene el usuario (salió del perfil `preview`, versionCode ≤ 2) | Claude, con Dafel logueado | hecho 2026-09-22: 1 keystore JKS default, SHA-256 `c4ac4463…eeed814`, creada 2026-05-14 03:36 UTC con el primer build y nunca modificada; los 3 APK `preview` son posteriores. Los artefactos de mayo ya expiraron (404), así que no se pudo leer la firma del APK instalado directamente |
| 5 | Backup de la keystore: `eas credentials` → Android → `credentials.json` → Download → guardar FUERA del repo (gestor de contraseñas) | Dafel | hecho 2026-09-22 (según Dafel) |
| 6 | Un solo PR con el pipeline y las fases (reemplaza al PR #1) → merge → release construye build 3 | Claude | 2026-09-23: Dafel aprobó todo ("súbelo"). PR desde `feat/extras`; al mergear, `release.yml` construye el build 3 solo |
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
| Jobs fallan en 2 s sin logs; anotación "account is locked due to a billing issue" | Bloqueo de facturación de la cuenta de GitHub. Actions se apaga incluso en repos públicos. En 2026-09-22 fue una tarjeta que falló la retención de autorización | Publicar en modo local. Revisar el aviso en https://github.com/settings/billing/payment_information; Dafel cambia la tarjeta. Nunca pagar ni subir los topes |
| El usuario no ve el cambio OTA | La app estaba abierta en segundo plano | Cerrarla del todo (quitarla de recientes) y abrirla |
| Cuota: "build limit reached" | Plan gratis: 15 builds Android/mes, se reinicia el día 1 | Esperar al mes siguiente, o hacer un build local en el runner (`eas build --local`; el runner ubuntu-24.04 trae JDK 17 y Android SDK) |

## Costo: todo en $0 (verificado 2026-09-22)

| Servicio | Uso | Costo | Por qué no cobra |
|---|---|---|---|
| GitHub repo público + Releases | Código y link fijo del APK | $0 | Gratis en repos públicos |
| GitHub Actions | CI y release | $0 | "Free for public repositories that use standard GitHub-hosted runners" (docs.github.com) |
| Tarjeta en GitHub | Solo para quitar el bloqueo de Actions | $0 | 6 topes en $0 con "Stop usage" cubren todo lo que se cobra por consumo. La retención de autorización no es un cobro. Lo único que un tope no frena es un plan o una prueba gratis que se active a mano |
| EAS Build (plan Free) | APK | $0 | "Free plan accounts do not incur overage charges": al agotar los 15 builds se bloquea hasta el día 1, no cobra (docs.expo.dev/billing/faq) |
| EAS Update (plan Free) | OTA | $0 | Límite de 1.000 usuarios/mes; hay 1 |
| Build local (`eas build --local`) | Plan B si se agota la cuota | $0 | Corre en la máquina o el runner |
| Cuenta Android de distribución limitada (2027) | Seguir instalando APK fuera de Play | $0 | Hasta 20 dispositivos, sin pago |
| ~~Google Play~~ | — | US$25 | **Descartado** |
| ~~Apple / iOS~~ | — | US$99/año | **Descartado** (el usuario usa Android) |

Reglas para seguir en $0:
- **Expo:** nunca subir de plan ni agregar método de pago.
- **GitHub:** la tarjeta existe solo para desbloquear Actions (decisión de Dafel, 2026-09-22).
  - Nunca subir ni borrar los 6 topes en $0 de https://github.com/settings/billing/budgets.
  - Nunca aceptar una prueba gratis ni un "Upgrade" (Copilot Pro, GitHub Pro). Con tarjeta guardada, la prueba pasa sola a pago.
  - Si GitHub agrega un producto nuevo que se cobra por consumo, crearle su tope en $0: sin tope, el uso es ilimitado.
- Si una necesidad nueva solo se resuelve pagando, para y consulta.

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
