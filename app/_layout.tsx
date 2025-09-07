import Ionicons from '@expo/vector-icons/Ionicons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: '#60A5FA',
        background: '#0B1220',
        card: '#111827',
        border: '#1F2937',
        text: '#E5E7EB',
      },
    } : {
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: '#2563EB',
        background: '#F8FAFC',
        card: '#FFFFFF',
        border: '#E2E8F0',
        text: '#0F172A',
      },
    }}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: 'SoundNoti',
            headerRight: ({ tintColor }) => (
              <Link href="/settings" asChild>
                <Pressable accessibilityLabel="settings">
                  <Ionicons name="settings-outline" size={22} color={tintColor ?? undefined} />
                </Pressable>
              </Link>
            ),
          }}
        />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
