# Deuda técnica y riesgos conocidos

Detectados en el escaneo del 2026-09-22. No se corrigen sin que Dafel lo pida: cada punto es candidato a una funcionalidad. Al resolver uno, bórralo de aquí en el mismo PR.

## Alta: riesgo de perder datos o de dar números equivocados

1. **Comisión en efectivo huérfana.** Al borrar un ingreso en efectivo, el gasto automático "Comisión Uber en efectivo" queda vivo. No hay vínculo entre ambas filas (los mantenimientos sí lo tienen: `maintenance.transaction_id`; ese es el patrón a copiar). Al revés también: borrar desde Hoy el gasto de un mantenimiento deja el registro del mantenimiento con su costo. Los pagos del arriendo ya lo resuelven: `getRentalPayments` hace JOIN con `transactions` y descarta el pago cuyo ingreso se borró. Ese es el patrón para el mantenimiento.
2. **DIAN con constantes 2026** (`dian.ts`: UVT $52.374, tabla del art. 241, topes de 1.400 y 4.500 UVT). La UVT cambia cada año (la DIAN la publica en diciembre): para el año gravable 2027 hay que actualizar `UVT` y `TAX_YEAR`, y revisar la reforma radicada en julio de 2026 (sube tarifas desde el AG 2027). No resta salud y pensión pagadas como independiente (no se anotan), así que el impuesto sale más alto que el real. El 25 % exento se muestra solo como alternativa: no está resuelto si lo de Uber es renta de trabajo. Los topes de consignaciones y consumos de 2026 salen del decreto de plazos, que aún no se publicaba en sep-2026.
3. **Ganancia real resta la comisión Uber al ingreso registrado** (solo con el interruptor Uber Pass apagado). Si el usuario registra lo que Uber ya le pagó (neto de comisión), la comisión se descuenta dos veces. Con Uber Pass no aplica.
4. **Costo de mantenimiento del eléctrico es un estimado** (`fleet.ts` → `VEHICLE_PRESETS.electric.maintCostPerKm = 150`, investigado en 2026-09, rango 100–210). La mitad son llantas (215/55 R18). El precio del servicio BYD (~$570.000) viene de un foro, no de una cotización. Ajustarlo en Carros → Editar datos con las primeras facturas o con la cotización de Moevo.

## Media: comportamiento raro o frágil

5. `addFundMovement` hace dos sentencias sin transacción: si la app muere entre ambas, `funds.balance` no cuadra con `fund_movements`. Usar `withTransactionSync`.
6. `AddDebtModal`: el input de meses no filtra dígitos (`parseInt('12a')` = 12).
7. `FundDetailModal` devuelve un `<Modal>` anidado dentro de otro `<Modal>` para depositar o retirar. Funciona, pero es frágil en Android. `VehiclesScreen` ya usa el patrón sin anidar (detalle como vista del tab).
8. "Jornada activa" = "hay notificaciones programadas sin marca" (los avisos de carros llevan `kind: vehicle` y el de la copia `kind: backup`). Si el usuario borra las notificaciones desde el sistema, la app cree que la jornada terminó. Una jornada que no se cerró con "Día finalizado" queda abierta en `work_sessions` y no cuenta para la ganancia por hora (tampoco las de más de 16 h).
9. Ícono de notificación = `assets/icon.png` a color. Android pinta los íconos pequeños en monocromo, así que se ve como un cuadro blanco. Necesita un PNG blanco con fondo transparente. Es un cambio nativo (APK).
10. Pico y placa asume días fijos por semana, por carro (gasolina 1, eléctrico 0). No modela la rotación real por dígito de placa ni la ciudad.
11. Avisos de mantenimiento por km dependen de que el usuario actualice el kilometraje a mano. No hay lectura automática del odómetro. Lo mismo el control de km del arriendo.
12. Arriendo: los km incluidos se cuentan en total desde la entrega, no semana a semana (una semana corta compensa una larga). Un contrato terminado no tiene pantalla: sus pagos siguen en Historial como ingresos, pero no se puede volver a ver el contrato.
13. "Cuánto te deja al mes" asume que el carro no se queda quieto ninguna semana y no descuenta la depreciación.
14. **Copia de seguridad "hecha" = se abrió Compartir.** `last_backup_date` se guarda al abrir la hoja de Compartir; si el usuario la cierra sin mandar el archivo, la app cree que hay copia y el aviso se corre una semana. La copia de seguridad `antes-de-restaurar.json` (en la carpeta privada de la app) no tiene pantalla para recuperarla.
15. **Precio real del kWh** = pagado ÷ kWh del recibo, y el consumo del carro (kWh/100 km) es el de la batería: no incluye la pérdida al cargar (~5 % DC, ~10 % AC), así que el costo por km sale un poco bajo.

## Baja: limpieza

16. Dependencias sin uso: `zustand`, `expo-status-bar`. Quitarlas cambia el fingerprint, así que conviene hacerlo en un PR que de todos modos vaya a sacar APK.
17. Sin tests en el repo. Las pruebas de las migraciones 1, 2 y 3, del arriendo, del respaldo, de las horas, de la meta del día y de la DIAN se hicieron fuera del repo (ver "Cambios de esquema" en `arquitectura.md`). Candidatas a traer al repo: `workStats.ts`, `dian.ts`, `backupData.ts`, `calcDailyGoal`, `rental.ts`, `fleet.ts` y los helpers de fecha.
18. `app.json` → `ios` existe pero nunca se ha construido iOS. El usuario usa Android.
