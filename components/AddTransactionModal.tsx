import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Pressable } from 'react-native';
import { addTransaction, addCharge, getActiveVehicle } from '../src/db';
import { todayString, formatCurrency } from '../src/format';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, CHARGE_CATEGORY, TransactionType } from '../src/categories';
import { getVehicleConfig, calcCashCommission } from '../src/vehicleCalc';
import { C, T, S, R, TOUCH } from '../src/theme';
import { Icon, SwitchMark } from './ui';
import SheetFrame, { ms, MoneyField, ChoiceTile } from './SheetFrame';

interface Props {
  initialType: TransactionType;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddTransactionModal({ initialType, onClose, onSaved }: Props) {
  const [type, setType]         = useState<TransactionType>(initialType);
  const [rawAmount, setRaw]     = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote]         = useState('');
  const [isCash, setIsCash]     = useState(false);
  const [rawKwh, setRawKwh]     = useState('');
  const [place, setPlace]       = useState('');

  const cfg = getVehicleConfig();
  const amount = Number(rawAmount);
  const cashCommission = isCash && type === 'income' && amount > 0
    ? calcCashCommission(amount, cfg)
    : 0;

  // Con carro eléctrico se muestra ⚡ Carga en vez de ⛽ Gasolina
  const vehicle  = getActiveVehicle();
  const electric = vehicle?.energy === 'electric';
  const categories = type === 'income'
    ? INCOME_CATEGORIES
    : EXPENSE_CATEGORIES.filter(c => c.id !== (electric ? 'gas' : CHARGE_CATEGORY));
  const kwh = Number(rawKwh.replace(',', '.'));
  const isCharge = type === 'expense' && category === CHARGE_CATEGORY;
  const tone = type === 'income' ? 'money' : 'spend';

  const handleTypeChange = (t: TransactionType) => {
    setType(t);
    setCategory('');
  };

  const handleCategory = (id: string) => {
    setCategory(id);
    // Uber Pass casi siempre vale lo mismo: se pre-llena el monto (editable)
    if (id === 'uber_pass' && !rawAmount) setRaw(String(cfg.uberPassPriceCOP));
  };

  const handleSave = () => {
    if (!amount || amount <= 0) {
      Alert.alert('Falta el valor', type === 'income' ? 'Escribe cuánto te entró.' : 'Escribe cuánto gastaste.');
      return;
    }
    if (!category) {
      Alert.alert('Falta en qué fue', type === 'income' ? 'Elige de dónde vino la plata.' : 'Elige en qué gastaste.');
      return;
    }
    if (isCharge && rawKwh && !(kwh > 0)) {
      Alert.alert('Revisa los kWh', 'Escribe solo el número, por ejemplo 32,5.');
      return;
    }
    const today = todayString();
    try {
      if (isCharge && vehicle) {
        addCharge(vehicle.id, amount, kwh > 0 ? kwh : null, place.trim() || null, note.trim() || null, today);
      } else {
        addTransaction(type, amount, category, note.trim() || null, today);
        // Si fue en efectivo, registrar automáticamente la comisión de Uber como gasto
        if (isCash && type === 'income' && cashCommission > 0) {
          addTransaction('expense', cashCommission, 'other',
            `Comisión Uber en efectivo (${cfg.uberCommissionPct}%)`, today);
        }
      }
    } catch {
      Alert.alert('No se pudo guardar', 'Intenta otra vez. Si sigue pasando, cierra la app y ábrela de nuevo.');
      return;
    }
    onSaved();
  };

