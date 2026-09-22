---
name: uber-finanzas
description: >-
  Manual operativo del repo uber-finanzas: app Android (Expo SDK 54, React Native, SQLite local)
  de finanzas para un conductor de Uber, usada a diario por el papá de Dafel. Trae arquitectura,
  convenciones, reglas que protegen sus datos y el pipeline automático
  funcionalidad → aprobación → PR → merge → release (update OTA o APK en GitHub Releases).
  Cárgala SIEMPRE que la sesión toque este repo, aunque la tarea parezca pequeña: nueva
  funcionalidad, bug, cambio de textos o UI, pantallas Hoy/Historial/Balance/Fondos, base de
  datos, notificaciones o jornada, cálculos (balance, ganancia real, pico y placa, DIAN, fondos,
  deudas), dependencias, app.json/eas.json, build, APK, EAS, OTA, release, PR, merge, "súbelo",
  "publícalo", "que le llegue a mi papá", "¿qué versión tiene?".
---

# Uber Finanzas

App de finanzas diarias para un conductor de Uber en Colombia: ingresos, gastos, balance del mes, fondos y deudas. **El usuario final es el papá de Dafel**: no es técnico, usa Android y ya tiene datos reales en la app. Cada decisión se mide contra dos preguntas: ¿sus datos quedan intactos? ¿le llega sin que tenga que hacer nada?

## Reglas duras

1. **Sus datos son irrecuperables.** Viven solo en la SQLite del celular, sin backup. Todo cambio de esquema es aditivo y va versionado con `PRAGMA user_version`: nunca `DROP`, `RENAME` ni cambio de tipo. Antes de tocar `src/db.ts`, lee "Cambios de esquema" en `references/arquitectura.md`. Un rollback de OTA no deshace una migración.
2. **Nunca pedirle que desinstale.** Desinstalar borra la DB. Si un APK no instala encima, el problema es de firma o de versionCode: se para y se diagnostica (ver `references/release.md` → Problemas conocidos).
3. **Una sola llave de firma.** Los builds usan la keystore de EAS con `--freeze-credentials`. Nunca quites ese flag ni generes credenciales nuevas: otra llave deja al usuario sin poder actualizar.
4. **Repo público.** Cero secretos en el código. `EXPO_TOKEN` vive solo en los secrets de GitHub. La keystore nunca entra al repo (`*.jks` ya está ignorado).
5. **Git:** rama desde `main` actualizado (`feat/…`, `fix/…`, `chore/…`); commits en inglés, conventional; PR siempre; `gh pr merge --squash --delete-branch`; nunca push directo ni force push a `main`.
6. **UI para un usuario no técnico:** español de Colombia, textos cortos y concretos, botones grandes, confirmación en toda acción destructiva, pista visible para cualquier gesto (mantener presionado). Sin jerga ("sincronizar", "caché", "OTA").
7. **Costo cero, sin excepción.** Este proyecto no tiene presupuesto. No agregues servicios, planes, dominios, tiendas ni APIs de pago. GitHub tiene una tarjeta guardada solo para desbloquear Actions, protegida con 6 topes en $0 con "Stop usage": nunca los subas ni los borres, y nunca aceptes una prueba gratis ni un "Upgrade". Si la única forma de hacer algo cuesta dinero, no la ejecutes: díselo y propón la alternativa gratis (tabla "Costo" en `references/release.md`).
8. **Prefiere JS puro.** Una dependencia nativa o un cambio en `app.json` obliga a un APK nuevo: el usuario debe tocar el aviso e instalar, y se gasta cuota de EAS (15/mes). Si hay alternativa sin nativo, úsala; si no, avísalo antes de pedir aprobación.

## Flujo: Dafel pide una funcionalidad → le llega al papá

**Autorización permanente (Dafel, 2026-09-22):** cuando Dafel aprueba una funcionalidad, eso ya autoriza el commit, el PR, el merge y la publicación. No vuelvas a preguntar entre esos pasos. Solo te detienes si algo falla o si el alcance cambia respecto de lo aprobado.

1. **Preparar**
   ```bash
   git switch main && git pull --ff-only && git switch -c feat/<slug>
   ```
   Lee `references/arquitectura.md` y solo los archivos que vas a tocar. Si la duda es de dominio (qué número anota el papá, cómo cobra Uber), pregunta: no inventes reglas de negocio.
2. **Implementar** imitando las convenciones del código: estilos `s`, paleta, `formatCurrency`, fechas `YYYY-MM-DD` locales, DB síncrona con parámetros `?`, `Alert` para confirmar.
3. **Verificar**, todo en verde antes de mostrar nada:
   ```bash
   npm run check        # tsc --noEmit + expo export android (el bundle que viaja por OTA)
   npx expo-doctor
   ```
