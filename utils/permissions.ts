import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

const NOTIFICATION_DENIED_KEY = '@notification_explicitly_denied';

export async function wasNotificationExplicitlyDenied(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_DENIED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setNotificationExplicitlyDenied(denied: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_DENIED_KEY, denied ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export async function openAppSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    Linking.openSettings();
  }
}

export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  if (api < 33) return true;
  
  const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';
  return PermissionsAndroid.check(POST_NOTIFICATIONS as any);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  if (api < 33) return true;
  
  const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';
  
  try {
    // Check if already granted
    const hasPermission = await PermissionsAndroid.check(POST_NOTIFICATIONS as any);
    if (hasPermission) {
      await setNotificationExplicitlyDenied(false);
      return true;
    }
    
    // Check if explicitly denied before
    const wasExplicitlyDenied = await wasNotificationExplicitlyDenied();
    if (wasExplicitlyDenied) {
      // Don't ask again, show settings prompt instead
      Alert.alert(
        '알림 권한 필요',
        '알림 권한이 거부되어 있습니다. 설정에서 직접 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로 이동', onPress: openAppSettings }
        ]
      );
      return false;
    }
    
    // Request permission
    const result = await PermissionsAndroid.request(POST_NOTIFICATIONS as any, {
      title: '알림 권한이 필요합니다',
      message: '소음 감지 시 텔레그램으로 알림을 보내기 위해 알림 권한이 필요합니다.',
      buttonPositive: '허용',
      buttonNegative: '거부',
    });
    
    const granted = result === PermissionsAndroid.RESULTS.GRANTED;
    
    // Check if user selected "Don't ask again"
    if (result === PermissionsAndroid.RESULTS.DENIED) {
      // Try to check shouldShowRequestPermissionRationale
      // If false after denial, it means "Don't ask again" was selected
      try {
        const shouldShow = await (PermissionsAndroid as any).shouldShowRequestPermissionRationale?.(POST_NOTIFICATIONS);
        if (!shouldShow) {
          await setNotificationExplicitlyDenied(true);
        }
      } catch {
        // If the method doesn't exist, assume it wasn't explicitly denied
      }
    }
    
    return granted;
  } catch (err) {
    console.warn('알림 권한 요청 실패:', err);
    return false;
  }
}
