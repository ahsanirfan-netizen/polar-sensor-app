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
    this.peakTimestamps = []; // Track peak timing for rhythm detection
    this.sampleCount = 0; // Track total samples for debug logging
    this.lastLogTime = 0; // For periodic debug logging
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

  calculateRhythm() {
    // Need at least 4 peaks to detect rhythm
    if (this.peakTimestamps.length < 4) return 0;
    
    // Calculate intervals between consecutive peaks
    const intervals = [];
    for (let i = 1; i < this.peakTimestamps.length; i++) {
      intervals.push(this.peakTimestamps[i] - this.peakTimestamps[i - 1]);
    }
    
    // Calculate coefficient of variation (CV)
    // Walking has consistent intervals (~500ms) with low CV (<0.3)
    // Random arm movements have irregular intervals with high CV (>0.8)
    const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + (val - mean) ** 2, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;
    
    // Convert CV to rhythm score: 0 = random, 1 = very rhythmic
    const rhythmScore = Math.max(0, Math.min(1, 1 - cv));
    return rhythmScore;
  }

  detectStep(accData) {
    const magnitude = this.calculateMagnitude(accData);
    const currentTime = Date.now();
    this.sampleCount++;
    
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
    
    // Use MINIMUM as baseline - ignores all peaks, no drift
    // Apply floor at 0.8G to prevent noise from driving threshold too low
    const rawBaseline = Math.min(...this.accBuffer);
    const baseline = Math.max(0.8, rawBaseline);
    
    // Peak detection: Must be 0.25G above baseline
    // Rhythm detection handles false positives, so we can be more sensitive
    const peakThreshold = baseline + 0.25;
    
    // Log magnitude/threshold every 1 second for debugging
    if (currentTime - this.lastLogTime > 1000) {
      this.log(`Mag: ${magnitude.toFixed(2)} | Base: ${baseline.toFixed(2)} | Thresh: ${peakThreshold.toFixed(2)}`);
      this.lastLogTime = currentTime;
    }
    
    const isPeak = magnitude > peakThreshold && 
                   (currentTime - this.lastPeakTime) > this.minPeakDistance;
    
    if (isPeak) {
      // Reset stale timestamps if gap > 2 seconds (indicates stop in walking)
      if (this.peakTimestamps.length > 0) {
        const lastPeakTime = this.peakTimestamps[this.peakTimestamps.length - 1];
        const gap = currentTime - lastPeakTime;
        if (gap > 2000) {
          this.peakTimestamps = [];
          this.log(`Rhythm reset (${(gap/1000).toFixed(1)}s idle)`);
        }
      }
      
      // Track peak timing for rhythm detection
      this.peakTimestamps.push(currentTime);
      if (this.peakTimestamps.length > 10) {
        this.peakTimestamps.shift(); // Keep last 10 peaks only
      }
      
      // Need at least 4 peaks to calculate rhythm - don't count until then
      if (this.peakTimestamps.length < 4) {
        this.log(`Peak ${this.peakTimestamps.length}/4 (building rhythm)`);
        return false;
      }
      
      // Calculate rhythm score
      const rhythmScore = this.calculateRhythm();
      
      // Count as step ONLY if rhythm is detected (score > 0.2)
      if (rhythmScore > 0.2) {
        this.lastPeakTime = currentTime;
        this.stepCount++;
        this.log(`Step #${this.stepCount} | Mag: ${magnitude.toFixed(2)} | Rhythm: ${rhythmScore.toFixed(2)}`);
        return true;
      } else {
        this.log(`Peak ignored (no rhythm) | Mag: ${magnitude.toFixed(2)} | Rhythm: ${rhythmScore.toFixed(2)}`);
      }
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
    this.peakTimestamps = [];
    this.debugLogs = [];
    this.sampleCount = 0;
    this.lastLogTime = 0;
    this.log('Counter reset');
  }
}

export default new StepCounterService();
