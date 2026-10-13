import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFunds, getFundMovements, addFundMovement, getTransactionsByDate, Fund, FundMovement } from '../src/db';
import { formatCurrency, todayString, formatShortDate } from '../src/format';
import { RENT_CATEGORY } from '../src/categories';
import { C, T, S, R } from '../src/theme';
import { Amount, Button, Hint, IconButton, Row, Section } from './ui';
import SheetFrame, { ms, MoneyField } from './SheetFrame';

// ─── Agregar o usar plata de un fondo ─────────────────────────────────────────

interface FundActionModalProps {
  fund: Fund;
  action: 'deposit' | 'withdraw';
  onClose: () => void;
  onSaved: () => void;
}

function FundActionModal({ fund, action, onClose, onSaved }: FundActionModalProps) {
  const [raw, setRaw]   = useState('');
  const [note, setNote] = useState('');
  const isDeposit       = action === 'deposit';

  const handleSave = () => {
    const amount = Number(raw);
    if (!amount || amount <= 0) { Alert.alert('Falta el valor', isDeposit ? 'Escribe cuánto separas.' : 'Escribe cuánto vas a usar.'); return; }
    if (!isDeposit && amount > fund.balance) {
      Alert.alert('No alcanza', `En este fondo solo hay ${formatCurrency(fund.balance)}.`);
      return;
    }
    addFundMovement(fund.id, isDeposit ? amount : -amount, note.trim() || null, todayString());
    onSaved();
  };

  return (
    <SheetFrame
      title={isDeposit ? `Separar para ${fund.name}` : `Usar de ${fund.name}`}
      onClose={onClose}
      onSave={handleSave}
      saveLabel={isDeposit ? 'Separar' : 'Usar'}
      saveTone={isDeposit ? 'money' : 'spend'}
    >
      <Text style={[T.bodySm, { marginBottom: S.lg }]}>Hay {formatCurrency(fund.balance)} en este fondo.</Text>
      <Text style={ms.mLabel}>¿Cuánto?</Text>
      <MoneyField raw={raw} onChange={setRaw} autoFocus label="Valor" />
      <Text style={ms.mLabel}>Nota (opcional)</Text>
      <TextInput
        style={ms.mInput}
        value={note}
        onChangeText={setNote}
        placeholder="Ej.: revisión de los 20.000 km"
        placeholderTextColor={C.textFaint}
      />
    </SheetFrame>
  );
}

// ─── Detalle de un fondo ──────────────────────────────────────────────────────

interface FundDetailProps {
  fund: Fund;
  onClose: () => void;
  onMoved: () => void;
}

