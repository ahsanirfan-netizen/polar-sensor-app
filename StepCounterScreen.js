import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Dimensions } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import DataRateMonitor from './DataRateMonitor';
import StepCounterService from './StepCounterService';

export default function StepCounterScreen() {
  const [stats, setStats] = useState({
    totalSamples: 0,
    totalPackets: 0,
    elapsedSeconds: 0,
    sampleRate: 0,
    packetRate: 0,
    samplesPerPacket: 0,
    expectedSampleRate: 37,
    expectedPacketRate: 0.5,
    expectedSamplesPerPacket: 71
  });

  const [fftStats, setFFTStats] = useState({
    totalSteps: 0,
    isWalking: false,
    isConfirmedWalking: false,
    consecutiveWalkingFrames: 0,
    consecutiveStationaryFrames: 0,
    framesToConfirm: 3,
    cadence: 0,
    stepsPerMinute: 0,
    ridgeFrequency: '0.00',
    ridgeStrength: '0.000',
    ridgeScale: '0.00',
    ridgeThreshold: '0.100',
    bufferFilled: false,
    dominantAxis: 'y',
    scalogram: [],
    frequencyLabels: []
  });

  const [ridgeThresholdInput, setRidgeThresholdInput] = useState('');
  const [currentRidgeThreshold, setCurrentRidgeThreshold] = useState(0.1);
  const [framesToConfirmInput, setFramesToConfirmInput] = useState('');
  const [currentFramesToConfirm, setCurrentFramesToConfirm] = useState(3);

  // Initialize ridge threshold and frames to confirm on mount
  useEffect(() => {
    const ridgeThreshold = StepCounterService.getRidgeThreshold();
    setCurrentRidgeThreshold(ridgeThreshold);
    setRidgeThresholdInput(ridgeThreshold.toString());
    
    const framesToConfirm = StepCounterService.getFramesToConfirm();
    setCurrentFramesToConfirm(framesToConfirm);
    setFramesToConfirmInput(framesToConfirm.toString());
  }, []);

  // Update stats every 100ms for responsive display
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(DataRateMonitor.getStats());
      const newFFTStats = StepCounterService.getFFTStats();
      setFFTStats(newFFTStats);
      
      // Sync UI with actual values from service (handles async load)
      const actualFrames = StepCounterService.getFramesToConfirm();
      if (actualFrames !== currentFramesToConfirm) {
        setCurrentFramesToConfirm(actualFrames);
        setFramesToConfirmInput(actualFrames.toString());
      }
      
      const actualRidgeThreshold = StepCounterService.getRidgeThreshold();
      if (actualRidgeThreshold !== currentRidgeThreshold) {
        setCurrentRidgeThreshold(actualRidgeThreshold);
        setRidgeThresholdInput(actualRidgeThreshold.toString());
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [currentFramesToConfirm, currentRidgeThreshold]);

  const handleSaveRidgeThreshold = async () => {
    const success = await StepCounterService.setRidgeThreshold(ridgeThresholdInput);
    if (success) {
      const newThreshold = StepCounterService.getRidgeThreshold();
      setCurrentRidgeThreshold(newThreshold);
      Alert.alert('Success', `Ridge threshold saved: ${newThreshold.toFixed(3)}`);
    } else {
      Alert.alert('Error', 'Please enter a valid threshold greater than 0 (e.g., 0.05, 0.1, 0.2)');
      setRidgeThresholdInput(currentRidgeThreshold.toString());
    }
  };

  const handleSaveFramesToConfirm = async () => {
    const success = await StepCounterService.setFramesToConfirm(framesToConfirmInput);
    if (success) {
      const newFrames = StepCounterService.getFramesToConfirm();
      setCurrentFramesToConfirm(newFrames);
      Alert.alert('Success', `Confirmation frames saved: ${newFrames} frames (${newFrames * 2}s delay)`);
    } else {
      Alert.alert('Error', 'Please enter a valid number of frames between 1 and 10');
      setFramesToConfirmInput(currentFramesToConfirm.toString());
    }
  };


  const sampleRateOk = parseFloat(stats.sampleRate) >= 30;
  const packetRateOk = parseFloat(stats.packetRate) >= 0.4;
  const samplesPerPacketOk = parseFloat(stats.samplesPerPacket) >= 50;

  const getDiagnosis = () => {
    if (stats.totalSamples === 0) {
      return { text: 'Waiting for data...', color: '#999' };
    }
    
    if (sampleRateOk && packetRateOk && samplesPerPacketOk) {
      return { text: '✓ All systems healthy', color: '#4CAF50' };
    }
    
    if (!packetRateOk) {
      return { 
        text: `✗ Packet rate too low (${stats.packetRate} Hz vs ${stats.expectedPacketRate} Hz expected)\nBLE streaming issue`, 
        color: '#f44336' 
      };
    }
    
    if (!samplesPerPacketOk) {
      return { 
        text: `✗ Multi-sample parsing broken (${stats.samplesPerPacket} samples/packet vs ${stats.expectedSamplesPerPacket} expected)\nOnly processing first sample per packet`, 
        color: '#f44336' 
      };
    }
    
    return { text: '⚠ Unknown issue', color: '#FF9800' };
  };

  const diagnosis = getDiagnosis();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Gyro Step Counter</Text>
      
      <View style={styles.stepCard}>
        <Text style={styles.label}>Total Steps</Text>
        <Text style={[styles.hugeNumber, { color: '#2196F3' }]}>
          {fftStats.totalSteps}
        </Text>
        <Text style={[styles.walkingStatus, { 
          color: fftStats.isConfirmedWalking ? '#4CAF50' : '#999',
          fontWeight: fftStats.isConfirmedWalking ? 'bold' : 'normal'
        }]}>
          {fftStats.bufferFilled ? (fftStats.isConfirmedWalking ? '🚶 WALKING (COUNTING)' : 'Standing Still') : 'Buffering...'}
        </Text>
        {fftStats.bufferFilled && fftStats.isWalking && !fftStats.isConfirmedWalking && (
          <Text style={[styles.confirmingText]}>
            Confirming... {fftStats.consecutiveWalkingFrames}/{fftStats.framesToConfirm}
          </Text>
        )}
        {fftStats.bufferFilled && !fftStats.isWalking && fftStats.isConfirmedWalking && (
          <Text style={[styles.confirmingText]}>
            Stopping... {fftStats.consecutiveStationaryFrames}/{fftStats.framesToConfirm}
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <View style={styles.statsCard}>
          <Text style={styles.label}>Cadence</Text>
          <Text style={[styles.bigNumber, { color: fftStats.isConfirmedWalking ? '#4CAF50' : '#999' }]}>
            {fftStats.stepsPerMinute}
          </Text>
          <Text style={styles.sublabel}>steps/min</Text>
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.label}>Ridge Frequency</Text>
          <Text style={[styles.bigNumber, { color: fftStats.isConfirmedWalking ? '#2196F3' : '#999' }]}>
            {fftStats.ridgeFrequency}
          </Text>
          <Text style={styles.sublabel}>Hz</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Ridge Strength</Text>
          <Text style={[styles.miniNumber, { color: '#E91E63' }]}>{fftStats.ridgeStrength}</Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Ridge Threshold</Text>
          <Text style={[styles.miniNumber, { color: '#9C27B0' }]}>{fftStats.ridgeThreshold}</Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Ridge Detected?</Text>
          <Text style={[styles.miniNumber, { color: parseFloat(fftStats.ridgeStrength) > parseFloat(fftStats.ridgeThreshold) ? '#4CAF50' : '#999' }]}>
            {parseFloat(fftStats.ridgeStrength) > parseFloat(fftStats.ridgeThreshold) ? '✓' : '✗'}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Ridge Scale</Text>
          <Text style={[styles.miniNumber, { color: '#00BCD4' }]}>
            {fftStats.ridgeScale}
          </Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Gyro Axis</Text>
          <Text style={[styles.miniNumber, { color: '#9C27B0' }]}>
            {fftStats.dominantAxis?.toUpperCase() || 'Y'}
          </Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Buffer</Text>
          <Text style={[styles.miniNumber, { color: fftStats.bufferFilled ? '#4CAF50' : '#FF9800' }]}>
            {fftStats.bufferFilled ? 'Ready' : 'Filling'}
          </Text>
        </View>
      </View>

      <View style={[styles.diagnosisCard, { backgroundColor: diagnosis.color + '20' }]}>
        <Text style={[styles.diagnosisText, { color: diagnosis.color }]}>
          {diagnosis.text}
        </Text>
      </View>

      <View style={styles.thresholdCard}>
        <Text style={styles.thresholdTitle}>Confirmation Frames</Text>
        <Text style={styles.thresholdHint}>
          Current: {currentFramesToConfirm} frames ({currentFramesToConfirm * 2}s delay)
        </Text>
        <View style={styles.thresholdRow}>
          <TextInput
            style={styles.thresholdInput}
            value={framesToConfirmInput}
            onChangeText={setFramesToConfirmInput}
            keyboardType="numeric"
            placeholder="3"
            placeholderTextColor="#999"
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveFramesToConfirm}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.thresholdGuide}>
          Range: 1-10 frames. Number of consecutive frames required before starting/stopping step counting.
        </Text>
        <Text style={[styles.thresholdGuide, { marginTop: 5, fontStyle: 'italic', color: '#666' }]}>
          Higher = fewer phantom steps, longer startup delay
        </Text>
      </View>

      <View style={styles.thresholdCard}>
        <Text style={styles.thresholdTitle}>Ridge Threshold</Text>
        <Text style={styles.thresholdHint}>Current: {currentRidgeThreshold.toFixed(3)}</Text>
        <View style={styles.thresholdRow}>
          <TextInput
            style={styles.thresholdInput}
            value={ridgeThresholdInput}
            onChangeText={setRidgeThresholdInput}
            keyboardType="numeric"
            placeholder="0.1"
            placeholderTextColor="#999"
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveRidgeThreshold}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.thresholdGuide}>
          Wavelet ridge strength must exceed this threshold for walking detection.
        </Text>
        <Text style={[styles.thresholdGuide, { marginTop: 5, fontStyle: 'italic', color: '#666' }]}>
          Lower = more sensitive. Higher = less sensitive. Typical range: 0.1-5.0 (no hard limit).
        </Text>
        <Text style={[styles.thresholdGuide, { marginTop: 5, fontWeight: 'bold', color: '#2196F3' }]}>
          CWT ridge detection automatically filters non-periodic motion!
        </Text>
      </View>

      {fftStats.bufferFilled && fftStats.scalogram.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>CWT Scalogram (Real-Time)</Text>
          <Text style={styles.chartSubtitle}>
            Wavelet coefficients across frequency range (0.8-3.5 Hz)
          </Text>
          <BarChart
            data={{
              labels: fftStats.frequencyLabels.map((freq, idx) => 
                idx % 5 === 0 ? freq.toFixed(1) : ''
              ),
              datasets: [{
                data: fftStats.scalogram
              }]
            }}
            width={Dimensions.get('window').width - 40}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#f5f5f5',
              decimalPlaces: 2,
              color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              style: {
                borderRadius: 16
              },
              propsForBackgroundLines: {
                strokeDasharray: '',
                stroke: '#e3e3e3',
                strokeWidth: 1
              },
              barPercentage: 0.8,
            }}
            style={{
              marginVertical: 8,
              borderRadius: 16
            }}
            showValuesOnTopOfBars={false}
          />
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#2196F3' }]} />
              <Text style={styles.legendText}>Ridge Strength</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
              <Text style={styles.legendText}>Walking (1.0-2.5 Hz)</Text>
            </View>
          </View>
          <Text style={styles.chartNote}>
            {fftStats.isWalking ? 
              `Ridge detected at ${fftStats.ridgeFrequency} Hz (strength: ${fftStats.ridgeStrength})` :
              'No ridge detected - Standing still or non-periodic motion'
            }
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
    color: '#333',
  },
  stepCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 30,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    alignItems: 'center',
  },
  hugeNumber: {
    fontSize: 80,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  walkingStatus: {
    fontSize: 18,
    marginTop: 10,
  },
  confirmingText: {
    fontSize: 14,
    color: '#FF9800',
    marginTop: 6,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  miniCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  label: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  miniLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
    fontWeight: '600',
  },
  bigNumber: {
    fontSize: 40,
    fontWeight: 'bold',
  },
  miniNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  sublabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  diagnosisCard: {
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  diagnosisText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
  },
  thresholdCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  thresholdTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  thresholdHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thresholdInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  thresholdGuide: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: '#666',
  },
  chartNote: {
    fontSize: 12,
    color: '#2196F3',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
