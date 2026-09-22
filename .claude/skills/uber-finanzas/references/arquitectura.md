# Arquitectura de Uber Finanzas

Estado escaneado el 2026-09-22. Si cambias la estructura, actualiza este archivo en el mismo PR.

## Stack

| Pieza | Versión | Nota |
|---|---|---|
| Expo SDK | 54 (`expo ~54.0.x`) | `newArchEnabled: true` |
| React Native | 0.81.5 | React 19.1 |
| TypeScript | ~5.9, `strict: true` | `tsconfig` extiende `expo/tsconfig.base` |
| Persistencia | `expo-sqlite ~16` | API **síncrona** (`getAllSync`, `runSync`) |
| Notificaciones | `expo-notifications ~0.32` | Solo locales, sin push |
| Navegación | ninguna librería | Tabs a mano en `App.tsx` |
| `.npmrc` | `legacy-peer-deps=true` | CI y local deben respetarlo (`npm ci` lo lee) |

Dependencias instaladas y **sin usar**: `zustand`, `expo-status-bar`. No las uses sin quitarlas de la lista de deuda.

## Mapa de archivos

```
index.ts                 registerRootComponent(App)
App.tsx                  Arranque (update OTA → initDatabase + setupNotifications → avisos de carros), tab bar, modal de transacción
components/
  TodayScreen.tsx        Tab "Hoy": jornada (recordatorios), avisos de carros, resumen del día, calculadora ganancia real, lista del día
  HistoryScreen.tsx      Tab "Historial": semana / mes, totales, mejor día, detalle por día
  BalanceScreen.tsx      Tab "Balance": estado del mes (verde/amarillo/rojo), gastos fijos, deudas, pico y placa, DIAN, config Uber (Pass / comisión)
  FundsScreen.tsx        Tab "Fondos": sobres virtuales (incluye FundActionModal y FundDetailModal internos)
  VehiclesScreen.tsx     Tab "Carros": lista → detalle (vista dentro del tab, no Modal; el botón atrás de Android vuelve).
                         Internos: DocModal (vencimientos), PlanModal (cada cuánto), OdometerModal, SheetFrame
  VehicleFormModal.tsx   Alta/edición de carro (gasolina o eléctrico, con valores típicos por tipo)
  MaintenanceModal.tsx   Registro de mantenimiento; opcionalmente lo anota como gasto 🔧 Mecánico
  DateField.tsx          Fecha escrita DD/MM/AAAA con eco en palabras (sin selector nativo)
  AddTransactionModal.tsx  Alta de ingreso/gasto; categoría Uber Pass pre-llena el monto; toggle efectivo (solo sin Uber Pass) → registra comisión Uber como gasto automático
  AddFixedExpenseModal.tsx Alta de gasto fijo mensual (categorías propias, distintas a las de transacciones)
  AddDebtModal.tsx       Alta de deuda (cuota mensual + meses restantes opcional)
src/
  db.ts                  Singleton SQLite, esquema, todas las queries
  categories.ts          Categorías de ingreso/gasto + helpers label/icon
  financeCalc.ts         computeBalance(): objetivo diario y semáforo del mes
  fleet.ts               Constantes de flota (energía, valores típicos, tipos de mantenimiento, documentos) y cálculos puros
                         (próximo mantenimiento, vencimientos, avisos). No importa la DB: db.ts importa de aquí
  vehicleCalc.ts         Config = carro activo + Uber (app_settings), ganancia real, comisión efectivo, pico y placa, DIAN, getFleetAlerts
  format.ts              Moneda COP, fechas locales YYYY-MM-DD, fechas en español, DD/MM/AAAA, sumar meses/días, km
  notifications.ts       Canal Android, permisos, jornada (8 recordatorios cada 2 h), avisos de carros (data.kind = 'vehicle')
  updates.ts             (pipeline) Aplica updates OTA al arrancar; detecta APK nuevo en GitHub Releases
assets/                  icon, adaptive-icon, splash-icon, favicon
```

