import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@dbnoti/settings/v1';

export type AppSettings = {
  botToken: string;
  chatId: string;
  threshold: number; // normalized dB [0..120]
};

const DEFAULTS: AppSettings = {
  botToken: '',
  chatId: '',
  threshold: 70,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const value = JSON.stringify(next);
  await AsyncStorage.setItem(SETTINGS_KEY, value);
}