  return (
    <SheetFrame
      title={type === 'income' ? 'Anotar ingreso' : 'Anotar gasto'}
      onClose={onClose}
      onSave={handleSave}
      saveLabel={type === 'income' ? 'Guardar ingreso' : 'Guardar gasto'}
      saveTone={tone}
    >
      {/* Ingreso / Gasto (botones segmentados) */}
      <View style={s.segment} accessibilityRole="radiogroup">
        {(['income', 'expense'] as const).map(t => {
          const on = type === t;
          const fg = t === 'income' ? C.money : C.spend;
          const bg = t === 'income' ? C.moneyContainer : C.spendContainer;
          return (
            <Pressable
              key={t}
              onPress={() => handleTypeChange(t)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[s.segBtn, on && { backgroundColor: bg }]}
            >
              {on && <Icon name="check" size={18} color={fg} />}
              <Text style={[T.label, { color: on ? fg : C.textMuted }]}>{t === 'income' ? 'Ingreso' : 'Gasto'}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={ms.mLabel}>¿Cuánto?</Text>
      <MoneyField raw={rawAmount} onChange={setRaw} autoFocus label="Valor" />

      <Text style={ms.mLabel}>{type === 'income' ? '¿De dónde?' : '¿En qué?'}</Text>
      <View style={ms.mGrid}>
        {categories.map(cat => (
          <ChoiceTile key={cat.id} icon={cat.icon} label={cat.label} selected={category === cat.id} tone={tone} onPress={() => handleCategory(cat.id)} />
        ))}
      </View>

      {/* Efectivo (solo para ingresos, y solo si Uber cobra comisión) */}
      {type === 'income' && !cfg.uberPassActive && (
        <>
          <Pressable
            style={[s.toggle, isCash && { backgroundColor: C.warnContainer }]}
            onPress={() => setIsCash(v => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: isCash }}
          >
            <Icon name="cash" size={24} color={isCash ? C.warn : C.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={T.titleSm}>¿Fue en efectivo?</Text>
              <Text style={T.labelSm}>Actívalo si el pasajero pagó en efectivo</Text>
            </View>
            <SwitchMark on={isCash} tone="warn" />
          </Pressable>
          {isCash && cashCommission > 0 && (
            <View style={s.cashNote}>
              <Icon name="alert" size={20} color={C.warn} />
              <Text style={[T.bodySm, { color: C.text, flex: 1 }]}>
                Separa {formatCurrency(cashCommission)} para pagarle a Uber. Al guardar, se anota solo como gasto.
              </Text>
            </View>
          )}
        </>
      )}

      {/* Carga del carro eléctrico: kWh y lugar para saber el precio real */}
      {isCharge && (
        <>
          <Text style={ms.mLabel}>¿Cuántos kWh cargó? (sale en el recibo)</Text>
          <TextInput
            style={ms.mInput}
            value={rawKwh}
            onChangeText={t => setRawKwh(t.replace(/[^\d.,]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="Ej.: 32,5"
            placeholderTextColor={C.textFaint}
          />
          {amount > 0 && kwh > 0 && (
            <Text style={[ms.mHint, { color: C.textMuted }]}>Pagaste {formatCurrency(amount / kwh)} por kWh</Text>
          )}
          <Text style={ms.mLabel}>¿Dónde? (opcional)</Text>
          <TextInput
            style={ms.mInput}
            value={place}
            onChangeText={setPlace}
            placeholder="Ej.: Terpel Las Vegas, casa"
            placeholderTextColor={C.textFaint}
          />
        </>
      )}

      <Text style={ms.mLabel}>Nota (opcional)</Text>
      <TextInput
        style={[ms.mInput, s.note]}
        value={note}
        onChangeText={setNote}
        placeholder="Ej.: mucho tráfico, llovió"
        placeholderTextColor={C.textFaint}
        multiline
        numberOfLines={3}
      />
    </SheetFrame>
  );
}

const s = StyleSheet.create({
  segment:  { flexDirection: 'row', borderWidth: 1, borderColor: C.outline, borderRadius: R.pill, overflow: 'hidden', marginBottom: S.xl },
  segBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.xs, minHeight: TOUCH },
  toggle:   { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.md, padding: S.md, minHeight: 64, marginBottom: S.md },
  cashNote: { flexDirection: 'row', gap: S.sm, alignItems: 'center', backgroundColor: C.warnContainer, borderRadius: R.md, padding: S.md, marginBottom: S.xl },
  note:     { fontSize: 16, fontWeight: '400', minHeight: 88, textAlignVertical: 'top', paddingTop: S.md },
});