4. **Pedir aprobación.** Muéstrale a Dafel:
   - qué cambia para el papá, en 1-3 líneas, en lenguaje de usuario;
   - los archivos tocados y el diff relevante;
   - **si sale como OTA o como APK nuevo**, y por qué (tabla en `references/release.md`);
   - riesgos: si toca el esquema, qué migración corre;
   - opcional, para probar: `npx expo start` → Expo Go en su celular.

   Espera un sí explícito ("dale", "aprobado", "súbelo").
5. **Publicar**, sin más preguntas:
   ```bash
   git add <archivos> && git commit -m "feat: <qué>" -m "<por qué>" -m "<línea Co-Authored-By del system-reminder>"
   git push -u origin HEAD
   gh pr create --base main --title "feat: …" --body-file <scratchpad>/pr.md
   gh pr checks --watch            # CI: check + release-forecast
   gh pr merge --squash --delete-branch
   git switch main && git pull --ff-only
   ```
   Luego publica según el modo (ver `references/release.md` → "Dos modos"):
   - **Actions (default, $0)**: el merge dispara `release.yml` solo. Síguelo con `gh run list --workflow release.yml -L 1` y `gh run watch <run-id> --exit-status`, en background: un APK puede tardar más de 90 min en la cola de EAS.
   - **Local (respaldo)**: solo si `release.yml` no arrancó o falló por infraestructura. Corre `scripts/release.sh` desde `main` limpio. Nunca en paralelo con un `release.yml` del mismo merge: construiría dos APK.

   El body del PR lleva: resumen para el usuario, cambios técnicos, plan de prueba con los comandos del paso 3, pronóstico OTA/APK y la línea de atribución de Claude Code. Sin CI, el pronóstico sale de `scripts/release.sh forecast`.
   Si CI falla, mira primero la anotación del job (`gh api repos/daniellp-rubio/uber-finanzas/check-runs/<job-id>/annotations`):
   - "account is locked due to a billing issue" no es un fallo del código: volvió el bloqueo de facturación. Con el paso 3 en verde, mergea, publica en modo local y avísale a Dafel que revise la tarjeta en GitHub.
   - Cualquier otro fallo: corrige, push y vuelve a esperar. Si falla dos veces por la misma causa, para y reporta.
6. **Reportar a Dafel:**
   - OTA: "Publicado. Le llega a tu papá la próxima vez que abra la app (si la tiene abierta, que la cierre del todo)."
   - APK: el link fijo más el mensaje listo para WhatsApp de `references/release.md`. La app también le mostrará el aviso verde.

Si la tarea cambia la arquitectura, el esquema, el pipeline o resuelve deuda, actualiza la referencia correspondiente **en el mismo PR**.

## Estado de la configuración

Mientras el paso de configuración inicial no esté completo (tabla en `references/release.md`), el paso 5 no funciona de punta a punta. Revisa esa tabla antes del primer release de la sesión. Si falta algo que solo Dafel puede hacer (login de Expo, `EXPO_TOKEN`), díselo en una línea, con el comando exacto para correr en **su** terminal.

## Mapa rápido

| Quiero cambiar… | Archivo |
|---|---|
| Tabs, arranque, aviso de APK nuevo | `App.tsx` |
| Pantalla Hoy / Historial / Balance / Fondos | `components/<X>Screen.tsx` |
| Alta de ingreso-gasto / gasto fijo / deuda | `components/Add*Modal.tsx` |
| Tablas y queries | `src/db.ts` |
| Categorías | `src/categories.ts` (gastos fijos: `AddFixedExpenseModal.tsx` + `CAT_ICONS` en `BalanceScreen.tsx`) |
| Semáforo del mes | `src/financeCalc.ts` |
| Vehículo, ganancia real, pico y placa, DIAN | `src/vehicleCalc.ts` |
| Moneda y fechas | `src/format.ts` |
| Recordatorios de jornada | `src/notifications.ts` |
| OTA al arrancar, chequeo de APK nuevo, etiqueta de versión | `src/updates.ts` |
| Pipeline | `scripts/release.sh` (toda la lógica), `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `eas.json`, `app.json` → `updates` / `runtimeVersion` |

## Referencias (lee solo la que toque)

| Archivo | Cuándo |
|---|---|
| `references/arquitectura.md` | Antes de escribir código: stack, mapa, modelo de datos, migraciones, convenciones, paleta, fórmulas del dominio |
| `references/release.md` | Antes de publicar o si algo del release falla: OTA vs APK, configuración inicial, comandos, rollback, problemas, cuotas, mensaje para el papá |
| `references/deuda-tecnica.md` | Al proponer mejoras o si la tarea toca una zona con riesgo conocido |
