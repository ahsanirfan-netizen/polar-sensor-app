import { FFTStepCounter } from './FFTStepCounter';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THRESHOLD_STORAGE_KEY = '@step_counter_threshold';

class StepCounterService {
  constructor() {
    this.fftCounter = new FFTStepCounter(37);
    this.debugLogs = [];
    this.maxLogs = 20;
    this.lastLogTime = 0;
    this.loadThreshold();
  }

  async loadThreshold() {
    try {
      const savedThreshold = await AsyncStorage.getItem(THRESHOLD_STORAGE_KEY);
      if (savedThreshold !== null) {
        const threshold = parseFloat(savedThreshold);
        if (!isNaN(threshold) && threshold > 0 && threshold < 1) {
          this.fftCounter.setThreshold(threshold);
          console.log(`Loaded saved threshold: ${threshold}`);
        }
      }
    } catch (error) {
      console.error('Error loading threshold:', error);
    }
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.debugLogs.push(`[${timestamp}] ${message}`);
    if (this.debugLogs.length > this.maxLogs) {
      this.debugLogs.shift();
    }
  }

  detectStep(gyroData) {
    if (!gyroData || gyroData.x === undefined) return false;
    
    this.fftCounter.addGyroSample(gyroData.x, gyroData.y, gyroData.z);
    
    const stats = this.fftCounter.getStats();
    const currentTime = Date.now();
    
    if (stats.bufferFilled && currentTime - this.lastLogTime > 5000) {
      const walkingStatus = stats.isWalking ? 'WALKING' : 'still';
      this.log(`${walkingStatus} | ${stats.stepsPerMinute} spm | Axis: ${stats.dominantAxis} | Freq: ${stats.dominantFrequency} Hz | Peak: ${stats.peakMagnitude}`);
      this.lastLogTime = currentTime;
    }
    
    return stats.isWalking;
  }

  getStepCount() {
    return this.fftCounter.getStats().totalSteps;
  }

  getDebugLogs() {
    return [...this.debugLogs];
  }

  getFFTStats() {
    return this.fftCounter.getStats();
  }

  reset() {
    this.fftCounter.reset();
    this.debugLogs = [];
    this.lastLogTime = 0;
    this.log('FFT Step Counter reset');
  }

  async setThreshold(newThreshold) {
    const success = this.fftCounter.setThreshold(newThreshold);
    if (success) {
      try {
        await AsyncStorage.setItem(THRESHOLD_STORAGE_KEY, newThreshold.toString());
        console.log(`Saved threshold to storage: ${newThreshold}`);
      } catch (error) {
        console.error('Error saving threshold:', error);
      }
    }
    return success;
  }

  getThreshold() {
    return this.fftCounter.getThreshold();
  }
}

export default new StepCounterService();
