# Arquitectura de Uber Finanzas

Estado escaneado el 2026-09-22; actualizado el 2026-09-23 (cargas, horas, meta, copia de seguridad, PDF, DIAN 2026). Si cambias la estructura, actualiza este archivo en el mismo PR.

## Stack

| Pieza | Versión | Nota |
|---|---|---|
| Expo SDK | 54 (`expo ~54.0.x`) | `newArchEnabled: true` |
| React Native | 0.81.5 | React 19.1 |
| TypeScript | ~5.9, `strict: true` | `tsconfig` extiende `expo/tsconfig.base` |
| Persistencia | `expo-sqlite ~16` | API **síncrona** (`getAllSync`, `runSync`) |
| Notificaciones | `expo-notifications ~0.32` | Solo locales, sin push |
| Archivos | `expo-file-system ~19` (API nueva `File`/`Paths`), `expo-sharing`, `expo-document-picker`, `expo-print` | Copia de seguridad y PDF. Nativos: entraron en el build 3 |
| Navegación | ninguna librería | Tabs a mano en `App.tsx` |
| `.npmrc` | `legacy-peer-deps=true` | CI y local deben respetarlo (`npm ci` lo lee) |

Dependencias instaladas y **sin usar**: `zustand`, `expo-status-bar`. No las uses sin quitarlas de la lista de deuda.

## Mapa de archivos

