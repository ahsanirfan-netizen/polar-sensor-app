import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import DataRateMonitor from './DataRateMonitor';

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

  // Update stats every 100ms for responsive display
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(DataRateMonitor.getStats());
    }, 100);
    
    return () => clearInterval(interval);
  }, []);

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
    <View style={styles.container}>
      <Text style={styles.title}>BLE Data Rate Diagnostic</Text>
      
      <View style={styles.row}>
        <View style={styles.statsCard}>
          <Text style={styles.label}>Sample Rate</Text>
          <Text style={[styles.bigNumber, { color: sampleRateOk ? '#4CAF50' : '#f44336' }]}>
            {stats.sampleRate}
          </Text>
          <Text style={styles.sublabel}>Hz (expect {stats.expectedSampleRate})</Text>
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.label}>Packet Rate</Text>
          <Text style={[styles.bigNumber, { color: packetRateOk ? '#4CAF50' : '#f44336' }]}>
            {stats.packetRate}
          </Text>
          <Text style={styles.sublabel}>Hz (expect {stats.expectedPacketRate})</Text>
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.label}>Samples Per Packet</Text>
        <Text style={[styles.bigNumber, { color: samplesPerPacketOk ? '#4CAF50' : '#f44336' }]}>
          {stats.samplesPerPacket}
        </Text>
        <Text style={styles.sublabel}>samples (expect {stats.expectedSamplesPerPacket})</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Total Samples</Text>
          <Text style={styles.miniNumber}>{stats.totalSamples}</Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Total Packets</Text>
          <Text style={styles.miniNumber}>{stats.totalPackets}</Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Elapsed</Text>
          <Text style={styles.miniNumber}>{stats.elapsedSeconds}s</Text>
        </View>
      </View>

      <View style={[styles.diagnosisCard, { backgroundColor: diagnosis.color + '20' }]}>
        <Text style={[styles.diagnosisText, { color: diagnosis.color }]}>
          {diagnosis.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
    color: '#333',
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
});
