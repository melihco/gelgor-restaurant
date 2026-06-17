import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { theme } from './src/theme';

type Session = {
  token: string;
  tenantId: string;
  officeId: string;
  displayName: string;
  email: string;
};

const STORAGE_KEY = 'smartagency.mobile.session';

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        try {
          setSession(JSON.parse(raw) as Session);
        } catch {
          await SecureStore.deleteItemAsync(STORAGE_KEY);
        }
      }
      setHydrated(true);
    })();
  }, []);

  const handleLogin = async (nextSession: Session) => {
    setSession(nextSession);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(nextSession));
  };

  const handleLogout = async () => {
    setSession(null);
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  };

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator session={session} onLogin={handleLogin} onLogout={handleLogout} />
    </>
  );
}
