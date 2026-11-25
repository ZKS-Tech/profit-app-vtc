import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoProvider } from '../demo/DemoContext';
import { LiveDataProvider } from '../data/live';
import { SettingsProvider } from '../settings/store';
import { colors } from '../theme';

/** Sur grand écran web, l'aperçu s'affiche dans un cadre de téléphone. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < 560) return <>{children}</>;
  return (
    <View style={styles.desk}>
      <View style={[styles.phone, { height: Math.min(860, height - 32) }]}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
      <LiveDataProvider>
      <DemoProvider>
        <StatusBar style="light" />
        <PhoneFrame>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="connexions" />
          </Stack>
        </PhoneFrame>
      </DemoProvider>
      </LiveDataProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  desk: {
    flex: 1,
    backgroundColor: '#05090F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: {
    width: 400,
    borderRadius: 36,
    borderWidth: 8,
    borderColor: '#1B2436',
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
});

// Affiché à la place de l'écran en cas d'erreur (au lieu d'un écran vide).
export { ErrorScreen as ErrorBoundary } from '../components/ErrorScreen';
