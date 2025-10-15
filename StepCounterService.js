import { FFTStepCounter } from './FFTStepCounter';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RIDGE_THRESHOLD_STORAGE_KEY = '@step_counter_ridge_threshold';
const FRAMES_TO_CONFIRM_KEY = '@step_counter_frames_to_confirm';

class StepCounterService {
  constructor() {
    this.fftCounter = new FFTStepCounter(37);
    this.debugLogs = [];
    this.maxLogs = 20;
    this.lastLogTime = 0;
    this.loadRidgeThreshold();
    this.loadFramesToConfirm();
  }

  async loadRidgeThreshold() {
    try {
      const savedThreshold = await AsyncStorage.getItem(RIDGE_THRESHOLD_STORAGE_KEY);
      if (savedThreshold !== null) {
        const threshold = parseFloat(savedThreshold);
        if (!isNaN(threshold) && threshold > 0) {
          this.fftCounter.setRidgeThreshold(threshold);
          console.log(`Loaded saved ridge threshold: ${threshold}`);
        }
      }
    } catch (error) {
      console.error('Error loading ridge threshold:', error);
    }
  }

  async loadFramesToConfirm() {
    try {
      const savedFrames = await AsyncStorage.getItem(FRAMES_TO_CONFIRM_KEY);
      if (savedFrames !== null) {
        const frames = parseInt(savedFrames);
        if (!isNaN(frames) && frames >= 1 && frames <= 10) {
          this.fftCounter.setFramesToConfirm(frames);
          console.log(`Loaded saved frames to confirm: ${frames}`);
        }
      }
    } catch (error) {
      console.error('Error loading frames to confirm:', error);
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
      this.log(`${walkingStatus} | ${stats.stepsPerMinute} spm | Axis: ${stats.dominantAxis} | Ridge: ${stats.ridgeFrequency} Hz | Strength: ${stats.ridgeStrength}`);
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

  async setRidgeThreshold(newThreshold) {
    const success = this.fftCounter.setRidgeThreshold(newThreshold);
    if (success) {
      try {
        await AsyncStorage.setItem(RIDGE_THRESHOLD_STORAGE_KEY, newThreshold.toString());
        console.log(`Saved ridge threshold to storage: ${newThreshold}`);
      } catch (error) {
        console.error('Error saving ridge threshold:', error);
      }
    }
    return success;
  }

  getRidgeThreshold() {
    return this.fftCounter.getRidgeThreshold();
  }

  async setFramesToConfirm(newFrames) {
    const success = this.fftCounter.setFramesToConfirm(newFrames);
    if (success) {
      try {
        await AsyncStorage.setItem(FRAMES_TO_CONFIRM_KEY, newFrames.toString());
        console.log(`Saved frames to confirm to storage: ${newFrames}`);
      } catch (error) {
        console.error('Error saving frames to confirm:', error);
      }
    }
    return success;
  }

  getFramesToConfirm() {
    return this.fftCounter.getFramesToConfirm();
  }

}

export default new StepCounterService();