```
index.ts                 registerRootComponent(App)
App.tsx                  Arranque (update OTA → initDatabase + setupNotifications → avisos de carros y de copia), tab bar, modal de transacción
components/
  TodayScreen.tsx        Tab "Hoy": jornada (recordatorios + hora de inicio/fin), avisos de carros, meta del día, resumen del día,
                         calculadora ganancia real con "separa $X para el mecánico" (→ fondo Mecánico), lista del día
  HistoryScreen.tsx      Tab "Historial": semana / mes, totales, mejor día, resumen por WhatsApp (Share), ganancia por hora
                         (día vs noche, por día de la semana), detalle por día
  BalanceScreen.tsx      Tab "Balance": estado del mes (verde/amarillo/rojo), gastos fijos, deudas, pico y placa, DianSection,
                         MyDataSection, config Uber (Pass / comisión)
  DianSection.tsx        Renta del año (DIAN 2026) proyectada con lo anotado
  MyDataSection.tsx      Copia de seguridad (guardar / recuperar) y resumen de ingresos en PDF (IncomePdfModal)
  FundsScreen.tsx        Tab "Fondos": sobres virtuales (incluye FundActionModal y FundDetailModal internos)
  VehiclesScreen.tsx     Tab "Carros": lista → detalle (vista dentro del tab, no Modal; el botón atrás de Android vuelve).
                         Internos: DocModal (vencimientos), PlanModal (cada cuánto), OdometerModal
  RentalSection.tsx      Sección "Arriendo" del detalle: estado de pagos, depósito, km, pagos.
                         Internos: RentalFormModal (contrato), PaymentModal, EndRentalModal (devolución)
  VehicleEconomics.tsx   "¿Cuánto te deja al mes?" (arrendado) o "Lo que te cuesta tenerlo" (propio); CostsModal (crédito + GPS)
  SheetFrame.tsx         Marco de los modales pequeños + estilos compartidos `ms` (Carros y arriendo)
  VehicleFormModal.tsx   Alta/edición de carro (gasolina o eléctrico, con valores típicos por tipo)
  MaintenanceModal.tsx   Registro de mantenimiento; opcionalmente lo anota como gasto 🔧 Mecánico
  DateField.tsx          Fecha escrita DD/MM/AAAA con eco en palabras (sin selector nativo)
  AddTransactionModal.tsx  Alta de ingreso/gasto; categoría Uber Pass pre-llena el monto; toggle efectivo (solo sin Uber Pass) → registra comisión Uber como gasto automático;
                           con carro eléctrico ⚡ Carga reemplaza a ⛽ Gasolina y pide kWh y lugar (addCharge)
  AddFixedExpenseModal.tsx Alta de gasto fijo mensual (categorías propias, distintas a las de transacciones)
  AddDebtModal.tsx       Alta de deuda (cuota mensual + meses restantes opcional)
src/
  db.ts                  Singleton SQLite, esquema, todas las queries
  categories.ts          Categorías de ingreso/gasto + helpers label/icon; RENT_CATEGORY ('rent', ingreso que crea el arriendo, oculto en el selector);
                         CHARGE_CATEGORY ('charge', gasto ⚡ Carga)
  financeCalc.ts         computeBalance(): objetivo diario y semáforo del mes; calcDailyGoal(): meta del día en Hoy
  workStats.ts           Puro: jornadas → días de trabajo → ganancia por hora (total, día/noche, por día de la semana)
  summary.ts             Texto del resumen para WhatsApp
  dian.ts                Renta: UVT 2026, tabla art. 241, topes para declarar, proyección del año (projectYear)
  incomeReport.ts        Resumen de ingresos por mes (3 o 6 meses completos) y su HTML
  pdf.ts                 HTML → PDF (expo-print) → Compartir
  backupData.ts          Copia de seguridad sin nativos: tablas ↔ JSON, validación, restaurar en transacción, fecha del próximo aviso
  backup.ts              Archivos: guardar la copia (expo-file-system + expo-sharing) y elegir una (expo-document-picker)
  fleet.ts               Constantes de flota (energía, valores típicos, tipos de mantenimiento, documentos) y cálculos puros
                         (próximo mantenimiento, vencimientos, avisos). No importa la DB: db.ts importa de aquí
  rental.ts              Arriendo, puro: valores del contrato, estado de pagos (saldo, mora, día de recoger), km incluidos, cuánto deja/cuesta
  vehicleCalc.ts         Config = carro activo + Uber (app_settings), ganancia real, comisión efectivo, pico y placa,
                         precio real del kWh (realKwhPrice / vehicleEnergyCostPerKm), getVehicleAlerts / getFleetAlerts (incluyen el aviso del arriendo)
  format.ts              Moneda COP, fechas locales YYYY-MM-DD, fecha y hora (nowString), mes en palabras, DD/MM/AAAA, sumar meses/días, km
  notifications.ts       Canal Android, permisos, jornada (8 recordatorios cada 2 h), avisos de carros y días de pago del arriendo (data.kind = 'vehicle'),
                         aviso de copia de seguridad (data.kind = 'backup')
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
| `vehicles` (v1) | id, name, plate, energy (`gasoline`/`electric`), km_per_gallon, gas_price, kwh_per_100km, kwh_price, pico_placa_days, maint_cost_per_km, odometer_km, odometer_date, active · (v2) debt_id (crédito en `debts`), extra_monthly_cost (GPS y otros, default 0) | lógico |
| `maintenance` (v1) | id, vehicle_id, kind, date, km, cost, shop, note, transaction_id (gasto creado con él), active | lógico; borra su gasto (físico) |
| `maintenance_plan` (v1) | id, vehicle_id, kind, every_km, every_months, active | lógico |
| `vehicle_docs` (v1) | id, vehicle_id, kind (`soat`/`rtm`/`tax`/`insurance`), due_date, cost; UNIQUE(vehicle_id, kind) | upsert; `due_date` NULL = sin fecha |
| `rentals` (v2) | id, vehicle_id, driver_name, driver_phone, weekly_fee, start_date, start_km, km_per_week (NULL = sin límite), extra_km_price, late_fee_per_day, deposit, end_date (NULL = vigente), deposit_returned, note, active | lógico (solo contrato sin pagos); terminar = `end_date` |
| `rental_payments` (v2) | id, rental_id, kind (`rent`/`fee`/`deposit`), amount, date, note, transaction_id (ingreso `rent` creado con él; NULL en depósito), active | lógico; borra su ingreso (físico) |
| `charges` (v3) | id, vehicle_id, date, kwh (NULL = no lo anotó), amount, place, transaction_id (gasto `charge` creado con ella), active | se borra borrando su gasto en Hoy (`getCharges` hace JOIN con `transactions`) |
| `work_sessions` (v3) | id, start_at, end_at (NULL = no tocó "Día finalizado"), hora local `YYYY-MM-DD HH:MM` | nunca |

- Índices: `idx_date` sobre `transactions(date)`, `idx_maintenance_vehicle` sobre `maintenance(vehicle_id)`, `idx_rentals_vehicle`, `idx_rental_payments_rental`, `idx_charges_vehicle` sobre `charges(vehicle_id, date)`.
- Semilla: si `funds` está vacía se crean Emergencias, Mecánico, Multas/Legal, Pensión.
- Claves de `app_settings`: `uber_commission_pct`, `uber_pass_active` (`'1'`/`'0'`, default `'1'`), `uber_pass_price_cop` (default 90000), `active_vehicle_id` (el carro que maneja el usuario), `last_backup_date`, `backup_reminder_since`, `maint_saved_today` (`fecha|monto` separado hoy para el mecánico), `owner_name` y `owner_id` (para el PDF). Una clave nueva no es cambio de esquema: `getSetting` devuelve el default si no existe.
- Claves **heredadas**: `km_per_gallon`, `gas_price_cop`, `pico_placa_days_week`, `maintenance_cost_per_km`. El JS actual ya no las usa; siguen ahí para el JS viejo si hay rollback de OTA. La migración 1 las copió al carro sembrado.
- `funds.balance` es un acumulado desnormalizado: `addFundMovement` inserta el movimiento y suma al balance (dos sentencias, sin transacción).
- **Migraciones con `PRAGMA user_version`** (`MIGRATIONS` en `db.ts`; `runMigrations` corre al final de `initDatabase`). Versión actual: **3**. El bloque `CREATE TABLE IF NOT EXISTS` inicial solo cubre las tablas originales.
  - 1: carros, mantenimientos, vencimientos. Siembra "Renault Duster" con la config que el usuario tenía (gasolina, mantenimiento por km) y pico y placa 1, y lo deja como carro activo.
  - 2: arriendo (`rentals`, `rental_payments`) y costos fijos por carro (`vehicles.debt_id`, `vehicles.extra_monthly_cost`, con `ALTER TABLE ADD COLUMN`).
  - 3: cargas del eléctrico (`charges`) y jornadas (`work_sessions`).
- **Tabla nueva ⇒ agrégala a `BACKUP_TABLES`** en `backupData.ts`; si no, la copia de seguridad no la guarda y restaurar la deja vacía.

### Cambios de esquema (obligatorio leer antes de tocar `db.ts`)

El celular del usuario ya tiene datos reales. Una migración mala = datos perdidos sin backup.

1. Solo cambios **aditivos**: tabla nueva, columna nueva con `DEFAULT`, índice nuevo. Nunca `DROP`, `RENAME` ni cambiar el tipo de una columna.
2. Agrega una función **al final** de `MIGRATIONS` en `db.ts` (`/* 2: … */ db => { … }`). Nunca edites ni reordenes una migración ya publicada: en el celular ya corrió y no vuelve a correr. Tampoco la hagas depender de constantes que puedan cambiar (la 1 escribe sus `DEFAULT` como literales). `runMigrations` ejecuta cada una en transacción junto con `PRAGMA user_version = n`.
3. Prueba la migración contra el esquema viejo antes del PR: transpila el `db.ts` viejo (`git show main:src/db.ts`) y el nuevo con `typescript.transpileModule`, simula `expo-sqlite` sobre `node:sqlite` (Node ≥ 22) y verifica datos intactos, siembra correcta, que reabrir no duplica y que el JS viejo sigue funcionando sobre el esquema nuevo. Si hay versiones intermedias sin publicar (p. ej. la 1), prueba también el salto desde ellas y su JS sobre el esquema nuevo.
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
- **Energía por km** (`energyCostPerKm`): gasolina = precio galón / km por galón; eléctrico = kWh cada 100 km / 100 × precio kWh (BYD: 17,5 × $1.815 ≈ $318/km con electrolinera; el precio real de las cargas anotadas reemplaza al del carro).
- **Ganancia real** (`calcRealEarnings`):
  - Con Uber Pass: bruto − Uber Pass por día trabajado − energía (km × energía por km) − mantenimiento (km × COP/km).
  - Uber Pass por día trabajado (`calcUberPassPerWorkDay`) = valor × 2 / (7 − días de pico y placa del carro activo). Duster en Medellín: 180.000 / 6 = 30.000; eléctrico sin pico y placa: 180.000 / 7 ≈ 25.714.
  - Sin Uber Pass: la comisión Uber (%) reemplaza la línea de Uber Pass.
- **Efectivo** (solo sin Uber Pass): al guardar un ingreso en efectivo se crea también un gasto `other` por la comisión Uber (`Comisión Uber en efectivo (X%)`). Con Uber Pass el interruptor de efectivo no se muestra.
- **Pico y placa**: del carro activo. Días bloqueados = días/semana × (días del mes / 7); pérdida = días bloqueados × promedio diario. Con 0 días (eléctrico), Balance dice que el carro no tiene pico y placa. Duster en Medellín: 1 día (decisión de Dafel, 2026-09-22).
- **Mantenimiento** (`fleet.ts`): cada `maintenance_plan` dice cada cuánto (km y/o meses; lo que pase primero). Próximo = último registro de ese tipo + intervalo. Amarillo a ≤ 30 días o ≤ 1.000 km; rojo si se pasó. Sin registro = "Registra el último que le hiciste" (sin aviso). Un carro nuevo trae plan: gasolina 10.000 km / 12 meses (Renault), eléctrico 12.000 km / 12 meses (plan del concesionario BYD-Motorysa, que manda para la garantía; el manual dice 20.000, se usa el menor). Mantenimiento por km típico: gasolina 80, eléctrico 150 (servicio + alineación + llantas; ver deuda #5).
- **Kilometraje**: `odometer_km` se actualiza a mano (tab Carros) o al registrar un mantenimiento con más km. Si hay planes por km y el dato tiene más de 15 días, sale el aviso "actualiza el kilometraje".
- **Vencimientos**: SOAT, técnico-mecánica, impuesto, seguro. Amarillo a ≤ 30 días, rojo vencido. `cost` es opcional (servirá para el costo anual en la fase de arriendo).
- **Avisos**: `getFleetAlerts()` junta los de todos los carros (rojos primero); Hoy muestra los 2 primeros y lleva a Carros. Notificaciones (`refreshVehicleReminders`, al arrancar y tras cada cambio en Carros): vencimientos 15 días antes y el día anterior, mantenimientos por fecha 7 días antes, a las 9:00. Los mantenimientos por km solo avisan dentro de la app.
- **Arriendo** (`rental.ts`, contrato recomendado investigado en 2026-09: $600.000/semana, depósito $1.200.000, 1.200 km/semana, $250 por km extra, mora $30.000/día):
  - Cuota **prepagada** cada 7 días desde `start_date` (día de pago = día de la semana de la entrega). Cuotas debidas a una fecha = ⌊días desde la entrega / 7⌋ + 1; con el carro devuelto se cuenta hasta el día anterior a `end_date`.
  - Es un **saldo**, no semanas marcadas: debe = cuotas debidas × cuota − pagos `rent`. Aguanta abonos parciales y pagos adelantados. La cuota más vieja sin pagar completa = entrega + 7 × ⌊pagado / cuota⌋.
  - Atraso: día 0 = "hoy paga" (amarillo); día 1 = gracia de 24 h (amarillo, sin mora); desde el día 2, rojo y mora = (días − 1) × mora diaria, que se muestra como sugerencia, no se suma sola. Día 3: "según el contrato ya puedes recoger el carro".
  - Tipos de pago: `rent` (cuota) y `fee` (mora, km extra, daños) crean un ingreso `rent` 🔑 con la fecha del pago; `deposit` no crea ingreso porque se devuelve. En la devolución, lo que no se devuelve del depósito entra como `fee` + ingreso.
  - Si el ingreso de un pago se borra desde Hoy, el pago deja de contar (`getRentalPayments` hace JOIN con `transactions`). Es la solución al huérfano de la deuda #2 para el arriendo.
  - El ingreso `rent` no cuenta como día trabajado (`getMonthStats`), no entra a la ganancia real de Hoy ni al "mejor día" de Historial (`DailySummary.rent`). Sí suma al neto del mes (cubre la cuota del crédito que está en Deudas).
  - Km: se compara el último kilometraje anotado con `start_km` + `km_per_week` × días / 7, en total desde la entrega (no semana a semana).
  - Un carro arrendado no puede ser el activo ni quitarse; el activo no se puede arrendar.
  - Aviso en Hoy/Carros (`rentalAlert`) y notificación a las 9:00 en el día de cada una de las próximas 4 cuotas sin pagar.
- **Cuánto deja / cuánto cuesta** (`vehicleEconomics`): fijos = cuota del crédito vinculado (de `debts`, la misma de Balance: no se cuenta dos veces) + Σ costo de vencimientos con fecha / 12 + `extra_monthly_cost`. Arrendado: arriendo × 52/12 − fijos − mantenimiento estimado (km incluidos × 52/12 × COP/km del carro); también "cuando termines el crédito" = + cuota. Propio: fijos y fijos / 24 por día de trabajo. No incluye semanas quieto ni depreciación.
- **Precio real del kWh** (`realKwhPrice`): pagado ÷ kWh de las cargas con kWh de los últimos 90 días del carro. Si hay, reemplaza a `kwh_price` en la energía por km (Hoy y Carros); si no, se usa el del carro.
- **Meta del día** (`calcDailyGoal`, Hoy): pendiente = obligaciones − (neto del mes − neto de hoy); meta = pendiente / (días laborales restantes + 1). Es el mismo reparto de "Necesitas hoy" de Balance: si hoy hace la meta, mañana sale igual. Solo aparece si hay gastos fijos o deudas.
- **Separar para el mecánico** (Hoy): con los km del día, el renglón "Provisión mecánico" (km × COP/km del carro) se puede pasar al fondo Mecánico (`addFundMovement`; busca el fondo por nombre y si no por 🔧). Lo separado hoy se guarda en `maint_saved_today` para no repetirlo; si suben los km, ofrece solo la diferencia. Al tocar "Día finalizado" se abre la calculadora.
- **Ganancia por hora** (`workStats.ts`): "Empecemos el día" guarda `start_at`, "Día finalizado" guarda `end_at` en la última jornada abierta. Por cada día con jornada: horas = Σ duración; neto = neto del día sin arriendo + el de los días siguientes hasta donde terminó la jornada si no tienen jornada propia (la madrugada queda con fecha del día siguiente). Se ignoran jornadas abiertas y de más de 16 h. De día = la mitad de la jornada cae entre 6:00 y 18:00. Se calcula sobre el periodo de Historial (semana o mes).
- **Resumen por WhatsApp** (`summaryText`): ganado, gastado, neto, días trabajados (con ingreso distinto de arriendo), arriendo aparte, horas y $/hora, mejor día. Se manda con `Share` de React Native (sin nativo nuevo).
- **Resumen de ingresos (PDF)**: los 3 o 6 meses completos antes del mes actual, desde el primer mes con registros. Por mes: días trabajados, ingresos por conducción, arriendo (columna solo si hay), gastos, neto; total y promedio. Pide nombre (obligatorio) y cédula (opcional) y los guarda. Dice que lo hizo el titular y que no es certificado de contador.
- **Copia de seguridad** (`backupData.ts`, `backup.ts`):
  - JSON `{ app: 'uber-finanzas', format: 1, schema, created_at, tables }` con todas las `BACKUP_TABLES`. Se guarda en caché y se abre Compartir (WhatsApp, Drive). `last_backup_date` se marca al abrir Compartir.
  - Recuperar: el usuario elige el archivo; se rechaza si no es de la app, si está dañado o si `schema` es mayor que el del celular. Confirmación con fecha y número de movimientos. Antes guarda lo actual en `antes-de-restaurar.json` (carpeta de documentos). Luego, en **una** transacción, borra cada tabla e inserta las filas con solo las columnas que existen hoy. Si algo falla, no cambia nada.
  - Aviso (`refreshBackupReminder`, al abrir la app y tras cada copia): uno solo programado, a las 7:00 p.m. Sin copias: al día siguiente de tener la función; con copia: 7 días después; vencida: cada 3 días desde ahí. Las fechas son fijas, así que abrir la app no lo corre.
- **DIAN** (`dian.ts`, investigado en 2026-09; vigente para el año gravable 2026):
  - UVT 2026 = $52.374 (Res. DIAN 000238 de 2025). Tabla del art. 241 con las bases en UVT tal como las trae la ley (116, 788, 2.296, 5.901, 10.352).
  - Proyección: ingresos y costos desde el primer registro del año hasta hoy × días del año / días con datos. Menos de 30 días: no se calcula.
  - Impuesto principal = tabla sobre (ingresos − costos anotados). Costos: `gas`, `charge`, `uber_pass`, `maint`, `wash`, `toll` (comida, celular y "otro" no). Alternativa, solo si da menos: 25 % exento sobre lo de manejar, con tope de 790 UVT, del 40 % del ingreso y de 1.340 UVT. Los dos caminos son excluyentes (art. 336).
  - Debe declarar: ingresos ≥ 1.400 UVT ($73.323.600). También se muestran los topes de consignaciones o consumos (1.400 UVT) y de patrimonio bruto (4.500 UVT, $235.683.000, sin restar deudas), que la app no puede medir.
  - No incluye salud y pensión pagadas (INCRNGO) ni la deducción del 1 % por factura electrónica. Hay que actualizar la UVT cada diciembre.
- **Jornada**: `startWorkDay` cancela los recordatorios de jornada, programa una confirmación a los 5 s y 8 recordatorios cada 2 h. "Jornada activa" = hay notificaciones programadas **sin marca** (ni `kind: 'vehicle'` ni `kind: 'backup'`). Toda notificación nueva que no sea de la jornada debe llevar su `kind` y excluirse en `isWorkDayReminder`. No uses `cancelAllScheduledNotificationsAsync`: borraría los avisos de SOAT, mantenimiento y copia.

## Cómo probar un cambio localmente

- `npx tsc --noEmit`: tipos.
- `npx expo export --platform android --output-dir <scratchpad>/export`: compila el bundle JS igual que un update OTA; detecta imports rotos.
- `npx expo-doctor`: versiones de dependencias contra el SDK.
- En un celular (opcional, lo hace Dafel): `npx expo start` y abrir con Expo Go (SDK 54). SQLite y notificaciones locales funcionan en Expo Go; `expo-updates` no (se desactiva en dev).