function FundDetailModal({ fund, onClose, onMoved }: FundDetailProps) {
  const [action, setAction]       = useState<'deposit' | 'withdraw' | null>(null);
  const [movements, setMovements] = useState<FundMovement[]>([]);

  React.useEffect(() => {
    setMovements(getFundMovements(fund.id));
  }, [fund.id]);

  const handleMoved = () => {
    setAction(null);
    setMovements(getFundMovements(fund.id));
    onMoved();
  };

  if (action) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAction(null)}>
        <FundActionModal fund={fund} action={action} onClose={() => setAction(null)} onSaved={handleMoved} />
      </Modal>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <IconButton name="arrow-left" label="Volver a Fondos" color={C.text} onPress={onClose} />
        <Text style={[T.title, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">{fund.icon} {fund.name}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={T.label}>Hay en este fondo</Text>
          <Text style={T.display}>{formatCurrency(fund.balance)}</Text>
          <Text style={T.labelSm}>La plata sigue en tu billetera; la app solo lleva la cuenta.</Text>
          <View style={s.btnRow}>
            <Button label="Separar" icon="plus" tone="money" style={{ flex: 1 }} onPress={() => setAction('deposit')} />
            <Button label="Usar" icon="minus" variant="tonal" tone="spend" style={{ flex: 1 }} disabled={fund.balance <= 0} onPress={() => setAction('withdraw')} />
          </View>
        </View>

        <Section title="Movimientos">
          {movements.length === 0 ? (
            <Text style={T.bodySm}>Sin movimientos todavía.</Text>
          ) : movements.map((m, i) => (
            <View key={m.id} style={[s.mvRow, i < movements.length - 1 && s.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>{formatShortDate(m.date)}</Text>
                {m.note ? <Text style={T.labelSm}>{m.note}</Text> : null}
              </View>
              <Amount value={m.amount} kind={m.amount >= 0 ? 'in' : 'out'} />
            </View>
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function FundsScreen() {
  const [funds, setFunds]       = useState<Fund[]>([]);
  const [selected, setSelected] = useState<Fund | null>(null);
  const [todayDrive, setDrive]  = useState(0);

  const load = useCallback(() => {
    setFunds(getFunds());
    // Lo ganado manejando hoy, para las sugerencias de cuánto separar
    setDrive(getTransactionsByDate(todayString())
      .filter(t => t.type === 'income' && t.category !== RENT_CATEGORY)
      .reduce((sum, t) => sum + t.amount, 0));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const totalSaved = funds.reduce((sum, f) => sum + f.balance, 0);
  const pct = (p: number) => todayDrive > 0 ? `hoy serían ${formatCurrency(todayDrive * p / 100)}` : 'cuando anotes lo de hoy te digo cuánto';

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={T.headline} accessibilityRole="header">Fondos</Text>
        <Text style={T.bodySm}>Plata separada para imprevistos</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={T.label}>Total separado</Text>
          <Text style={T.display}>{formatCurrency(totalSaved)}</Text>
          <Text style={T.labelSm}>Cada fondo es un sobre: la plata sigue en tu billetera.</Text>
        </View>

        <Section>
          {funds.map((fund, i) => (
            <Row
              key={fund.id}
              title={`${fund.icon}  ${fund.name}`}
              right={<Text style={T.amount}>{formatCurrency(fund.balance)}</Text>}
              onPress={() => setSelected(fund)}
              last={i === funds.length - 1}
            />
          ))}
          <Hint>Toca un fondo para separar o usar plata.</Hint>
        </Section>

        <Section title="¿Cuánto separar?">
          <Tip glyph="🛡️" title="Emergencias" text={`10 % de lo que ganas; ${pct(10)}`} />
          <Tip glyph="🔧" title="Mecánico" text="$300.000 al mes, unos $12.500 por día trabajado" />
          <Tip glyph="⚖️" title="Multas" text="$200.000 al mes (zona gris legal)" />
          <Tip glyph="🏦" title="Pensión" text={`16 % de lo que ganas (aporte voluntario); ${pct(16)}`} last />
        </Section>
      </ScrollView>

      <Modal
        visible={selected !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <FundDetailModal
            fund={selected}
            onClose={() => setSelected(null)}
            onMoved={() => {
              load();
              const updated = getFunds().find(f => f.id === selected.id);
              if (updated) setSelected(updated);
            }}
          />
        )}
      </Modal>
    </View>
  );
}

function Tip({ glyph, title, text, last }: { glyph: string; title: string; text: string; last?: boolean }) {
  return (
    <View style={[s.tip, !last && s.divider]}>
      <Text style={s.glyph}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text style={T.body}>{title}</Text>
        <Text style={T.labelSm}>{text}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.sm },
  topBar:    { flexDirection: 'row', alignItems: 'center', gap: S.xs, paddingHorizontal: S.xs, minHeight: 64 },
  scroll:    { paddingHorizontal: S.lg, paddingBottom: S.xl },
  hero:      { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, gap: 2 },
  btnRow:    { flexDirection: 'row', gap: S.md, marginTop: S.lg },
  mvRow:     { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: S.xs },
  divider:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
  tip:       { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingVertical: S.xs },
  glyph:     { fontSize: 22, width: 28, textAlign: 'center' },
});
