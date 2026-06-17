import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { mobileApiClient } from '../api/client';
import { theme } from '../theme';

export function LoginScreen({
  onLogin,
}: {
  onLogin: (session: {
    token: string;
    tenantId: string;
    officeId: string;
    displayName: string;
    email: string;
  }) => void;
}) {
  const [email, setEmail] = useState('demo@smartagency.ai');
  const [password, setPassword] = useState('demo1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setError(null);
      const session = await mobileApiClient.login(email, password);
      onLogin({
        token: session.token,
        tenantId: session.tenantId,
        officeId: session.officeId,
        displayName: session.user.displayName,
        email: session.user.email,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.badge}>Smart Agency Mobile</Text>
      <Text style={styles.title}>Client App</Text>
      <Text style={styles.subtitle}>
        Expo iskeleti: auth, navigation ve ortak contract paketi ile yeni native taban.
      </Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={theme.textMuted} autoCapitalize="none" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={theme.textMuted} secureTextEntry />
      <Pressable style={styles.button} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>Giriş Yap</Text>}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
  },
  badge: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.text,
    fontSize: 34,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    color: theme.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
  },
});
