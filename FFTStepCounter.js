import FFT from 'fft.js';

export class FFTStepCounter {
  constructor(sampleRate = 37) {
    this.sampleRate = sampleRate;
    this.windowSizeSeconds = 4;
    const idealSize = sampleRate * this.windowSizeSeconds;
    this.bufferSize = Math.pow(2, Math.round(Math.log2(idealSize)));
    this.fftInterval = 2000;
    
    this.magnitudeBuffer = new Array(this.bufferSize).fill(0);
    this.bufferIndex = 0;
    this.bufferFilled = false;
    
    this.lastFFTTime = 0;
    this.totalStepsFractional = 0;
    this.currentCadence = 0;
    this.isWalking = false;
    this.dominantFrequency = 0;
    this.peakMagnitude = 0;
    
    this.walkingFreqMin = 0.5;
    this.walkingFreqMax = 4.0;
    this.peakThreshold = 0.03; // Recalibrated after fixing ACC scale factor (16x correction)
    
    this.fft = new FFT(this.bufferSize);
    this.fftInput = new Array(this.bufferSize * 2);
    this.fftOutput = new Array(this.bufferSize * 2);
    
    this.lastStepTime = Date.now();
  }

  addAccSample(x, y, z) {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    
    this.magnitudeBuffer[this.bufferIndex] = magnitude;
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
      ordered[i] = this.magnitudeBuffer[(this.bufferIndex + i) % this.bufferSize];
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
      bufferFilled: this.bufferFilled
    };
  }

  reset() {
    this.magnitudeBuffer.fill(0);
    this.bufferIndex = 0;
    this.bufferFilled = false;
    this.totalStepsFractional = 0;
    this.currentCadence = 0;
    this.isWalking = false;
    this.dominantFrequency = 0;
    this.peakMagnitude = 0;
    this.lastFFTTime = 0;
    this.lastStepTime = Date.now();
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
