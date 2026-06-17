import { Pressable, StyleSheet, Text } from 'react-native';
import { ScreenFrame } from './shared';
import { theme } from '../theme';

export function SettingsScreen({
  session,
  onLogout,
}: {
  session: { email: string };
  onLogout: () => void;
}) {
  return (
    <ScreenFrame title="Settings" subtitle={`Signed in as ${session.email}`}>
      <Pressable style={styles.button} onPress={onLogout}>
        <Text style={styles.buttonLabel}>Oturumu Kapat</Text>
      </Pressable>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: {
    color: theme.text,
    fontWeight: '700',
  },
});
