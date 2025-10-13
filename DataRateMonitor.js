// Simple diagnostic service to measure ACC data rate
class DataRateMonitor {
  constructor() {
    this.sampleCount = 0;
    this.packetCount = 0;
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

  addPacket() {
    this.packetCount++;
  }

  getStats() {
    if (!this.startTime) {
      return {
        totalSamples: 0,
        totalPackets: 0,
        elapsedSeconds: 0,
        sampleRate: 0,
        packetRate: 0,
        samplesPerPacket: 0,
        expectedSampleRate: 37,
        expectedPacketRate: 0.5,
        expectedSamplesPerPacket: 71
      };
    }

    const elapsedMs = this.lastSampleTime - this.startTime;
    const elapsedSeconds = elapsedMs / 1000;
    const sampleRate = elapsedSeconds > 0 ? this.sampleCount / elapsedSeconds : 0;
    const packetRate = elapsedSeconds > 0 ? this.packetCount / elapsedSeconds : 0;
    const samplesPerPacket = this.packetCount > 0 ? this.sampleCount / this.packetCount : 0;

    return {
      totalSamples: this.sampleCount,
      totalPackets: this.packetCount,
      elapsedSeconds: elapsedSeconds.toFixed(1),
      sampleRate: sampleRate.toFixed(1),
      packetRate: packetRate.toFixed(1),
      samplesPerPacket: samplesPerPacket.toFixed(1),
      expectedSampleRate: 37,
      expectedPacketRate: 0.5,
      expectedSamplesPerPacket: 71
    };
  }

  reset() {
    this.sampleCount = 0;
    this.packetCount = 0;
    this.startTime = null;
    this.lastSampleTime = null;
  }
}

export default new DataRateMonitor();
