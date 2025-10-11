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
    this.walkingThreshold = 0.15; // ACC magnitude variance >0.15 indicates walking (G-force scale)
    this.stoppedThreshold = 0.05; // ACC magnitude variance <0.05 indicates stillness (G-force scale)
    this.minPeakDistance = 200;
    this.walkingCallback = null;
    this.walkingStoppedCallback = null;
    this.pendingStartConfirmation = false;
    this.pendingStopConfirmation = false;
    this.lastRejectionTime = 0;
    this.rejectionCooldown = 10000;
    this.lastStopTime = 0;
    this.stopCooldown = 5000; // 5 second cooldown after stopping
    this.categoriesSetup = false;
    this.handlerSetup = false;
    this.currentVariance = 0; // For debugging
    this.currentGyroMag = 0; // For debugging raw gyro values
    this.lastAccData = null; // Store last ACC data for UI debug display
    this.lastAccMag = 0; // Store last ACC magnitude for UI debug display
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
    
    // Store for UI debug display
    this.lastAccData = accData;
    this.lastAccMag = accMag;
    
    // Debug: Log first few values to understand the data
    if (this.accBuffer.length < 5) {
      console.log('DEBUG ACC buffer:', accData, '→ magnitude:', accMag.toFixed(3));
    }
    
    this.currentGyroMag = gyroMag; // Store for debugging
    this.gyroBuffer.push(gyroMag);
    this.accBuffer.push(accMag);
    
    if (this.gyroBuffer.length > 50) {
      this.gyroBuffer.shift();
      this.accBuffer.shift();
    }
    
    if (this.accBuffer.length >= 20) {
      const accVariance = this.calculateVariance(this.accBuffer);
      
      // Debug: Log variance calculation details every 50th time
      if (Math.random() < 0.02) {
        const min = Math.min(...this.accBuffer);
        const max = Math.max(...this.accBuffer);
        const mean = this.accBuffer.reduce((sum, val) => sum + val, 0) / this.accBuffer.length;
        console.log('VARIANCE DEBUG - Buffer min:', min.toFixed(3), 'max:', max.toFixed(3), 'mean:', mean.toFixed(3), 'variance:', accVariance.toFixed(3));
      }
      
      this.currentVariance = accVariance; // Store for debugging (now using ACC variance)
      
      const now = Date.now();
      const cooldownExpired = (now - this.lastRejectionTime) > this.rejectionCooldown;
      const stopCooldownExpired = (now - this.lastStopTime) > this.stopCooldown;
      
      // Use accelerometer variance for BOTH start and stop (consistent & reliable)
      // Walking creates high variance from bouncing, still arm has low variance
      const isLikelyWalking = accVariance > this.walkingThreshold;
      const isLikelyStopped = accVariance < this.stoppedThreshold;
      
      if (isLikelyWalking && !this.isWalking && !this.walkingSession && !this.pendingStartConfirmation && cooldownExpired && stopCooldownExpired) {
        this.pendingStartConfirmation = true;
        // Auto-start walking without notifications (production safe)
        if (this.walkingCallback) {
          this.walkingCallback();
        }
      } 
      else if (isLikelyStopped && this.isWalking && !this.pendingStopConfirmation) {
        this.pendingStopConfirmation = true;
        this.lastStopTime = now;
        // Auto-stop: Trigger callback to save session, then stop
        if (this.walkingStoppedCallback) {
          this.walkingStoppedCallback();
        }
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
    // Clear buffers to start fresh (remove any stale data)
    this.gyroBuffer = [];
    this.accBuffer = [];
    this.walkingSession = {
      startTime: new Date().toISOString(),
      steps: 0
    };
  }

  resetDetection() {
    // Complete reset of all detection state
    this.gyroBuffer = [];
    this.accBuffer = [];
    this.currentVariance = 0;
    this.currentGyroMag = 0;
    console.log('StepCounterService: Detection buffers reset');
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
    
    // Peak detection thresholds for G-force scale (magnitude ≈ 1.0 when still)
    const relativeThreshold = recentMean * 1.15; // 15% above mean
    const absoluteThreshold = 1.5; // Minimum acceleration magnitude to count as step (G-forces)
    
    // Must exceed BOTH thresholds AND have proper timing
    const isValidPeak = magnitude > relativeThreshold && 
                        magnitude > absoluteThreshold && 
                        (currentTime - this.lastPeakTime) > this.minPeakDistance;
    
    if (isValidPeak) {
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
    this.lastStopTime = 0;
    this.pendingStartConfirmation = false;
    this.pendingStopConfirmation = false;
  }

  getStepCount() {
    return this.stepCount;
  }

  getIsWalking() {
    return this.isWalking;
  }

  getCurrentVariance() {
    return this.currentVariance;
  }

  getCurrentGyroMag() {
    return this.currentGyroMag;
  }

  getGyroBufferStats() {
    if (this.gyroBuffer.length === 0) return { min: 0, max: 0, mean: 0 };
    const min = Math.min(...this.gyroBuffer);
    const max = Math.max(...this.gyroBuffer);
    const mean = this.gyroBuffer.reduce((sum, val) => sum + val, 0) / this.gyroBuffer.length;
    return { min, max, mean };
  }

  getAccBufferStats() {
    if (this.accBuffer.length === 0) return { min: 0, max: 0, mean: 0 };
    const min = Math.min(...this.accBuffer);
    const max = Math.max(...this.accBuffer);
    const mean = this.accBuffer.reduce((sum, val) => sum + val, 0) / this.accBuffer.length;
    return { min, max, mean };
  }

  getLastAccData() {
    return this.lastAccData || { x: 0, y: 0, z: 0 };
  }

  getLastAccMag() {
    return this.lastAccMag;
  }

  recordRejection() {
    this.lastRejectionTime = Date.now();
    this.pendingStartConfirmation = false;
    this.pendingStopConfirmation = false;
  }

  async addNotificationReceivedListener(callback) {
    const loaded = await this.loadNotifications();
    if (!loaded || !Notifications) return null;

    try {
      return Notifications.addNotificationReceivedListener(callback);
    } catch (error) {
      console.error('Error adding notification listener:', error);
      return null;
    }
  }

  async addNotificationResponseReceivedListener(callback) {
    const loaded = await this.loadNotifications();
    if (!loaded || !Notifications) return null;

    try {
      return Notifications.addNotificationResponseReceivedListener(callback);
    } catch (error) {
      console.error('Error adding notification response listener:', error);
      return null;
    }
  }

  removeNotificationSubscription(subscription) {
    if (!subscription || !Notifications) return;

    try {
      Notifications.removeNotificationSubscription(subscription);
    } catch (error) {
      console.error('Error removing notification subscription:', error);
    }
  }
}

export default new StepCounterService();
