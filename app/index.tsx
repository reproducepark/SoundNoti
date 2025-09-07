import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAudioMonitor } from '@/hooks/useAudioMonitor';
import { loadSettings } from '@/utils/storage';
import { sendTelegramMessage } from '@/utils/telegram';

export default function HomeScreen() {
  const [isReady, setIsReady] = useState(false);
  const [threshold, setThreshold] = useState<number>(70);
  const [botToken, setBotToken] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');

  const { currentDb, isMonitoring, start, stop } = useAudioMonitor({
    threshold,
    cooldownMs: 60_000,
    onThresholdExceed: async (dbValue) => {
      if (!botToken || !chatId) return;
      try {
        await sendTelegramMessage({ botToken, chatId, text: `소음 레벨 경고: ${dbValue.toFixed(1)} dB` });
      } catch (error) {
        // 사용자 방해 최소화를 위해 조용히 실패 처리
      }
    },
  });

  const refreshSettings = useCallback(async () => {
    const settings = await loadSettings();
    setThreshold(settings.threshold);
    setBotToken(settings.botToken);
    setChatId(settings.chatId);
    setIsReady(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSettings();
    }, [refreshSettings])
  );

  useEffect(() => {
    // 안드로이드 전용 앱이지만, iOS 실행 시 안내
    if (Platform.OS !== 'android') {
      Alert.alert('Android 전용', '이 앱은 Android 전용입니다.');
    }
  }, []);

  const toggleMonitoring = useCallback(async () => {
    try {
      if (Platform.OS !== 'android') {
        Alert.alert('Android 전용', '이 기능은 Android에서만 동작합니다.');
        return;
      }
      if (!isMonitoring) {
        await start();
      } else {
        await stop();
      }
    } catch (err: any) {
      const message = err?.message ?? '시작 중 알 수 없는 오류가 발생했습니다.';
      Alert.alert('오류', message);
    }
  }, [isMonitoring, start, stop]);

  const buttonLabel = useMemo(() => (isMonitoring ? '중지' : '시작'), [isMonitoring]);

  if (!isReady) {
    return (
      <View style={styles.container}> 
        <Text style={styles.title}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>음성 레벨</Text>
      <Text style={styles.level}>{currentDb.toFixed(1)} dB</Text>
      <Text style={styles.threshold}>임계값: {threshold.toFixed(0)} dB</Text>

      <Pressable onPress={toggleMonitoring} style={[styles.button, isMonitoring ? styles.buttonStop : styles.buttonStart]}>
        <Text style={styles.buttonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  level: {
    fontSize: 48,
    fontWeight: '800',
  },
  threshold: {
    fontSize: 14,
    opacity: 0.7,
  },
  button: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonStart: {
    backgroundColor: '#0a84ff',
  },
  buttonStop: {
    backgroundColor: '#ff3b30',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
});


