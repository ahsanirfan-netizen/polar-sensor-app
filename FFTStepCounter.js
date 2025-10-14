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
    
    // Gyro scale factor to normalize values to ACC-like range (0-5)
    // Typical gyro walking values are 1000-5000, divide by 1000
    this.gyroScaleFactor = 1000;
    
    this.lastFFTTime = 0;
    this.totalStepsFractional = 0;
    this.currentCadence = 0;
    this.isWalking = false;
    this.dominantFrequency = 0;
    this.peakMagnitude = 0;
    this.dominantAxis = 'y'; // Default to Y axis
    
    // Consecutive frame tracking for confirmation
    this.consecutiveWalkingFrames = 0;
    this.consecutiveStationaryFrames = 0;
    this.framesToConfirm = 3; // Require 3 consecutive frames (6 seconds)
    this.isConfirmedWalking = false;
    
    this.walkingFreqMin = 0.5;
    this.walkingFreqMax = 4.0;
    this.peakThreshold = 0.03; // Keep for legacy/fallback
    
    // Moving average for adaptive threshold
    this.maWindowSize = 15; // Default: 15 samples = 30 seconds of history
    this.peakHistory = [];
    this.movingAverage = 0;
    this.maBootstrapMin = 5; // Minimum samples before enabling adaptive detection
    this.maMultiplier = 1.15; // Peak must be 15% above MA to trigger walking
    this.maFloorClamp = 0.02; // Minimum threshold to prevent MA collapse
    
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

  updateMovingAverage(newPeak) {
    // Add new peak to history
    this.peakHistory.push(newPeak);
    
    // Keep only last N samples (circular buffer)
    if (this.peakHistory.length > this.maWindowSize) {
      this.peakHistory.shift();
    }
    
    // Calculate moving average
    if (this.peakHistory.length > 0) {
      const sum = this.peakHistory.reduce((acc, val) => acc + val, 0);
      this.movingAverage = sum / this.peakHistory.length;
    }
  }

  getAdaptiveThreshold() {
    // Bootstrap: use fixed threshold until we have enough samples
    if (this.peakHistory.length < this.maBootstrapMin) {
      return this.peakThreshold;
    }
    
    // Adaptive threshold: MA * multiplier, but never below floor clamp
    return Math.max(this.movingAverage * this.maMultiplier, this.maFloorClamp);
  }

  addGyroSample(x, y, z) {
    // Select dominant axis based on variance
    const dominantValue = this.selectDominantAxis(x, y, z);
    
    // Normalize gyro value to ACC-like range (0-5) for consistent FFT scaling
    this.gyroBuffer[this.bufferIndex] = dominantValue / this.gyroScaleFactor;
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
    
    // Use adaptive threshold instead of fixed
    const adaptiveThreshold = this.getAdaptiveThreshold();
    const wasConfirmedWalking = this.isConfirmedWalking;
    this.isWalking = normalizedMagnitude > adaptiveThreshold && this.dominantFrequency >= this.walkingFreqMin;
    
    // Update MA only when NOT walking (track stationary baseline only)
    if (!this.isWalking) {
      this.updateMovingAverage(normalizedMagnitude);
    }
    
    // Update consecutive frame counters
    if (this.isWalking) {
      this.consecutiveWalkingFrames++;
      this.consecutiveStationaryFrames = 0;
    } else {
      this.consecutiveStationaryFrames++;
      this.consecutiveWalkingFrames = 0;
    }
    
    // Confirm walking only after N consecutive frames
    if (this.consecutiveWalkingFrames >= this.framesToConfirm) {
      this.isConfirmedWalking = true;
    } else if (this.consecutiveStationaryFrames >= this.framesToConfirm) {
      this.isConfirmedWalking = false;
    }
    
    // Only count steps when BOTH confirmed walking AND currently detected
    // This prevents counting during the stop-confirmation window
    if (this.isConfirmedWalking && this.isWalking) {
      // Gyro measures arm swing frequency, which equals step frequency (no doubling needed)
      // Cap at realistic walking/running cadence: 0.8-3.5 Hz = 48-210 steps/min
      const minCadence = 0.8; // 48 steps/min (very slow walking)
      const maxCadence = 3.5; // 210 steps/min (fast running)
      this.currentCadence = Math.max(minCadence, Math.min(this.dominantFrequency, maxCadence));
      
      const now = Date.now();
      let elapsed = (now - this.lastStepTime) / 1000;
      
      elapsed = Math.min(elapsed, this.fftInterval / 1000);
      
      const stepsInInterval = this.currentCadence * elapsed;
      this.totalStepsFractional += stepsInInterval;
      
      this.lastStepTime = now;
    } else {
      this.currentCadence = 0;
      if (wasConfirmedWalking) {
        this.lastStepTime = Date.now();
      }
    }
  }

  getStats() {
    return {
      totalSteps: Math.round(this.totalStepsFractional),
      isWalking: this.isWalking,
      isConfirmedWalking: this.isConfirmedWalking,
      consecutiveWalkingFrames: this.consecutiveWalkingFrames,
      consecutiveStationaryFrames: this.consecutiveStationaryFrames,
      cadence: this.currentCadence,
      stepsPerMinute: Math.round(this.currentCadence * 60),
      dominantFrequency: this.dominantFrequency.toFixed(2),
      peakMagnitude: this.peakMagnitude.toFixed(3),
      movingAverage: this.movingAverage.toFixed(3),
      adaptiveThreshold: this.getAdaptiveThreshold().toFixed(3),
      maWindowSize: this.maWindowSize,
      maSampleCount: this.peakHistory.length,
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
    this.peakHistory = []; // Clear MA history
    this.movingAverage = 0;
    this.consecutiveWalkingFrames = 0;
    this.consecutiveStationaryFrames = 0;
    this.isConfirmedWalking = false;
    this.lastFFTTime = 0;
    this.lastStepTime = Date.now();
    this.dominantAxis = 'y';
  }

  setThreshold(newThreshold) {
    const threshold = parseFloat(newThreshold);
    if (!isNaN(threshold) && threshold > 0) {
      this.peakThreshold = threshold;
      return true;
    }
    return false;
  }

  getThreshold() {
    return this.peakThreshold;
  }

  setMAWindowSize(newSize) {
    const size = parseInt(newSize);
    if (!isNaN(size) && size >= 5 && size <= 60) {
      this.maWindowSize = size;
      // Trim history if new size is smaller
      while (this.peakHistory.length > this.maWindowSize) {
        this.peakHistory.shift();
      }
      return true;
    }
    return false;
  }

  getMAWindowSize() {
    return this.maWindowSize;
  }
}
