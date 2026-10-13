import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Modal, Linking } from 'react-native';
import {
  addRental, updateRental, deleteRental, endRental, addRentalPayment, deleteRentalPayment,
  Vehicle, Rental, RentalInput, RentalPayment,
} from '../src/db';
import {
  RENTAL_DEFAULTS, GRACE_DAYS, MAX_LATE_DAYS, RECOVER_DAY, PAYMENT_KINDS, rentStatus, describeRent, kmStatus,
  collectedInMonth, payDayName, paymentLabel, paymentIcon, weekdayOf, firstPayDate, firstPayDateFor, firstInstallment,
} from '../src/rental';
import { addDays, formatCurrency, formatDate, formatLongDate, formatKm, todayString } from '../src/format';
import { requestNotificationPermission } from '../src/notifications';
import DateField from './DateField';
import SheetFrame, { ms } from './SheetFrame';
import { C, T, S, R } from '../src/theme';
import { Amount, Button, Chip, Collapsible, Icon, IconButton, Row, Section, Tone } from './ui';

const LEVEL_TONE: Record<string, Tone> = { red: 'spend', yellow: 'warn', ok: 'money', unknown: 'neutral' };
const LEVEL_COLOR: Record<string, string> = { red: C.spend, yellow: C.warn, ok: C.money, unknown: C.textMuted };

// Lunes primero, como en el calendario de Colombia (índices de Date.getDay)
const WEEK_CHIPS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']] as const;

// Montos: el input guarda solo dígitos y muestra con puntos
const digits  = (t: string) => t.replace(/\D/g, '');
const showNum = (raw: string) => (raw ? Number(raw).toLocaleString('es-CO') : '');

// Qué paga y cuándo, según el día de pago y si paga por adelantado o al terminar la semana
function payDayHint(start: string | null, payDay: number | null, fee: number, arrears: boolean): string {
  if (!start) return 'Escoge primero la fecha de entrega.';
  const grace = `Tiene ${GRACE_DAYS * 24} horas de gracia.`;
  const sameDay = payDay === null || payDay === weekdayOf(start);
  const first = sameDay ? start : firstPayDateFor(start, payDay);
  if (arrears) {
    if (sameDay) {
      return `Paga ${formatCurrency(fee)} los ${payDayName(start)} por la semana que ya usó: el primer pago es el ` +
        `${formatLongDate(addDays(start, 7))}. ${grace}`;
    }
    const { days, amount } = firstInstallment({ start_date: start, first_pay_date: first, weekly_fee: fee });
    return `El primer pago es el ${formatLongDate(first)}: ${formatCurrency(amount)} por los ${days} ` +
      `${days === 1 ? 'día' : 'días'} desde la entrega. Después paga ${formatCurrency(fee)} los ${payDayName(first)} ` +
      `por la semana que ya usó. ${grace}`;
  }
  if (sameDay) {
    return `Paga el día de la entrega por adelantado y después cada 7 días (los ${payDayName(start)}). ${grace}`;
  }
  const { days, amount } = firstInstallment({ start_date: start, first_pay_date: first, weekly_fee: fee });
  return `El día de la entrega paga ${formatCurrency(amount)} por ${days} ${days === 1 ? 'día' : 'días'}, hasta el ` +
    `${formatLongDate(addDays(first, -1))}. Después paga ${formatCurrency(fee)} los ${payDayName(first)} por adelantado, ` +
    `desde el ${formatLongDate(first)}. ${grace}`;
}

interface Props {
  vehicle:   Vehicle;
  rental:    Rental | null;        // contrato vigente
  payments:  RentalPayment[];
  isActive:  boolean;              // es el carro que maneja el usuario
  onChanged: () => void;
}

// ─── Sección "Arriendo" del detalle de un carro ───────────────────────────────

