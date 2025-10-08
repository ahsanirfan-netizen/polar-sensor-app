import { Platform } from 'react-native';

// Lazy load native module to prevent crashes on import
let HealthConnect = null;

class HealthConnectService {
  constructor() {
    this.isInitialized = false;
    this.hasPermissions = false;
  }

  async loadHealthConnect() {
    if (HealthConnect) return true;
    
    try {
      HealthConnect = await import('react-native-health-connect');
      return true;
    } catch (error) {
      console.error('Failed to load react-native-health-connect:', error);
      return false;
    }
  }

  async initializeHealthConnect() {
    if (Platform.OS !== 'android') {
      console.log('Health Connect is Android-only');
      return false;
    }

    const loaded = await this.loadHealthConnect();
    if (!loaded) {
      console.log('Health Connect module not available');
      return false;
    }

    try {
      const status = await HealthConnect.getSdkStatus();
      if (status !== 3) {
        console.log('Health Connect not available. Status:', status);
        return false;
      }

      this.isInitialized = await HealthConnect.initialize();
      console.log('Health Connect initialized:', this.isInitialized);
      return this.isInitialized;
    } catch (error) {
      console.error('Error initializing Health Connect:', error);
      return false;
    }
  }

  async requestPermissions() {
    if (!this.isInitialized) {
      const initialized = await this.initializeHealthConnect();
      if (!initialized || !HealthConnect) return false;
    }

    try {
      const permissions = await HealthConnect.requestPermission([
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'write', recordType: 'Steps' },
        { accessType: 'read', recordType: 'Distance' },
        { accessType: 'write', recordType: 'Distance' },
        { accessType: 'read', recordType: 'HeartRate' },
        { accessType: 'write', recordType: 'HeartRate' },
        { accessType: 'read', recordType: 'SleepSession' },
        { accessType: 'write', recordType: 'SleepSession' },
      ]);

      this.hasPermissions = permissions.some(p => p.recordType === 'Steps' && p.accessType === 'write');
      console.log('Health Connect permissions granted:', this.hasPermissions);
      return this.hasPermissions;
    } catch (error) {
      console.error('Error requesting Health Connect permissions:', error);
      return false;
    }
  }

  async syncStepsToHealthConnect(steps, startTime, endTime) {
    if (!this.hasPermissions) {
      const granted = await this.requestPermissions();
      if (!granted || !HealthConnect) {
        console.log('Health Connect permissions not granted');
        return false;
      }
    }

    try {
      const result = await HealthConnect.insertRecords([
        {
          recordType: 'Steps',
          count: steps,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        },
      ]);

      console.log('Steps synced to Health Connect:', result);
      return true;
    } catch (error) {
      console.error('Error syncing steps to Health Connect:', error);
      return false;
    }
  }

  async syncSleepToHealthConnect(sleepOnset, wakeTime, stages = null) {
    if (!this.hasPermissions) {
      const granted = await this.requestPermissions();
      if (!granted || !HealthConnect) {
        console.log('Health Connect permissions not granted');
        return false;
      }
    }

    try {
      const sleepRecord = {
        recordType: 'SleepSession',
        startTime: new Date(sleepOnset).toISOString(),
        endTime: new Date(wakeTime).toISOString(),
      };

      if (stages) {
        sleepRecord.stages = stages;
      }

      const result = await HealthConnect.insertRecords([sleepRecord]);

      console.log('Sleep synced to Health Connect:', result);
      return true;
    } catch (error) {
      console.error('Error syncing sleep to Health Connect:', error);
      return false;
    }
  }

  async syncHeartRateToHealthConnect(heartRate, timestamp) {
    if (!this.hasPermissions) {
      const granted = await this.requestPermissions();
      if (!granted || !HealthConnect) return false;
    }

    try {
      const result = await HealthConnect.insertRecords([
        {
          recordType: 'HeartRate',
          time: new Date(timestamp).toISOString(),
          beatsPerMinute: heartRate,
        },
      ]);

      return true;
    } catch (error) {
      console.error('Error syncing heart rate to Health Connect:', error);
      return false;
    }
  }

  async getTodaySteps() {
    if (!this.hasPermissions) {
      const granted = await this.requestPermissions();
      if (!granted || !HealthConnect) return 0;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await HealthConnect.readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: today.toISOString(),
          endTime: endOfDay.toISOString(),
        },
      });

      const totalSteps = result.records.reduce((sum, record) => sum + record.count, 0);
      return totalSteps;
    } catch (error) {
      console.error('Error reading steps from Health Connect:', error);
      return 0;
    }
  }
}

export default new HealthConnectService();
