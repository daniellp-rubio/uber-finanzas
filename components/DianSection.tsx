import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  projectYear, calcDIANEstimate, DIAN_DISCLAIMER, TAX_YEAR,
  INCOME_TO_FILE_COP, PATRIMONY_TO_FILE_COP,
} from '../src/dian';
import { formatCurrency, formatDate } from '../src/format';

// Estimador de renta del año, proyectado con lo anotado desde el primer registro del año
export default function DianSection() {
  const [open, setOpen] = useState(false);
  const p = projectYear();

  return (
    <TouchableOpacity style={s.section} onPress={() => setOpen(v => !v)} activeOpacity={0.8}>
      <View style={s.header}>
        <Text style={s.title}>🏛️ RENTA {TAX_YEAR} (DIAN)</Text>
        <Text style={s.chevron}>{open ? '▲' : '▼'}</Text>
      </View>

      {!p ? (
        <Text style={s.muted}>Necesitas al menos un mes de registros este año para calcularlo.</Text>
      ) : (() => {
        const d = calcDIANEstimate(p.input);
        return (
          <>
            <Text style={[s.status, { color: d.mustFileByIncome ? '#F44336' : '#00C853' }]}>
              {d.mustFileByIncome
                ? '⚠️ Con lo que llevas, te toca declarar renta'
                : '✓ Por ingresos, no te tocaría declarar'}
            </Text>
            <Text style={s.tax}>
              Impuesto estimado: <Text style={s.taxNum}>{formatCurrency(d.taxWithCosts)}</Text>
            </Text>

            {open && (
              <View style={s.detail}>
                <View style={s.row}>
                  <Text style={s.label}>Ingresos del año (proyectado)</Text>
                  <Text style={s.val}>{formatCurrency(d.income)}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Gastos del carro que se restan</Text>
                  <Text style={[s.val, { color: '#00C853' }]}>-{formatCurrency(d.costs)}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.labelBold}>Impuesto estimado</Text>
                  <Text style={[s.val, { color: '#F44336' }]}>{formatCurrency(d.taxWithCosts)}</Text>
                </View>
                {d.taxWithExempt !== null && (
                  <Text style={s.note}>
                    Si un contador acepta el 25 % exento por trabajo independiente, podría bajar a {formatCurrency(d.taxWithExempt)}.
                  </Text>
                )}

                <Text style={s.subTitle}>Te toca declarar si en {TAX_YEAR} pasa cualquiera de estas:</Text>
                <Text style={s.bullet}>• Ingresos de {formatCurrency(INCOME_TO_FILE_COP)} o más</Text>
                <Text style={s.bullet}>• Consignaciones en el banco o compras con tarjeta de más de {formatCurrency(INCOME_TO_FILE_COP)}</Text>
                <Text style={s.bullet}>• Todo lo que tienes (carros, casa, cuentas) vale más de {formatCurrency(PATRIMONY_TO_FILE_COP)}, aunque tengas deudas</Text>

                <Text style={s.note}>
                  Calculado con tus registros desde el {formatDate(p.fromDate)} ({p.days} días), llevado a un año completo.
                  Gastos que cuentan: gasolina o carga, Uber Pass, mecánico, lavado y peajes.
                </Text>
                <Text style={s.disclaimer}>{DIAN_DISCLAIMER}</Text>
              </View>
            )}
            {!open && <Text style={s.more}>Toca para ver el detalle</Text>}
          </>
        );
      })()}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  section:    { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title:      { color: '#888', fontSize: 12, letterSpacing: 1, fontWeight: '600' },
  chevron:    { color: '#888', fontSize: 12 },
  muted:      { color: '#666', fontSize: 13, lineHeight: 19 },
  status:     { fontSize: 14, fontWeight: '600' },
  tax:        { color: '#aaa', fontSize: 14, marginTop: 8 },
  taxNum:     { color: '#fff', fontWeight: '800' },
  more:       { color: '#555', fontSize: 11, marginTop: 8 },
  detail:     { backgroundColor: '#222', borderRadius: 12, padding: 12, marginTop: 12 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 8 },
  label:      { color: '#aaa', fontSize: 13, flex: 1 },
  labelBold:  { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },
  val:        { color: '#fff', fontSize: 13, fontWeight: '600' },
  subTitle:   { color: '#ddd', fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  bullet:     { color: '#aaa', fontSize: 12, lineHeight: 18, marginBottom: 2 },
  note:       { color: '#888', fontSize: 12, lineHeight: 17, marginTop: 10 },
  disclaimer: { color: '#666', fontSize: 11, marginTop: 10, fontStyle: 'italic', lineHeight: 16 },
});