export default function RentalSection({ vehicle, rental, payments, isActive, onChanged }: Props) {
  const [form, setForm]       = useState<'new' | 'edit' | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  const handleStart = () => {
    if (isActive) {
      Alert.alert('Es el carro que manejas',
        'Para arrendarlo, primero agrega el carro que vas a manejar y toca "Ahora manejo este carro" en ese carro.');
      return;
    }
    setForm('new');
  };

  const done = (close: () => void) => () => { close(); onChanged(); };

  const formModal = (
    <Modal visible={form !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setForm(null)}>
      {form !== null && (
        <RentalFormModal
          vehicle={vehicle}
          rental={form === 'edit' ? rental : null}
          canDelete={form === 'edit' && payments.length === 0}
          onClose={() => setForm(null)}
          onSaved={done(() => setForm(null))}
        />
      )}
    </Modal>
  );

  if (!rental) {
    return (
      <Section>
        <Row
          icon="key-variant"
          tone="primary"
          title="Arrendar este carro"
          subtitle="Lleva la cuenta de las cuotas, el depósito y los km"
          onPress={handleStart}
          last
        />
        {formModal}
      </Section>
    );
  }

  const today     = todayString();
  const st        = rentStatus(rental, payments, today);
  const km        = kmStatus(rental, vehicle);
  const collected = collectedInMonth(payments, today.slice(0, 7));
  const depMiss   = Math.max(rental.deposit - st.depositPaid, 0);

  const handleDeletePayment = (p: RentalPayment) =>
    Alert.alert('Borrar pago', p.transaction_id !== null
      ? `¿Borrar el pago de ${formatCurrency(p.amount)}? También se borra el ingreso 🔑 de ese día.`
      : p.kind === 'credit'
        ? `¿Borrar los días sin cobrar (${formatCurrency(p.amount)})? Vuelve a deberlos.`
        : `¿Borrar el abono de ${formatCurrency(p.amount)} al depósito?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { deleteRentalPayment(p); onChanged(); } },
    ]);

  return (
    <Collapsible
      title={`Arriendo · ${rental.driver_name}`}
      summary={describeRent(st)}
      summaryTone={LEVEL_TONE[st.level]}
      initiallyOpen
    >
      <Text style={T.bodySm}>
        {formatCurrency(rental.weekly_fee)} por semana{rental.in_arrears ? ' vencida' : ''} · paga los {payDayName(firstPayDate(rental))} · desde el {formatDate(rental.start_date)}
      </Text>
      {rental.driver_phone && (
        <Button
          label={`Llamar al ${rental.driver_phone}`}
          icon="phone"
          variant="text"
          onPress={() => Linking.openURL(`tel:${rental.driver_phone}`)}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        />
      )}

      {/* ── Estado de pagos ── */}
      <View style={[rs.statusBox, { borderColor: LEVEL_COLOR[st.level] }]}>
        <Text style={[T.titleSm, { color: LEVEL_COLOR[st.level] }]}>{describeRent(st)}</Text>
        {st.level === 'ok' && st.nextDue && (
          <Text style={T.bodySm}>Próximo pago: {formatLongDate(st.nextDue)}</Text>
        )}
        {st.lateFee > 0 && (
          <Text style={T.bodySm}>
            Mora según el contrato: {formatCurrency(st.lateFee)} ({formatCurrency(rental.late_fee_per_day)} por día después de la gracia, máximo {MAX_LATE_DAYS} días por cuota)
          </Text>
        )}
        {st.canRecover && (
          <Text style={[T.label, { color: C.spend }]}>
            Lleva {st.daysLate} días de atraso: según el contrato ya puedes recoger el carro.
          </Text>
        )}
      </View>

      <View style={rs.facts}>
        <Fact icon="lock-outline" text={`Depósito: ${formatCurrency(st.depositPaid)} de ${formatCurrency(rental.deposit)}`}
          extra={depMiss > 0 ? `falta ${formatCurrency(depMiss)}` : undefined} extraTone="warn" ok={depMiss === 0} />
        {km && (
          <Fact icon="map-marker-distance" text={`Lleva ${formatKm(km.driven)} km de ${formatKm(km.allowed)} incluidos`}
            extra={km.excess > 0 ? `se pasó ${formatKm(km.excess)} km = ${formatCurrency(km.charge)}` : undefined} extraTone="spend" ok={km.excess === 0} />
        )}
        {!km && rental.km_per_week !== null && (
          <Fact icon="map-marker-distance" text="Actualiza el kilometraje para ver si se pasó de los km incluidos" />
        )}
        <Fact icon="cash-multiple" text={`Este mes llevas cobrado ${formatCurrency(collected)}`} />
      </View>

      <Button label="Registrar pago" icon="cash-plus" tone="money" big onPress={() => setShowPay(true)} style={{ marginTop: S.md }} />

      {/* ── Pagos ── */}
      {payments.length > 0 && (
        <>
          <Text style={[T.titleSm, { marginTop: S.lg }]}>Pagos</Text>
          {payments.map((p, i) => (
            <View key={p.id} style={[rs.payRow, i < payments.length - 1 && rs.divider]}>
              <Text style={rs.glyph}>{paymentIcon(p.kind)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>{paymentLabel(p.kind)}</Text>
                <Text style={T.labelSm}>{formatDate(p.date)}{p.note ? ` · ${p.note}` : ''}</Text>
              </View>
              {p.kind === 'rent' || p.kind === 'fee'
                ? <Amount value={p.amount} kind="in" />
                : <Text style={[T.amount, { color: C.textMuted }]}>{formatCurrency(p.amount)}</Text>}
              <IconButton name="trash-can-outline" label={`Borrar ${paymentLabel(p.kind)}`} onPress={() => handleDeletePayment(p)} />
            </View>
          ))}
        </>
      )}

      <View style={rs.btnRow}>
        <Button label="Me devolvió el carro" icon="car-arrow-left" variant="outlined" tone="neutral" onPress={() => setShowEnd(true)} />
        <Button label="Editar contrato" icon="pencil-outline" variant="outlined" tone="neutral" onPress={() => setForm('edit')} />
      </View>

      {formModal}

      <Modal visible={showPay} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPay(false)}>
        {showPay && (
          <PaymentModal
            vehicle={vehicle}
            rental={rental}
            payments={payments}
            onClose={() => setShowPay(false)}
            onSaved={done(() => setShowPay(false))}
          />
        )}
      </Modal>

      <Modal visible={showEnd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEnd(false)}>
        {showEnd && (
          <EndRentalModal
            vehicle={vehicle}
            rental={rental}
            payments={payments}
            onClose={() => setShowEnd(false)}
            onSaved={done(() => setShowEnd(false))}
          />
        )}
      </Modal>
    </Collapsible>
  );
}

// Una línea de dato con ícono; `ok` agrega un check verde y `extra` una nota de color
function Fact({ icon, text, extra, extraTone, ok }: {
  icon: React.ComponentProps<typeof Icon>['name']; text: string; extra?: string; extraTone?: 'warn' | 'spend'; ok?: boolean;
}) {
  return (
    <View style={rs.fact}>
      <Icon name={icon} size={20} color={C.textMuted} />
      <Text style={[T.bodySm, { color: C.text, flex: 1 }]}>
        {text}
        {extra ? <Text style={{ color: extraTone === 'spend' ? C.spend : C.warn, fontWeight: '700' }}> · {extra}</Text> : null}
      </Text>
      {ok && !extra ? <Icon name="check-circle" size={18} color={C.money} /> : null}
    </View>
  );
}

// ─── Modal: contrato (nuevo o editar) ─────────────────────────────────────────

function RentalFormModal({ vehicle, rental, canDelete, onClose, onSaved }: {
  vehicle: Vehicle; rental: Rental | null; canDelete: boolean; onClose: () => void; onSaved: () => void;
}) {
  const d = RENTAL_DEFAULTS;
  const [name, setName]       = useState(rental?.driver_name ?? '');
  const [phone, setPhone]     = useState(rental?.driver_phone ?? '');
  const [fee, setFee]         = useState(String(rental?.weekly_fee ?? d.weeklyFee));
  const [start, setStart]     = useState<string | null>(rental?.start_date ?? todayString());
  // null = paga el mismo día de la semana de la entrega
  const [payDay, setPayDay]   = useState<number | null>(
    rental && firstPayDate(rental) !== rental.start_date ? weekdayOf(firstPayDate(rental)) : null);
  // Nuevo contrato: semana vencida por defecto (contrato de la Duster v4)
  const [arrears, setArrears] = useState(rental ? rental.in_arrears === 1 : true);
  const [startKm, setStartKm] = useState(
    rental ? (rental.start_km !== null ? String(rental.start_km) : '')
           : (vehicle.odometer_km !== null ? String(Math.round(vehicle.odometer_km)) : ''));
  const [kmWeek, setKmWeek]   = useState(rental ? (rental.km_per_week !== null ? String(rental.km_per_week) : '') : String(d.kmPerWeek));
  const [kmPrice, setKmPrice] = useState(String(rental?.extra_km_price ?? d.extraKmPrice));
  const [lateFee, setLateFee] = useState(String(rental?.late_fee_per_day ?? d.lateFeePerDay));
  const [deposit, setDeposit] = useState(String(rental?.deposit ?? d.deposit));
  const [note, setNote]       = useState(rental?.note ?? '');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Falta el conductor', 'Escribe el nombre de quien va a manejar el carro.');
      return;
    }
    if (!(Number(fee) > 0)) {
      Alert.alert('Falta la cuota', 'Escribe cuánto paga por semana.');
      return;
    }
    if (!start) {
      Alert.alert('Revisa la fecha', 'Escribe la fecha de entrega completa: día/mes/año.');
      return;
    }
    const firstPay = payDay === null ? start : firstPayDateFor(start, payDay);
    const input: RentalInput = {
      vehicle_id:       vehicle.id,
      driver_name:      name.trim(),
      driver_phone:     phone.trim() || null,
      weekly_fee:       Number(fee),
      start_date:       start,
      first_pay_date:   firstPay === start ? null : firstPay,
      in_arrears:       arrears ? 1 : 0,
      start_km:         Number(startKm) > 0 ? Number(startKm) : null,
      km_per_week:      Number(kmWeek) > 0 ? Number(kmWeek) : null,
      extra_km_price:   Number(kmPrice) || 0,
      late_fee_per_day: Number(lateFee) || 0,
      deposit:          Number(deposit) || 0,
      note:             note.trim() || null,
    };
    if (rental) updateRental(rental.id, input);
    else addRental(input);
    await requestNotificationPermission().catch(() => false);  // para avisar el día de pago
    onSaved();
  };

  const handleDelete = () => {
    if (!rental) return;
    Alert.alert('Borrar contrato', `¿Borrar el arriendo a ${rental.driver_name}? Úsalo solo si lo creaste por error.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { deleteRental(rental.id); onSaved(); } },
    ]);
  };

  return (
    <SheetFrame title={rental ? 'Editar contrato' : 'Arrendar carro'} onClose={onClose} onSave={handleSave}>
      <Text style={ms.mVehicle}>{vehicle.name}</Text>

      {!rental && (
        <View style={rs.tipBox}>
          <Text style={rs.tipTitle}>Antes de entregar el carro</Text>
          <Text style={rs.tipTxt}>
            • Contrato firmado y pagaré{'\n'}
            • Fotos del carro por dentro y por fuera{'\n'}
            • GPS instalado{'\n'}
            • Antecedentes del conductor y su perfil de Uber: 4,8 ★ o más y 1.000 viajes o más
          </Text>
        </View>
      )}

      <Text style={ms.mLabel}>Conductor</Text>
      <TextInput style={ms.mInput} value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor={C.textFaint} />
      <TextInput style={ms.mInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Celular (opcional)" placeholderTextColor={C.textFaint} />

      <Text style={ms.mLabel}>Cuota por semana</Text>
      <TextInput style={ms.mInput} value={showNum(fee)} onChangeText={t => setFee(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor={C.textFaint} />
      <Text style={ms.mHint}>Recomendado: {formatCurrency(d.weeklyFee)}. Más caro, el conductor no alcanza a pagar y se atrasa.</Text>

      <Text style={ms.mLabel}>Fecha de entrega</Text>
      <DateField value={start} onChange={setStart} />

      <Text style={ms.mLabel}>Día de pago</Text>
      <View style={ms.mGrid}>
        {WEEK_CHIPS.map(([wd, label]) => (
          <Chip key={wd} label={label} selected={start ? (payDay ?? weekdayOf(start)) === wd : false}
            onPress={() => setPayDay(start && wd === weekdayOf(start) ? null : wd)} />
        ))}
      </View>
      <Text style={ms.mHint}>{payDayHint(start, payDay, Number(fee), arrears)}</Text>

      <Text style={ms.mLabel}>¿Cuándo paga?</Text>
      <View style={ms.mGrid}>
        <Chip label="Al terminar la semana" selected={arrears} onPress={() => setArrears(true)} />
        <Chip label="Por adelantado" selected={!arrears} onPress={() => setArrears(false)} />
      </View>

      <Text style={ms.mLabel}>Kilometraje al entregarlo</Text>
      <TextInput style={ms.mInput} value={showNum(startKm)} onChangeText={t => setStartKm(digits(t))} keyboardType="number-pad" placeholder="Lo que marca el tablero" placeholderTextColor={C.textFaint} />

      <Text style={ms.mLabel}>Km incluidos</Text>
      <View style={ms.mRow}>
        <TextInput style={ms.mSmallInput} value={kmWeek} onChangeText={t => setKmWeek(digits(t))} keyboardType="number-pad" placeholder="Sin límite" placeholderTextColor={C.textFaint} />
        <Text style={rs.rowLabel}>km por semana</Text>
      </View>
      <View style={ms.mRow}>
        <TextInput style={ms.mSmallInput} value={showNum(kmPrice)} onChangeText={t => setKmPrice(digits(t))} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.textFaint} />
        <Text style={rs.rowLabel}>pesos por km de más</Text>
      </View>
      <Text style={ms.mHint}>Vacío = sin límite de km.</Text>

      <Text style={ms.mLabel}>Mora por día de atraso</Text>
      <TextInput style={ms.mInput} value={showNum(lateFee)} onChangeText={t => setLateFee(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor={C.textFaint} />
      <Text style={ms.mHint}>Déjalo en $0 si el contrato no cobra mora. Si la cobra, se suma después de la gracia, máximo {MAX_LATE_DAYS} días por cada cuota. Desde el día {RECOVER_DAY} de atraso el contrato permite recoger el carro.</Text>

      <Text style={ms.mLabel}>Depósito</Text>
      <TextInput style={ms.mInput} value={showNum(deposit)} onChangeText={t => setDeposit(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor={C.textFaint} />
      <Text style={ms.mHint}>Puede pagarlo por partes: cada abono se anota en Registrar pago → Depósito.</Text>

      <Text style={ms.mLabel}>Nota (opcional)</Text>
      <TextInput style={[ms.mInput, rs.note]} value={note} onChangeText={setNote} placeholder="Ej.: descansa los domingos" placeholderTextColor={C.textFaint} multiline />

      {canDelete && (
        <Button label="Borrar este contrato" icon="trash-can-outline" variant="text" tone="spend" onPress={handleDelete} />
      )}
    </SheetFrame>
  );
}

// ─── Modal: registrar un pago ─────────────────────────────────────────────────

function PaymentModal({ vehicle, rental, payments, onClose, onSaved }: {
  vehicle: Vehicle; rental: Rental; payments: RentalPayment[]; onClose: () => void; onSaved: () => void;
}) {
  const today = todayString();
  const st    = rentStatus(rental, payments, today);
  const km    = kmStatus(rental, vehicle);

  // Lo que se sugiere según lo que va a pagar
  const suggested = (k: RentalPayment['kind']): number => {
    if (k === 'rent')    return st.owed > 0 ? st.owed : rental.weekly_fee;
    if (k === 'fee')     return st.lateFee + (km?.charge ?? 0);
    if (k === 'deposit') return Math.max(rental.deposit - st.depositPaid, 0);
    return 0;
  };

  const [kind, setKind]     = useState<RentalPayment['kind']>('rent');
  const [amount, setAmount] = useState(String(suggested('rent') || ''));
  const [days, setDays]     = useState('1');
  const [date, setDate]     = useState<string | null>(today);
  const [note, setNote]     = useState('');

  // Días sin cobrar: la séptima parte de la cuota por cada día (cláusulas 11h, 15 y 17c del contrato)
  const creditAmount = Math.round(rental.weekly_fee * (Number(days) || 0) / 7);
  const value = kind === 'credit' ? creditAmount : Number(amount);

  const pick = (k: RentalPayment['kind']) => { setKind(k); setAmount(String(suggested(k) || '')); };

  const handleSave = () => {
    if (!(value > 0)) {
      Alert.alert('Falta el valor', kind === 'credit' ? 'Escribe cuántos días no se cobran.' : 'Escribe cuánto te pagó.');
      return;
    }
    if (!date) {
      Alert.alert('Revisa la fecha', 'Escríbela completa: día/mes/año.');
      return;
    }
    if (date > today) {
      Alert.alert('Revisa la fecha', 'La fecha no puede ser después de hoy.');
      return;
    }
    const daysNote = kind === 'credit' ? `${Number(days)} ${Number(days) === 1 ? 'día' : 'días'}` : null;
    addRentalPayment(rental, vehicle.name, kind, value, date, [daysNote, note.trim()].filter(Boolean).join(' · ') || null);
    onSaved();
  };

  return (
    <SheetFrame title="Registrar pago" onClose={onClose} onSave={handleSave} saveLabel="Guardar pago">
      <Text style={ms.mVehicle}>{rental.driver_name} · {vehicle.name}</Text>

      <Text style={ms.mLabel}>¿Qué te pagó?</Text>
      <View style={ms.mGrid}>
        {PAYMENT_KINDS.map(k => (
          <Chip key={k.id} label={`${k.icon} ${k.label}`} selected={kind === k.id} onPress={() => pick(k.id)} />
        ))}
      </View>

      {kind === 'credit' ? (
        <>
          <Text style={ms.mLabel}>¿Cuántos días no se cobran?</Text>
          <View style={ms.mRow}>
            <TextInput style={ms.mSmallInput} value={days} onChangeText={t => setDays(digits(t))} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.textFaint} />
            <Text style={rs.rowLabel}>días = {formatCurrency(creditAmount)}</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={ms.mLabel}>¿Cuánto?</Text>
          <TextInput style={ms.mBigInput} value={showNum(amount)} onChangeText={t => setAmount(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor={C.textFaint} />
        </>
      )}
      <Text style={ms.mHint}>
        {kind === 'rent' && (st.owed > 0
          ? `Debe ${formatCurrency(st.owed)} de cuotas. Se anota como ingreso 🔑 en Hoy, con la fecha del pago.`
          : `Está al día: este pago adelanta la próxima semana. Se anota como ingreso 🔑 en Hoy.`)}
        {kind === 'fee' && `Mora hoy: ${formatCurrency(st.lateFee)}${km ? ` · km de más: ${formatCurrency(km.charge)}` : ''}. Se anota como ingreso 🔑 en Hoy.`}
        {kind === 'deposit' && 'El depósito no es un ingreso: se le devuelve cuando entregue el carro, menos multas y daños. No sale en Hoy.'}
        {kind === 'credit' && 'Días que el contrato no cobra: carro inmovilizado por D12 o por documentos del carro, o más de 24 horas en el taller por mantenimiento o por un choque que no fue culpa suya. Se descuentan de lo que debe. No es ingreso ni sale en Hoy.'}
      </Text>

      <Text style={ms.mLabel}>{kind === 'credit' ? 'Fecha' : 'Fecha del pago'}</Text>
      <DateField value={date} onChange={setDate} />

      <Text style={ms.mLabel}>Nota (opcional)</Text>
      <TextInput style={[ms.mInput, rs.note]} value={note} onChangeText={setNote} placeholder={kind === 'credit' ? 'Ej.: inmovilizado por D12' : 'Ej.: pagó por Nequi'} placeholderTextColor={C.textFaint} multiline />
    </SheetFrame>
  );
}

// ─── Modal: devolución del carro ──────────────────────────────────────────────

function EndRentalModal({ vehicle, rental, payments, onClose, onSaved }: {
  vehicle: Vehicle; rental: Rental; payments: RentalPayment[]; onClose: () => void; onSaved: () => void;
}) {
  const today = todayString();
  const [date, setDate]     = useState<string | null>(today);
  const [endKm, setEndKm]   = useState('');
  const [back, setBack]     = useState(String(rentStatus(rental, payments, today).depositPaid || ''));
  const [refund, setRefund] = useState<boolean | null>(null);  // ¿le devuelve los días pagados y no usados?

  // Cómo queda la cuenta si lo devuelve en la fecha escrita (la última cuota cuenta solo los días que lo tuvo)
  const st = rentStatus({ ...rental, end_date: date ?? today }, payments, today);
  const km = endKm && date ? kmStatus(rental, { odometer_km: Number(endKm), odometer_date: date }) : null;
  const returned = Number(back) || 0;
  const kept     = st.depositPaid - returned;
  const unused   = Math.max(-st.owed, 0);
  const unusedRefund = unused > 0 && refund ? unused : 0;

  const handleSave = () => {
    if (!date) {
      Alert.alert('Revisa la fecha', 'Escríbela completa: día/mes/año.');
      return;
    }
    if (date > today || date < rental.start_date) {
      Alert.alert('Revisa la fecha', `Debe estar entre el ${formatDate(rental.start_date)} y hoy.`);
      return;
    }
    if (returned > st.depositPaid) {
      Alert.alert('Revisa el depósito', `Solo te pagó ${formatCurrency(st.depositPaid)} de depósito.`);
      return;
    }
    if (unused > 0 && refund === null) {
      Alert.alert('Días no usados', `Pagó ${formatCurrency(unused)} por días que no usó. Escoge si se los devuelves.`);
      return;
    }
    Alert.alert('Terminar arriendo', `¿${rental.driver_name} te devolvió el ${vehicle.name}?${st.owed > 0 ? ` Todavía debe ${formatCurrency(st.owed)} de cuotas.` : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, terminar', style: 'destructive', onPress: () => {
        endRental(rental, vehicle.name, date, Number(endKm) > 0 ? Number(endKm) : null, st.depositPaid, returned, unusedRefund);
        onSaved();
      }},
    ]);
  };

  return (
    <SheetFrame title="Devolución" onClose={onClose} onSave={handleSave} saveLabel="Terminar arriendo" saveTone="spend">
      <Text style={ms.mVehicle}>{rental.driver_name} · {vehicle.name}</Text>

      <Text style={ms.mLabel}>¿Qué día te lo devolvió?</Text>
      <DateField value={date} onChange={setDate} />

      <Text style={ms.mLabel}>Kilometraje al recibirlo</Text>
      <TextInput style={ms.mInput} value={showNum(endKm)} onChangeText={t => setEndKm(digits(t))} keyboardType="number-pad" placeholder="Lo que marca el tablero" placeholderTextColor={C.textFaint} />

      <View style={rs.tipBox}>
        <Text style={rs.tipTitle}>Cómo queda la cuenta</Text>
        <Text style={rs.tipTxt}>
          {st.owed > 0 ? `• Debe ${formatCurrency(st.owed)} de cuotas` : unused > 0 ? `• Pagó ${formatCurrency(unused)} por días que no usó` : '• Cuotas al día'}{'\n'}
          {km ? (km.excess > 0 ? `• Se pasó ${formatKm(km.excess)} km = ${formatCurrency(km.charge)}` : '• No se pasó de los km') + '\n' : ''}
          • Te pagó {formatCurrency(st.depositPaid)} de depósito
        </Text>
      </View>

      {unused > 0 && (
        <>
          <Text style={ms.mLabel}>¿Le devuelves los días que no usó?</Text>
          <View style={ms.mGrid}>
            <Chip label={`Sí, ${formatCurrency(unused)}`} selected={refund === true} onPress={() => setRefund(true)} />
            <Chip label="No" selected={refund === false} onPress={() => setRefund(false)} />
          </View>
          <Text style={ms.mHint}>
            Según el contrato (cláusula 20f) se devuelven si terminó en la prueba, con aviso de 15 días, o porque tú
            fallaste. No se devuelven si lo terminaste tú porque él incumplió o si lo devolvió sin aviso: ese valor se
            descuenta de lo que deba.{unusedRefund > 0 ? ` Se anota como gasto 📦 en Hoy.` : ''}
          </Text>
        </>
      )}

      <Text style={ms.mLabel}>¿Cuánto del depósito le devuelves?</Text>
      <TextInput style={ms.mInput} value={showNum(back)} onChangeText={t => setBack(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor={C.textFaint} />
      <Text style={ms.mHint}>
        Antes de devolverlo revisa multas en el SIMIT (pueden llegar semanas después) y descuenta daños y lo que deba.
        {kept > 0 ? ` Te quedas con ${formatCurrency(kept)}: se anota como ingreso 🔑.` : ''}
        {returned + unusedRefund > 0 ? ` En total le transfieres ${formatCurrency(returned + unusedRefund)}.` : ''}
      </Text>
    </SheetFrame>
  );
}

const rs = StyleSheet.create({
  statusBox: { borderRadius: R.md, borderWidth: 1.5, padding: S.md, marginTop: S.md, gap: S.xs, backgroundColor: C.bg },
  facts:     { marginTop: S.md, gap: S.sm },
  fact:      { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  payRow:    { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60 },
  divider:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
  glyph:     { fontSize: 20, width: 28, textAlign: 'center' },
  btnRow:    { gap: S.sm, marginTop: S.lg },

  // Formularios
  tipBox:    { backgroundColor: C.warnContainer, borderRadius: R.md, padding: S.md, marginBottom: S.xl },
  tipTitle:  { ...T.label, color: C.warn, marginBottom: S.xs },
  tipTxt:    { ...T.bodySm, color: C.text },
  rowLabel:  { ...T.body, color: C.textMuted, flex: 1 },
  note:      { fontSize: 16, fontWeight: '400', minHeight: 88, textAlignVertical: 'top', paddingTop: S.md },
});
