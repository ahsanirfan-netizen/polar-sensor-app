import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
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
    cadence: 0,
    stepsPerMinute: 0,
    dominantFrequency: '0.00',
    peakMagnitude: '0.000',
    bufferFilled: false
  });

  const [thresholdInput, setThresholdInput] = useState('');
  const [currentThreshold, setCurrentThreshold] = useState(0.03);

  // Initialize threshold on mount
  useEffect(() => {
    const threshold = StepCounterService.getThreshold();
    setCurrentThreshold(threshold);
    setThresholdInput(threshold.toString());
  }, []);

  // Update stats every 100ms for responsive display
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(DataRateMonitor.getStats());
      setFFTStats(StepCounterService.getFFTStats());
    }, 100);
    
    return () => clearInterval(interval);
  }, []);

  const handleSaveThreshold = () => {
    const success = StepCounterService.setThreshold(thresholdInput);
    if (success) {
      const newThreshold = StepCounterService.getThreshold();
      setCurrentThreshold(newThreshold);
      Alert.alert('Success', `Threshold updated to ${newThreshold.toFixed(3)}`);
    } else {
      Alert.alert('Error', 'Please enter a valid threshold between 0 and 1 (e.g., 0.03)');
      setThresholdInput(currentThreshold.toString());
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
      <Text style={styles.title}>FFT Step Counter</Text>
      
      <View style={styles.stepCard}>
        <Text style={styles.label}>Total Steps</Text>
        <Text style={[styles.hugeNumber, { color: '#2196F3' }]}>
          {fftStats.totalSteps}
        </Text>
        <Text style={[styles.walkingStatus, { 
          color: fftStats.isWalking ? '#4CAF50' : '#999',
          fontWeight: fftStats.isWalking ? 'bold' : 'normal'
        }]}>
          {fftStats.bufferFilled ? (fftStats.isWalking ? '🚶 WALKING' : 'Standing Still') : 'Buffering...'}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.statsCard}>
          <Text style={styles.label}>Cadence</Text>
          <Text style={[styles.bigNumber, { color: fftStats.isWalking ? '#4CAF50' : '#999' }]}>
            {fftStats.stepsPerMinute}
          </Text>
          <Text style={styles.sublabel}>steps/min</Text>
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.label}>Frequency</Text>
          <Text style={[styles.bigNumber, { color: fftStats.isWalking ? '#2196F3' : '#999' }]}>
            {fftStats.dominantFrequency}
          </Text>
          <Text style={styles.sublabel}>Hz</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Peak Magnitude</Text>
          <Text style={styles.miniNumber}>{fftStats.peakMagnitude}</Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Sample Rate</Text>
          <Text style={[styles.miniNumber, { color: sampleRateOk ? '#4CAF50' : '#f44336' }]}>
            {stats.sampleRate} Hz
          </Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Packet Rate</Text>
          <Text style={[styles.miniNumber, { color: packetRateOk ? '#4CAF50' : '#f44336' }]}>
            {stats.packetRate} Hz
          </Text>
        </View>
      </View>

      <View style={[styles.diagnosisCard, { backgroundColor: diagnosis.color + '20' }]}>
        <Text style={[styles.diagnosisText, { color: diagnosis.color }]}>
          {diagnosis.text}
        </Text>
      </View>

      <View style={styles.thresholdCard}>
        <Text style={styles.thresholdTitle}>Walking Detection Threshold</Text>
        <Text style={styles.thresholdHint}>Current: {currentThreshold.toFixed(3)}</Text>
        <View style={styles.thresholdRow}>
          <TextInput
            style={styles.thresholdInput}
            value={thresholdInput}
            onChangeText={setThresholdInput}
            keyboardType="numeric"
            placeholder="0.03"
            placeholderTextColor="#999"
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveThreshold}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.thresholdGuide}>
          Typical range: 0.02-0.05. Lower = more sensitive.
        </Text>
      </View>
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
});
