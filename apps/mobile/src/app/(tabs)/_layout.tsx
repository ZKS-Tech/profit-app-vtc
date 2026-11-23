import { Tabs } from 'expo-router';
import { CalendarDays, ChartColumn, Map, User } from 'lucide-react-native';
import { colors } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Carte', tabBarIcon: ({ color }) => <Map size={22} color={color} /> }}
      />
      {/* Arrivées gares/aéroport : calcul côté serveur, écran masqué (décision du 23/11). */}
      <Tabs.Screen name="arrivees" options={{ href: null }} />
      <Tabs.Screen
        name="planification"
        options={{ title: 'Planif.', tabBarIcon: ({ color }) => <CalendarDays size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stats', tabBarIcon: ({ color }) => <ChartColumn size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarIcon: ({ color }) => <User size={22} color={color} /> }}
      />
    </Tabs>
  );
}
