import BackgroundService from 'react-native-background-actions';
import { Platform } from 'react-native';
import { updateNotification } from './ForegroundService';

let isBackgroundServiceRunning = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const backgroundTask = async (taskDataArguments) => {
  const { delay } = taskDataArguments;
  
  await new Promise(async (resolve) => {
    while (BackgroundService.isRunning()) {
      await sleep(delay);
    }
    resolve();
  });
};

export async function startBackgroundService(deviceName = 'Polar Sensor') {
  if (Platform.OS !== 'android') {
    return false;
  }

  if (isBackgroundServiceRunning) {
    console.log('Background service already running');
    return true;
  }

  try {
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
        delay: 5000,
      },
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: true,
      },
    };

    await BackgroundService.start(backgroundTask, options);
    isBackgroundServiceRunning = true;
    console.log('Background service started successfully');
    return true;
  } catch (error) {
    console.error('Error starting background service:', error);
    isBackgroundServiceRunning = false;
    return false;
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
