import { NativeModules, Platform } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';

const { NativeForegroundService } = NativeModules;

// Diagnostic logging
console.log('🔍 Available Native Modules:', Object.keys(NativeModules));
console.log('🔍 NativeForegroundService status:', NativeForegroundService ? 'FOUND ✅' : 'NOT FOUND ❌');

let isBackgroundServiceRunning = false;

async function checkNotificationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const settings = await notifee.getNotificationSettings();
    
    if (settings.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
      console.log('✅ Notification permission already granted');
      return true;
    }
    
    console.log('⚠️ Notification permission not granted - requesting...');
    const requestResult = await notifee.requestPermission();
    
    if (requestResult.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
      console.log('✅ Notification permission granted');
      return true;
    } else {
      console.error('❌ Notification permission denied');
      return false;
    }
  } catch (error) {
    console.error('❌ Error checking notification permission:', error);
    return false;
  }
}

export async function startBackgroundService(deviceName = 'Polar Sensor') {
  if (Platform.OS !== 'android') {
    console.log('Background service only available on Android');
    return false;
  }

  if (!NativeForegroundService) {
    console.error('❌ Native foreground service module not found');
    throw new Error('Native foreground service module not available');
  }

  if (isBackgroundServiceRunning) {
    console.log('Background service already running');
    return true;
  }

  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) {
    console.error('Cannot start background service - notification permission not granted');
    throw new Error('Notification permission required for background service');
  }

  try {
    await NativeForegroundService.startService(deviceName);
    isBackgroundServiceRunning = true;
    console.log('✅ Native foreground service started successfully');
    console.log('🔧 Service type: FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE');
    console.log('🔋 Wake lock: PARTIAL_WAKE_LOCK acquired');
    return true;
  } catch (error) {
    console.error('❌ Error starting native foreground service:', error);
    isBackgroundServiceRunning = false;
    throw error;
  }
}

export async function updateBackgroundNotification(stats) {
  if (!isBackgroundServiceRunning || Platform.OS !== 'android') {
    return;
  }

  if (!NativeForegroundService) {
    console.error('❌ Native foreground service module not found');
    return;
  }

  try {
    const { heartRate, recordingTime, deviceName } = stats;
    
    const formattedTime = recordingTime || '00:00:00';
    const hrText = heartRate ? heartRate.toString() : null;
    
    await NativeForegroundService.updateNotification(
      hrText,
      formattedTime,
      deviceName || 'Polar Sensor'
    );
  } catch (error) {
    console.error('Error updating native notification:', error);
  }
}

export async function stopBackgroundService() {
  if (Platform.OS !== 'android') {
    return;
  }

  if (!NativeForegroundService) {
    console.error('❌ Native foreground service module not found');
    return;
  }

  try {
    if (isBackgroundServiceRunning) {
      await NativeForegroundService.stopService();
      isBackgroundServiceRunning = false;
      console.log('✅ Native foreground service stopped successfully');
    }
  } catch (error) {
    console.error('Error stopping native foreground service:', error);
  }
}

export async function isServiceRunning() {
  if (Platform.OS !== 'android' || !NativeForegroundService) {
    return false;
  }

  try {
    return await NativeForegroundService.isRunning();
  } catch (error) {
    console.error('Error checking service status:', error);
    return isBackgroundServiceRunning;
  }
}
