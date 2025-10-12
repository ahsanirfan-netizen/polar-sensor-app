import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';

let StepCounterService = null;

try {
  StepCounterService = require('./StepCounterService').default;
} catch (error) {
  console.error('Failed to load StepCounterService:', error);
}

export default function StepCounterScreen() {
  const [stepCount, setStepCount] = useState(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    // Reset counter when screen loads
    StepCounterService?.reset();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Update step count every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (isMounted.current && StepCounterService) {
        setStepCount(StepCounterService.getStepCount());
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.stepDisplay}>
        <Text style={styles.stepCount}>{stepCount}</Text>
        <Text style={styles.label}>Steps</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDisplay: {
    alignItems: 'center',
  },
  stepCount: {
    fontSize: 120,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  label: {
    fontSize: 24,
    color: '#666',
    marginTop: 10,
  },
});
