// Simple diagnostic service to measure ACC data rate
class DataRateMonitor {
  constructor() {
    this.sampleCount = 0;
    this.startTime = null;
    this.lastSampleTime = null;
  }

  addSample() {
    const now = Date.now();
    
    if (!this.startTime) {
      this.startTime = now;
    }
    
    this.sampleCount++;
    this.lastSampleTime = now;
  }

  getStats() {
    if (!this.startTime) {
      return {
        totalSamples: 0,
        elapsedSeconds: 0,
        currentRate: 0,
        expectedRate: 52
      };
    }

    const elapsedMs = this.lastSampleTime - this.startTime;
    const elapsedSeconds = elapsedMs / 1000;
    const currentRate = elapsedSeconds > 0 ? this.sampleCount / elapsedSeconds : 0;

    return {
      totalSamples: this.sampleCount,
      elapsedSeconds: elapsedSeconds.toFixed(1),
      currentRate: currentRate.toFixed(1),
      expectedRate: 52
    };
  }

  reset() {
    this.sampleCount = 0;
    this.startTime = null;
    this.lastSampleTime = null;
  }
}

export default new DataRateMonitor();
