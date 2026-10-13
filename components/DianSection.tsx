import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  projectYear, calcDIANEstimate, DIAN_DISCLAIMER, TAX_YEAR,
  INCOME_TO_FILE_COP, PATRIMONY_TO_FILE_COP,
} from '../src/dian';
import { formatCurrency, formatDate } from '../src/format';
import { C, T, S, R } from '../src/theme';
import { Collapsible, Icon } from './ui';

// Estimador de renta del año, proyectado con lo anotado desde el primer registro del año
export default function DianSection() {
  const p = projectYear();
  const d = p ? calcDIANEstimate(p.input) : null;

  return (
    <Collapsible
      title={`Renta ${TAX_YEAR} (DIAN)`}
      summary={!d ? 'Falta al menos un mes de registros este año'
        : d.mustFileByIncome ? `Te tocaría declarar · impuesto estimado ${formatCurrency(d.taxWithCosts)}`
        : `Por ingresos no te tocaría declarar · impuesto estimado ${formatCurrency(d.taxWithCosts)}`}
      summaryTone={d?.mustFileByIncome ? 'warn' : undefined}
    >
      {!p || !d ? (
        <Text style={T.bodySm}>Necesitas al menos un mes de registros este año para calcularlo.</Text>
      ) : (
        <>
          <View style={s.status}>
            <Icon name={d.mustFileByIncome ? 'alert' : 'check-circle'} size={20} color={d.mustFileByIncome ? C.warn : C.money} />
            <Text style={[T.label, { flex: 1, color: d.mustFileByIncome ? C.warn : C.money }]}>
              {d.mustFileByIncome ? 'Con lo que llevas, te toca declarar renta' : 'Por ingresos, no te tocaría declarar'}
            </Text>
          </View>

          <View style={s.detail}>
            <Line label="Ingresos del año (proyectado)" value={formatCurrency(d.income)} />
            <Line label="Gastos del carro que se restan" value={`−${formatCurrency(d.costs)}`} />
            <View style={s.divider} />
            <Line label="Impuesto estimado" value={formatCurrency(d.taxWithCosts)} bold />
          </View>
          {d.taxWithExempt !== null && (
            <Text style={s.note}>
              Si un contador acepta el 25 % exento por trabajo independiente, podría bajar a {formatCurrency(d.taxWithExempt)}.
            </Text>
          )}

          <Text style={[T.label, { marginTop: S.lg, marginBottom: S.xs }]}>Te toca declarar si en {TAX_YEAR} pasa cualquiera de estas:</Text>
          <Text style={s.bullet}>• Ingresos de {formatCurrency(INCOME_TO_FILE_COP)} o más</Text>
          <Text style={s.bullet}>• Consignaciones en el banco o compras con tarjeta de más de {formatCurrency(INCOME_TO_FILE_COP)}</Text>
          <Text style={s.bullet}>• Todo lo que tienes (carros, casa, cuentas) vale más de {formatCurrency(PATRIMONY_TO_FILE_COP)}, aunque tengas deudas</Text>

          <Text style={s.note}>
            Calculado con tus registros desde el {formatDate(p.fromDate)} ({p.days} días), llevado a un año completo.
            Gastos que cuentan: gasolina o carga, Uber Pass, mecánico, lavado y peajes.
          </Text>
          <Text style={[s.note, { color: C.textFaint }]}>{DIAN_DISCLAIMER}</Text>
        </>
      )}
    </Collapsible>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[bold ? T.label : T.bodySm, { flex: 1 }]}>{label}</Text>
      <Text style={T.amount}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  status:  { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  detail:  { backgroundColor: C.surfaceHigh, borderRadius: R.md, padding: S.md, marginTop: S.md },
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm, minHeight: 32 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.outline, marginVertical: S.xs },
  bullet:  { ...T.bodySm, marginBottom: S.xs },
  note:    { ...T.labelSm, marginTop: S.md },
});
