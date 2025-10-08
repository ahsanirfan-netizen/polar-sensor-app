import { Platform } from 'react-native';

// Lazy load notifications to prevent crashes on import
let Notifications = null;

class StepCounterService {
  constructor() {
    this.isWalking = false;
    this.gyroBuffer = [];
    this.accBuffer = [];
    this.stepCount = 0;
    this.walkingSession = null;
    this.lastPeakTime = 0;
    this.walkingThreshold = 0.5;
    this.minPeakDistance = 200;
    this.walkingCallback = null;
    this.walkingStoppedCallback = null;
    this.pendingStartConfirmation = false;
    this.pendingStopConfirmation = false;
    this.lastRejectionTime = 0;
    this.rejectionCooldown = 10000;
    this.categoriesSetup = false;
    this.handlerSetup = false;
  }

  async loadNotifications() {
    if (Notifications) return true;
    
    try {
      Notifications = await import('expo-notifications');
      return true;
    } catch (error) {
      console.error('Failed to load expo-notifications:', error);
      return false;
    }
  }

  async setupNotificationHandler() {
    if (this.handlerSetup) return;
    
    const loaded = await this.loadNotifications();
    if (!loaded) return;
    
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      this.handlerSetup = true;
    } catch (error) {
      console.error('Failed to setup notification handler:', error);
    }
  }

  async setupNotificationCategories() {
    const loaded = await this.loadNotifications();
    if (!loaded) return;
    
    if (Platform.OS === 'android') {
      await Notifications.setNotificationCategoryAsync('walking_start', [
        {
          identifier: 'confirm_yes',
          buttonTitle: 'Yes',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'confirm_no',
          buttonTitle: 'No',
          options: { opensAppToForeground: false },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('walking_stop', [
        {
          identifier: 'stop_yes',
          buttonTitle: 'Yes, Stop',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'stop_no',
          buttonTitle: 'No, Continue',
          options: { opensAppToForeground: false },
        },
      ]);
    }
  }

  setWalkingCallbacks(onWalkingDetected, onWalkingStopped) {
    this.walkingCallback = onWalkingDetected;
    this.walkingStoppedCallback = onWalkingStopped;
  }

  async requestNotificationPermissions() {
    await this.setupNotificationHandler();
    
    const loaded = await this.loadNotifications();
    if (!loaded) return false;
    
    if (Platform.OS === 'android') {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
      } catch (error) {
        console.error('Failed to request notification permissions:', error);
        return false;
      }
    }
    return true;
  }

  calculateGyroMagnitude(gyro) {
    if (!gyro || gyro.x === undefined) return 0;
    return Math.sqrt(gyro.x ** 2 + gyro.y ** 2 + gyro.z ** 2);
  }

  calculateAccMagnitude(acc) {
    if (!acc || acc.x === undefined) return 0;
    return Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  }

  calculateVariance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => (val - mean) ** 2);
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  async detectWalkingPattern(gyroData, accData) {
    const gyroMag = this.calculateGyroMagnitude(gyroData);
    const accMag = this.calculateAccMagnitude(accData);
    
    this.gyroBuffer.push(gyroMag);
    this.accBuffer.push(accMag);
    
    if (this.gyroBuffer.length > 50) {
      this.gyroBuffer.shift();
      this.accBuffer.shift();
    }
    
    if (this.gyroBuffer.length >= 20) {
      const gyroVariance = this.calculateVariance(this.gyroBuffer);
      const isLikelyWalking = gyroVariance > this.walkingThreshold;
      const now = Date.now();
      const cooldownExpired = (now - this.lastRejectionTime) > this.rejectionCooldown;
      
      if (isLikelyWalking && !this.isWalking && !this.walkingSession && !this.pendingStartConfirmation && cooldownExpired) {
        this.pendingStartConfirmation = true;
        await this.sendWalkingNotification('start');
      } 
      else if (!isLikelyWalking && this.isWalking && !this.pendingStopConfirmation && cooldownExpired) {
        this.pendingStopConfirmation = true;
        await this.sendWalkingNotification('stop');
      }
    }
  }

  async sendWalkingNotification(type) {
    const hasPermission = await this.requestNotificationPermissions();
    if (!hasPermission || !Notifications) return;

    if (!this.categoriesSetup) {
      await this.setupNotificationCategories();
      this.categoriesSetup = true;
    }

    if (type === 'start') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Walking Detected 🚶',
          body: 'Are you walking?',
          data: { type: 'walking_start' },
          categoryIdentifier: 'walking_start',
        },
        trigger: null,
      });
      
      if (this.walkingCallback) {
        this.walkingCallback();
      }
    } else if (type === 'stop') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Walking Stopped ⏸️',
          body: 'Did you stop walking?',
          data: { type: 'walking_stop' },
          categoryIdentifier: 'walking_stop',
        },
        trigger: null,
      });
      
      if (this.walkingStoppedCallback) {
        this.walkingStoppedCallback();
      }
    }
  }

  startWalkingSession() {
    this.isWalking = true;
    this.stepCount = 0;
    this.pendingStartConfirmation = false;
    this.walkingSession = {
      startTime: new Date().toISOString(),
      steps: 0
    };
  }

  stopWalkingSession() {
    if (!this.walkingSession) return null;
    
    const session = {
      ...this.walkingSession,
      endTime: new Date().toISOString(),
      steps: this.stepCount
    };
    
    this.isWalking = false;
    this.walkingSession = null;
    this.stepCount = 0;
    this.gyroBuffer = [];
    this.accBuffer = [];
    this.pendingStopConfirmation = false;
    
    return session;
  }

  detectStep(accData) {
    if (!this.isWalking) return false;
    
    const magnitude = this.calculateAccMagnitude(accData);
    const currentTime = Date.now();
    
    if (this.accBuffer.length < 10) return false;
    
    const recentMean = this.accBuffer.slice(-10).reduce((sum, val) => sum + val, 0) / 10;
    const threshold = recentMean * 1.15;
    
    if (magnitude > threshold && (currentTime - this.lastPeakTime) > this.minPeakDistance) {
      this.lastPeakTime = currentTime;
      this.stepCount++;
      if (this.walkingSession) {
        this.walkingSession.steps = this.stepCount;
      }
      return true;
    }
    
    return false;
  }

  reset() {
    this.isWalking = false;
    this.gyroBuffer = [];
    this.accBuffer = [];
    this.stepCount = 0;
    this.walkingSession = null;
    this.lastPeakTime = 0;
    this.pendingStartConfirmation = false;
    this.pendingStopConfirmation = false;
  }

  getStepCount() {
    return this.stepCount;
  }

  getIsWalking() {
    return this.isWalking;
  }

  recordRejection() {
    this.lastRejectionTime = Date.now();
    this.pendingStartConfirmation = false;
    this.pendingStopConfirmation = false;
  }
}

export default new StepCounterService();
