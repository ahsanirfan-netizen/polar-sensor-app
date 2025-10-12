import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import StepCounterService from './StepCounterService';
import WaveletStepCounter from './WaveletStepCounter';

export default function StepCounterScreen() {
  const [peakStepCount, setPeakStepCount] = useState(0);
  const [fftStepCount, setFftStepCount] = useState(0);
  const [debugLogs, setDebugLogs] = useState([]);
  const isMounted = useRef(true);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    
    // Don't reset counters - App.js owns their lifecycle
    // Screen just displays their current state
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Update step counts and logs every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (isMounted.current) {
        setPeakStepCount(StepCounterService.getStepCount());
        setFftStepCount(WaveletStepCounter.getStepCount());
        
        // Combine logs from both algorithms
        const peakLogs = StepCounterService.getDebugLogs();
        const fftLogs = WaveletStepCounter.getDebugLogs();
        
        // Interleave logs with labels
        const combinedLogs = [];
        peakLogs.forEach(log => combinedLogs.push(`[PEAK] ${log}`));
        fftLogs.forEach(log => combinedLogs.push(`[FFT] ${log}`));
        
        setDebugLogs(combinedLogs.slice(-20)); // Keep last 20
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [debugLogs]);

  return (
    <View style={styles.container}>
      <View style={styles.compareContainer}>
        <View style={styles.algorithmBox}>
          <Text style={styles.algorithmLabel}>Peak Detection</Text>
          <Text style={styles.stepCount}>{peakStepCount}</Text>
          <Text style={styles.label}>Steps</Text>
        </View>
        
        <View style={styles.algorithmBox}>
          <Text style={styles.algorithmLabel}>FFT (Wavelet)</Text>
          <Text style={styles.stepCountFft}>{fftStepCount}</Text>
          <Text style={styles.label}>Steps</Text>
        </View>
      </View>
      
      <View style={styles.consoleContainer}>
        <Text style={styles.consoleTitle}>Debug Console</Text>
        <ScrollView 
          ref={scrollViewRef}
          style={styles.consoleScroll}
          contentContainerStyle={styles.consoleContent}
        >
          {debugLogs.length === 0 ? (
            <Text style={styles.consoleText}>Waiting for ACC data...</Text>
          ) : (
            debugLogs.map((log, index) => (
              <Text key={index} style={styles.consoleText}>{log}</Text>
            ))
          )}
        </ScrollView>
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
  compareContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 30,
    marginBottom: 20,
  },
  algorithmBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    flex: 1,
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  algorithmLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 10,
    fontWeight: '600',
  },
  stepCount: {
    fontSize: 60,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  stepCountFft: {
    fontSize: 60,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  consoleContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
  },
  consoleTitle: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  consoleScroll: {
    flex: 1,
  },
  consoleContent: {
    paddingBottom: 10,
  },
  consoleText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});
