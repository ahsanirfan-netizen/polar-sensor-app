// Frequency-domain step counter using FFT
// Based on research: walking cadence = dominant frequency in 0.5-4 Hz range
// More robust than peak detection - analyzes rhythm patterns

import FFT from 'fft.js';

class WaveletStepCounter {
  constructor() {
    this.stepCount = 0;
    this.sampleRate = 20; // Hz - assuming ~50ms sampling from BLE
    this.windowSize = 1.0; // 1 second windows
    this.samplesPerWindow = Math.round(this.sampleRate * this.windowSize);
    
    // FFT size must be power of 2
    this.fftSize = 32; // Nearest power of 2 >= samplesPerWindow
    this.fft = new FFT(this.fftSize);
    
    this.magnitudeBuffer = [];
    this.debugLogs = [];
    this.maxLogs = 20;
    
    // Walking frequency range
    this.minFreq = 0.5; // 30 steps/min
    this.maxFreq = 4.0;  // 240 steps/min
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.debugLogs.push(`[${timestamp}] ${message}`);
    if (this.debugLogs.length > this.maxLogs) {
      this.debugLogs.shift();
    }
  }

  calculateMagnitude(acc) {
    if (!acc || acc.x === undefined) return 0;
    return Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  }

  findDominantFrequency(fftOutput) {
    // Convert FFT output to power spectrum
    const powerSpectrum = [];
    for (let i = 0; i < this.fftSize / 2; i++) {
      const real = fftOutput[2 * i];
      const imag = fftOutput[2 * i + 1];
      powerSpectrum.push(real * real + imag * imag);
    }

    // Find peak in walking frequency range
    const freqResolution = this.sampleRate / this.fftSize;
    const minBin = Math.ceil(this.minFreq / freqResolution);
    const maxBin = Math.floor(this.maxFreq / freqResolution);

    let maxPower = 0;
    let peakBin = 0;
    
    for (let i = minBin; i <= maxBin && i < powerSpectrum.length; i++) {
      if (powerSpectrum[i] > maxPower) {
        maxPower = powerSpectrum[i];
        peakBin = i;
      }
    }

    // Convert bin to frequency
    const dominantFreq = peakBin * freqResolution;
    
    // Confidence check: power must be significant
    const avgPower = powerSpectrum.reduce((sum, p) => sum + p, 0) / powerSpectrum.length;
    const confidence = maxPower / (avgPower + 1e-10); // Avoid division by zero
    
    return { frequency: dominantFreq, confidence: confidence };
  }

  processWindow() {
    if (this.magnitudeBuffer.length < this.samplesPerWindow) {
      return 0; // Not enough data
    }

    // Prepare data for FFT (pad or truncate to fftSize)
    const input = new Float32Array(this.fftSize);
    for (let i = 0; i < this.fftSize; i++) {
      if (i < this.magnitudeBuffer.length) {
        input[i] = this.magnitudeBuffer[i];
      } else {
        input[i] = 0; // Zero padding
      }
    }

    // Remove DC component (mean)
    const mean = input.reduce((sum, val) => sum + val, 0) / input.length;
    for (let i = 0; i < input.length; i++) {
      input[i] -= mean;
    }

    // Apply FFT
    const complexInput = new Array(this.fftSize * 2);
    for (let i = 0; i < this.fftSize; i++) {
      complexInput[2 * i] = input[i];      // Real part
      complexInput[2 * i + 1] = 0;         // Imaginary part
    }

    const output = this.fft.createComplexArray();
    this.fft.transform(output, complexInput);

    // Find dominant frequency
    const result = this.findDominantFrequency(output);
    
    // Count steps if confident
    let windowSteps = 0;
    if (result.confidence > 5.0 && result.frequency >= this.minFreq) {
      // Frequency = steps per second in this window
      windowSteps = result.frequency * this.windowSize;
      this.log(`Window: ${result.frequency.toFixed(2)} Hz, ${windowSteps.toFixed(1)} steps (conf: ${result.confidence.toFixed(1)})`);
    } else {
      this.log(`Window: No walking detected (freq: ${result.frequency.toFixed(2)}, conf: ${result.confidence.toFixed(1)})`);
    }

    // Clear buffer for next window
    this.magnitudeBuffer = [];
    
    return windowSteps;
  }

  detectStep(accData) {
    const magnitude = this.calculateMagnitude(accData);
    
    // Log first sample
    if (this.stepCount === 0 && this.magnitudeBuffer.length === 0) {
      this.log('FFT step counter started');
    }

    // Add to buffer
    this.magnitudeBuffer.push(magnitude);

    // Process window when full
    if (this.magnitudeBuffer.length >= this.samplesPerWindow) {
      const windowSteps = this.processWindow();
      this.stepCount += Math.round(windowSteps);
      return windowSteps > 0;
    }

    return false;
  }

  getStepCount() {
    return this.stepCount;
  }

  getDebugLogs() {
    return [...this.debugLogs];
  }

  reset() {
    this.stepCount = 0;
    this.magnitudeBuffer = [];
    this.debugLogs = [];
    this.log('FFT counter reset');
  }
}

export default new WaveletStepCounter();
