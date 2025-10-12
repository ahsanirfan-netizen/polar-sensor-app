// Frequency-domain step counter using FFT
// Based on research: walking cadence = dominant frequency in 0.5-4 Hz range
// More robust than peak detection - analyzes rhythm patterns

import FFT from 'fft.js';

class WaveletStepCounter {
  constructor() {
    this.stepCount = 0;
    this.sampleRate = 52; // Hz - Polar Verity Sense ACC actual sampling rate
    this.windowSize = 1.0; // 1 second windows
    this.samplesPerWindow = Math.round(this.sampleRate * this.windowSize);
    
    // FFT size must be power of 2
    this.fftSize = 64; // Nearest power of 2 >= 52 samples
    this.fft = new FFT(this.fftSize);
    
    this.magnitudeBuffer = [];
    this.debugLogs = [];
    this.maxLogs = 30;
    this.totalSamples = 0;
    this.windowsProcessed = 0;
    this.firstSampleTime = null;
    this.lastSampleTime = null;
    
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

    this.windowsProcessed++;

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
    
    // Count steps - use MUCH lower confidence threshold
    let windowSteps = 0;
    if (result.confidence > 2.0 && result.frequency >= this.minFreq && result.frequency <= this.maxFreq) {
      // Frequency = steps per second in this window
      windowSteps = result.frequency * this.windowSize;
      this.log(`Win${this.windowsProcessed}: ${result.frequency.toFixed(2)}Hz → ${windowSteps.toFixed(1)} steps (conf:${result.confidence.toFixed(1)})`);
    } else {
      this.log(`Win${this.windowsProcessed}: Rejected ${result.frequency.toFixed(2)}Hz (conf:${result.confidence.toFixed(1)})`);
    }

    // Clear buffer for next window
    this.magnitudeBuffer = [];
    
    return windowSteps;
  }

  detectStep(accData) {
    try {
      const now = Date.now();
      const magnitude = this.calculateMagnitude(accData);
      this.totalSamples++;
      
      // Track timing
      if (!this.firstSampleTime) {
        this.firstSampleTime = now;
        this.log(`Started: ${this.sampleRate}Hz, ${this.fftSize}-pt FFT, ${this.samplesPerWindow} samples/win`);
        console.log('FFT Counter: First sample received, starting counter');
      }
      this.lastSampleTime = now;

      // Add to buffer
      this.magnitudeBuffer.push(magnitude);
      
      // Log every 10 samples to track data flow
      if (this.totalSamples % 10 === 0) {
        this.log(`${this.totalSamples} samples | buf: ${this.magnitudeBuffer.length}/${this.samplesPerWindow}`);
        console.log(`FFT: ${this.totalSamples} samples received, buffer: ${this.magnitudeBuffer.length}`);
      }

      // Log buffer status every 52 samples (1 second)
      if (this.totalSamples % 52 === 0) {
        const elapsedSec = (now - this.firstSampleTime) / 1000;
        const actualRate = this.totalSamples / elapsedSec;
        this.log(`✓ ${this.totalSamples} samples in ${elapsedSec.toFixed(1)}s (${actualRate.toFixed(1)}Hz)`);
      }

      // Process window when full
      if (this.magnitudeBuffer.length >= this.samplesPerWindow) {
        const windowSteps = this.processWindow();
        this.stepCount += Math.round(windowSteps);
        this.log(`Total steps: ${this.stepCount}`);
        return windowSteps > 0;
      }

      return false;
    } catch (error) {
      this.log(`ERROR: ${error.message}`);
      console.error('FFT detectStep error:', error);
      return false;
    }
  }

  getStepCount() {
    return this.stepCount;
  }

  getDebugLogs() {
    return [...this.debugLogs];
  }

  reset() {
    const resetStack = new Error().stack;
    console.warn('FFT RESET CALLED! Stack:', resetStack);
    
    const hadSamples = this.totalSamples > 0;
    const bufferSize = this.magnitudeBuffer.length;
    
    this.stepCount = 0;
    this.magnitudeBuffer = [];
    this.debugLogs = [];
    this.totalSamples = 0;
    this.windowsProcessed = 0;
    this.firstSampleTime = null;
    this.lastSampleTime = null;
    
    if (hadSamples) {
      this.log(`⚠️ RESET! Lost ${bufferSize} samples`);
    } else {
      this.log('FFT counter reset');
    }
  }
}

export default new WaveletStepCounter();
