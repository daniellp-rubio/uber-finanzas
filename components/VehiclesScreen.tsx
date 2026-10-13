import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Modal, BackHandler, Pressable } from 'react-native';
import {
  getVehicles, getVehicle, getActiveVehicle, setActiveVehicle, deleteVehicle, updateOdometer,
  getMaintenance, getMaintenancePlans, getVehicleDocs, deleteMaintenance,
  addMaintenancePlan, updateMaintenancePlan, deleteMaintenancePlan, setVehicleDoc,
  getCurrentRental, getRentalPayments, getDebt,
  Vehicle, MaintenanceRecord, MaintenancePlan, VehicleDoc, Rental, RentalPayment, Debt,
} from '../src/db';
import {
  DOC_KINDS, MAINTENANCE_KINDS, energyIcon, vehicleAlerts, planStatus, docStatus,
  describeDays, describePlan, maintenanceLabel, maintenanceIcon, docLabel, VehicleAlert, Level,
} from '../src/fleet';
import { getVehicleAlerts, vehicleEnergyCostPerKm, realKwhPrice } from '../src/vehicleCalc';
import { formatCurrency, formatDate, formatKm, todayString } from '../src/format';
import { refreshVehicleReminders, requestNotificationPermission } from '../src/notifications';
import VehicleFormModal from './VehicleFormModal';
import MaintenanceModal from './MaintenanceModal';
import RentalSection from './RentalSection';
import VehicleEconomics from './VehicleEconomics';
import DateField from './DateField';
import SheetFrame, { ms } from './SheetFrame';
import { C, T, S, R } from '../src/theme';
import { Banner, Button, Chip, Collapsible, Icon, IconButton, Pill, Row, Section, Tone } from './ui';

const LEVEL_TONE: Record<Level, Tone> = { red: 'spend', yellow: 'warn', ok: 'money', unknown: 'neutral' };
const LEVEL_COLOR: Record<Level, string> = { red: C.spend, yellow: C.warn, ok: C.money, unknown: C.textMuted };

// El más urgente de una lista con nivel: primero rojo, después amarillo
function mostUrgent<X extends { level: Level }>(items: X[]): X | undefined {
  return items.find(i => i.level === 'red') ?? items.find(i => i.level === 'yellow');
}

// Tras cambiar fechas o mantenimientos se reprograman los avisos (si falla, la app sigue igual)
const syncReminders = () => { refreshVehicleReminders().catch(() => {}); };

// ─── Lista de carros ──────────────────────────────────────────────────────────

export default function VehiclesScreen({ openVehicleId, onOpened }: { openVehicleId?: number | null; onOpened?: () => void }) {
  const [cards, setCards]       = useState<{ v: Vehicle; alerts: VehicleAlert[]; rental: Rental | null }[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(openVehicleId ?? null);
  const [showAdd, setShowAdd]   = useState(false);

  const load = useCallback(() => {
    const today = todayString();
    setCards(getVehicles().map(v => ({ v, alerts: getVehicleAlerts(v, today), rental: getCurrentRental(v.id) })));
    setActiveId(getActiveVehicle()?.id ?? null);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Si se llegó desde un aviso de Hoy, ya se abrió ese carro: se limpia el pedido
  useEffect(() => { if (openVehicleId != null) onOpened?.(); }, [openVehicleId, onOpened]);

  const back = useCallback(() => { setSelected(null); load(); }, [load]);

  // Botón atrás de Android: del detalle vuelve a la lista
  useEffect(() => {
    if (selected === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  }, [selected, back]);

  if (selected !== null) return <VehicleDetail vehicleId={selected} onBack={back} />;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={T.headline} accessibilityRole="header">Carros</Text>
        <Text style={T.bodySm}>Mantenimientos, vencimientos y arriendo</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {cards.map(({ v, alerts, rental }) => {
          const reds    = alerts.filter(a => a.level === 'red').length;
          const yellows = alerts.length - reds;
          return (
            <Pressable
              key={v.id}
              style={({ pressed }) => [s.vCard, pressed && { opacity: 0.85 }]}
              onPress={() => setSelected(v.id)}
              accessibilityRole="button"
            >
              <Text style={s.vIcon}>{energyIcon(v.energy)}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.title}>{v.name}</Text>
                <Text style={T.labelSm}>
                  {[v.plate, v.odometer_km !== null ? `${formatKm(v.odometer_km)} km` : null].filter(Boolean).join(' · ') || 'Sin placa ni kilometraje'}
                </Text>
                {rental && (
                  <View style={s.inline}>
                    <Icon name="key-variant" size={16} color={C.textMuted} />
                    <Text style={T.labelSm}>Arrendado a {rental.driver_name}</Text>
                  </View>
                )}
                {v.id === activeId && (
                  <View style={s.inline}>
                    <Icon name="steering" size={16} color={C.primary} />
                    <Text style={[T.labelSm, { color: C.primary }]}>Lo manejas tú</Text>
                  </View>
                )}
                <View style={[s.inline, { marginTop: S.xs }]}>
                  {reds > 0 && <Pill text={`${reds} vencido${reds > 1 ? 's' : ''}`} tone="spend" />}
                  {yellows > 0 && <Pill text={`${yellows} por revisar`} tone="warn" />}
                  {!reds && !yellows && <Pill text="Al día" tone="money" />}
                </View>
              </View>
              <Icon name="chevron-right" size={24} color={C.textFaint} />
            </Pressable>
          );
        })}

        <Button label="Agregar carro" icon="plus" variant="tonal" tone="neutral" onPress={() => setShowAdd(true)} style={{ alignSelf: 'flex-start' }} />
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <VehicleFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); syncReminders(); }}
        />
      </Modal>
    </View>
  );
}

