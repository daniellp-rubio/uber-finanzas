import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDafelMoves, getChargeExpensesSince, addDafelMove, setDafelStart, deleteDafelMove } from '../src/db';
import { computeDafelAccount, DafelAccount, DafelEntry, DafelLoan } from '../src/dafelAccount';
import { formatCurrency, formatShortDate, todayString } from '../src/format';
import { C, T, S, R } from '../src/theme';
import { Amount, Button, Hint, IconButton, Row, Section } from './ui';
import SheetFrame, { ms, MoneyField } from './SheetFrame';

// Plata del papá en el Bancolombia de Dafel: Uber le paga ahí, las cargas van con la tarjeta de Dafel
// y los préstamos de Dafel se pagan con ese saldo. Cálculo en src/dafelAccount.ts.

const MAX_ENTRIES = 40;

export function loadDafelAccount(): DafelAccount {
  const moves = getDafelMoves();
  const start = moves.find(m => m.kind === 'start');
  return computeDafelAccount(moves, start ? getChargeExpensesSince(start.date) : []);
}

// ─── Fila en Fondos ───────────────────────────────────────────────────────────

export function DafelAccountCard({ account, onPress }: { account: DafelAccount; onPress: () => void }) {
  const owes = account.balance < 0;
  const subtitle = !account.started
    ? 'Toca para empezar a llevar la cuenta'
    : [owes ? 'Le debes a Dafel' : 'Tu plata ahí',
       account.pendingLoans > 0 ? `debes ${formatCurrency(account.pendingLoans)} en préstamos` : null].filter(Boolean).join(' · ');
  return (
    <Section title="Plata con Dafel">
      <Row
        icon="bank"
        tone={owes ? 'spend' : 'primary'}
        title="Bancolombia de Dafel"
        subtitle={subtitle}
        right={account.started
          ? <Text style={[T.amount, owes && { color: C.spend }]}>{owes ? '−' : ''}{formatCurrency(Math.abs(account.balance))}</Text>
          : null}
        onPress={onPress}
        last
      />
    </Section>
  );
}

// ─── Formulario de un monto ───────────────────────────────────────────────────

type SheetKind = 'start' | 'uber' | 'out' | 'loan';

const SHEETS: Record<SheetKind, {
  title: string; intro: string; save: string; tone: 'money' | 'spend' | 'primary'; note: string | null; allowZero?: boolean;
}> = {
  start: {
    title: 'Tu plata con Dafel',
    intro: '¿Cuánto de tu plata hay hoy en el Bancolombia de Dafel? Si no sabes, pregúntale a él. Desde hoy, cada ⚡ Carga se resta sola porque la paga su tarjeta.',
    save: 'Empezar', tone: 'primary', note: null, allowZero: true,
  },
  uber: {
    title: 'Uber pagó',
    intro: 'Lo que Uber consignó en la cuenta de Dafel. El valor sale en el resumen semanal de Uber.',
    save: 'Sumar', tone: 'money', note: 'Ej.: semana del 13 al 19',
  },
  out: {
    title: 'Dafel te pasó',
    intro: 'Plata tuya que Dafel te pasó, o con la que te pagó algo. Se resta de tu saldo.',
    save: 'Restar', tone: 'spend', note: 'Ej.: transferencia a Nequi',
  },
  loan: {
    title: 'Dafel te prestó',
    intro: 'Queda como deuda y no toca tu saldo. Cuando le pagues, toca "Ya le pagué" y ahí se resta de tu saldo.',
    save: 'Anotar', tone: 'primary', note: 'Ej.: para las llantas',
  },
};

