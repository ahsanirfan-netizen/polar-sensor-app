import { MorletWavelet } from './utils/MorletWavelet';

export class FFTStepCounter {
  constructor(sampleRate = 37) {
    this.sampleRate = sampleRate;
    this.windowSizeSeconds = 4;
    const idealSize = sampleRate * this.windowSizeSeconds;
    this.bufferSize = Math.pow(2, Math.round(Math.log2(idealSize)));
    this.cwtInterval = 2000;
    
    this.gyroBuffer = new Array(this.bufferSize).fill(0);
    this.bufferIndex = 0;
    this.bufferFilled = false;
    
    this.gyroXBuffer = [];
    this.gyroYBuffer = [];
    this.gyroZBuffer = [];
    this.varianceWindowSize = 50;
    
    this.gyroScaleFactor = 1000;
    
    this.lastCWTTime = 0;
    this.totalStepsFractional = 0;
    this.currentCadence = 0;
    this.isWalking = false;
    this.ridgeFrequency = 0;
    this.ridgeStrength = 0;
    this.ridgeScale = 0;
    this.dominantAxis = 'y';
    
    this.consecutiveWalkingFrames = 0;
    this.consecutiveStationaryFrames = 0;
    this.framesToConfirm = 3;
    this.isConfirmedWalking = false;
    
    this.walkingFreqMin = 0.5;
    this.walkingFreqMax = 4.0;
    
    this.ridgeThreshold = 0.1;
    
    this.morlet = new MorletWavelet(6);
    
    this.numScales = 25;
    this.scales = this.generateScales();
    
    this.lastStepTime = Date.now();
  }

  generateScales() {
    const scales = [];
    const minScale = this.morlet.frequencyToScale(this.walkingFreqMax, this.sampleRate);
    const maxScale = this.morlet.frequencyToScale(this.walkingFreqMin, this.sampleRate);
    
    for (let i = 0; i < this.numScales; i++) {
      const scale = minScale + (maxScale - minScale) * (i / (this.numScales - 1));
      scales.push(scale);
    }
    
    return scales;
  }

  selectDominantAxis(x, y, z) {
    this.gyroXBuffer.push(x);
    this.gyroYBuffer.push(y);
    this.gyroZBuffer.push(z);
    
    if (this.gyroXBuffer.length > this.varianceWindowSize) {
      this.gyroXBuffer.shift();
      this.gyroYBuffer.shift();
      this.gyroZBuffer.shift();
    }
    
    if (this.gyroXBuffer.length === this.varianceWindowSize) {
      const varianceX = this.calculateVariance(this.gyroXBuffer);
      const varianceY = this.calculateVariance(this.gyroYBuffer);
      const varianceZ = this.calculateVariance(this.gyroZBuffer);
      
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
    const dominantValue = this.selectDominantAxis(x, y, z);
    
    this.gyroBuffer[this.bufferIndex] = dominantValue / this.gyroScaleFactor;
    this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
    
    if (this.bufferIndex === 0 && !this.bufferFilled) {
      this.bufferFilled = true;
    }
    
    const now = Date.now();
    if (this.bufferFilled && now - this.lastCWTTime >= this.cwtInterval) {
      this.runCWTAnalysis();
      this.lastCWTTime = now;
    }
  }

  runCWTAnalysis() {
    const orderedBuffer = this.getOrderedBuffer();
    
    const mean = orderedBuffer.reduce((sum, val) => sum + val, 0) / orderedBuffer.length;
    const centeredBuffer = orderedBuffer.map(val => val - mean);
    
    const scalogram = this.morlet.computeCWT(centeredBuffer, this.scales, this.sampleRate);
    
    this.detectRidge(scalogram);
  }

  getOrderedBuffer() {
    const ordered = new Array(this.bufferSize);
    for (let i = 0; i < this.bufferSize; i++) {
      ordered[i] = this.gyroBuffer[(this.bufferIndex + i) % this.bufferSize];
    }
    return ordered;
  }

  detectRidge(scalogram) {
    let maxCoefficient = 0;
    let maxScaleIndex = 0;
    
    for (let i = 0; i < scalogram.length; i++) {
      if (scalogram[i] > maxCoefficient) {
        maxCoefficient = scalogram[i];
        maxScaleIndex = i;
      }
    }
    
    this.ridgeStrength = maxCoefficient;
    this.ridgeScale = this.scales[maxScaleIndex];
    this.ridgeFrequency = this.morlet.scaleToFrequency(this.ridgeScale, this.sampleRate);
    
    const wasConfirmedWalking = this.isConfirmedWalking;
    
    const ridgeDetected = this.ridgeStrength > this.ridgeThreshold && 
                         this.ridgeFrequency >= this.walkingFreqMin && 
                         this.ridgeFrequency <= this.walkingFreqMax;
    
    this.isWalking = ridgeDetected;
    
    if (this.isWalking) {
      this.consecutiveWalkingFrames++;
      this.consecutiveStationaryFrames = 0;
    } else {
      this.consecutiveStationaryFrames++;
      this.consecutiveWalkingFrames = 0;
    }
    
    if (this.consecutiveWalkingFrames >= this.framesToConfirm) {
      this.isConfirmedWalking = true;
    } else if (this.consecutiveStationaryFrames >= this.framesToConfirm) {
      this.isConfirmedWalking = false;
    }
    
    if (this.isConfirmedWalking && this.isWalking) {
      const minCadence = 0.8;
      const maxCadence = 3.5;
      this.currentCadence = Math.max(minCadence, Math.min(this.ridgeFrequency, maxCadence));
      
      const now = Date.now();
      let elapsed = (now - this.lastStepTime) / 1000;
      
      elapsed = Math.min(elapsed, this.cwtInterval / 1000);
      
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
      framesToConfirm: this.framesToConfirm,
      cadence: this.currentCadence,
      stepsPerMinute: Math.round(this.currentCadence * 60),
      ridgeFrequency: this.ridgeFrequency.toFixed(2),
      ridgeStrength: this.ridgeStrength.toFixed(3),
      ridgeScale: this.ridgeScale.toFixed(2),
      ridgeThreshold: this.ridgeThreshold.toFixed(3),
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
    this.ridgeFrequency = 0;
    this.ridgeStrength = 0;
    this.ridgeScale = 0;
    this.consecutiveWalkingFrames = 0;
    this.consecutiveStationaryFrames = 0;
    this.isConfirmedWalking = false;
    this.lastCWTTime = 0;
    this.lastStepTime = Date.now();
    this.dominantAxis = 'y';
  }

  setRidgeThreshold(newThreshold) {
    const threshold = parseFloat(newThreshold);
    if (!isNaN(threshold) && threshold > 0) {
      this.ridgeThreshold = threshold;
      return true;
    }
    return false;
  }

  getRidgeThreshold() {
    return this.ridgeThreshold;
  }

  setFramesToConfirm(newFrames) {
    const frames = parseInt(newFrames);
    if (!isNaN(frames) && frames >= 1 && frames <= 10) {
      this.framesToConfirm = frames;
      return true;
    }
    return false;
  }

  getFramesToConfirm() {
    return this.framesToConfirm;
  }
}
