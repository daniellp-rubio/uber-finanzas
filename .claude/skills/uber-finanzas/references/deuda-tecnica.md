# Deuda técnica y riesgos conocidos

Detectados en el escaneo del 2026-09-22. No se corrigen sin que Dafel lo pida: cada punto es candidato a una funcionalidad. Al resolver uno, bórralo de aquí en el mismo PR.

## Alta: riesgo de perder datos o de dar números equivocados

1. **Sin backup de datos.** Todo vive en la SQLite del celular. Si se pierde, roba o daña el teléfono, o alguien desinstala la app, se pierde el historial completo. Candidata: exportar/importar un archivo `.db` o JSON con `expo-sharing` y `expo-document-picker`. Esas son dependencias nativas: saldría como APK.
2. **Sin sistema de migraciones.** El primer cambio de esquema debe introducir `PRAGMA user_version` (patrón en `arquitectura.md`).
3. **Comisión en efectivo huérfana.** Al borrar un ingreso en efectivo, el gasto automático "Comisión Uber en efectivo" queda vivo. No hay vínculo entre ambas filas.
4. **DIAN con constantes 2025** (`vehicleCalc.ts`: UVT 49.799, tramo único del 19 %). La tabla real de renta es progresiva por tramos de UVT y la UVT cambia cada año. Además, el umbral de "debe declarar" usa ingresos netos × 12, cuando la norma mira ingresos brutos, patrimonio, consumos y otros topes. Rotulado como orientativo, pero puede inducir a error.
5. **Ganancia real resta la comisión Uber al ingreso registrado.** Si el usuario registra lo que Uber ya le pagó (neto de comisión), la comisión se descuenta dos veces. Hay que confirmar con el usuario qué número anota.

## Media: comportamiento raro o frágil

6. `addFundMovement` hace dos sentencias sin transacción: si la app muere entre ambas, `funds.balance` no cuadra con `fund_movements`. Usar `withTransactionSync`.
7. `AddDebtModal`: el input de meses no filtra dígitos (`parseInt('12a')` = 12).
8. `FundDetailModal` devuelve un `<Modal>` anidado dentro de otro `<Modal>` para depositar o retirar. Funciona, pero es frágil en Android.
9. "Jornada activa" = "hay notificaciones programadas". Si el usuario borra las notificaciones desde el sistema, la app cree que la jornada terminó.
10. Ícono de notificación = `assets/icon.png` a color. Android pinta los íconos pequeños en monocromo, así que se ve como un cuadro blanco. Necesita un PNG blanco con fondo transparente. Es un cambio nativo (APK).
11. Pico y placa asume días fijos por semana (el default comenta "Bogotá"). No modela la rotación real por dígito de placa ni la ciudad.
12. `financeCalc.ts` importa `todayString` sin usarlo.

## Baja: limpieza

13. Dependencias sin uso: `zustand`, `expo-status-bar`. Quitarlas cambia el fingerprint, así que conviene hacerlo en un PR que de todos modos vaya a sacar APK.
14. Sin tests. Las funciones puras candidatas son `calcRealEarnings`, `calcCashCommission`, `calcPicoPlacaImpact`, `calcDIANEstimate`, `formatCurrency` y `formatShortDate`. `computeBalance` necesitaría extraer la parte pura.
15. `app.json` → `ios` existe pero nunca se ha construido iOS. El usuario usa Android.
