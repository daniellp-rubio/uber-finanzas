import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Modal, StatusBar, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDatabase } from './src/db';
import { setupNotifications } from './src/notifications';
import TodayScreen from './components/TodayScreen';
import HistoryScreen from './components/HistoryScreen';
import BalanceScreen from './components/BalanceScreen';
import FundsScreen from './components/FundsScreen';
import AddTransactionModal from './components/AddTransactionModal';
import type { TransactionType } from './src/categories';

type Tab = 'today' | 'history' | 'balance' | 'funds';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today',   label: 'Hoy',      icon: '🏠' },
  { id: 'history', label: 'Historial', icon: '📅' },
  { id: 'balance', label: 'Balance',   icon: '💰' },
  { id: 'funds',   label: 'Fondos',    icon: '💼' },
];

function AppContent() {
  const [ready, setReady]            = useState(false);
  const [tab, setTab]                = useState<Tab>('today');
  const [modal, setModal]            = useState<TransactionType | null>(null);
  const [refreshTrigger, setRefresh] = useState(0);
  const insets                       = useSafeAreaInsets();

  useEffect(() => {
    Promise.all([initDatabase(), setupNotifications()])
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={[s.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Screen */}
      <View style={s.screen}>
        {tab === 'today' && (
          <TodayScreen
            refreshTrigger={refreshTrigger}
            onAddIncome={() => setModal('income')}
            onAddExpense={() => setModal('expense')}
          />
        )}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'balance' && <BalanceScreen />}
        {tab === 'funds'   && <FundsScreen />}
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
