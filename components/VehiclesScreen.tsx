import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Modal, BackHandler, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getVehicles, getVehicle, getActiveVehicle, setActiveVehicle, deleteVehicle, updateOdometer,
  getMaintenance, getMaintenancePlans, getVehicleDocs, deleteMaintenance,
  addMaintenancePlan, updateMaintenancePlan, deleteMaintenancePlan, setVehicleDoc,
  Vehicle, MaintenanceRecord, MaintenancePlan, VehicleDoc,
} from '../src/db';
import {
  DOC_KINDS, MAINTENANCE_KINDS, energyIcon, energyCostPerKm, vehicleAlerts, planStatus, docStatus,
  describeDays, describePlan, maintenanceLabel, maintenanceIcon, docLabel, VehicleAlert, Level,
} from '../src/fleet';
import { formatCurrency, formatDate, formatKm, todayString } from '../src/format';
import { refreshVehicleReminders, requestNotificationPermission } from '../src/notifications';
import VehicleFormModal from './VehicleFormModal';
import MaintenanceModal from './MaintenanceModal';
import DateField from './DateField';

const LEVEL_COLOR: Record<Level, string> = {
  red: '#F44336', yellow: '#FFC107', ok: '#00C853', unknown: '#666',
};

// Tras cambiar fechas o mantenimientos se reprograman los avisos (si falla, la app sigue igual)
const syncReminders = () => { refreshVehicleReminders().catch(() => {}); };

// ─── Lista de carros ──────────────────────────────────────────────────────────

