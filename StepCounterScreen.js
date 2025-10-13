import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import DataRateMonitor from './DataRateMonitor';

export default function StepCounterScreen() {
  const [stats, setStats] = useState({
    totalSamples: 0,
    elapsedSeconds: 0,
    currentRate: 0,
    expectedRate: 52
  });

  // Update stats every 100ms for responsive display
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(DataRateMonitor.getStats());
    }, 100);
    
    return () => clearInterval(interval);
  }, []);

  const ratePercentage = stats.expectedRate > 0 
    ? ((parseFloat(stats.currentRate) / stats.expectedRate) * 100).toFixed(0)
    : 0;

  const isHealthy = parseFloat(stats.currentRate) >= 50;
  const rateColor = isHealthy ? '#4CAF50' : '#f44336';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ACC Data Rate Monitor</Text>
      
      <View style={styles.statsCard}>
        <Text style={styles.label}>Total Samples</Text>
        <Text style={styles.bigNumber}>{stats.totalSamples}</Text>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.label}>Elapsed Time</Text>
        <Text style={styles.bigNumber}>{stats.elapsedSeconds} sec</Text>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.label}>Current Rate</Text>
        <Text style={[styles.bigNumber, { color: rateColor }]}>
          {stats.currentRate} Hz
        </Text>
        <Text style={styles.sublabel}>
          ({ratePercentage}% of expected {stats.expectedRate} Hz)
        </Text>
      </View>

      <View style={[styles.statusCard, { backgroundColor: isHealthy ? '#E8F5E9' : '#FFEBEE' }]}>
        <Text style={[styles.statusText, { color: isHealthy ? '#2E7D32' : '#C62828' }]}>
          {isHealthy ? '✓ Data stream healthy' : '✗ Data stream issues detected'}
        </Text>
        {!isHealthy && stats.totalSamples > 0 && (
          <Text style={styles.statusHint}>
            Expected: ~52 samples/second{'\n'}
            Getting: ~{stats.currentRate} samples/second{'\n'}
            {parseFloat(stats.currentRate) < 5 
              ? 'Multi-sample parsing may be broken' 
              : 'Rate is low but not zero'}
          </Text>
        )}
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
    marginBottom: 30,
    color: '#333',
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  sublabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  statusCard: {
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
