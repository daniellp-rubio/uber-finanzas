import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, Linking } from 'react-native';
import {
  addRental, updateRental, deleteRental, endRental, addRentalPayment, deleteRentalPayment,
  Vehicle, Rental, RentalInput, RentalPayment,
} from '../src/db';
import {
  RENTAL_DEFAULTS, GRACE_DAYS, RECOVER_DAY, PAYMENT_KINDS, rentStatus, describeRent, kmStatus,
  collectedInMonth, payDayName, paymentLabel, paymentIcon,
} from '../src/rental';
import { formatCurrency, formatDate, formatLongDate, formatKm, todayString } from '../src/format';
import { requestNotificationPermission } from '../src/notifications';
import DateField from './DateField';
import SheetFrame, { ms } from './SheetFrame';

const LEVEL_COLOR = { red: '#F44336', yellow: '#FFC107', ok: '#00C853', unknown: '#666' };

// Montos: el input guarda solo dígitos y muestra con puntos
const digits  = (t: string) => t.replace(/\D/g, '');
const showNum = (raw: string) => (raw ? Number(raw).toLocaleString('es-CO') : '');

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
      <>
        <TouchableOpacity style={rs.startBtn} onPress={handleStart} activeOpacity={0.8}>
          <Text style={rs.startTxt}>🔑 Arrendar este carro</Text>
          <Text style={rs.startSub}>Lleva la cuenta de las cuotas semanales, la mora, el depósito y los km</Text>
        </TouchableOpacity>
        {formModal}
      </>
    );
  }

  const today     = todayString();
  const st        = rentStatus(rental, payments, today);
  const km        = kmStatus(rental, vehicle);
  const collected = collectedInMonth(payments, today.slice(0, 7));
  const depMiss   = Math.max(rental.deposit - st.depositPaid, 0);

  const handleDeletePayment = (p: RentalPayment) =>
    Alert.alert('Eliminar pago', p.transaction_id !== null
      ? `¿Eliminar el pago de ${formatCurrency(p.amount)}? También se borra el ingreso 🔑 de ese día.`
      : `¿Eliminar el abono de ${formatCurrency(p.amount)} al depósito?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteRentalPayment(p); onChanged(); } },
    ]);

  return (
    <View style={rs.section}>
      <Text style={rs.sectionTitle}>ARRIENDO</Text>

      <View style={rs.driverRow}>
        <Text style={rs.driver} numberOfLines={1}>🔑 {rental.driver_name}</Text>
        {rental.driver_phone && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${rental.driver_phone}`)}>
            <Text style={rs.phone}>📞 {rental.driver_phone}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={rs.terms}>
        {formatCurrency(rental.weekly_fee)} por semana · paga los {payDayName(rental.start_date)} · desde el {formatDate(rental.start_date)}
      </Text>

      {/* ── Estado de pagos ── */}
      <View style={[rs.statusBox, { borderColor: LEVEL_COLOR[st.level] }]}>
        <Text style={[rs.statusTxt, { color: LEVEL_COLOR[st.level] }]}>{describeRent(st)}</Text>
        {st.level === 'ok' && st.nextDue && (
          <Text style={rs.statusSub}>Próximo pago: {formatLongDate(st.nextDue)}</Text>
        )}
        {st.lateFee > 0 && (
          <Text style={rs.statusSub}>
            Mora según el contrato: {formatCurrency(st.lateFee)} ({formatCurrency(rental.late_fee_per_day)} por día después de la gracia)
          </Text>
        )}
        {st.canRecover && (
          <Text style={[rs.statusSub, { color: '#F44336' }]}>
            Lleva {st.daysLate} días de atraso: según el contrato ya puedes recoger el carro.
          </Text>
        )}
      </View>

      <Text style={rs.line}>
        🔒 Depósito: {formatCurrency(st.depositPaid)} de {formatCurrency(rental.deposit)}
        {depMiss > 0 ? <Text style={rs.warn}> · falta {formatCurrency(depMiss)}</Text> : ' ✓'}
      </Text>
      {km && (
        <Text style={rs.line}>
          📍 Lleva {formatKm(km.driven)} km de {formatKm(km.allowed)} incluidos
          {km.excess > 0
            ? <Text style={rs.bad}> · se pasó {formatKm(km.excess)} km = {formatCurrency(km.charge)}</Text>
            : ' ✓'}
        </Text>
      )}
      {!km && rental.km_per_week !== null && (
        <Text style={rs.lineDim}>📍 Actualiza el kilometraje para ver si se pasó de los km incluidos</Text>
      )}
      <Text style={rs.line}>💵 Este mes llevas cobrado {formatCurrency(collected)}</Text>

      <TouchableOpacity style={rs.payBtn} onPress={() => setShowPay(true)}>
        <Text style={rs.payTxt}>💵 Registrar pago</Text>
      </TouchableOpacity>

      {/* ── Pagos ── */}
      {payments.length > 0 && (
        <>
          <Text style={[rs.sectionTitle, { marginTop: 16 }]}>PAGOS</Text>
          {payments.map(p => (
            <TouchableOpacity key={p.id} style={rs.payRow} onLongPress={() => handleDeletePayment(p)} activeOpacity={0.7}>
              <Text style={rs.payIcon}>{paymentIcon(p.kind)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={rs.payTitle}>{paymentLabel(p.kind)}</Text>
                <Text style={rs.paySub}>{formatDate(p.date)}{p.note ? ` · ${p.note}` : ''}</Text>
              </View>
              <Text style={[rs.payAmt, p.kind === 'deposit' && { color: '#aaa' }]}>+{formatCurrency(p.amount)}</Text>
            </TouchableOpacity>
          ))}
          <Text style={rs.hint}>Mantén presionado para eliminar</Text>
        </>
      )}

      <View style={rs.btnRow}>
        <TouchableOpacity style={rs.smallBtn} onPress={() => setForm('edit')}>
          <Text style={rs.smallBtnTxt}>Editar contrato</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rs.smallBtn} onPress={() => setShowEnd(true)}>
          <Text style={rs.smallBtnTxt}>Me devolvió el carro</Text>
        </TouchableOpacity>
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
    const input: RentalInput = {
      vehicle_id:       vehicle.id,
      driver_name:      name.trim(),
      driver_phone:     phone.trim() || null,
      weekly_fee:       Number(fee),
      start_date:       start,
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
            • Antecedentes del conductor y su perfil de Uber: 4,8 ★ o más y 1.000 viajes o más{'\n'}
            • Pregunta por escrito a tu aseguradora si el seguro cubre el carro trabajando en Uber
          </Text>
        </View>
      )}

      <Text style={ms.mLabel}>CONDUCTOR</Text>
      <TextInput style={rs.textInput} value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor="#444" />
      <TextInput style={rs.textInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Celular (opcional)" placeholderTextColor="#444" />

      <Text style={ms.mLabel}>CUOTA POR SEMANA</Text>
      <TextInput style={ms.mInput} value={showNum(fee)} onChangeText={t => setFee(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor="#444" />
      <Text style={ms.mHint}>Recomendado: {formatCurrency(d.weeklyFee)}. Más caro, el conductor no alcanza a pagar y se atrasa.</Text>

      <Text style={ms.mLabel}>FECHA DE ENTREGA</Text>
      <DateField value={start} onChange={setStart} />
      <Text style={ms.mHint}>
        Paga ese día por adelantado y después cada 7 días{start ? ` (los ${payDayName(start)})` : ''}. Tiene {GRACE_DAYS * 24} horas de gracia.
      </Text>

      <Text style={ms.mLabel}>KILOMETRAJE AL ENTREGARLO</Text>
      <TextInput style={ms.mInput} value={showNum(startKm)} onChangeText={t => setStartKm(digits(t))} keyboardType="number-pad" placeholder="Lo que marca el tablero" placeholderTextColor="#444" />

      <Text style={ms.mLabel}>KM INCLUIDOS</Text>
      <View style={ms.mRow}>
        <TextInput style={ms.mSmallInput} value={kmWeek} onChangeText={t => setKmWeek(digits(t))} keyboardType="number-pad" placeholder="Sin límite" placeholderTextColor="#444" />
        <Text style={rs.rowLabel}>km por semana</Text>
      </View>
      <View style={ms.mRow}>
        <TextInput style={ms.mSmallInput} value={showNum(kmPrice)} onChangeText={t => setKmPrice(digits(t))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#444" />
        <Text style={rs.rowLabel}>pesos por km de más</Text>
      </View>
      <Text style={ms.mHint}>Vacío = sin límite de km.</Text>

      <Text style={ms.mLabel}>MORA POR DÍA DE ATRASO</Text>
      <TextInput style={ms.mInput} value={showNum(lateFee)} onChangeText={t => setLateFee(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor="#444" />
      <Text style={ms.mHint}>Se cobra después de la gracia. Al día {RECOVER_DAY} de atraso el contrato debe permitir recoger el carro.</Text>

      <Text style={ms.mLabel}>DEPÓSITO</Text>
      <TextInput style={ms.mInput} value={showNum(deposit)} onChangeText={t => setDeposit(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor="#444" />
      <Text style={ms.mHint}>Puede pagarlo por partes: cada abono se anota en Registrar pago → Depósito.</Text>

      <Text style={ms.mLabel}>NOTA (opcional)</Text>
      <TextInput style={rs.noteInput} value={note} onChangeText={setNote} placeholder="Ej: descansa los domingos" placeholderTextColor="#444" multiline />

      {canDelete && (
        <TouchableOpacity onPress={handleDelete}>
          <Text style={ms.deleteTxt}>Borrar este contrato</Text>
        </TouchableOpacity>
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
    return Math.max(rental.deposit - st.depositPaid, 0);
  };

  const [kind, setKind]     = useState<RentalPayment['kind']>('rent');
  const [amount, setAmount] = useState(String(suggested('rent') || ''));
  const [date, setDate]     = useState<string | null>(today);
  const [note, setNote]     = useState('');

  const pick = (k: RentalPayment['kind']) => { setKind(k); setAmount(String(suggested(k) || '')); };

  const handleSave = () => {
    if (!(Number(amount) > 0)) {
      Alert.alert('Falta el valor', 'Escribe cuánto te pagó.');
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
    addRentalPayment(rental, vehicle.name, kind, Number(amount), date, note.trim() || null);
    onSaved();
  };

  return (
    <SheetFrame title="Registrar pago" onClose={onClose} onSave={handleSave}>
      <Text style={ms.mVehicle}>{rental.driver_name} · {vehicle.name}</Text>

      <Text style={ms.mLabel}>¿QUÉ TE PAGÓ?</Text>
      <View style={ms.mGrid}>
        {PAYMENT_KINDS.map(k => (
          <TouchableOpacity key={k.id} style={[ms.mChip, kind === k.id && ms.mChipOn]} onPress={() => pick(k.id)}>
            <Text style={[ms.mChipTxt, kind === k.id && ms.mChipTxtOn]}>{k.icon} {k.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={ms.mLabel}>¿CUÁNTO?</Text>
      <TextInput style={ms.mBigInput} value={showNum(amount)} onChangeText={t => setAmount(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor="#444" />
      <Text style={ms.mHint}>
        {kind === 'rent' && (st.owed > 0
          ? `Debe ${formatCurrency(st.owed)} de cuotas. Se anota como ingreso 🔑 en Hoy, con la fecha del pago.`
          : `Está al día: este pago adelanta la próxima semana. Se anota como ingreso 🔑 en Hoy.`)}
        {kind === 'fee' && `Mora hoy: ${formatCurrency(st.lateFee)}${km ? ` · km de más: ${formatCurrency(km.charge)}` : ''}. Se anota como ingreso 🔑 en Hoy.`}
        {kind === 'deposit' && 'El depósito no es un ingreso: se le devuelve cuando entregue el carro, menos multas y daños. No sale en Hoy.'}
      </Text>

      <Text style={ms.mLabel}>FECHA DEL PAGO</Text>
      <DateField value={date} onChange={setDate} />

      <Text style={ms.mLabel}>NOTA (opcional)</Text>
      <TextInput style={rs.noteInput} value={note} onChangeText={setNote} placeholder="Ej: pagó por Nequi" placeholderTextColor="#444" multiline />
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

  // Cómo queda la cuenta si lo devuelve en la fecha escrita
  const st = rentStatus({ ...rental, end_date: date ?? today }, payments, today);
  const km = endKm && date ? kmStatus(rental, { odometer_km: Number(endKm), odometer_date: date }) : null;
  const returned = Number(back) || 0;
  const kept     = st.depositPaid - returned;

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
    Alert.alert('Terminar arriendo', `¿${rental.driver_name} te devolvió el ${vehicle.name}?${st.owed > 0 ? ` Todavía debe ${formatCurrency(st.owed)} de cuotas.` : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, terminar', style: 'destructive', onPress: () => {
        endRental(rental, vehicle.name, date, Number(endKm) > 0 ? Number(endKm) : null, st.depositPaid, returned);
        onSaved();
      }},
    ]);
  };

  return (
    <SheetFrame title="Devolución" onClose={onClose} onSave={handleSave} saveLabel="TERMINAR ARRIENDO">
      <Text style={ms.mVehicle}>{rental.driver_name} · {vehicle.name}</Text>

      <Text style={ms.mLabel}>¿QUÉ DÍA TE LO DEVOLVIÓ?</Text>
      <DateField value={date} onChange={setDate} />

      <Text style={ms.mLabel}>KILOMETRAJE AL RECIBIRLO</Text>
      <TextInput style={ms.mInput} value={showNum(endKm)} onChangeText={t => setEndKm(digits(t))} keyboardType="number-pad" placeholder="Lo que marca el tablero" placeholderTextColor="#444" />

      <View style={rs.tipBox}>
        <Text style={rs.tipTitle}>Cómo queda la cuenta</Text>
        <Text style={rs.tipTxt}>
          {st.owed > 0 ? `• Debe ${formatCurrency(st.owed)} de cuotas` : '• Cuotas al día'}{'\n'}
          {km ? (km.excess > 0 ? `• Se pasó ${formatKm(km.excess)} km = ${formatCurrency(km.charge)}` : '• No se pasó de los km') + '\n' : ''}
          • Te pagó {formatCurrency(st.depositPaid)} de depósito
        </Text>
      </View>

      <Text style={ms.mLabel}>¿CUÁNTO DEL DEPÓSITO LE DEVUELVES?</Text>
      <TextInput style={ms.mInput} value={showNum(back)} onChangeText={t => setBack(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor="#444" />
      <Text style={ms.mHint}>
        Antes de devolverlo revisa multas en el SIMIT (pueden llegar semanas después) y descuenta daños y lo que deba.
        {kept > 0 ? ` Te quedas con ${formatCurrency(kept)}: se anota como ingreso 🔑.` : ''}
      </Text>
    </SheetFrame>
  );
}

const rs = StyleSheet.create({
  section:      { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionTitle: { color: '#888', fontSize: 12, letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  startBtn:     { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: '#FFC107' },
  startTxt:     { color: '#FFC107', fontSize: 15, fontWeight: '700' },
  startSub:     { color: '#666', fontSize: 12, marginTop: 2 },
  driverRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  driver:       { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  phone:        { color: '#00C853', fontSize: 14, fontWeight: '600' },
  terms:        { color: '#888', fontSize: 13, marginTop: 4, marginBottom: 12 },
  statusBox:    { borderRadius: 12, borderWidth: 1.5, padding: 12, marginBottom: 12, backgroundColor: '#121212' },
  statusTxt:    { fontSize: 16, fontWeight: '800' },
  statusSub:    { color: '#aaa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  line:         { color: '#aaa', fontSize: 14, paddingVertical: 3 },
  lineDim:      { color: '#666', fontSize: 13, paddingVertical: 3 },
  warn:         { color: '#FFC107' },
  bad:          { color: '#F44336' },
  payBtn:       { backgroundColor: '#00C853', borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  payTxt:       { color: '#fff', fontSize: 17, fontWeight: '800' },
  payRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomColor: '#262626', borderBottomWidth: 1 },
  payIcon:      { fontSize: 20 },
  payTitle:     { color: '#fff', fontSize: 14, fontWeight: '600' },
  paySub:       { color: '#888', fontSize: 12, marginTop: 2 },
  payAmt:       { color: '#00C853', fontSize: 14, fontWeight: '700' },
  hint:         { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 8 },
  btnRow:       { flexDirection: 'row', gap: 10, marginTop: 14 },
  smallBtn:     { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#555', paddingVertical: 10, alignItems: 'center' },
  smallBtnTxt:  { color: '#aaa', fontSize: 14, fontWeight: '600' },

  // Formularios
  tipBox:       { backgroundColor: '#1a1a00', borderRadius: 14, padding: 14, marginBottom: 22 },
  tipTitle:     { color: '#FFC107', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  tipTxt:       { color: '#aaa', fontSize: 13, lineHeight: 20 },
  textInput:    { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, color: '#fff', fontSize: 17, marginBottom: 14 },
  rowLabel:     { color: '#aaa', fontSize: 15, flex: 1 },
  noteInput:    { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, color: '#fff', fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 14 },
});
