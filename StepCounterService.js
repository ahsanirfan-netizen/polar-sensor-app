// Ultra-minimal step counter - just ACC magnitude-based peak detection

class StepCounterService {
  constructor() {
    this.stepCount = 0;
    this.lastPeakTime = 0;
    this.minPeakDistance = 200; // Minimum 200ms between steps (max ~3 steps/sec)
    this.accBuffer = [];
    this.maxBufferSize = 20; // Keep last 20 samples (~1 second at 50ms rate)
    this.debugLogs = []; // Store logs for UI display
    this.maxLogs = 20; // Keep last 20 log entries
  }

  calculateMagnitude(acc) {
    if (!acc || acc.x === undefined) return 0;
    return Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.debugLogs.push(`[${timestamp}] ${message}`);
    if (this.debugLogs.length > this.maxLogs) {
      this.debugLogs.shift();
    }
  }

  detectStep(accData) {
    const magnitude = this.calculateMagnitude(accData);
    const currentTime = Date.now();
    
    // Log first sample
    if (this.stepCount === 0 && this.accBuffer.length === 0) {
      this.log('First ACC sample received');
    }
    
    // Add to buffer
    this.accBuffer.push(magnitude);
    if (this.accBuffer.length > this.maxBufferSize) {
      this.accBuffer.shift();
    }
    
    // Need at least 10 samples to establish baseline
    if (this.accBuffer.length < 10) return false;
    
    // Use minimum of buffer as baseline (gravity when still ~1.0G)
    const baseline = Math.min(...this.accBuffer);
    
    // Peak detection: 0.25G above baseline, minimum 1.15G absolute
    const peakThreshold = baseline + 0.25;
    const absoluteMinimum = 1.15;
    
    const isValidPeak = magnitude > peakThreshold && 
                        magnitude > absoluteMinimum && 
                        (currentTime - this.lastPeakTime) > this.minPeakDistance;
    
    if (isValidPeak) {
      this.lastPeakTime = currentTime;
      this.stepCount++;
      this.log(`Step #${this.stepCount} | Mag: ${magnitude.toFixed(2)} | Base: ${baseline.toFixed(2)}`);
      return true;
    }
    
    return false;
  }

  getStepCount() {
    return this.stepCount;
  }

  getDebugLogs() {
    return [...this.debugLogs]; // Return new array copy so React detects changes
  }

  reset() {
    this.stepCount = 0;
    this.lastPeakTime = 0;
    this.accBuffer = [];
    this.debugLogs = [];
    this.log('Counter reset');
  }
}

export default new StepCounterService();
