import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { getDebts, addDebt, setVehicleCosts, Vehicle, VehicleDoc, Debt, Rental } from '../src/db';
import { vehicleEconomics, WEEKS_PER_MONTH, WORK_DAYS_MONTH } from '../src/rental';
import { formatCurrency, formatKm } from '../src/format';
import SheetFrame, { ms } from './SheetFrame';

const digits  = (t: string) => t.replace(/\D/g, '');
const showNum = (raw: string) => (raw ? Number(raw).toLocaleString('es-CO') : '');

interface Props {
  vehicle:   Vehicle;
  docs:      VehicleDoc[];
  debt:      Debt | null;     // crédito vinculado
  rental:    Rental | null;   // contrato vigente
  isActive:  boolean;
  onChanged: () => void;
}

// ─── ¿Cuánto deja (arrendado) o cuánto cuesta (propio) el carro al mes? ──────

export default function VehicleEconomics({ vehicle, docs, debt, rental, isActive, onChanged }: Props) {
  const [showEdit, setShowEdit] = useState(false);
  const e = vehicleEconomics(vehicle, docs, debt, rental);
  const noDocsCost = e.docs === 0;

  const row = (label: string, amount: number, sign: '+' | '-') => (
    <View style={es.row} key={label}>
      <Text style={es.rowLabel}>{label}</Text>
      <Text style={[es.rowVal, { color: sign === '+' ? '#00C853' : '#F44336' }]}>{sign}{formatCurrency(amount)}</Text>
    </View>
  );

  const costRows = [
    e.loan  > 0 && row(`Cuota del crédito${e.loanMonths !== null ? ` (faltan ${e.loanMonths})` : ''}`, e.loan, '-'),
    e.docs  > 0 && row('SOAT, impuesto y seguro (al mes)', e.docs, '-'),
    e.extra > 0 && row('GPS y otros fijos', e.extra, '-'),
  ];

  return (
    <View style={es.section}>
      {rental ? (
        <>
          <Text style={es.title}>¿CUÁNTO TE DEJA AL MES?</Text>
          {row(`Arriendo (${formatCurrency(rental.weekly_fee)} × ${String(WEEKS_PER_MONTH.toFixed(2)).replace('.', ',')} semanas)`, e.rent, '+')}
          {costRows}
          {row(`Mantenimiento (~${formatKm(e.maintKm)} km × ${formatCurrency(vehicle.maint_cost_per_km)})`, e.maint, '-')}
          <View style={es.divider} />
          <View style={es.row}>
            <Text style={es.totalLabel}>{e.net >= 0 ? 'Te deja' : 'Pierdes'}</Text>
            <Text style={[es.totalVal, { color: e.net >= 0 ? '#00C853' : '#F44336' }]}>{formatCurrency(e.net)}</Text>
          </View>
          {e.loan > 0 && (
            <Text style={es.note}>Cuando termines de pagar el crédito: {formatCurrency(e.netAfterLoan)} al mes.</Text>
          )}
          <Text style={es.hint}>
            Estimado si no se queda quieto ninguna semana. No incluye lo que se desvaloriza el carro.
          </Text>
        </>
      ) : (
        <>
          <Text style={es.title}>LO QUE TE CUESTA TENERLO AL MES</Text>
          {costRows}
          <View style={es.divider} />
          <View style={es.row}>
            <Text style={es.totalLabel}>Total fijo</Text>
            <Text style={[es.totalVal, { color: e.fixed > 0 ? '#F44336' : '#888' }]}>{formatCurrency(e.fixed)}</Text>
          </View>
          {e.fixed > 0 && (
            <Text style={es.note}>
              {isActive
                ? `Cada día de trabajo (${WORK_DAYS_MONTH} al mes) tiene que dejar ${formatCurrency(e.perWorkDay)} solo para el carro, además de ${vehicle.energy === 'electric' ? 'la carga' : 'la gasolina'} y el mantenimiento.`
                : `Quieto, este carro te cuesta ${formatCurrency(e.fixed)} al mes.`}
            </Text>
          )}
        </>
      )}

      {e.loan === 0 && <Text style={es.missing}>¿Tiene crédito? Agrégalo en "Editar costos".</Text>}
      {noDocsCost && <Text style={es.missing}>Falta el costo del SOAT, impuesto o seguro: agrégalo en Vencimientos.</Text>}

      <TouchableOpacity style={es.editBtn} onPress={() => setShowEdit(true)}>
        <Text style={es.editTxt}>Editar costos</Text>
      </TouchableOpacity>

      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
        {showEdit && (
          <CostsModal
            vehicle={vehicle}
            debt={debt}
            onClose={() => setShowEdit(false)}
            onSaved={() => { setShowEdit(false); onChanged(); }}
          />
        )}
      </Modal>
    </View>
  );
}

