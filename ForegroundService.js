import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';
import { Platform, Linking } from 'react-native';

let notificationId = null;

export async function requestNotificationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const settings = await notifee.requestPermission();
    
    if (settings.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
      console.log('Notification permission granted via Notifee');
      return true;
    } else if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
      console.log('Notification permission denied');
      return false;
    } else {
      console.log('Notification permission not determined');
      return false;
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

export async function openAppSettings() {
  try {
    await Linking.openSettings();
  } catch (error) {
    console.error('Error opening app settings:', error);
  }
}

export async function openBatterySettings() {
  if (Platform.OS !== 'android') {
    return;
  }
  
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch (error) {
    console.error('Error opening battery settings:', error);
    try {
      await Linking.openSettings();
    } catch (fallbackError) {
      console.error('Fallback to app settings failed:', fallbackError);
    }
  }
}

export async function checkNotificationPermission() {
  try {
    const settings = await notifee.getNotificationSettings();
    
    if (settings.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
      console.log('Notifee: Notifications authorized');
      return true;
    } else if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
      console.log('Notifee: Notifications denied');
      return false;
    } else {
      console.log('Notifee: Notification permission not determined');
      return await requestNotificationPermission();
    }
  } catch (error) {
    console.error('Error checking notification permission:', error);
    return false;
  }
}

export async function createNotificationChannel() {
  try {
    const channelId = await notifee.createChannel({
      id: 'ble-sensor-foreground',
      name: 'BLE Sensor Monitoring',
      importance: AndroidImportance.LOW,
      description: 'Persistent notification for BLE sensor data collection',
    });
    return channelId;
  } catch (error) {
    console.error('Error creating notification channel:', error);
    throw error;
  }
}

export async function startForegroundService(deviceName = 'Polar Sensor') {
  try {
    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
      throw new Error('Notification permission not granted - foreground service cannot start');
    }

    const channelId = await createNotificationChannel();
    
    notificationId = await notifee.displayNotification({
      title: `Connected to ${deviceName}`,
      body: 'Collecting sensor data...',
      android: {
        channelId,
        asForegroundService: true,
        ongoing: true,
        color: '#FF6B6B',
        colorized: true,
        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },
        actions: [
          {
            title: 'Stop',
            pressAction: {
              id: 'stop',
            },
          },
        ],
      },
    });

    console.log('Foreground service notification displayed successfully');
    return notificationId;
  } catch (error) {
    console.error('Error starting foreground service:', error);
    throw error;
  }
}

export async function updateNotification(stats) {
  if (!notificationId) return;

  try {
    const { heartRate, recordingTime, deviceName } = stats;
    
    const formattedTime = recordingTime || '00:00:00';
    const hrText = heartRate ? `HR: ${heartRate} bpm` : 'HR: --';
    
    await notifee.displayNotification({
      id: notificationId,
      title: `Recording: ${formattedTime}`,
      body: `${hrText} | ${deviceName || 'Polar Sensor'}`,
      android: {
        channelId: 'ble-sensor-foreground',
        asForegroundService: true,
        ongoing: true,
        color: '#FF6B6B',
        colorized: true,
        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },
        actions: [
          {
            title: 'Stop',
            pressAction: {
              id: 'stop',
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('Error updating notification:', error);
  }
}

export async function stopForegroundService() {
  try {
    if (notificationId) {
      await notifee.stopForegroundService();
      notificationId = null;
      console.log('Foreground service stopped successfully');
    }
  } catch (error) {
    console.error('Error stopping foreground service:', error);
  }
}

export async function setupNotificationHandlers(onStopPress) {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail;

    if (pressAction?.id === 'stop') {
      if (onStopPress) {
        onStopPress();
      }
      await stopForegroundService();
    }
  });

  notifee.onForegroundEvent(({ type, detail }) => {
    const { notification, pressAction } = detail;

    if (pressAction?.id === 'stop') {
      if (onStopPress) {
        onStopPress();
      }
      stopForegroundService();
    }
  });
}
