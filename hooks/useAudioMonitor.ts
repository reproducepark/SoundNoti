import { toByteArray } from 'base64-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import AudioRecord from 'react-native-audio-record';
import BackgroundService from 'react-native-background-actions';

type UseAudioMonitorParams = {
  threshold: number; // normalized dB [0..120]
  cooldownMs?: number; // default 60s
  onThresholdExceed?: (db: number) => void;
  holdMs?: number; // must stay above threshold for this long to trigger
  hysteresisDb?: number; // below (threshold - hysteresisDb) to reset hold
};

export function useAudioMonitor(params: UseAudioMonitorParams) {
  const { threshold, cooldownMs = 2_000, onThresholdExceed, holdMs = 400, hysteresisDb = 2 } = params;
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentDb, setCurrentDb] = useState(0);
  const lastTriggerAtRef = useRef<number>(0);
  const startedRef = useRef(false);
  const listenerAttachedRef = useRef(false);
  const aboveStartAtRef = useRef<number>(0);
  const emaDbRef = useRef<number>(0);
  const thresholdRef = useRef<number>(threshold);
  const cooldownRef = useRef<number>(cooldownMs);
  const holdRef = useRef<number>(holdMs);
  const hysteresisRef = useRef<number>(hysteresisDb);
  const lastNotifUpdateAtRef = useRef<number>(0);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);
  useEffect(() => {
    cooldownRef.current = cooldownMs;
  }, [cooldownMs]);
  useEffect(() => {
    holdRef.current = holdMs;
  }, [holdMs]);
  useEffect(() => {
    hysteresisRef.current = hysteresisDb;
  }, [hysteresisDb]);

  const ensurePermission = useCallback(async (): Promise<{ micGranted: boolean; notifGranted: boolean }> => {
    if (Platform.OS !== 'android') return { micGranted: true, notifGranted: true };
    
    // Check microphone permission
    let micGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (!micGranted) {
      const micResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: '마이크 권한이 필요합니다',
        message: '소음 레벨을 측정하기 위해 마이크 권한이 필요합니다.',
        buttonPositive: '허용',
        buttonNegative: '거부',
      });
      micGranted = micResult === PermissionsAndroid.RESULTS.GRANTED;
    }
    
    // Check notification permission for Android 13+
    const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
    let notifGranted = true;
    
    if (api >= 33) {
      const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';
      notifGranted = await PermissionsAndroid.check(POST_NOTIFICATIONS as any);
      // Notification permission is already requested in useNotificationPermission hook
    }
    
    return { micGranted, notifGranted };
  }, []);

  const initRecorder = useCallback((source: number = 6) => {
    if (!AudioRecord || typeof AudioRecord.init !== 'function') {
      throw new Error('AudioRecord 모듈이 로드되지 않았습니다. 네이티브 빌드 후 다시 시도하세요.');
    }
    // Reasonable defaults for VAD-like monitoring
    AudioRecord.init({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      bufferSize: 2048,
      wavFile: '',
      audioSource: source, // 6: VOICE_RECOGNITION, 1: MIC
    } as any);
  }, []);

  const startAudioWithFallback = useCallback(async () => {
    const sources = [6, 1, 0];
    for (const src of sources) {
      try {
        initRecorder(src);
        await AudioRecord.start();
        return;
      } catch (e) {
        // try next source
      }
    }
    throw new Error('마이크 스트림 시작에 실패했습니다. 권한/기기 호환성을 확인하세요.');
  }, [initRecorder]);

  const computeDbFromPcm16leBase64 = useCallback((base64Chunk: string) => {
    try {
      const bytes = toByteArray(base64Chunk);
      const totalSamples = Math.floor(bytes.length / 2);
      if (totalSamples <= 0) return 0;
      let sumSquares = 0;
      for (let i = 0; i < totalSamples; i++) {
        const lo = bytes[i * 2];
        const hi = bytes[i * 2 + 1];
        let sample = (hi << 8) | lo; // little-endian
        if (sample & 0x8000) sample = sample - 0x10000; // signed 16-bit
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / totalSamples);
      if (rms <= 0) return 0;
      const dbfs = 20 * Math.log10(rms / 32767);
      const normalized = Math.max(0, Math.min(120, 120 + dbfs));
      return normalized;
    } catch {
      return 0;
    }
  }, []);

  const start = useCallback(async () => {
    if (!AudioRecord || typeof AudioRecord.start !== 'function') {
      throw new Error('AudioRecord 모듈을 찾을 수 없습니다. EAS Build 또는 expo run:android로 네이티브 빌드가 필요합니다.');
    }
    if (startedRef.current) return;
    const { micGranted, notifGranted } = await ensurePermission();
    if (!micGranted) {
      throw new Error('RECORD_AUDIO 권한이 필요합니다.');
    }
    const task = async () => {
      setCurrentDb(0);

      if (!listenerAttachedRef.current) {
        AudioRecord.on('data', (data: string) => {
          const sampleDb = computeDbFromPcm16leBase64(data);
          const alpha = 0.25;
          const ema = (emaDbRef.current = alpha * sampleDb + (1 - alpha) * (emaDbRef.current || sampleDb));
          const displayDb = ema;
          const peakDb = Math.max(sampleDb, ema);
          setCurrentDb(displayDb);

          const thresh = Math.max(0, Math.min(120, thresholdRef.current));
          const now = Date.now();

          if (peakDb >= thresh) {
            if (aboveStartAtRef.current === 0) aboveStartAtRef.current = now;
            const heldFor = now - aboveStartAtRef.current;
            if (heldFor >= holdRef.current && now - lastTriggerAtRef.current > cooldownRef.current) {
              lastTriggerAtRef.current = now;
              onThresholdExceed?.(peakDb);
            }
          } else {
            // Reset hold immediately when below threshold to require continuous above-threshold time
            aboveStartAtRef.current = 0;
          }
        });
        listenerAttachedRef.current = true;
      }

      await startAudioWithFallback();
      // keep-alive loop
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        if (!startedRef.current) break;
      }
    };

    const options = {
      taskName: 'Voice Monitor',
      taskTitle: 'Voice monitoring active',
      taskDesc: 'Listening with threshold alerts',
      taskIcon: { name: 'ic_launcher', type: 'mipmap' as const },
      color: '#2563EB',
      linkingURI: 'dbnotitelegram://',
      parameters: {},
      foregroundService: true,
    };

    startedRef.current = true;
    setIsMonitoring(true);
    try {
      // Android 13+: 알림 권한이 없으면 Foreground Service 시작이 거부될 수 있으므로 선행 체크
      if (notifGranted) {
        await BackgroundService.start(task, options as any);
      } else {
        try {
          // eslint-disable-next-line no-alert
          Alert.alert('알림 권한 필요', '상단 알림 표시가 차단되어 인앱 모드로 실행합니다. 설정에서 알림을 허용하면 백그라운드가 활성화됩니다.');
        } catch {}
        void task();
        return;
      }
    } catch (e) {
      // Fallback: run without background service + 사용자 안내
      try {
        // eslint-disable-next-line no-alert
        Alert.alert('알림 권한 필요', '상단 알림을 표시하려면 앱 알림 권한을 허용하세요. 일단 포그라운드에서 동작합니다.');
      } catch {}
      setCurrentDb(0);
      if (!listenerAttachedRef.current) {
        AudioRecord.on('data', (data: string) => {
          const sampleDb = computeDbFromPcm16leBase64(data);
          const alpha = 0.25;
          const ema = (emaDbRef.current = alpha * sampleDb + (1 - alpha) * (emaDbRef.current || sampleDb));
          const displayDb = ema;
          const peakDb = Math.max(sampleDb, ema);
          setCurrentDb(displayDb);

          const thresh = Math.max(0, Math.min(120, thresholdRef.current));
          const now = Date.now();
          if (peakDb >= thresh) {
            if (aboveStartAtRef.current === 0) aboveStartAtRef.current = now;
            const heldFor = now - aboveStartAtRef.current;
            if (heldFor >= holdRef.current && now - lastTriggerAtRef.current > cooldownRef.current) {
              lastTriggerAtRef.current = now;
              onThresholdExceed?.(peakDb);
            }
          } else {
            aboveStartAtRef.current = 0;
          }
          // 알림 갱신 (폴백 모드에선 실행 안될 수 있음)
          try {
            const ts = Date.now();
            // @ts-ignore
            if (BackgroundService.isRunning && BackgroundService.isRunning() && ts - lastNotifUpdateAtRef.current > 2000) {
              lastNotifUpdateAtRef.current = ts;
              // @ts-ignore
              BackgroundService.updateNotification({ taskTitle: 'Voice monitoring', taskDesc: `${displayDb.toFixed(1)} dB (thr ${thresh})` });
            }
          } catch {}
        });
        listenerAttachedRef.current = true;
      }
      await startAudioWithFallback();
    }
  }, [computeDbFromPcm16leBase64, cooldownMs, ensurePermission, onThresholdExceed, startAudioWithFallback, threshold]);

  const stop = useCallback(async () => {
    if (!startedRef.current) return;
    try {
      await AudioRecord.stop();
    } finally {
      try { await BackgroundService.stop(); } catch {}
      startedRef.current = false;
      setIsMonitoring(false);
      listenerAttachedRef.current = false;
      aboveStartAtRef.current = 0;
      emaDbRef.current = 0;
    }
  }, []);

  return { isMonitoring, currentDb, start, stop };
}