## Modelo de datos (`uber-finanzas.db`, WAL)

| Tabla | Columnas | Borrado |
|---|---|---|
| `transactions` | id, type (`income`/`expense`), amount REAL, category, note, date `YYYY-MM-DD` | **físico** (`DELETE`) |
| `fixed_expenses` | id, name, amount, category, active | lógico (`active = 0`) |
| `debts` | id, name, monthly_payment, months_remaining (NULL = indefinida), active | lógico |
| `funds` | id, name, icon, color, balance, active | lógico (no hay UI de borrado) |
| `fund_movements` | id, fund_id, amount (+ depósito / − retiro), note, date | nunca |
| `app_settings` | key PK, value TEXT | `INSERT OR REPLACE` |
| `vehicles` (v1) | id, name, plate, energy (`gasoline`/`electric`), km_per_gallon, gas_price, kwh_per_100km, kwh_price, pico_placa_days, maint_cost_per_km, odometer_km, odometer_date, active | lógico |
| `maintenance` (v1) | id, vehicle_id, kind, date, km, cost, shop, note, transaction_id (gasto creado con él), active | lógico; borra su gasto (físico) |
| `maintenance_plan` (v1) | id, vehicle_id, kind, every_km, every_months, active | lógico |
| `vehicle_docs` (v1) | id, vehicle_id, kind (`soat`/`rtm`/`tax`/`insurance`), due_date, cost; UNIQUE(vehicle_id, kind) | upsert; `due_date` NULL = sin fecha |

- Índices: `idx_date` sobre `transactions(date)`, `idx_maintenance_vehicle` sobre `maintenance(vehicle_id)`.
- Semilla: si `funds` está vacía se crean Emergencias, Mecánico, Multas/Legal, Pensión.
- Claves de `app_settings`: `uber_commission_pct`, `uber_pass_active` (`'1'`/`'0'`, default `'1'`), `uber_pass_price_cop` (default 90000), `active_vehicle_id` (el carro que maneja el usuario). Una clave nueva no es cambio de esquema: `getSetting` devuelve el default si no existe.
- Claves **heredadas**: `km_per_gallon`, `gas_price_cop`, `pico_placa_days_week`, `maintenance_cost_per_km`. El JS actual ya no las usa; siguen ahí para el JS viejo si hay rollback de OTA. La migración 1 las copió al carro sembrado.
- `funds.balance` es un acumulado desnormalizado: `addFundMovement` inserta el movimiento y suma al balance (dos sentencias, sin transacción).
- **Migraciones con `PRAGMA user_version`** (`MIGRATIONS` en `db.ts`; `runMigrations` corre al final de `initDatabase`). Versión actual: **1** (carros, mantenimientos, vencimientos; siembra "Renault Duster" con la config que el usuario tenía y lo deja como carro activo). El bloque `CREATE TABLE IF NOT EXISTS` inicial solo cubre las tablas originales.

### Cambios de esquema (obligatorio leer antes de tocar `db.ts`)

El celular del usuario ya tiene datos reales. Una migración mala = datos perdidos sin backup.

1. Solo cambios **aditivos**: tabla nueva, columna nueva con `DEFAULT`, índice nuevo. Nunca `DROP`, `RENAME` ni cambiar el tipo de una columna.
2. Agrega una función **al final** de `MIGRATIONS` en `db.ts` (`/* 2: … */ db => { … }`). Nunca edites ni reordenes una migración ya publicada: en el celular ya corrió y no vuelve a correr. Tampoco la hagas depender de constantes que puedan cambiar (la 1 escribe sus `DEFAULT` como literales). `runMigrations` ejecuta cada una en transacción junto con `PRAGMA user_version = n`.
3. Prueba la migración contra el esquema viejo antes del PR: transpila el `db.ts` viejo (`git show main:src/db.ts`) y el nuevo con `typescript.transpileModule`, simula `expo-sqlite` sobre `node:sqlite` (Node ≥ 22) y verifica datos intactos, siembra correcta, que reabrir no duplica y que el JS viejo sigue funcionando sobre el esquema nuevo.
4. Un update OTA puede revertirse (rollback) a JS viejo: el JS viejo debe seguir funcionando con el esquema nuevo. Por eso solo cambios aditivos y columnas nullable o con default.

