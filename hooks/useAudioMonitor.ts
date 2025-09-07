import { toByteArray } from 'base64-js';
import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import AudioRecord from 'react-native-audio-record';

type UseAudioMonitorParams = {
  threshold: number; // normalized dB [0..120]
  cooldownMs?: number; // default 60s
  onThresholdExceed?: (db: number) => void;
};

export function useAudioMonitor(params: UseAudioMonitorParams) {
  const { threshold, cooldownMs = 60_000, onThresholdExceed } = params;
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentDb, setCurrentDb] = useState(0);
  const lastTriggerAtRef = useRef<number>(0);
  const startedRef = useRef(false);

  const ensurePermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted) return true;
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const initRecorder = useCallback(() => {
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
      audioSource: 6, // VOICE_RECOGNITION
    } as any);
  }, []);

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
    initRecorder();
    setCurrentDb(0);
    setIsMonitoring(true);
    startedRef.current = true;

    AudioRecord.on('data', (data: string) => {
      const db = computeDbFromPcm16leBase64(data);
      setCurrentDb(db);
      if (db >= threshold) {
        const now = Date.now();
        if (now - lastTriggerAtRef.current > cooldownMs) {
          lastTriggerAtRef.current = now;
          onThresholdExceed?.(db);
        }
      }
    });

    await AudioRecord.start();
  }, [computeDbFromPcm16leBase64, cooldownMs, ensurePermission, initRecorder, onThresholdExceed, threshold]);

  const stop = useCallback(async () => {
    if (!startedRef.current) return;
    try {
      await AudioRecord.stop();
    } finally {
      startedRef.current = false;
      setIsMonitoring(false);
    }
  }, []);

  return { isMonitoring, currentDb, start, stop };
}


