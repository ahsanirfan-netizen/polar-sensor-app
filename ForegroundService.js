import notifee, { AndroidImportance } from '@notifee/react-native';

let notificationId = null;

export async function createNotificationChannel() {
  const channelId = await notifee.createChannel({
    id: 'ble-sensor-foreground',
    name: 'BLE Sensor Monitoring',
    importance: AndroidImportance.LOW,
    description: 'Persistent notification for BLE sensor data collection',
  });
  return channelId;
}

export async function startForegroundService(deviceName = 'Polar Sensor') {
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

  return notificationId;
}

export async function updateNotification(stats) {
  if (!notificationId) return;

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
}

export async function stopForegroundService() {
  if (notificationId) {
    await notifee.stopForegroundService();
    notificationId = null;
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