## Convenciones de código (imitarlas)

- **Componentes**: `export default function XScreen()`. Estado local con `useState`; datos cargados con `const load = useCallback(() => {...}, [])` + `useEffect(() => { load(); }, [load])`. Tras escribir en la DB se llama `load()` otra vez. No hay store global.
- **Refresco entre pantallas**: `App.tsx` pasa `refreshTrigger` (contador) a `TodayScreen`. Las otras tabs se desmontan al cambiar de tab y recargan al montar.
- **DB**: funciones exportadas en `src/db.ts`, siempre síncronas y con parámetros `?` (nunca interpolar valores del usuario en SQL).
- **Estilos**: `StyleSheet.create` al final del archivo en una constante `s` (subcomponentes usan `fs`, `fd`). Claves alineadas en columna.
- **Modales**: `<Modal animationType="slide" presentationStyle="pageSheet" onRequestClose=...>`; dentro, `KeyboardAvoidingView` + `SafeAreaView` de `react-native-safe-area-context`; barra superior con "✕ Cancelar", título y spacer `width: 80`; botón de guardar grande abajo.
- **Montos**: el input guarda solo dígitos (`t.replace(/\D/g, '')`) y muestra `Number(raw).toLocaleString('es-CO')`. Para pintar dinero usar siempre `formatCurrency` (redondea, separador `.`, sin signo; el signo se antepone a mano).
- **Fechas**: strings locales `YYYY-MM-DD` (`todayString()`); nunca `toISOString()` (UTC corre el día en Colombia de noche). Para pedir una fecha usa `DateField` (no hay selector nativo; agregarlo obliga a APK). Helpers en `format.ts`: `parseDMY`, `addMonths`, `addDays`, `daysBetween`, `formatDate`, `formatKm`.
- **Detalle dentro de un tab**: estado `selected` + `BackHandler` para el botón atrás de Android (ver `VehiclesScreen`). Así los modales del detalle no quedan anidados dentro de otro `Modal`.
- **Confirmaciones**: toda acción destructiva pasa por `Alert.alert` con botón `style: 'destructive'`. Borrar = mantener presionado, siempre con texto de pista visible debajo.
- **Textos**: español de Colombia, tuteo, frases cortas. Iconos = emojis.
- **Comentarios**: separadores `// ─── Sección ───` y comentarios cortos en español.

### Paleta (tema oscuro fijo, `userInterfaceStyle: dark`)

| Uso | Color |
|---|---|
| Fondo | `#121212` |
| Tarjetas | `#1a1a1a`, `#1e1e1e`; inputs `#262626` |
| Verde (ingreso, OK, acción primaria) | `#00C853` · fondos `#0a2e1a`, `#0a3020`, `#0d3320` |
| Rojo (gasto, peligro) | `#F44336` · fondos `#2e0a0a`, `#3d0a0a` |
| Amarillo (aviso, neto) | `#FFC107` · fondos `#1a1a00`, `#2a1f00` |
| Texto | `#fff` principal · `#aaa` / `#888` secundario · `#666` / `#555` / `#444` pistas |

## Lógica de dominio

