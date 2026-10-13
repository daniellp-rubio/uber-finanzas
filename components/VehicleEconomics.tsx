import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Modal } from 'react-native';
import { getDebts, addDebt, setVehicleCosts, Vehicle, VehicleDoc, Debt, Rental } from '../src/db';
import { vehicleEconomics, WEEKS_PER_MONTH, WORK_DAYS_MONTH } from '../src/rental';
import { formatCurrency, formatKm } from '../src/format';
import SheetFrame, { ms } from './SheetFrame';
import { C, T, S } from '../src/theme';
import { Amount, Button, Chip, Collapsible } from './ui';

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
      <Text style={[T.bodySm, { flex: 1 }]}>{label}</Text>
      <Amount value={amount} kind={sign === '+' ? 'in' : 'out'} />
    </View>
  );

  const costRows = [
    e.loan  > 0 && row(`Cuota del crédito${e.loanMonths !== null ? ` (faltan ${e.loanMonths})` : ''}`, e.loan, '-'),
    e.docs  > 0 && row('SOAT, impuesto y seguro (al mes)', e.docs, '-'),
    e.extra > 0 && row('GPS y otros fijos', e.extra, '-'),
  ];

  const summary = rental
    ? `${e.net >= 0 ? 'Te deja' : 'Pierdes'} ${formatCurrency(e.net)} al mes`
    : `Te cuesta ${formatCurrency(e.fixed)} al mes`;

  return (
    <Collapsible
      title={rental ? '¿Cuánto te deja al mes?' : 'Lo que te cuesta al mes'}
      summary={summary}
      summaryTone={rental && e.net < 0 ? 'spend' : undefined}
    >
      {rental ? (
        <>
          {row(`Arriendo (${formatCurrency(rental.weekly_fee)} × ${String(WEEKS_PER_MONTH.toFixed(2)).replace('.', ',')} semanas)`, e.rent, '+')}
          {costRows}
          {row(`Mantenimiento (~${formatKm(e.maintKm)} km × ${formatCurrency(vehicle.maint_cost_per_km)})`, e.maint, '-')}
          <View style={es.divider} />
          <View style={es.row}>
            <Text style={[T.titleSm, { flex: 1 }]}>{e.net >= 0 ? 'Te deja' : 'Pierdes'}</Text>
            <Text style={[T.title, { fontVariant: ['tabular-nums'], color: e.net >= 0 ? C.money : C.spend }]}>{formatCurrency(e.net)}</Text>
          </View>
          {e.loan > 0 && (
            <Text style={es.note}>Cuando termines de pagar el crédito: {formatCurrency(e.netAfterLoan)} al mes.</Text>
          )}
          <Text style={[es.note, { color: C.textFaint }]}>
            Estimado si no se queda quieto ninguna semana. No incluye lo que se desvaloriza el carro.
          </Text>
        </>
      ) : (
        <>
          {costRows}
          <View style={es.divider} />
          <View style={es.row}>
            <Text style={[T.titleSm, { flex: 1 }]}>Total fijo</Text>
            <Text style={[T.title, { fontVariant: ['tabular-nums'] }]}>{formatCurrency(e.fixed)}</Text>
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

      {e.loan === 0 && <Text style={[es.note, { color: C.warn }]}>¿Tiene crédito? Agrégalo en "Editar costos".</Text>}
      {noDocsCost && <Text style={[es.note, { color: C.warn }]}>Falta el costo del SOAT, impuesto o seguro: agrégalo en Vencimientos.</Text>}

      <Button label="Editar costos" icon="pencil-outline" variant="outlined" tone="neutral" onPress={() => setShowEdit(true)} style={{ marginTop: S.md, alignSelf: 'flex-start' }} />

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
    </Collapsible>
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
    <Chip key={String(id)} label={label} selected={debtId === id} onPress={() => setDebtId(id)} />
  );

  return (
    <SheetFrame title="Costos del carro" onClose={onClose} onSave={handleSave}>
      <Text style={ms.mVehicle}>{vehicle.name}</Text>

      <Text style={ms.mLabel}>¿Cuál es el crédito de este carro?</Text>
      <View style={ms.mGrid}>
        {chip(null, 'No tiene crédito')}
        {debts.map(d => chip(d.id, `${d.name} · ${formatCurrency(d.monthly_payment)}`))}
        {chip('new', 'Agregar el crédito')}
      </View>

      {debtId === 'new' ? (
        <>
          <Text style={ms.mLabel}>Cuota de cada mes</Text>
          <TextInput style={ms.mInput} value={showNum(payment)} onChangeText={t => setPayment(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor={C.textFaint} />
          <Text style={ms.mLabel}>¿Cuántas cuotas faltan? (opcional)</Text>
          <TextInput style={ms.mInput} value={months} onChangeText={t => setMonths(digits(t))} keyboardType="number-pad" placeholder="Ej.: 41" placeholderTextColor={C.textFaint} />
          <Text style={ms.mHint}>Se agrega también en Balance → Deudas, para que cuente en tu meta del mes.</Text>
        </>
      ) : (
        <Text style={ms.mHint}>Las cuotas salen de Balance → Deudas: se usan las mismas, no se cuentan dos veces.</Text>
      )}

      <Text style={ms.mLabel}>GPS y otros fijos al mes</Text>
      <TextInput style={ms.mInput} value={showNum(extra)} onChangeText={t => setExtra(digits(t))} keyboardType="number-pad" placeholder="$ 0" placeholderTextColor={C.textFaint} />
      <Text style={ms.mHint}>GPS, parqueadero y lo que pagues cada mes por este carro. El SOAT, la técnico-mecánica, el impuesto y el seguro van con su costo en Vencimientos.</Text>
    </SheetFrame>
  );
}

const es = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.md, minHeight: 36 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.outline, marginVertical: S.sm },
  note:    { ...T.labelSm, marginTop: S.sm },
});
