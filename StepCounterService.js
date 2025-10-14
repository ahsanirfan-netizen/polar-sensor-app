import { FFTStepCounter } from './FFTStepCounter';

class StepCounterService {
  constructor() {
    this.fftCounter = new FFTStepCounter(37);
    this.debugLogs = [];
    this.maxLogs = 20;
    this.lastLogTime = 0;
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.debugLogs.push(`[${timestamp}] ${message}`);
    if (this.debugLogs.length > this.maxLogs) {
      this.debugLogs.shift();
    }
  }

  detectStep(accData) {
    if (!accData || accData.x === undefined) return false;
    
    this.fftCounter.addAccSample(accData.x, accData.y, accData.z);
    
    const stats = this.fftCounter.getStats();
    const currentTime = Date.now();
    
    if (stats.bufferFilled && currentTime - this.lastLogTime > 5000) {
      const walkingStatus = stats.isWalking ? 'WALKING' : 'still';
      this.log(`${walkingStatus} | ${stats.stepsPerMinute} spm | Freq: ${stats.dominantFrequency} Hz | Peak: ${stats.peakMagnitude}`);
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
}

export default new StepCounterService();