- **Balance del mes** (`financeCalc.ts`): obligaciones = gastos fijos + cuotas de deudas. Objetivo diario = obligaciones / 24 días laborales. Promedio = neto del mes / días con ingreso. Verde ≥ 90 % del objetivo, amarillo ≥ 65 %, rojo por debajo o si el neto es negativo. Días laborales restantes ≈ 80 % de los días calendario que quedan.
- **Uber Pass** (desde 2026-09, lo usa el papá): Uber cobra una suscripción 2 veces por semana (~$90.000 cada una) en vez de comisión por viaje. El usuario registra cada cobro como gasto `uber_pass`. Interruptor "Tengo Uber Pass" en Balance → Configurar Uber.
- **Carro activo** (`active_vehicle_id`): de él salen la energía por km, el pico y placa y el mantenimiento por km. Si fue quitado, se usa el primer carro.
- **Energía por km** (`energyCostPerKm`): gasolina = precio galón / km por galón; eléctrico = kWh cada 100 km / 100 × precio kWh (BYD: 17,5 × $958 ≈ $168/km).
- **Ganancia real** (`calcRealEarnings`):
  - Con Uber Pass: bruto − Uber Pass por día trabajado − energía (km × energía por km) − mantenimiento (km × COP/km).
  - Uber Pass por día trabajado (`calcUberPassPerWorkDay`) = valor × 2 / (7 − días de pico y placa del carro activo). Duster en Medellín: 180.000 / 6 = 30.000; eléctrico sin pico y placa: 180.000 / 7 ≈ 25.714.
  - Sin Uber Pass: la comisión Uber (%) reemplaza la línea de Uber Pass.
- **Efectivo** (solo sin Uber Pass): al guardar un ingreso en efectivo se crea también un gasto `other` por la comisión Uber (`Comisión Uber en efectivo (X%)`). Con Uber Pass el interruptor de efectivo no se muestra.
- **Pico y placa**: del carro activo. Días bloqueados = días/semana × (días del mes / 7); pérdida = días bloqueados × promedio diario. Con 0 días (eléctrico), Balance dice que el carro no tiene pico y placa.
- **Mantenimiento** (`fleet.ts`): cada `maintenance_plan` dice cada cuánto (km y/o meses; lo que pase primero). Próximo = último registro de ese tipo + intervalo. Amarillo a ≤ 30 días o ≤ 1.000 km; rojo si se pasó. Sin registro = "Registra el último que le hiciste" (sin aviso). Un carro nuevo trae plan: gasolina 10.000 km / 12 meses (Renault), eléctrico 12.000 km / 12 meses (BYD Colombia; el manual dice 20.000, se usa el menor para cuidar la garantía).
- **Kilometraje**: `odometer_km` se actualiza a mano (tab Carros) o al registrar un mantenimiento con más km. Si hay planes por km y el dato tiene más de 15 días, sale el aviso "actualiza el kilometraje".
- **Vencimientos**: SOAT, técnico-mecánica, impuesto, seguro. Amarillo a ≤ 30 días, rojo vencido. `cost` es opcional (servirá para el costo anual en la fase de arriendo).
- **Avisos**: `getFleetAlerts()` junta los de todos los carros (rojos primero); Hoy muestra los 2 primeros y lleva a Carros. Notificaciones (`refreshVehicleReminders`, al arrancar y tras cada cambio en Carros): vencimientos 15 días antes y el día anterior, mantenimientos por fecha 7 días antes, a las 9:00. Los mantenimientos por km solo avisan dentro de la app.
- **DIAN**: constantes **2025** (UVT 49.799, umbral 1.340 UVT, deducible fijo 40 %, tarifa simplificada 19 % sobre 1.090 UVT). Orientativo; hay que actualizarlo cada año.
- **Jornada**: `startWorkDay` cancela los recordatorios de jornada, programa una confirmación a los 5 s y 8 recordatorios cada 2 h. "Jornada activa" = hay notificaciones programadas que **no** son avisos de carro (`content.data.kind !== 'vehicle'`). No uses `cancelAllScheduledNotificationsAsync`: borraría los avisos de SOAT y mantenimiento.

## Cómo probar un cambio localmente

- `npx tsc --noEmit`: tipos.
- `npx expo export --platform android --output-dir <scratchpad>/export`: compila el bundle JS igual que un update OTA; detecta imports rotos.
- `npx expo-doctor`: versiones de dependencias contra el SDK.
- En un celular (opcional, lo hace Dafel): `npx expo start` y abrir con Expo Go (SDK 54). SQLite y notificaciones locales funcionan en Expo Go; `expo-updates` no (se desactiva en dev).
