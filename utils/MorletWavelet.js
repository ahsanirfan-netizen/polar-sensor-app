export class MorletWavelet {
  constructor(centerFrequency = 6) {
    this.omega = centerFrequency;
    this.normalizationFactor = Math.pow(Math.PI, -0.25);
  }

  createWavelet(scale, length, samplingRate) {
    const wavelet = new Array(length);
    const center = Math.floor(length / 2);
    const dt = 1.0 / samplingRate;
    
    for (let i = 0; i < length; i++) {
      const t = (i - center) * dt;
      const scaledT = t / scale;
      
      const gaussian = Math.exp(-0.5 * scaledT * scaledT);
      const oscillation = Math.cos(this.omega * scaledT);
      
      wavelet[i] = this.normalizationFactor * gaussian * oscillation / Math.sqrt(scale);
    }
    
    return wavelet;
  }

  convolve(signal, wavelet) {
    const signalLength = signal.length;
    const waveletLength = wavelet.length;
    
    let coefficient = 0;
    
    const startIdx = Math.max(0, signalLength - waveletLength);
    
    for (let i = 0; i < waveletLength && (startIdx + i) < signalLength; i++) {
      coefficient += signal[startIdx + i] * wavelet[i];
    }
    
    return coefficient;
  }

  computeCWT(signal, scales, samplingRate) {
    const signalLength = signal.length;
    const numScales = scales.length;
    const scalogram = new Array(numScales);
    
    const waveletLength = Math.min(signalLength, 64);
    
    for (let s = 0; s < numScales; s++) {
      const wavelet = this.createWavelet(scales[s], waveletLength, samplingRate);
      const coefficient = this.convolve(signal, wavelet);
      scalogram[s] = Math.abs(coefficient);
    }
    
    return scalogram;
  }

  scaleToFrequency(scale, samplingRate) {
    return (this.omega * samplingRate) / (2 * Math.PI * scale);
  }

  frequencyToScale(frequency, samplingRate) {
    return (this.omega * samplingRate) / (2 * Math.PI * frequency);
  }
}