function AmountSheet({ title, intro, save, tone, note: notePlaceholder, allowZero, initial = '', max, onClose, onSave }: {
  title: string; intro: string; save: string; tone: 'money' | 'spend' | 'primary'; note: string | null;
  allowZero?: boolean; initial?: string; max?: number; onClose: () => void; onSave: (amount: number, note: string | null) => void;
}) {
  const [raw, setRaw]   = useState(initial);
  const [note, setNote] = useState('');

  const handleSave = () => {
    const amount = Number(raw);
    if (raw === '' || (!allowZero && amount <= 0)) { Alert.alert('Falta el valor', 'Escribe cuánto fue.'); return; }
    if (max !== undefined && amount > max) { Alert.alert('Es más de lo que debes', `De este préstamo solo debes ${formatCurrency(max)}.`); return; }
    onSave(amount, note.trim() || null);
  };

  return (
    <SheetFrame title={title} onClose={onClose} onSave={handleSave} saveLabel={save} saveTone={tone}>
      <Text style={[T.bodySm, { marginBottom: S.lg }]}>{intro}</Text>
      <Text style={ms.mLabel}>¿Cuánto?</Text>
      <MoneyField raw={raw} onChange={setRaw} autoFocus label="Valor" />
      {notePlaceholder && (
        <>
          <Text style={ms.mLabel}>Nota (opcional)</Text>
          <TextInput
            style={ms.mInput}
            value={note}
            onChangeText={setNote}
            placeholder={notePlaceholder}
            placeholderTextColor={C.textFaint}
          />
        </>
      )}
    </SheetFrame>
  );
}

// ─── Detalle ──────────────────────────────────────────────────────────────────

