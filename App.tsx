import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Modal, StatusBar, Pressable, Text, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDatabase } from './src/db';
import { setupNotifications, refreshVehicleReminders, refreshBackupReminder } from './src/notifications';
import { applyOtaUpdateIfAvailable, isNewApkAvailable, APK_URL } from './src/updates';
import TodayScreen from './components/TodayScreen';
import HistoryScreen from './components/HistoryScreen';
import BalanceScreen from './components/BalanceScreen';
import FundsScreen from './components/FundsScreen';
import VehiclesScreen from './components/VehiclesScreen';
import AddTransactionModal from './components/AddTransactionModal';
import type { TransactionType } from './src/categories';
import { C, T, S, R } from './src/theme';
import { Icon, IconName } from './components/ui';

type Tab = 'today' | 'history' | 'balance' | 'funds' | 'vehicles';

const TABS: { id: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { id: 'today',    label: 'Hoy',       icon: 'home-outline',     iconOn: 'home' },
  { id: 'history',  label: 'Historial', icon: 'calendar-blank-outline', iconOn: 'calendar-blank' },
  { id: 'balance',  label: 'Balance',   icon: 'chart-donut',      iconOn: 'chart-donut-variant' },
  { id: 'funds',    label: 'Fondos',    icon: 'piggy-bank-outline', iconOn: 'piggy-bank' },
  { id: 'vehicles', label: 'Carros',    icon: 'car-outline',      iconOn: 'car' },
];

function AppContent() {
  const [ready, setReady]            = useState(false);
  const [tab, setTab]                = useState<Tab>('today');
  const [modal, setModal]            = useState<TransactionType | null>(null);
  const [refreshTrigger, setRefresh] = useState(0);
  const [openVehicle, setOpenVehicle] = useState<number | null>(null);  // aviso de Hoy → ese carro
  const [newApk, setNewApk]          = useState(false);
  const insets                       = useSafeAreaInsets();

  useEffect(() => {
    // Primero el update OTA (puede reiniciar la app), después la DB
    applyOtaUpdateIfAvailable()
      .then(() => Promise.all([initDatabase(), setupNotifications()]))
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    isNewApkAvailable().then(setNewApk);
    refreshVehicleReminders().catch(() => {});  // SOAT, técnico-mecánica, etc.
    refreshBackupReminder().catch(() => {});    // copia de seguridad semanal
  }, [ready]);

  if (!ready) {
    return (
      <View style={[s.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Aviso de APK nuevo */}
      {newApk && (
        <Pressable style={s.updateBar} onPress={() => Linking.openURL(APK_URL)} accessibilityRole="button">
          <Icon name="download-circle" size={26} color={C.money} />
          <View style={{ flex: 1 }}>
            <Text style={[T.label, { color: C.money }]}>Hay una versión nueva de la app</Text>
            <Text style={[T.labelSm, { color: C.text }]}>Toca para descargarla e instalarla. Tus datos se conservan.</Text>
          </View>
        </Pressable>
      )}

      {/* Screen */}
      <View style={s.screen}>
        {tab === 'today' && (
          <TodayScreen
            refreshTrigger={refreshTrigger}
            onAddIncome={() => setModal('income')}
            onAddExpense={() => setModal('expense')}
            onOpenVehicle={id => { setOpenVehicle(id); setTab('vehicles'); }}
          />
        )}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'balance' && <BalanceScreen />}
        {tab === 'funds'   && <FundsScreen />}
        {tab === 'vehicles' && <VehiclesScreen openVehicleId={openVehicle} onOpened={() => setOpenVehicle(null)} />}
      </View>

      {/* Barra de navegación (Material 3) */}
      <View style={s.tabBar} accessibilityRole="tablist">
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={s.tabItem}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              <View style={[s.tabPill, on && s.tabPillOn]}>
                <Icon name={on ? t.iconOn : t.icon} size={24} color={on ? C.text : C.textMuted} />
              </View>
              <Text style={[s.tabLabel, on && s.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Add Transaction Modal */}
      <Modal
        visible={modal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModal(null)}
      >
        {modal !== null && (
          <AddTransactionModal
            initialType={modal}
            onClose={() => setModal(null)}
            onSaved={() => { setModal(null); setRefresh(n => n + 1); }}
          />
        )}
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent />
      <AppContent />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  loading:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  screen:     { flex: 1 },
  updateBar:  { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.moneyContainer, paddingVertical: S.md, paddingHorizontal: S.lg },
  tabBar:     { flexDirection: 'row', backgroundColor: C.surface, paddingTop: S.md, paddingBottom: S.sm },
  tabItem:    { flex: 1, alignItems: 'center', gap: S.xs, minHeight: 56 },
  tabPill:    { width: 64, height: 32, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  tabPillOn:  { backgroundColor: C.primaryContainer },
  tabLabel:   { ...T.labelSm, fontSize: 12 },
  tabLabelOn: { color: C.text, fontWeight: '700' },
});