// ─── Detalle de un carro ──────────────────────────────────────────────────────

function VehicleDetail({ vehicleId, onBack }: { vehicleId: number; onBack: () => void }) {
  const [vehicle, setVehicle]     = useState<Vehicle | null>(null);
  const [isActive, setIsActive]   = useState(false);
  const [plans, setPlans]         = useState<MaintenancePlan[]>([]);
  const [records, setRecords]     = useState<MaintenanceRecord[]>([]);
  const [docs, setDocs]           = useState<VehicleDoc[]>([]);
  const [rental, setRental]       = useState<Rental | null>(null);
  const [payments, setPayments]   = useState<RentalPayment[]>([]);
  const [debt, setDebt]           = useState<Debt | null>(null);
  const [showEdit, setShowEdit]   = useState(false);
  const [maintKind, setMaintKind] = useState<string | null>(null);  // '' = sin tipo elegido
  const [docKind, setDocKind]     = useState<string | null>(null);
  const [planEdit, setPlanEdit]   = useState<MaintenancePlan | 'new' | null>(null);
  const [showOdo, setShowOdo]     = useState(false);

  const load = useCallback(() => {
    const v = getVehicle(vehicleId);
    const r = getCurrentRental(vehicleId);
    setVehicle(v);
    setIsActive(getActiveVehicle()?.id === vehicleId);
    setPlans(getMaintenancePlans(vehicleId));
    setRecords(getMaintenance(vehicleId));
    setDocs(getVehicleDocs(vehicleId));
    setRental(r);
    setPayments(r ? getRentalPayments(r.id) : []);
    setDebt(v?.debt_id != null ? getDebt(v.debt_id) : null);
  }, [vehicleId]);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); syncReminders(); };

  if (!vehicle) return <View style={s.container} />;

  const today     = todayString();
  // El estado del arriendo ya sale arriba, en su sección; aquí solo vencimientos y mantenimientos
  const alerts    = vehicleAlerts(vehicle, plans, records, docs, today)
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));

  const handleMakeActive = () => {
    setActiveVehicle(vehicle.id);
    load();
  };

  const handleDeleteVehicle = () => {
    if (isActive) {
      Alert.alert('No se puede quitar', 'Es el carro que manejas. Primero elige otro carro como el que manejas.');
      return;
    }
    if (rental) {
      Alert.alert('No se puede quitar', `Está arrendado a ${rental.driver_name}. Primero toca "Me devolvió el carro".`);
      return;
    }
    Alert.alert(`Quitar "${vehicle.name}"`, 'Se oculta el carro con sus mantenimientos. Los gastos que ya anotaste se quedan.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => { deleteVehicle(vehicle.id); syncReminders(); onBack(); } },
    ]);
  };

  const handleDeleteRecord = (r: MaintenanceRecord) =>
    Alert.alert('Borrar mantenimiento', r.transaction_id !== null
      ? `¿Borrar "${maintenanceLabel(r.kind)}"? También se borra el gasto de ${formatCurrency(r.cost)}.`
      : `¿Borrar "${maintenanceLabel(r.kind)}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { deleteMaintenance(r); changed(); } },
    ]);

  const costKm = vehicleEnergyCostPerKm(vehicle);
  const realKwh = vehicle.energy === 'electric' ? realKwhPrice(vehicle.id) : null;

  // Resúmenes de una línea para las secciones cerradas
  const docRows = DOC_KINDS.map(k => {
    const doc = docs.find(d => d.kind === k.id);
    return { k, doc, st: docStatus(doc, today) };
  });
  const docUrgent = mostUrgent(docRows.map(r => ({ ...r, level: r.st.level })));
  const docsSummary = docUrgent && docUrgent.st.daysLeft !== null
    ? `${docUrgent.k.label} ${describeDays(docUrgent.st.daysLeft)}`
    : docRows.every(r => !r.doc?.due_date) ? 'Sin fechas anotadas' : 'Todo al día';
  const planRows = plans.map(p => ({ p, st: planStatus(p, records, vehicle.odometer_km, today) }));
  const planUrgent = mostUrgent(planRows.map(r => ({ ...r, level: r.st.level })));
  const plansSummary = planUrgent
    ? `${maintenanceLabel(planUrgent.p.kind)}, ${describePlan(planUrgent.st)}`
    : plans.length === 0 ? 'Sin recordatorios' : 'Todo al día';

  return (
    <View style={s.container}>
      <View style={s.topBar}>
        <IconButton name="arrow-left" label="Volver a Carros" color={C.text} onPress={onBack} />
        <Text style={[T.title, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">{energyIcon(vehicle.energy)} {vehicle.name}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── Carro que maneja ── */}
        {isActive ? (
          <View style={s.activeBox}>
            <Icon name="steering" size={20} color={C.primary} />
            <Text style={[T.label, { color: C.primary, flex: 1 }]}>Lo manejas tú: "Me queda" y el pico y placa usan este carro</Text>
          </View>
        ) : rental ? null : (
          <Section>
            <Row
              icon="steering"
              tone="primary"
              title="Ahora manejo este carro"
              subtitle={'"Me queda" y el pico y placa usarán sus datos'}
              onPress={handleMakeActive}
              last
            />
          </Section>
        )}

        {/* ── Avisos ── */}
        {alerts.map((a, i) => (
          <Banner
            key={i}
            tone={a.level === 'red' ? 'spend' : 'warn'}
            icon={a.level === 'red' ? 'alert-circle' : 'alert'}
            text={a.text.replace(`${vehicle.name}: `, '')}
          />
        ))}

        {/* ── Arriendo y cuánto deja ── */}
        <RentalSection vehicle={vehicle} rental={rental} payments={payments} isActive={isActive} onChanged={changed} />
        <VehicleEconomics vehicle={vehicle} docs={docs} debt={debt} rental={rental} isActive={isActive} onChanged={changed} />

        {/* ── Kilometraje ── */}
        <Section>
          <View style={s.odoRow}>
            <View style={{ flex: 1 }}>
              <Text style={T.titleSm}>Kilometraje</Text>
              <Text style={T.headline}>{vehicle.odometer_km !== null ? `${formatKm(vehicle.odometer_km)} km` : 'Sin dato'}</Text>
              {vehicle.odometer_date && <Text style={T.labelSm}>Anotado el {formatDate(vehicle.odometer_date)}</Text>}
            </View>
            <Button label="Actualizar" variant="tonal" tone="primary" onPress={() => setShowOdo(true)} />
          </View>
        </Section>

        {/* ── Documentos ── */}
        <Collapsible
          title="Vencimientos"
          summary={docsSummary}
          summaryTone={docUrgent ? LEVEL_TONE[docUrgent.level] : undefined}
          initiallyOpen={docUrgent?.level === 'red'}
        >
          {docRows.map(({ k, doc, st }, i) => (
            <Pressable
              key={k.id}
              style={({ pressed }) => [s.row, i < docRows.length - 1 && s.divider, pressed && { opacity: 0.85 }]}
              onPress={() => setDocKind(k.id)}
              accessibilityRole="button"
            >
              <Text style={s.glyph}>{k.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>{k.label}</Text>
                <Text style={[T.labelSm, { color: LEVEL_COLOR[st.level] }]}>
                  {doc?.due_date && st.daysLeft !== null
                    ? `${formatDate(doc.due_date)} · ${describeDays(st.daysLeft)}`
                    : 'Sin fecha: toca para agregarla'}
                </Text>
              </View>
              <Icon name="chevron-right" size={22} color={C.textFaint} />
            </Pressable>
          ))}
        </Collapsible>

        {/* ── Mantenimiento: cuándo toca ── */}
        <Collapsible
          title="Mantenimientos"
          summary={plansSummary}
          summaryTone={planUrgent ? LEVEL_TONE[planUrgent.level] : undefined}
          initiallyOpen={planUrgent?.level === 'red'}
        >
          {plans.length === 0 && <Text style={[T.bodySm, { paddingVertical: S.sm }]}>Sin recordatorios.</Text>}
          {planRows.map(({ p, st }, i) => (
            <View key={p.id} style={[s.row, i < planRows.length - 1 && s.divider]}>
              <Pressable
                style={({ pressed }) => [s.planMain, pressed && { opacity: 0.85 }]}
                onPress={() => setMaintKind(p.kind)}
                accessibilityRole="button"
                accessibilityHint="Registrar que ya se hizo"
              >
                <Text style={s.glyph}>{maintenanceIcon(p.kind)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={T.body}>{maintenanceLabel(p.kind)}</Text>
                  <Text style={[T.labelSm, { color: LEVEL_COLOR[st.level] }]}>{describePlan(st)}</Text>
                  <Text style={[T.labelSm, { color: C.textFaint }]}>
                    Cada {[p.every_km ? `${formatKm(p.every_km)} km` : null, p.every_months ? `${p.every_months} meses` : null].filter(Boolean).join(' o ')}
                  </Text>
                </View>
              </Pressable>
              <IconButton name="pencil-outline" label={`Cambiar cada cuánto toca ${maintenanceLabel(p.kind)}`} onPress={() => setPlanEdit(p)} />
            </View>
          ))}
          <View style={s.btnRow}>
            <Button label="Registrar mantenimiento" icon="wrench" tone="warn" style={{ flex: 1 }} onPress={() => setMaintKind('')} />
          </View>
          <Button label="Otro recordatorio (llantas, frenos…)" icon="plus" variant="text" onPress={() => setPlanEdit('new')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
          <Text style={[T.labelSm, { color: C.textFaint }]}>Toca uno para anotar que ya se hizo; el lápiz cambia cada cuánto toca.</Text>
        </Collapsible>

        {/* ── Historial ── */}
        <Collapsible title="Historial de mantenimientos" summary={records.length === 0 ? 'Sin mantenimientos anotados' : `${records.length} anotado${records.length === 1 ? '' : 's'}`}>
          {records.length === 0 ? (
            <Text style={[T.bodySm, { paddingVertical: S.sm }]}>Sin mantenimientos anotados.</Text>
          ) : records.map((r, i) => (
            <View key={r.id} style={[s.row, i < records.length - 1 && s.divider]}>
              <Text style={s.glyph}>{maintenanceIcon(r.kind)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>{maintenanceLabel(r.kind)}</Text>
                <Text style={T.labelSm}>
                  {[formatDate(r.date), r.km !== null ? `${formatKm(r.km)} km` : null, r.shop].filter(Boolean).join(' · ')}
                </Text>
                {r.note ? <Text style={[T.labelSm, { color: C.textFaint }]}>{r.note}</Text> : null}
              </View>
              {r.cost > 0 && <Text style={[T.amount, { color: C.spend }]}>−{formatCurrency(r.cost)}</Text>}
              <IconButton name="trash-can-outline" label={`Borrar ${maintenanceLabel(r.kind)}`} onPress={() => handleDeleteRecord(r)} />
            </View>
          ))}
        </Collapsible>

        {/* ── Datos del carro ── */}
        <Collapsible title="Datos del carro" summary={[vehicle.plate, `${formatCurrency(costKm)} por km de ${vehicle.energy === 'electric' ? 'carga' : 'gasolina'}`].filter(Boolean).join(' · ')}>
          {vehicle.plate && <DataLine label="Placa" value={vehicle.plate} />}
          <DataLine
            label={vehicle.energy === 'electric' ? 'Consumo' : 'Rendimiento'}
            value={vehicle.energy === 'electric'
              ? `${String(vehicle.kwh_per_100km).replace('.', ',')} kWh cada 100 km · ${formatCurrency(vehicle.kwh_price)} el kWh`
              : `${String(vehicle.km_per_gallon).replace('.', ',')} km por galón · ${formatCurrency(vehicle.gas_price)} el galón`}
          />
          {realKwh && (
            <DataLine
              label="Lo que de verdad pagas"
              value={`${formatCurrency(realKwh.price)} el kWh (${realKwh.charges} ${realKwh.charges === 1 ? 'carga' : 'cargas'} en 90 días)`}
              color={C.money}
            />
          )}
          <DataLine label={vehicle.energy === 'electric' ? 'Carga por km' : 'Gasolina por km'} value={formatCurrency(costKm)} />
          {vehicle.energy === 'electric' && !realKwh && (
            <Text style={[T.labelSm, { color: C.textFaint, marginVertical: S.xs }]}>Anota tus cargas como gasto ⚡ Carga con los kWh y la app usa lo que de verdad pagas.</Text>
          )}
          <DataLine
            label="Pico y placa"
            value={vehicle.pico_placa_days === 0 ? 'No tiene' : `${vehicle.pico_placa_days} día${vehicle.pico_placa_days === 1 ? '' : 's'} por semana`}
          />
          <DataLine label="Mantenimiento" value={`${formatCurrency(vehicle.maint_cost_per_km)} por km`} />
          <Button label="Editar datos" icon="pencil-outline" variant="outlined" tone="neutral" onPress={() => setShowEdit(true)} style={{ marginTop: S.md, alignSelf: 'flex-start' }} />
        </Collapsible>

        <Button label="Quitar este carro" icon="trash-can-outline" variant="text" tone="spend" onPress={handleDeleteVehicle} style={{ marginTop: S.sm }} />
      </ScrollView>

      {/* ── Modales ── */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
        <VehicleFormModal
          vehicle={vehicle}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); changed(); }}
        />
      </Modal>

      <Modal visible={maintKind !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMaintKind(null)}>
        {maintKind !== null && (
          <MaintenanceModal
            vehicle={vehicle}
            initialKind={maintKind}
            onClose={() => setMaintKind(null)}
            onSaved={() => { setMaintKind(null); changed(); }}
          />
        )}
      </Modal>

      <Modal visible={docKind !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDocKind(null)}>
        {docKind !== null && (
          <DocModal
            vehicle={vehicle}
            kind={docKind}
            doc={docs.find(d => d.kind === docKind)}
            onClose={() => setDocKind(null)}
            onSaved={() => { setDocKind(null); changed(); }}
          />
        )}
      </Modal>

      <Modal visible={planEdit !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPlanEdit(null)}>
        {planEdit !== null && (
          <PlanModal
            vehicle={vehicle}
            plan={planEdit === 'new' ? null : planEdit}
            taken={plans.map(p => p.kind)}
            onClose={() => setPlanEdit(null)}
            onSaved={() => { setPlanEdit(null); changed(); }}
          />
        )}
      </Modal>

      <Modal visible={showOdo} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowOdo(false)}>
        {showOdo && (
          <OdometerModal
            vehicle={vehicle}
            onClose={() => setShowOdo(false)}
            onSaved={() => { setShowOdo(false); changed(); }}
          />
        )}
      </Modal>
    </View>
  );
}

// ─── Modal: vencimiento (SOAT, técnico-mecánica, impuesto, seguro) ───────────

function DocModal({ vehicle, kind, doc, onClose, onSaved }: {
  vehicle: Vehicle; kind: string; doc: VehicleDoc | undefined; onClose: () => void; onSaved: () => void;
}) {
  const [date, setDate]       = useState<string | null>(doc?.due_date ?? null);
  const [rawCost, setRawCost] = useState(doc?.cost ? String(doc.cost) : '');

  const handleSave = async () => {
    if (!date) {
      Alert.alert('Revisa la fecha', 'Escribe la fecha de vencimiento completa: día/mes/año.');
      return;
    }
    setVehicleDoc(vehicle.id, kind, date, Number(rawCost) > 0 ? Number(rawCost) : null);
    await requestNotificationPermission().catch(() => false);  // para poder avisar antes de que venza
    onSaved();
  };

  const handleClear = () =>
    Alert.alert('Quitar fecha', `¿Quitar la fecha de ${docLabel(kind)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => { setVehicleDoc(vehicle.id, kind, null, null); onSaved(); } },
    ]);

  return (
    <SheetFrame title={docLabel(kind)} onClose={onClose} onSave={handleSave}>
      <Text style={ms.mVehicle}>{vehicle.name}</Text>
      <Text style={ms.mLabel}>¿Cuándo vence?</Text>
      <DateField value={date} onChange={setDate} />
      <Text style={ms.mHint}>Te avisamos 15 días antes y el día anterior, a las 9 de la mañana.</Text>

      <Text style={ms.mLabel}>¿Cuánto cuesta? (opcional)</Text>
      <TextInput
        style={ms.mInput}
        value={rawCost ? Number(rawCost).toLocaleString('es-CO') : ''}
        onChangeText={t => setRawCost(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="$ 0"
        placeholderTextColor={C.textFaint}
      />
      <Text style={ms.mHint}>Sirve para calcular cuánto te cuesta o te deja el carro cada mes.</Text>

      {doc?.due_date && (
        <Button label="Quitar fecha" icon="calendar-remove-outline" variant="text" tone="spend" onPress={handleClear} />
      )}
    </SheetFrame>
  );
}

// ─── Modal: cada cuánto toca un mantenimiento ─────────────────────────────────

function PlanModal({ vehicle, plan, taken, onClose, onSaved }: {
  vehicle: Vehicle; plan: MaintenancePlan | null; taken: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [kind, setKind]     = useState(plan?.kind ?? '');
  const [km, setKm]         = useState(plan?.every_km ? String(plan.every_km) : '');
  const [months, setMonths] = useState(plan?.every_months ? String(plan.every_months) : '');

  const handleSave = () => {
    if (!kind) {
      Alert.alert('Falta el tipo', 'Toca qué mantenimiento quieres que te recordemos.');
      return;
    }
    const everyKm = Number(km) > 0 ? Number(km) : null;
    const everyMonths = Number(months) > 0 ? Number(months) : null;
    if (!everyKm && !everyMonths) {
      Alert.alert('Falta cada cuánto', 'Escribe los km, los meses o ambos.');
      return;
    }
    if (plan) updateMaintenancePlan(plan.id, everyKm, everyMonths);
    else addMaintenancePlan(vehicle.id, kind, everyKm, everyMonths);
    onSaved();
  };

  const handleDelete = () => {
    if (!plan) return;
    Alert.alert('Quitar recordatorio', `¿Dejar de recordar "${maintenanceLabel(plan.kind)}"? El historial se queda.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => { deleteMaintenancePlan(plan.id); onSaved(); } },
    ]);
  };

  const options = MAINTENANCE_KINDS.filter(k => !taken.includes(k.id));

  return (
    <SheetFrame title="Recordatorio" onClose={onClose} onSave={handleSave}>
      <Text style={ms.mVehicle}>{vehicle.name}</Text>
      {plan ? (
        <Text style={ms.mKind}>{maintenanceIcon(plan.kind)} {maintenanceLabel(plan.kind)}</Text>
      ) : (
        <>
          <Text style={ms.mLabel}>¿Qué mantenimiento?</Text>
          <View style={ms.mGrid}>
            {options.map(k => (
              <Chip key={k.id} label={`${k.icon} ${k.label}`} selected={kind === k.id} onPress={() => setKind(k.id)} />
            ))}
          </View>
        </>
      )}

      <Text style={ms.mLabel}>Cada cuánto (lo que pase primero)</Text>
      <View style={ms.mRow}>
        <Text style={ms.mRowLabel}>Cada</Text>
        <TextInput style={ms.mSmallInput} value={km} onChangeText={t => setKm(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="10000" placeholderTextColor={C.textFaint} />
        <Text style={ms.mRowLabel}>km</Text>
      </View>
      <View style={ms.mRow}>
        <Text style={ms.mRowLabel}>o cada</Text>
        <TextInput style={ms.mSmallInput} value={months} onChangeText={t => setMonths(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="12" placeholderTextColor={C.textFaint} />
        <Text style={ms.mRowLabel}>meses</Text>
      </View>
      <Text style={ms.mHint}>Usa lo que dice el manual del carro o el taller. Si el carro trabaja en plataformas, respeta el plan del concesionario para no perder la garantía.</Text>

      {plan && (
        <Button label="Quitar recordatorio" icon="bell-off-outline" variant="text" tone="spend" onPress={handleDelete} />
      )}
    </SheetFrame>
  );
}

// ─── Modal: actualizar kilometraje ────────────────────────────────────────────

function OdometerModal({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [km, setKm] = useState('');

  const handleSave = () => {
    const n = Number(km);
    if (!km || n <= 0) {
      Alert.alert('Revisa el número', 'Escribe los km que marca el tablero.');
      return;
    }
    const save = () => { updateOdometer(vehicle.id, n, todayString()); onSaved(); };
    if (vehicle.odometer_km !== null && n < vehicle.odometer_km) {
      Alert.alert('¿Seguro?', `Es menos de lo que tenías anotado (${formatKm(vehicle.odometer_km)} km).`, [
        { text: 'Corregir', style: 'cancel' },
        { text: 'Sí, guardar', onPress: save },
      ]);
      return;
    }
    save();
  };

  return (
    <SheetFrame title="Kilometraje" onClose={onClose} onSave={handleSave}>
      <Text style={ms.mVehicle}>{vehicle.name}</Text>
      <Text style={ms.mLabel}>¿Cuánto marca el tablero hoy?</Text>
      <TextInput
        style={ms.mBigInput}
        value={km ? Number(km).toLocaleString('es-CO') : ''}
        onChangeText={t => setKm(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder={vehicle.odometer_km !== null ? formatKm(vehicle.odometer_km) : '0'}
        placeholderTextColor={C.textFaint}
        autoFocus
      />
      <Text style={ms.mHint}>Con el kilometraje al día te avisamos cuándo toca cada mantenimiento.</Text>
    </SheetFrame>
  );
}

// Dato del carro: etiqueta a la izquierda, valor a la derecha
function DataLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.dataLine}>
      <Text style={[T.bodySm, { width: 120 }]}>{label}</Text>
      <Text style={[T.body, { flex: 1, textAlign: 'right' }, color && { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.sm },
  topBar:    { flexDirection: 'row', alignItems: 'center', gap: S.xs, paddingHorizontal: S.xs, minHeight: 64 },
  scroll:    { paddingHorizontal: S.lg, paddingBottom: S.xl },
  inline:    { flexDirection: 'row', alignItems: 'center', gap: S.xs, flexWrap: 'wrap' },

  // Lista
  vCard:     { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md },
  vIcon:     { fontSize: 30 },

  // Detalle
  activeBox: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.primaryContainer, borderRadius: R.md, padding: S.md, marginBottom: S.md },
  odoRow:    { flexDirection: 'row', alignItems: 'center', gap: S.md },
  row:       { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, paddingVertical: S.xs },
  divider:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
  glyph:     { fontSize: 22, width: 28, textAlign: 'center' },
  planMain:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56 },
  btnRow:    { flexDirection: 'row', marginTop: S.md },
  dataLine:  { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outline },
});
