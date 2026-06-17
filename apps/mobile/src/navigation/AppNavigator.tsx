import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { theme } from '../theme';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { MissionsScreen } from '../screens/MissionsScreen';
import { BrandScreen } from '../screens/BrandScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

type Session = {
  token: string;
  tenantId: string;
  officeId: string;
  displayName: string;
  email: string;
};

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.bg,
    card: theme.card,
    text: theme.text,
    border: theme.border,
    primary: theme.accent,
  },
};

function ClientTabs({ session, onLogout }: { session: Session; onLogout: () => void }) {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
      }}
    >
      <Tabs.Screen name="Home" options={{ tabBarIcon: () => <Text>■</Text> }}>
        {() => <HomeScreen session={session} />}
      </Tabs.Screen>
      <Tabs.Screen name="Feed" options={{ tabBarIcon: () => <Text>●</Text> }}>
        {() => <FeedScreen session={session} />}
      </Tabs.Screen>
      <Tabs.Screen name="Missions" options={{ tabBarIcon: () => <Text>▲</Text> }}>
        {() => <MissionsScreen session={session} />}
      </Tabs.Screen>
      <Tabs.Screen name="Brand" options={{ tabBarIcon: () => <Text>◆</Text> }}>
        {() => <BrandScreen session={session} />}
      </Tabs.Screen>
      <Tabs.Screen name="Settings" options={{ tabBarIcon: () => <Text>⋯</Text> }}>
        {() => <SettingsScreen session={session} onLogout={onLogout} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

export function AppNavigator({
  session,
  onLogin,
  onLogout,
}: {
  session: Session | null;
  onLogin: (session: Session) => void;
  onLogout: () => void;
}) {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="ClientApp">
            {() => <ClientTabs session={session} onLogout={onLogout} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Login">
            {() => <LoginScreen onLogin={onLogin} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
