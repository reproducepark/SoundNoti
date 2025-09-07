import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppSettings, loadSettings, saveSettings } from '@/utils/storage';
import { sendTelegramMessage } from '@/utils/telegram';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>({ botToken: '', chatId: '', threshold: 70 });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
    })();
  }, []);

  const onChange = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onSave = useCallback(async () => {
    try {
      setSaving(true);
      await saveSettings(settings);
      Alert.alert('저장됨', '설정이 저장되었습니다.');
      router.back();
    } catch (e) {
      Alert.alert('오류', '설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [router, settings]);

  const onTest = useCallback(async () => {
    try {
      setTesting(true);
      if (!settings.botToken || !settings.chatId) {
        Alert.alert('정보 필요', '봇 토큰과 채팅 ID를 입력하세요.');
        return;
      }
      await sendTelegramMessage({ botToken: settings.botToken, chatId: settings.chatId, text: '테스트 메시지 입니다.' });
      Alert.alert('성공', '텔레그램으로 테스트 메시지를 전송했습니다.');
    } catch (e) {
      Alert.alert('실패', '메시지 전송에 실패했습니다. 토큰/채팅 ID를 확인하세요.');
    } finally {
      setTesting(false);
    }
  }, [settings]);

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>텔레그램 봇 토큰</Text>
        <TextInput
          style={styles.input}
          placeholder="123456:ABC-DEF..."
          autoCapitalize="none"
          value={settings.botToken}
          onChangeText={(t) => onChange('botToken', t)}
        />

        <Text style={styles.label}>채팅 ID</Text>
        <TextInput
          style={styles.input}
          placeholder="123456789"
          keyboardType="numeric"
          value={settings.chatId}
          onChangeText={(t) => onChange('chatId', t)}
        />

        <Text style={styles.label}>Threshold (dB, 0~120)</Text>
        <TextInput
          style={styles.input}
          placeholder="70"
          keyboardType="numeric"
          value={String(Math.round(settings.threshold))}
          onChangeText={(t) => {
            const num = Number(t);
            const clamped = Math.max(0, Math.min(120, isNaN(num) ? 0 : num));
            onChange('threshold', clamped);
          }}
        />

        <View style={styles.row}>
          <Pressable onPress={onSave} style={[styles.button, styles.primary]} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? '저장 중...' : '저장'}</Text>
          </Pressable>
          <Pressable onPress={onTest} style={[styles.button, styles.secondary]} disabled={testing}>
            <Text style={styles.buttonText}>{testing ? '테스트 중...' : '테스트 전송'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  primary: {
    backgroundColor: '#2563EB',
  },
  secondary: {
    backgroundColor: '#0F172A',
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
});


