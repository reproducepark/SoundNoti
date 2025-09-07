import { toByteArray } from 'base64-js';
import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
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
  const { threshold, cooldownMs = 60_000, onThresholdExceed, holdMs = 400, hysteresisDb = 2 } = params;
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentDb, setCurrentDb] = useState(0);
  const lastTriggerAtRef = useRef<number>(0);
  const startedRef = useRef(false);
  const listenerAttachedRef = useRef(false);
  const aboveStartAtRef = useRef<number>(0);
  const emaDbRef = useRef<number>(0);

  const ensurePermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    let ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (!ok) {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      ok = res === PermissionsAndroid.RESULTS.GRANTED;
    }
    if (!ok) return false;

    // Android 13+ requires POST_NOTIFICATIONS for foreground service notification
    const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
    const POST_NOTIFICATIONS = (PermissionsAndroid.PERMISSIONS as unknown as Record<string, string>)[
      'POST_NOTIFICATIONS'
    ];
    if (api >= 33 && POST_NOTIFICATIONS) {
      const notifGranted = await PermissionsAndroid.check(POST_NOTIFICATIONS as any);
      if (!notifGranted) {
        await PermissionsAndroid.request(POST_NOTIFICATIONS as any);
      }
    }

    return true;
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
    const ok = await ensurePermission();
    if (!ok) {
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

          const thresh = Math.max(0, Math.min(120, threshold));
          const now = Date.now();

          if (peakDb >= thresh) {
            if (aboveStartAtRef.current === 0) aboveStartAtRef.current = now;
            const heldFor = now - aboveStartAtRef.current;
            if (heldFor >= holdMs && now - lastTriggerAtRef.current > cooldownMs) {
              lastTriggerAtRef.current = now;
              onThresholdExceed?.(peakDb);
            }
          } else if (peakDb < Math.max(0, thresh - hysteresisDb)) {
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
      const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
      const canUseBgService = Platform.OS === 'android' && api < 34; // Android 14+ crashes without proper service type
      if (canUseBgService) {
        await BackgroundService.start(task, options as any);
      } else {
        // Fallback for Android 14+: run inline without starting foreground service
        void task();
      }
    } catch (e) {
      // Fallback: run without background service
      setCurrentDb(0);
      if (!listenerAttachedRef.current) {
        AudioRecord.on('data', (data: string) => {
          const sampleDb = computeDbFromPcm16leBase64(data);
          const alpha = 0.25;
          const ema = (emaDbRef.current = alpha * sampleDb + (1 - alpha) * (emaDbRef.current || sampleDb));
          const displayDb = ema;
          const peakDb = Math.max(sampleDb, ema);
          setCurrentDb(displayDb);

          const thresh = Math.max(0, Math.min(120, threshold));
          const now = Date.now();
          if (peakDb >= thresh) {
            if (aboveStartAtRef.current === 0) aboveStartAtRef.current = now;
            const heldFor = now - aboveStartAtRef.current;
            if (heldFor >= holdMs && now - lastTriggerAtRef.current > cooldownMs) {
              lastTriggerAtRef.current = now;
              onThresholdExceed?.(peakDb);
            }
          } else if (peakDb < Math.max(0, thresh - hysteresisDb)) {
            aboveStartAtRef.current = 0;
          }
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


