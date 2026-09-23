import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Modal, StatusBar, TouchableOpacity, Text, ActivityIndicator, Linking } from 'react-native';
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

type Tab = 'today' | 'history' | 'balance' | 'funds' | 'vehicles';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today',   label: 'Hoy',      icon: '🏠' },
  { id: 'history', label: 'Historial', icon: '📅' },
  { id: 'balance', label: 'Balance',   icon: '💰' },
  { id: 'funds',   label: 'Fondos',    icon: '💼' },
  { id: 'vehicles', label: 'Carros',   icon: '🚙' },
];

function AppContent() {
  const [ready, setReady]            = useState(false);
  const [tab, setTab]                = useState<Tab>('today');
  const [modal, setModal]            = useState<TransactionType | null>(null);
  const [refreshTrigger, setRefresh] = useState(0);
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
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Aviso de APK nuevo */}
      {newApk && (
        <TouchableOpacity style={s.updateBar} onPress={() => Linking.openURL(APK_URL)} activeOpacity={0.8}>
          <Text style={s.updateTitle}>📲 Hay una versión nueva de la app</Text>
          <Text style={s.updateSub}>Toca aquí para descargarla e instalarla. Tus datos se conservan.</Text>
        </TouchableOpacity>
      )}

      {/* Screen */}
      <View style={s.screen}>
        {tab === 'today' && (
          <TodayScreen
            refreshTrigger={refreshTrigger}
            onAddIncome={() => setModal('income')}
            onAddExpense={() => setModal('expense')}
            onOpenVehicles={() => setTab('vehicles')}
          />
        )}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'balance' && <BalanceScreen />}
        {tab === 'funds'   && <FundsScreen />}
        {tab === 'vehicles' && <VehiclesScreen />}
      </View>

      {/* Bottom Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={s.tabItem} onPress={() => setTab(t.id)}>
            <Text style={s.tabIcon}>{t.icon}</Text>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
            {tab === t.id && <View style={s.tabDot} />}
          </TouchableOpacity>
        ))}
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
      <StatusBar barStyle="light-content" backgroundColor="#121212" translucent />
      <AppContent />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#121212' },
  loading:        { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  screen:         { flex: 1 },
  updateBar:      { backgroundColor: '#0a3020', borderBottomColor: '#00C853', borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 16 },
  updateTitle:    { color: '#00C853', fontSize: 15, fontWeight: '800' },
  updateSub:      { color: '#4caf7a', fontSize: 12, marginTop: 2 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderTopColor: '#2a2a2a',
    borderTopWidth: 1,
  },
  tabItem:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 3 },
  tabIcon:        { fontSize: 20 },
  tabLabel:       { color: '#555', fontSize: 11, fontWeight: '600' },
  tabLabelActive: { color: '#00C853' },
  tabDot:         { width: 4, height: 4, borderRadius: 2, backgroundColor: '#00C853' },
});
