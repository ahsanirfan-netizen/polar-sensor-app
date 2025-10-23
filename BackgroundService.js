import BackgroundService from 'react-native-background-actions';
import { Platform } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';

let isBackgroundServiceRunning = false;
let taskIterations = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const backgroundTask = async (taskDataArguments) => {
  const { delay } = taskDataArguments;
  
  await new Promise(async (resolve) => {
    console.log('🚀 Background service task started - keeping app alive');
    
    while (BackgroundService.isRunning()) {
      taskIterations++;
      
      const currentTime = new Date().toLocaleTimeString();
      console.log(`⏰ Background service heartbeat #${taskIterations} at ${currentTime}`);
      
      await BackgroundService.updateNotification({
        taskDesc: `Active - Heartbeat #${taskIterations}`,
      });
      
      await sleep(delay);
    }
    
    console.log('🛑 Background service task ending');
    resolve();
  });
};

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
    return false;
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
    taskIterations = 0;
    
    const options = {
      taskName: 'BLE Sensor Data Collection',
      taskTitle: `Connected to ${deviceName}`,
      taskDesc: 'Collecting sensor data...',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#FF6B6B',
      linkingURI: 'polarsensor://',
      parameters: {
        delay: 30000,
      },
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: true,
      },
    };

    await BackgroundService.start(backgroundTask, options);
    isBackgroundServiceRunning = true;
    console.log('✅ Background service started successfully with notification permission');
    return true;
  } catch (error) {
    console.error('❌ Error starting background service:', error);
    isBackgroundServiceRunning = false;
    throw error;
  }
}

export async function updateBackgroundNotification(stats) {
  if (!isBackgroundServiceRunning || Platform.OS !== 'android') {
    return;
  }

  try {
    const { heartRate, recordingTime, deviceName } = stats;
    
    const formattedTime = recordingTime || '00:00:00';
    const hrText = heartRate ? `HR: ${heartRate} bpm` : 'HR: --';
    
    await BackgroundService.updateNotification({
      taskTitle: `Recording: ${formattedTime}`,
      taskDesc: `${hrText} | ${deviceName || 'Polar Sensor'}`,
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: true,
      },
    });
  } catch (error) {
    console.error('Error updating background notification:', error);
  }
}

export async function stopBackgroundService() {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    if (isBackgroundServiceRunning) {
      await BackgroundService.stop();
      isBackgroundServiceRunning = false;
      console.log('Background service stopped successfully');
    }
  } catch (error) {
    console.error('Error stopping background service:', error);
  }
}

export function isServiceRunning() {
  return isBackgroundServiceRunning;
}