export default function DafelAccountModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [account, setAccount] = useState<DafelAccount>(() => loadDafelAccount());
  const [sheet, setSheet]     = useState<SheetKind | null>(null);
  const [paying, setPaying]   = useState<DafelLoan | null>(null);

  const reload = useCallback(() => { setAccount(loadDafelAccount()); onChanged(); }, [onChanged]);

  const closeSheets = () => { setSheet(null); setPaying(null); };
  const saved = () => { closeSheets(); reload(); };

  const handleSheetSave = (kind: SheetKind) => (amount: number, note: string | null) => {
    if (kind === 'start') setDafelStart(amount, todayString());
    else addDafelMove(kind, amount, todayString(), note);
    saved();
  };

  const deleteEntry = (e: DafelEntry) => {
    if (e.moveId === null) return;
    const isStart = e === account.entries[account.entries.length - 1];
    Alert.alert(
      isStart ? 'Borrar el saldo inicial' : 'Borrar movimiento',
      isStart
        ? 'Se borra el punto de partida y tendrás que escribir de nuevo cuánto hay hoy.'
        : `¿Borrar "${e.label}" de ${formatCurrency(Math.abs(e.amount))}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => { deleteDafelMove(e.moveId!); reload(); } },
      ],
    );
  };

  const deleteLoan = (l: DafelLoan) =>
    Alert.alert('Borrar préstamo', `¿Borrar el préstamo de ${formatCurrency(l.amount)}?${l.paid > 0 ? ' También se borran sus pagos y esa plata vuelve a tu saldo.' : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { deleteDafelMove(l.id); reload(); } },
    ]);

  if (sheet || paying) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheets}>
        {paying ? (
          <AmountSheet
            title="Pagarle a Dafel"
            intro={`De este préstamo debes ${formatCurrency(paying.pending)}. Lo que pagues se resta de tu plata en el Bancolombia de Dafel.`}
            save="Ya le pagué"
            tone="money"
            note={null}
            initial={String(Math.round(paying.pending))}
            max={paying.pending}
            onClose={closeSheets}
            onSave={amount => { addDafelMove('loan_paid', amount, todayString(), null, paying.id); saved(); }}
          />
        ) : sheet && (
          <AmountSheet {...SHEETS[sheet]} onClose={closeSheets} onSave={handleSheetSave(sheet)} />
        )}
      </Modal>
    );
  }

  const owes = account.balance < 0;
  const shown = account.entries.slice(0, MAX_ENTRIES);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <IconButton name="arrow-left" label="Volver a Fondos" color={C.text} onPress={onClose} />
        <Text style={[T.title, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">Bancolombia de Dafel</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {!account.started ? (
          <View style={s.hero}>
            <Text style={T.title}>Tu plata en la cuenta de Dafel</Text>
            <Text style={[T.bodySm, { marginTop: S.sm }]}>
              Uber te paga en el Bancolombia de Dafel y las cargas van con su tarjeta. Aquí ves cuánto de esa plata es tuya,
              y lo que Dafel te presta.
            </Text>
            <Button label="Empezar" icon="play" big style={{ marginTop: S.lg }} onPress={() => setSheet('start')} />
          </View>
        ) : (
          <>
            <View style={s.hero}>
              <Text style={T.label}>{owes ? 'Le debes a Dafel' : 'Tu plata en la cuenta de Dafel'}</Text>
              <Text style={[T.display, owes && { color: C.spend }]}>{formatCurrency(Math.abs(account.balance))}</Text>
              <Text style={T.labelSm}>
                Las cargas se restan solas{account.chargesTotal > 0 ? `: van ${formatCurrency(account.chargesTotal)} desde el ${formatShortDate(account.startDate!)}` : ''}.
              </Text>
              <View style={s.btnRow}>
                <Button label="Uber pagó" icon="plus" tone="money" style={{ flex: 1 }} onPress={() => setSheet('uber')} />
                <Button label="Dafel te pasó" icon="minus" variant="tonal" tone="spend" style={{ flex: 1 }} onPress={() => setSheet('out')} />
              </View>
            </View>

            <Section title="Préstamos de Dafel">
              {account.loans.length === 0 ? (
                <Text style={T.bodySm}>No le debes préstamos a Dafel.</Text>
              ) : account.loans.map((l, i) => (
                <View key={l.id} style={[s.loanRow, i < account.loans.length - 1 && s.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={T.body}>{formatCurrency(l.amount)} · {formatShortDate(l.date)}</Text>
                    {l.note ? <Text style={T.labelSm} numberOfLines={1}>{l.note}</Text> : null}
                    <Text style={[T.labelSm, { color: l.pending > 0 ? C.warn : C.money }]}>
                      {l.pending > 0 ? `Debes ${formatCurrency(l.pending)}` : 'Pagado'}
                    </Text>
                  </View>
                  {l.pending > 0 && <Button label="Ya le pagué" variant="tonal" tone="money" style={s.payBtn} onPress={() => setPaying(l)} />}
                  <IconButton name="trash-can-outline" label={`Borrar préstamo de ${formatCurrency(l.amount)}`} onPress={() => deleteLoan(l)} />
                </View>
              ))}
              <Button label="Dafel te prestó" icon="plus" variant="tonal" style={{ marginTop: S.md }} onPress={() => setSheet('loan')} />
            </Section>

            <Section title="Movimientos">
              {shown.map((e, i) => (
                <View key={e.key} style={[s.mvRow, i < shown.length - 1 && s.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={T.body}>{e.label}</Text>
                    <Text style={T.labelSm} numberOfLines={1}>{[formatShortDate(e.date), e.note].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Amount value={Math.abs(e.amount)} kind={e.amount >= 0 ? 'in' : 'out'} />
                  {e.moveId !== null
                    ? <IconButton name="trash-can-outline" label={`Borrar ${e.label}`} onPress={() => deleteEntry(e)} />
                    : <View style={s.iconSpace} />}
                </View>
              ))}
              <Hint>Las cargas se borran desde Hoy, como cualquier gasto.</Hint>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  topBar:    { flexDirection: 'row', alignItems: 'center', gap: S.xs, paddingHorizontal: S.xs, minHeight: 64 },
  scroll:    { paddingHorizontal: S.lg, paddingBottom: S.xl },
  hero:      { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, gap: 2 },
  btnRow:    { flexDirection: 'row', gap: S.md, marginTop: S.lg },
  loanRow:   { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 72, paddingVertical: S.sm },
  payBtn:    { paddingHorizontal: S.md },
  mvRow:     { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 60, paddingVertical: S.xs },
  divider:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
  iconSpace: { width: 48 },
});
