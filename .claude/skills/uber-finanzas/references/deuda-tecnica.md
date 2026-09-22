# Deuda técnica y riesgos conocidos

Detectados en el escaneo del 2026-09-22. No se corrigen sin que Dafel lo pida: cada punto es candidato a una funcionalidad. Al resolver uno, bórralo de aquí en el mismo PR.

## Alta: riesgo de perder datos o de dar números equivocados

1. **Sin backup de datos.** Todo vive en la SQLite del celular. Si se pierde, roba o daña el teléfono, o alguien desinstala la app, se pierde el historial completo. Candidata: exportar/importar un archivo `.db` o JSON con `expo-sharing` y `expo-document-picker`. Esas son dependencias nativas: saldría como APK.
2. **Comisión en efectivo huérfana.** Al borrar un ingreso en efectivo, el gasto automático "Comisión Uber en efectivo" queda vivo. No hay vínculo entre ambas filas (los mantenimientos sí lo tienen: `maintenance.transaction_id`; ese es el patrón a copiar). Al revés también: borrar desde Hoy el gasto de un mantenimiento deja el registro del mantenimiento con su costo. Los pagos del arriendo ya lo resuelven: `getRentalPayments` hace JOIN con `transactions` y descarta el pago cuyo ingreso se borró. Ese es el patrón para el mantenimiento.
3. **DIAN con constantes 2025** (`vehicleCalc.ts`: UVT 49.799, tramo único del 19 %). La tabla real de renta es progresiva por tramos de UVT y la UVT cambia cada año. Además, el umbral de "debe declarar" usa ingresos netos × 12, cuando la norma mira ingresos brutos, patrimonio, consumos y otros topes. Rotulado como orientativo, pero puede inducir a error.
4. **Ganancia real resta la comisión Uber al ingreso registrado** (solo con el interruptor Uber Pass apagado). Si el usuario registra lo que Uber ya le pagó (neto de comisión), la comisión se descuenta dos veces. Con Uber Pass no aplica.
5. **Costo de mantenimiento del eléctrico es un estimado** (`fleet.ts` → `VEHICLE_PRESETS.electric.maintCostPerKm = 150`, investigado en 2026-09, rango 100–210). La mitad son llantas (215/55 R18). El precio del servicio BYD (~$570.000) viene de un foro, no de una cotización. Ajustarlo en Carros → Editar datos con las primeras facturas o con la cotización de Moevo.

## Media: comportamiento raro o frágil

6. `addFundMovement` hace dos sentencias sin transacción: si la app muere entre ambas, `funds.balance` no cuadra con `fund_movements`. Usar `withTransactionSync`.
7. `AddDebtModal`: el input de meses no filtra dígitos (`parseInt('12a')` = 12).
8. `FundDetailModal` devuelve un `<Modal>` anidado dentro de otro `<Modal>` para depositar o retirar. Funciona, pero es frágil en Android. `VehiclesScreen` ya usa el patrón sin anidar (detalle como vista del tab).
9. "Jornada activa" = "hay notificaciones programadas que no son avisos de carro". Si el usuario borra las notificaciones desde el sistema, la app cree que la jornada terminó.
10. Ícono de notificación = `assets/icon.png` a color. Android pinta los íconos pequeños en monocromo, así que se ve como un cuadro blanco. Necesita un PNG blanco con fondo transparente. Es un cambio nativo (APK).
11. Pico y placa asume días fijos por semana, por carro (gasolina 1, eléctrico 0). No modela la rotación real por dígito de placa ni la ciudad.
12. `financeCalc.ts` importa `todayString` sin usarlo.
13. Avisos de mantenimiento por km dependen de que el usuario actualice el kilometraje a mano. No hay lectura automática del odómetro. Lo mismo el control de km del arriendo.
14. Arriendo: los km incluidos se cuentan en total desde la entrega, no semana a semana (una semana corta compensa una larga). Un contrato terminado no tiene pantalla: sus pagos siguen en Historial como ingresos, pero no se puede volver a ver el contrato.
15. "Cuánto te deja al mes" asume que el carro no se queda quieto ninguna semana y no descuenta la depreciación.

## Baja: limpieza

16. Dependencias sin uso: `zustand`, `expo-status-bar`. Quitarlas cambia el fingerprint, así que conviene hacerlo en un PR que de todos modos vaya a sacar APK.
17. Sin tests en el repo. Las funciones puras candidatas son `calcRealEarnings`, `calcCashCommission`, `calcPicoPlacaImpact`, `calcDIANEstimate`, `formatCurrency`, `formatShortDate`, todo `fleet.ts` y los helpers de fecha. `computeBalance` necesitaría extraer la parte pura. Las pruebas de las migraciones 1 y 2, y del cálculo del arriendo, se hicieron fuera del repo (ver "Cambios de esquema" en `arquitectura.md`).
18. `app.json` → `ios` existe pero nunca se ha construido iOS. El usuario usa Android.
