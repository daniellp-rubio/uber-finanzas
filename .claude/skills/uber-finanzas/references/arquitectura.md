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
App.tsx                  Arranque (update OTA → initDatabase + setupNotifications), tab bar, modal de transacción
components/
  TodayScreen.tsx        Tab "Hoy": jornada (recordatorios), resumen del día, calculadora ganancia real, lista del día
  HistoryScreen.tsx      Tab "Historial": semana / mes, totales, mejor día, detalle por día
  BalanceScreen.tsx      Tab "Balance": estado del mes (verde/amarillo/rojo), gastos fijos, deudas, pico y placa, DIAN, config vehículo
  FundsScreen.tsx        Tab "Fondos": sobres virtuales (incluye FundActionModal y FundDetailModal internos)
  AddTransactionModal.tsx  Alta de ingreso/gasto; toggle efectivo → registra comisión Uber como gasto automático
  AddFixedExpenseModal.tsx Alta de gasto fijo mensual (categorías propias, distintas a las de transacciones)
  AddDebtModal.tsx       Alta de deuda (cuota mensual + meses restantes opcional)
src/
  db.ts                  Singleton SQLite, esquema, todas las queries
  categories.ts          Categorías de ingreso/gasto + helpers label/icon
  financeCalc.ts         computeBalance(): objetivo diario y semáforo del mes
  vehicleCalc.ts         Config del vehículo (app_settings), ganancia real, comisión efectivo, pico y placa, DIAN
  format.ts              Moneda COP, fechas locales YYYY-MM-DD, fechas en español
  notifications.ts       Canal Android, permisos, jornada (8 recordatorios cada 2 h)
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

- Índice: `idx_date` sobre `transactions(date)`.
- Semilla: si `funds` está vacía se crean Emergencias, Mecánico, Multas/Legal, Pensión.
- Claves de `app_settings`: `km_per_gallon`, `gas_price_cop`, `uber_commission_pct`, `pico_placa_days_week`, `maintenance_cost_per_km`.
- `funds.balance` es un acumulado desnormalizado: `addFundMovement` inserta el movimiento y suma al balance (dos sentencias, sin transacción).
- **No hay sistema de migraciones.** `initDatabase` solo hace `CREATE TABLE IF NOT EXISTS`, que NO agrega columnas a tablas existentes. Ver "Cambios de esquema".

### Cambios de esquema (obligatorio leer antes de tocar `db.ts`)

El celular del usuario ya tiene datos reales. Una migración mala = datos perdidos sin backup.

1. Solo cambios **aditivos**: tabla nueva, columna nueva con `DEFAULT`, índice nuevo. Nunca `DROP`, `RENAME` ni cambiar el tipo de una columna.
2. Versiona con `PRAGMA user_version`. Patrón a introducir la primera vez que haga falta:
   ```ts
   const MIGRATIONS: string[] = [
     /* 1 */ `ALTER TABLE transactions ADD COLUMN km REAL`,
   ];
   const { user_version } = _db.getFirstSync<{ user_version: number }>('PRAGMA user_version')!;
   for (let v = user_version; v < MIGRATIONS.length; v++) {
     _db.withTransactionSync(() => {
       _db!.execSync(MIGRATIONS[v]);
       _db!.execSync(`PRAGMA user_version = ${v + 1}`);
     });
   }
   ```
   Va después del bloque `CREATE TABLE IF NOT EXISTS` en `initDatabase`.
3. Un update OTA puede revertirse (rollback) a JS viejo: el JS viejo debe seguir funcionando con el esquema nuevo. Por eso solo cambios aditivos y columnas nullable o con default.

## Convenciones de código (imitarlas)

- **Componentes**: `export default function XScreen()`. Estado local con `useState`; datos cargados con `const load = useCallback(() => {...}, [])` + `useEffect(() => { load(); }, [load])`. Tras escribir en la DB se llama `load()` otra vez. No hay store global.
- **Refresco entre pantallas**: `App.tsx` pasa `refreshTrigger` (contador) a `TodayScreen`. Las otras tabs se desmontan al cambiar de tab y recargan al montar.
- **DB**: funciones exportadas en `src/db.ts`, siempre síncronas y con parámetros `?` (nunca interpolar valores del usuario en SQL).
- **Estilos**: `StyleSheet.create` al final del archivo en una constante `s` (subcomponentes usan `fs`, `fd`). Claves alineadas en columna.
- **Modales**: `<Modal animationType="slide" presentationStyle="pageSheet" onRequestClose=...>`; dentro, `KeyboardAvoidingView` + `SafeAreaView` de `react-native-safe-area-context`; barra superior con "✕ Cancelar", título y spacer `width: 80`; botón de guardar grande abajo.
- **Montos**: el input guarda solo dígitos (`t.replace(/\D/g, '')`) y muestra `Number(raw).toLocaleString('es-CO')`. Para pintar dinero usar siempre `formatCurrency` (redondea, separador `.`, sin signo; el signo se antepone a mano).
- **Fechas**: strings locales `YYYY-MM-DD` (`todayString()`); nunca `toISOString()` (UTC corre el día en Colombia de noche).
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
- **Ganancia real** (`calcRealEarnings`): bruto − comisión Uber (%) − gasolina (km / km-por-galón × precio galón) − mantenimiento (km × COP/km).
- **Efectivo**: al guardar un ingreso en efectivo se crea también un gasto `other` por la comisión Uber (`Comisión Uber en efectivo (X%)`).
- **Pico y placa**: días bloqueados = días/semana × (días del mes / 7); pérdida = días bloqueados × promedio diario.
- **DIAN**: constantes **2025** (UVT 49.799, umbral 1.340 UVT, deducible fijo 40 %, tarifa simplificada 19 % sobre 1.090 UVT). Orientativo; hay que actualizarlo cada año.
- **Jornada**: `startWorkDay` cancela todo, programa una confirmación a los 5 s y 8 recordatorios cada 2 h. "Jornada activa" = hay notificaciones programadas pendientes.

## Cómo probar un cambio localmente

- `npx tsc --noEmit`: tipos.
- `npx expo export --platform android --output-dir <scratchpad>/export`: compila el bundle JS igual que un update OTA; detecta imports rotos.
- `npx expo-doctor`: versiones de dependencias contra el SDK.
- En un celular (opcional, lo hace Dafel): `npx expo start` y abrir con Expo Go (SDK 54). SQLite y notificaciones locales funcionan en Expo Go; `expo-updates` no (se desactiva en dev).
