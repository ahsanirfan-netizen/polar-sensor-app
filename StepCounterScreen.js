import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

let StepCounterService = null;

try {
  StepCounterService = require('./StepCounterService').default;
} catch (error) {
  console.error('Failed to load StepCounterService:', error);
}

export default function StepCounterScreen() {
  const [stepCount, setStepCount] = useState(0);
  const [debugLogs, setDebugLogs] = useState([]);
  const isMounted = useRef(true);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    
    // Reset counter when screen loads
    StepCounterService?.reset();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Update step count and logs every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (isMounted.current && StepCounterService) {
        setStepCount(StepCounterService.getStepCount());
        setDebugLogs(StepCounterService.getDebugLogs());
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
      <View style={styles.stepDisplay}>
        <Text style={styles.stepCount}>{stepCount}</Text>
        <Text style={styles.label}>Steps</Text>
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
  stepDisplay: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 30,
  },
  stepCount: {
    fontSize: 100,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  label: {
    fontSize: 24,
    color: '#666',
    marginTop: 10,
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
