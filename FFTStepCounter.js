import FFT from 'fft.js';

export class FFTStepCounter {
  constructor(sampleRate = 37) {
    this.sampleRate = sampleRate;
    this.windowSizeSeconds = 4;
    const idealSize = sampleRate * this.windowSizeSeconds;
    this.bufferSize = Math.pow(2, Math.round(Math.log2(idealSize)));
    this.fftInterval = 2000;
    
    this.gyroBuffer = new Array(this.bufferSize).fill(0);
    this.bufferIndex = 0;
    this.bufferFilled = false;
    
    // Variance tracking for dominant axis selection
    this.gyroXBuffer = [];
    this.gyroYBuffer = [];
    this.gyroZBuffer = [];
    this.varianceWindowSize = 50; // Samples for variance calculation
    
    this.lastFFTTime = 0;
    this.totalStepsFractional = 0;
    this.currentCadence = 0;
    this.isWalking = false;
    this.dominantFrequency = 0;
    this.peakMagnitude = 0;
    this.dominantAxis = 'y'; // Default to Y axis
    
    this.walkingFreqMin = 0.5;
    this.walkingFreqMax = 4.0;
    this.peakThreshold = 0.03;
    
    this.fft = new FFT(this.bufferSize);
    this.fftInput = new Array(this.bufferSize * 2);
    this.fftOutput = new Array(this.bufferSize * 2);
    
    this.lastStepTime = Date.now();
  }

  selectDominantAxis(x, y, z) {
    // Add to variance tracking buffers
    this.gyroXBuffer.push(x);
    this.gyroYBuffer.push(y);
    this.gyroZBuffer.push(z);
    
    // Keep only recent samples
    if (this.gyroXBuffer.length > this.varianceWindowSize) {
      this.gyroXBuffer.shift();
      this.gyroYBuffer.shift();
      this.gyroZBuffer.shift();
    }
    
    // Calculate variance for each axis (every 50 samples)
    if (this.gyroXBuffer.length === this.varianceWindowSize) {
      const varianceX = this.calculateVariance(this.gyroXBuffer);
      const varianceY = this.calculateVariance(this.gyroYBuffer);
      const varianceZ = this.calculateVariance(this.gyroZBuffer);
      
      // Select axis with highest variance (most motion)
      if (varianceX >= varianceY && varianceX >= varianceZ) {
        this.dominantAxis = 'x';
        return x;
      } else if (varianceY >= varianceX && varianceY >= varianceZ) {
        this.dominantAxis = 'y';
        return y;
      } else {
        this.dominantAxis = 'z';
        return z;
      }
    }
    
    // Default to current dominant axis value
    if (this.dominantAxis === 'x') return x;
    if (this.dominantAxis === 'y') return y;
    return z;
  }

  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  addGyroSample(x, y, z) {
    // Select dominant axis based on variance
    const dominantValue = this.selectDominantAxis(x, y, z);
    
    this.gyroBuffer[this.bufferIndex] = dominantValue;
    this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
    
    if (this.bufferIndex === 0 && !this.bufferFilled) {
      this.bufferFilled = true;
    }
    
    const now = Date.now();
    if (this.bufferFilled && now - this.lastFFTTime >= this.fftInterval) {
      this.runFFTAnalysis();
      this.lastFFTTime = now;
    }
  }

  runFFTAnalysis() {
    const orderedBuffer = this.getOrderedBuffer();
    
    const mean = orderedBuffer.reduce((sum, val) => sum + val, 0) / orderedBuffer.length;
    
    for (let i = 0; i < this.bufferSize; i++) {
      this.fftInput[i * 2] = orderedBuffer[i] - mean;
      this.fftInput[i * 2 + 1] = 0;
    }
    
    this.fft.transform(this.fftOutput, this.fftInput);
    
    this.analyzSpectrum();
  }

  getOrderedBuffer() {
    const ordered = new Array(this.bufferSize);
    for (let i = 0; i < this.bufferSize; i++) {
      ordered[i] = this.gyroBuffer[(this.bufferIndex + i) % this.bufferSize];
    }
    return ordered;
  }

  analyzSpectrum() {
    const freqResolution = this.sampleRate / this.bufferSize;
    
    const minBin = Math.ceil(this.walkingFreqMin / freqResolution);
    const maxBin = Math.floor(this.walkingFreqMax / freqResolution);
    
    let maxMagnitude = 0;
    let peakBin = 0;
    
    for (let i = minBin; i <= maxBin && i < this.bufferSize / 2; i++) {
      const real = this.fftOutput[i * 2];
      const imag = this.fftOutput[i * 2 + 1];
      const magnitude = Math.sqrt(real * real + imag * imag);
      
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
        peakBin = i;
      }
    }
    
    const normalizedMagnitude = maxMagnitude / this.bufferSize;
    
    this.peakMagnitude = normalizedMagnitude;
    this.dominantFrequency = peakBin * freqResolution;
    
    const wasWalking = this.isWalking;
    this.isWalking = normalizedMagnitude > this.peakThreshold && this.dominantFrequency >= this.walkingFreqMin;
    
    if (this.isWalking) {
      this.currentCadence = this.dominantFrequency * 2;
      
      const now = Date.now();
      let elapsed = (now - this.lastStepTime) / 1000;
      
      elapsed = Math.min(elapsed, this.fftInterval / 1000);
      
      const stepsInInterval = this.currentCadence * elapsed;
      this.totalStepsFractional += stepsInInterval;
      
      this.lastStepTime = now;
    } else {
      this.currentCadence = 0;
      if (wasWalking) {
        this.lastStepTime = Date.now();
      }
    }
  }

  getStats() {
    return {
      totalSteps: Math.round(this.totalStepsFractional),
      isWalking: this.isWalking,
      cadence: this.currentCadence,
      stepsPerMinute: Math.round(this.currentCadence * 60),
      dominantFrequency: this.dominantFrequency.toFixed(2),
      peakMagnitude: this.peakMagnitude.toFixed(3),
      bufferFilled: this.bufferFilled,
      dominantAxis: this.dominantAxis
    };
  }

  reset() {
    this.gyroBuffer.fill(0);
    this.gyroXBuffer = [];
    this.gyroYBuffer = [];
    this.gyroZBuffer = [];
    this.bufferIndex = 0;
    this.bufferFilled = false;
    this.totalStepsFractional = 0;
    this.currentCadence = 0;
    this.isWalking = false;
    this.dominantFrequency = 0;
    this.peakMagnitude = 0;
    this.lastFFTTime = 0;
    this.lastStepTime = Date.now();
    this.dominantAxis = 'y';
  }

  setThreshold(newThreshold) {
    const threshold = parseFloat(newThreshold);
    if (!isNaN(threshold) && threshold > 0 && threshold < 1) {
      this.peakThreshold = threshold;
      return true;
    }
    return false;
  }

  getThreshold() {
    return this.peakThreshold;
  }
}