export default function VehiclesScreen() {
  const [cards, setCards]       = useState<{ v: Vehicle; alerts: VehicleAlert[] }[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAdd, setShowAdd]   = useState(false);

  const load = useCallback(() => {
    const today = todayString();
    setCards(getVehicles().map(v => ({
      v,
      alerts: vehicleAlerts(v, getMaintenancePlans(v.id), getMaintenance(v.id), getVehicleDocs(v.id), today),
    })));
    setActiveId(getActiveVehicle()?.id ?? null);
  }, []);

  useEffect(() => { load(); }, [load]);

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
        <Text style={s.title}>Mis carros</Text>
        <Text style={s.subtitle}>Mantenimientos, SOAT y vencimientos</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {cards.map(({ v, alerts }) => {
          const reds    = alerts.filter(a => a.level === 'red').length;
          const yellows = alerts.length - reds;
          return (
            <TouchableOpacity key={v.id} style={s.vCard} onPress={() => setSelected(v.id)} activeOpacity={0.8}>
              <Text style={s.vIcon}>{energyIcon(v.energy)}</Text>
              <View style={s.vInfo}>
                <Text style={s.vName}>{v.name}</Text>
                <Text style={s.vSub}>
                  {[v.plate, v.odometer_km !== null ? `${formatKm(v.odometer_km)} km` : null].filter(Boolean).join(' · ') || 'Sin placa ni kilometraje'}
                </Text>
                <Text style={[s.vStatus, { color: reds ? '#F44336' : yellows ? '#FFC107' : '#00C853' }]}>
                  {reds ? `🔴 ${reds} vencido${reds > 1 ? 's' : ''}` : ''}
                  {reds && yellows ? '  ·  ' : ''}
                  {yellows ? `🟡 ${yellows} por revisar` : ''}
                  {!reds && !yellows ? '✓ Todo al día' : ''}
                </Text>
              </View>
              {v.id === activeId && (
                <View style={s.badge}><Text style={s.badgeTxt}>Lo manejas tú</Text></View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={s.addBtnTxt}>+ Agregar carro</Text>
        </TouchableOpacity>
        <Text style={s.hint}>Toca un carro para ver sus mantenimientos y vencimientos</Text>
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
  const [showEdit, setShowEdit]   = useState(false);
  const [maintKind, setMaintKind] = useState<string | null>(null);  // '' = sin tipo elegido
  const [docKind, setDocKind]     = useState<string | null>(null);
  const [planEdit, setPlanEdit]   = useState<MaintenancePlan | 'new' | null>(null);
  const [showOdo, setShowOdo]     = useState(false);

  const load = useCallback(() => {
    setVehicle(getVehicle(vehicleId));
    setIsActive(getActiveVehicle()?.id === vehicleId);
    setPlans(getMaintenancePlans(vehicleId));
    setRecords(getMaintenance(vehicleId));
    setDocs(getVehicleDocs(vehicleId));
  }, [vehicleId]);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); syncReminders(); };

  if (!vehicle) return <View style={s.container} />;

  const today  = todayString();
  const alerts = vehicleAlerts(vehicle, plans, records, docs, today);

  const handleMakeActive = () => {
    setActiveVehicle(vehicle.id);
    load();
  };

  const handleDeleteVehicle = () => {
    if (isActive) {
      Alert.alert('No se puede quitar', 'Es el carro que manejas. Primero elige otro carro como el que manejas.');
      return;
    }
    Alert.alert(`Quitar "${vehicle.name}"`, 'Se oculta el carro con sus mantenimientos. Los gastos que ya anotaste se quedan.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => { deleteVehicle(vehicle.id); syncReminders(); onBack(); } },
    ]);
  };

  const handleDeleteRecord = (r: MaintenanceRecord) =>
    Alert.alert('Eliminar mantenimiento', r.transaction_id !== null
      ? `¿Eliminar "${maintenanceLabel(r.kind)}"? También se borra el gasto de ${formatCurrency(r.cost)}.`
      : `¿Eliminar "${maintenanceLabel(r.kind)}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteMaintenance(r); changed(); } },
    ]);

  const costKm = energyCostPerKm(vehicle);

  return (
    <View style={s.container}>
      <View style={s.detailHeader}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Text style={s.backTxt}>‹ Carros</Text>
        </TouchableOpacity>
        <Text style={s.detailTitle} numberOfLines={1}>{energyIcon(vehicle.energy)} {vehicle.name}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── Carro que maneja ── */}
        {isActive ? (
          <View style={s.activeBox}>
            <Text style={s.activeTxt}>✓ Lo manejas tú: la ganancia real usa este carro</Text>
          </View>
        ) : (
          <TouchableOpacity style={s.makeActiveBtn} onPress={handleMakeActive}>
            <Text style={s.makeActiveTxt}>🚗 Ahora manejo este carro</Text>
            <Text style={s.makeActiveSub}>La ganancia real y el pico y placa usarán sus datos</Text>
          </TouchableOpacity>
        )}

        {/* ── Avisos ── */}
        {alerts.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>AVISOS</Text>
            {alerts.map((a, i) => (
              <Text key={i} style={[s.alertTxt, { color: LEVEL_COLOR[a.level] }]}>
                {a.icon} {a.text.replace(`${vehicle.name}: `, '')}
              </Text>
            ))}
          </View>
        )}

        {/* ── Kilometraje ── */}
        <TouchableOpacity style={s.odoCard} onPress={() => setShowOdo(true)} activeOpacity={0.8}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>KILOMETRAJE</Text>
            <Text style={s.odoKm}>{vehicle.odometer_km !== null ? `${formatKm(vehicle.odometer_km)} km` : 'Sin dato'}</Text>
            {vehicle.odometer_date && <Text style={s.odoDate}>Anotado el {formatDate(vehicle.odometer_date)}</Text>}
          </View>
          <View style={s.odoBtn}><Text style={s.odoBtnTxt}>Actualizar</Text></View>
        </TouchableOpacity>

        {/* ── Documentos ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>VENCIMIENTOS</Text>
          {DOC_KINDS.map(k => {
            const doc = docs.find(d => d.kind === k.id);
            const st  = docStatus(doc, today);
            return (
              <TouchableOpacity key={k.id} style={s.row} onPress={() => setDocKind(k.id)} activeOpacity={0.7}>
                <Text style={s.rowIcon}>{k.icon}</Text>
                <View style={s.rowInfo}>
                  <Text style={s.rowTitle}>{k.label}</Text>
                  <Text style={[s.rowSub, { color: LEVEL_COLOR[st.level] }]}>
                    {doc?.due_date && st.daysLeft !== null
                      ? `${formatDate(doc.due_date)} · ${describeDays(st.daysLeft)}`
                      : 'Sin fecha: toca para agregarla'}
                  </Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Mantenimiento: cuándo toca ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PRÓXIMOS MANTENIMIENTOS</Text>
          {plans.length === 0 && <Text style={s.emptyRow}>Sin recordatorios</Text>}
          {plans.map(p => {
            const st = planStatus(p, records, vehicle.odometer_km, today);
            return (
              <View key={p.id} style={s.row}>
                <TouchableOpacity style={s.planMain} onPress={() => setMaintKind(p.kind)} activeOpacity={0.7}>
                  <Text style={s.rowIcon}>{maintenanceIcon(p.kind)}</Text>
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>{maintenanceLabel(p.kind)}</Text>
                    <Text style={[s.rowSub, { color: LEVEL_COLOR[st.level] }]}>{describePlan(st)}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={s.everyBtn} onPress={() => setPlanEdit(p)}>
                  <Text style={s.everyTxt}>
                    {[p.every_km ? `${formatKm(p.every_km)} km` : null, p.every_months ? `${p.every_months} m` : null]
                      .filter(Boolean).join(' / ')} ✎
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity onPress={() => setPlanEdit('new')}>
            <Text style={s.linkTxt}>+ Otro recordatorio (llantas, frenos…)</Text>
          </TouchableOpacity>
          <Text style={s.hint}>Toca uno para registrar que ya se hizo · ✎ para cambiar cada cuánto</Text>
        </View>

        <TouchableOpacity style={s.maintBtn} onPress={() => setMaintKind('')}>
          <Text style={s.maintBtnTxt}>🔧 Registrar mantenimiento</Text>
        </TouchableOpacity>

        {/* ── Historial ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>HISTORIAL</Text>
          {records.length === 0 ? (
            <Text style={s.emptyRow}>Sin mantenimientos registrados</Text>
          ) : (
            <>
              {records.map(r => (
                <TouchableOpacity key={r.id} style={s.row} onLongPress={() => handleDeleteRecord(r)} activeOpacity={0.7}>
                  <Text style={s.rowIcon}>{maintenanceIcon(r.kind)}</Text>
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>{maintenanceLabel(r.kind)}</Text>
                    <Text style={s.rowSub}>
                      {[formatDate(r.date), r.km !== null ? `${formatKm(r.km)} km` : null, r.shop].filter(Boolean).join(' · ')}
                    </Text>
                    {r.note ? <Text style={s.rowNote}>{r.note}</Text> : null}
                  </View>
                  {r.cost > 0 && <Text style={s.rowCost}>{formatCurrency(r.cost)}</Text>}
                </TouchableOpacity>
              ))}
              <Text style={s.hint}>Mantén presionado para eliminar</Text>
            </>
          )}
        </View>

        {/* ── Datos del carro ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>DATOS DEL CARRO</Text>
          {vehicle.plate && <Text style={s.dataTxt}>Placa: {vehicle.plate}</Text>}
          <Text style={s.dataTxt}>
            {vehicle.energy === 'electric'
              ? `⚡ ${String(vehicle.kwh_per_100km).replace('.', ',')} kWh cada 100 km · ${formatCurrency(vehicle.kwh_price)} el kWh`
              : `⛽ ${String(vehicle.km_per_gallon).replace('.', ',')} km por galón · ${formatCurrency(vehicle.gas_price)} el galón`}
          </Text>
          <Text style={s.dataTxt}>{vehicle.energy === 'electric' ? 'Carga' : 'Gasolina'} por km: {formatCurrency(costKm)}</Text>
          <Text style={s.dataTxt}>
            Pico y placa: {vehicle.pico_placa_days === 0 ? 'no tiene' : `${vehicle.pico_placa_days} día${vehicle.pico_placa_days === 1 ? '' : 's'} por semana`}
          </Text>
          <Text style={s.dataTxt}>Mantenimiento: {formatCurrency(vehicle.maint_cost_per_km)} por km</Text>
          <TouchableOpacity style={s.editBtn} onPress={() => setShowEdit(true)}>
            <Text style={s.editBtnTxt}>Editar datos</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleDeleteVehicle}>
          <Text style={s.deleteTxt}>Quitar este carro</Text>
        </TouchableOpacity>
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
      <Text style={s.mVehicle}>{vehicle.name}</Text>
      <Text style={s.mLabel}>¿CUÁNDO VENCE?</Text>
      <DateField value={date} onChange={setDate} />
      <Text style={s.mHint}>Te avisamos 15 días antes y el día anterior, a las 9 de la mañana.</Text>

      <Text style={s.mLabel}>¿CUÁNTO CUESTA? (opcional)</Text>
      <TextInput
        style={s.mInput}
        value={rawCost ? Number(rawCost).toLocaleString('es-CO') : ''}
        onChangeText={t => setRawCost(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="$ 0"
        placeholderTextColor="#444"
      />
      <Text style={s.mHint}>Sirve para calcular cuánto cuesta tener el carro al año.</Text>

      {doc?.due_date && (
        <TouchableOpacity onPress={handleClear}>
          <Text style={s.deleteTxt}>Quitar fecha</Text>
        </TouchableOpacity>
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
      <Text style={s.mVehicle}>{vehicle.name}</Text>
      {plan ? (
        <Text style={s.mKind}>{maintenanceIcon(plan.kind)} {maintenanceLabel(plan.kind)}</Text>
      ) : (
        <>
          <Text style={s.mLabel}>¿QUÉ MANTENIMIENTO?</Text>
          <View style={s.mGrid}>
            {options.map(k => (
              <TouchableOpacity key={k.id} style={[s.mChip, kind === k.id && s.mChipOn]} onPress={() => setKind(k.id)}>
                <Text style={[s.mChipTxt, kind === k.id && s.mChipTxtOn]}>{k.icon} {k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={s.mLabel}>CADA CUÁNTO (lo que pase primero)</Text>
      <View style={s.mRow}>
        <Text style={s.mRowLabel}>Cada</Text>
        <TextInput style={s.mSmallInput} value={km} onChangeText={t => setKm(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="10000" placeholderTextColor="#444" />
        <Text style={s.mRowLabel}>km</Text>
      </View>
      <View style={s.mRow}>
        <Text style={s.mRowLabel}>o cada</Text>
        <TextInput style={s.mSmallInput} value={months} onChangeText={t => setMonths(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="12" placeholderTextColor="#444" />
        <Text style={s.mRowLabel}>meses</Text>
      </View>
      <Text style={s.mHint}>Usa lo que dice el manual del carro o el taller. Si el carro trabaja en plataformas, respeta el plan del concesionario para no perder la garantía.</Text>

      {plan && (
        <TouchableOpacity onPress={handleDelete}>
          <Text style={s.deleteTxt}>Quitar recordatorio</Text>
        </TouchableOpacity>
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
      <Text style={s.mVehicle}>{vehicle.name}</Text>
      <Text style={s.mLabel}>¿CUÁNTO MARCA EL TABLERO HOY?</Text>
      <TextInput
        style={s.mBigInput}
        value={km ? Number(km).toLocaleString('es-CO') : ''}
        onChangeText={t => setKm(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder={vehicle.odometer_km !== null ? formatKm(vehicle.odometer_km) : '0'}
        placeholderTextColor="#444"
        autoFocus
      />
      <Text style={s.mHint}>Con el kilometraje al día te avisamos cuándo toca cada mantenimiento.</Text>
    </SheetFrame>
  );
}

// ─── Marco común de los modales pequeños ──────────────────────────────────────

function SheetFrame({ title, onClose, onSave, children }: {
  title: string; onClose: () => void; onSave: () => void; children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeTxt}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>{title}</Text>
          <View style={{ width: 80 }} />
        </View>
        <ScrollView contentContainerStyle={s.mScroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={s.saveWrap}>
          <TouchableOpacity style={s.saveBtn} onPress={onSave}>
            <Text style={s.saveTxt}>GUARDAR</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#121212' },
  header:        { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title:         { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle:      { color: '#666', fontSize: 14, marginTop: 2 },
  scroll:        { padding: 16, paddingBottom: 40 },

  // Lista
  vCard:         { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 12 },
  vIcon:         { fontSize: 30 },
  vInfo:         { flex: 1 },
  vName:         { color: '#fff', fontSize: 18, fontWeight: '700' },
  vSub:          { color: '#888', fontSize: 13, marginTop: 2 },
  vStatus:       { fontSize: 13, fontWeight: '600', marginTop: 6 },
  badge:         { backgroundColor: '#0a3020', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: '#00C853' },
  badgeTxt:      { color: '#00C853', fontSize: 11, fontWeight: '700' },
  addBtn:        { marginTop: 4, borderRadius: 14, borderWidth: 1.5, borderColor: '#00C853', borderStyle: 'dashed', paddingVertical: 14, alignItems: 'center' },
  addBtnTxt:     { color: '#aaa', fontSize: 15, fontWeight: '600' },
  hint:          { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 8 },

  // Detalle
  detailHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  backBtn:       { paddingVertical: 6, paddingRight: 6 },
  backTxt:       { color: '#00C853', fontSize: 16, fontWeight: '700' },
  detailTitle:   { color: '#fff', fontSize: 22, fontWeight: '800', flex: 1 },
  activeBox:     { backgroundColor: '#0a2e1a', borderRadius: 14, padding: 12, marginBottom: 14 },
  activeTxt:     { color: '#00C853', fontSize: 13, fontWeight: '600' },
  makeActiveBtn: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: '#00C853' },
  makeActiveTxt: { color: '#00C853', fontSize: 15, fontWeight: '700' },
  makeActiveSub: { color: '#666', fontSize: 12, marginTop: 2 },
  section:       { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionTitle:  { color: '#888', fontSize: 12, letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  alertTxt:      { fontSize: 14, fontWeight: '600', paddingVertical: 4, lineHeight: 20 },
  odoCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 14 },
  odoKm:         { color: '#fff', fontSize: 26, fontWeight: '800' },
  odoDate:       { color: '#666', fontSize: 12, marginTop: 2 },
  odoBtn:        { backgroundColor: '#262626', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  odoBtnTxt:     { color: '#00C853', fontSize: 14, fontWeight: '700' },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomColor: '#262626', borderBottomWidth: 1 },
  rowIcon:       { fontSize: 22 },
  rowInfo:       { flex: 1 },
  rowTitle:      { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowSub:        { color: '#888', fontSize: 12, marginTop: 2 },
  rowNote:       { color: '#666', fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  rowCost:       { color: '#F44336', fontSize: 14, fontWeight: '700' },
  chevron:       { color: '#555', fontSize: 22 },
  planMain:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  everyBtn:      { backgroundColor: '#262626', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  everyTxt:      { color: '#aaa', fontSize: 11, fontWeight: '600' },
  linkTxt:       { color: '#00C853', fontSize: 14, fontWeight: '600', marginTop: 12 },
  emptyRow:      { color: '#444', fontSize: 14, paddingVertical: 6 },
  maintBtn:      { backgroundColor: '#FFC107', borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  maintBtnTxt:   { color: '#121212', fontSize: 17, fontWeight: '800' },
  dataTxt:       { color: '#aaa', fontSize: 14, paddingVertical: 3 },
  editBtn:       { marginTop: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#555', paddingVertical: 10, alignItems: 'center' },
  editBtnTxt:    { color: '#aaa', fontSize: 14, fontWeight: '600' },
  deleteTxt:     { color: '#F44336', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 14 },

  // Modales pequeños
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomColor: '#222', borderBottomWidth: 1,
  },
  closeBtn:      { width: 80 },
  closeTxt:      { color: '#888', fontSize: 15 },
  topTitle:      { color: '#fff', fontSize: 17, fontWeight: '700' },
  mScroll:       { padding: 20, paddingBottom: 16 },
  mVehicle:      { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 20 },
  mKind:         { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 20 },
  mLabel:        { color: '#666', fontSize: 12, letterSpacing: 1.5, marginBottom: 10 },
  mHint:         { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 22, marginTop: -8 },
  mInput:        { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 14 },
  mBigInput:     { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 18, color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 14 },
  mGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  mChip:         { backgroundColor: '#1e1e1e', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  mChipOn:       { backgroundColor: '#2a1f00', borderWidth: 2, borderColor: '#FFC107' },
  mChipTxt:      { color: '#888', fontSize: 13, fontWeight: '600' },
  mChipTxtOn:    { color: '#fff' },
  mRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  mRowLabel:     { color: '#aaa', fontSize: 16, width: 60 },
  mSmallInput:   { backgroundColor: '#262626', borderRadius: 10, padding: 12, color: '#fff', fontSize: 18, fontWeight: '700', width: 120, textAlign: 'center' },
  saveWrap: {
    padding: 16, paddingBottom: 8,
    backgroundColor: '#121212', borderTopColor: '#222', borderTopWidth: 1,
  },
  saveBtn:       { borderRadius: 18, height: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00C853' },
  saveTxt:       { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
});