// ─── Modal: crédito vinculado y otros fijos ───────────────────────────────────

function CostsModal({ vehicle, debt, onClose, onSaved }: {
  vehicle: Vehicle; debt: Debt | null; onClose: () => void; onSaved: () => void;
}) {
  const debts = getDebts();
  const [debtId, setDebtId]   = useState<number | 'new' | null>(debt?.id ?? null);
  const [payment, setPayment] = useState('');
  const [months, setMonths]   = useState('');
  const [extra, setExtra]     = useState(vehicle.extra_monthly_cost ? String(vehicle.extra_monthly_cost) : '');

  const handleSave = () => {
    let linked: number | null = debtId === 'new' ? null : debtId;
    if (debtId === 'new') {
      if (!(Number(payment) > 0)) {
        Alert.alert('Falta la cuota', 'Escribe cuánto pagas cada mes del crédito.');
        return;
      }
      linked = addDebt(`Crédito ${vehicle.name}`, Number(payment), Number(months) > 0 ? Number(months) : null);
    }
    setVehicleCosts(vehicle.id, linked, Number(extra) || 0);
    onSaved();
  };

  const chip = (id: number | 'new' | null, label: string) => (
    <TouchableOpacity key={String(id)} style={[ms.mChip, debtId === id && ms.mChipOn]} onPress={() => setDebtId(id)}>
      <Text style={[ms.mChipTxt, debtId === id && ms.mChipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SheetFrame title="Costos del carro" onClose={onClose} onSave={handleSave}>
      <Text style={ms.mVehicle}>{vehicle.name}</Text>

      <Text style={ms.mLabel}>¿CUÁL ES EL CRÉDITO DE ESTE CARRO?</Text>
      <View style={ms.mGrid}>
        {chip(null, 'No tiene crédito')}
        {debts.map(d => chip(d.id, `${d.name} · ${formatCurrency(d.monthly_payment)}`))}
        {chip('new', '+ Agregar el crédito')}
      </View>

      {debtId === 'new' ? (
        <>
          <Text style={ms.mLabel}>CUOTA MENSUAL</Text>
          <TextInput style={ms.mInput} value={showNum(payment)} onChangeText={t => setPayment(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor="#444" />
          <Text style={ms.mLabel}>¿CUÁNTAS CUOTAS FALTAN? (opcional)</Text>
          <TextInput style={ms.mInput} value={months} onChangeText={t => setMonths(digits(t))} keyboardType="number-pad" placeholder="Ej: 41" placeholderTextColor="#444" />
          <Text style={ms.mHint}>Se agrega también en 💰 Balance → Deudas, para que cuente en tu meta del mes.</Text>
        </>
      ) : (
        <Text style={ms.mHint}>Las cuotas salen de 💰 Balance → Deudas: se usan las mismas, no se cuentan dos veces.</Text>
      )}

      <Text style={ms.mLabel}>GPS Y OTROS FIJOS AL MES</Text>
      <TextInput style={ms.mInput} value={showNum(extra)} onChangeText={t => setExtra(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor="#444" />
      <Text style={ms.mHint}>GPS, parqueadero y lo que pagues cada mes por este carro. El SOAT, la técnico-mecánica, el impuesto y el seguro van con su costo en Vencimientos.</Text>
    </SheetFrame>
  );
}

const es = StyleSheet.create({
  section:    { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  title:      { color: '#888', fontSize: 12, letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rowLabel:   { color: '#aaa', fontSize: 13, flex: 1 },
  rowVal:     { fontSize: 14, fontWeight: '700' },
  divider:    { height: 1, backgroundColor: '#333', marginVertical: 8 },
  totalLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  totalVal:   { fontSize: 20, fontWeight: '800' },
  note:       { color: '#aaa', fontSize: 13, marginTop: 8, lineHeight: 18 },
  hint:       { color: '#555', fontSize: 11, marginTop: 8, lineHeight: 16 },
  missing:    { color: '#FFC107', fontSize: 12, marginTop: 8 },
  editBtn:    { marginTop: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#555', paddingVertical: 10, alignItems: 'center' },
  editTxt:    { color: '#aaa', fontSize: 14, fontWeight: '600' },
});
