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
    
    try {
      await NativeForegroundService.startWatchdog();
      console.log('⏰ Watchdog started - will check service every 5 minutes');
    } catch (error) {
      console.warn('⚠️ Failed to start watchdog (non-critical):', error.message);
    }
    
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
      try {
        await NativeForegroundService.stopWatchdog();
        console.log('⏰ Watchdog stopped');
      } catch (error) {
        console.warn('⚠️ Failed to stop watchdog (non-critical):', error.message);
      }
      
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

export async function checkExitReasons() {
  if (Platform.OS !== 'android' || !NativeForegroundService) {
    return null;
  }

  try {
    const exitReasonsJson = await NativeForegroundService.getExitReasons();
    
    if (!exitReasonsJson || typeof exitReasonsJson !== 'string') {
      console.log('📋 No exit reasons data available');
      return null;
    }
    
    const exitReasons = JSON.parse(exitReasonsJson);
    
    if (exitReasons.error) {
      console.warn(`⚠️ Exit reasons error: ${exitReasons.error}`);
      return null;
    }
    
    if (Array.isArray(exitReasons) && exitReasons.length > 0) {
      console.log(`📋 Found ${exitReasons.length} previous app terminations:`);
      exitReasons.forEach((exit, index) => {
        console.log(`\n${index + 1}. ${exit.timestamp}`);
        console.log(`   Reason: ${exit.reason}`);
        console.log(`   Importance: ${exit.importance}`);
        console.log(`   Memory: RSS=${exit.rss}, PSS=${exit.pss}`);
        if (exit.description && exit.description !== 'No description') {
          console.log(`   Description: ${exit.description}`);
        }
      });
    } else {
      console.log('📋 No previous app terminations found');
    }
    
    return exitReasons;
  } catch (error) {
    console.error('❌ Error checking exit reasons:', error.message || error);
    return null;
  }
}

export async function getCurrentMemoryInfo() {
  if (Platform.OS !== 'android' || !NativeForegroundService) {
    return null;
  }

  try {
    const memoryInfoJson = await NativeForegroundService.getCurrentMemoryInfo();
    
    if (!memoryInfoJson || typeof memoryInfoJson !== 'string') {
      console.log('💾 No memory info data available');
      return null;
    }
    
    const memoryInfo = JSON.parse(memoryInfoJson);
    
    if (memoryInfo.error) {
      console.warn(`⚠️ Memory info error: ${memoryInfo.error}`);
      return null;
    }
    
    console.log('💾 Current Memory Status:');
    console.log(`   Heap Used: ${memoryInfo.heapUsedMB}MB / ${memoryInfo.heapMaxMB}MB`);
    console.log(`   Heap Free: ${memoryInfo.heapFreeMB}MB`);
    console.log(`   System Available: ${memoryInfo.availableMemoryMB}MB / ${memoryInfo.totalMemoryMB}MB`);
    console.log(`   Low Memory: ${memoryInfo.lowMemory ? 'YES ⚠️' : 'NO ✅'}`);
    
    return memoryInfo;
  } catch (error) {
    console.error('❌ Error getting memory info:', error.message || error);
    return null;
  }
}

export async function checkAndRequestBatteryExemption() {
  if (Platform.OS !== 'android' || !NativeForegroundService) {
    return true;
  }

  try {
    const isDisabled = await NativeForegroundService.isBatteryOptimizationDisabled();
    
    if (isDisabled) {
      console.log('✅ Battery optimization already disabled');
      return true;
    } else {
      console.log('⚠️ Battery optimization is enabled - requesting exemption...');
      const result = await NativeForegroundService.requestBatteryOptimizationExemption();
      console.log(`🔋 Battery exemption request: ${result}`);
      return result === 'already_disabled';
    }
  } catch (error) {
    console.error('❌ Error checking battery optimization:', error.message || error);
    return false;
  }
}

export async function checkAndRequestExactAlarmPermission() {
  if (Platform.OS !== 'android' || !NativeForegroundService) {
    return true;
  }

  try {
    const canSchedule = await NativeForegroundService.canScheduleExactAlarms();
    
    if (canSchedule) {
      console.log('✅ Exact alarm permission granted');
      return true;
    } else {
      console.log('⚠️ Exact alarm permission not granted - requesting...');
      const result = await NativeForegroundService.requestExactAlarmPermission();
      console.log(`⏰ Exact alarm permission request: ${result}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error checking exact alarm permission:', error.message || error);
    return false;
  }
}
