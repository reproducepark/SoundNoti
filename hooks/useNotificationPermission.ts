import { checkNotificationPermission, requestNotificationPermission } from '@/utils/permissions';
import { useCallback, useEffect, useState } from 'react';

export function useNotificationPermission() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const checkPermission = useCallback(async () => {
    const granted = await checkNotificationPermission();
    setHasPermission(granted);
    return granted;
  }, []);

  const requestPermission = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setHasPermission(granted);
    return granted;
  }, []);

  useEffect(() => {
    // Check permission on mount
    checkPermission();
  }, [checkPermission]);

  // Delay the request to ensure UI is ready
  useEffect(() => {
    const timer = setTimeout(async () => {
      const hasPermission = await checkNotificationPermission();
      if (!hasPermission) {
        await requestPermission();
      }
    }, 1500); // Wait 1.5 seconds after app starts

    return () => clearTimeout(timer);
  }, [requestPermission]);

  return { hasPermission, requestPermission, checkPermission };
}
