import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

// Progressive loading - adds features step by step
let StepCounterService = null;
let HealthConnectService = null;
let supabase = null;

try {
  StepCounterService = require('./StepCounterService').default;
  HealthConnectService = require('./HealthConnectService').default;
  supabase = require('./supabaseClient').supabase;
} catch (error) {
  console.error('Failed to load dependencies:', error);
}

export default function StepCounterScreenProgressive() {
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState(null);
  const [stepCount, setStepCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  
  const notificationListener = useRef();
  const responseListener = useRef();

  // Phase 0: Just render basic UI (already working)
  
  // Phase 1: Add state initialization
  useEffect(() => {
    if (phase >= 1) {
      try {
        console.log('Phase 1: Basic state initialized');
      } catch (err) {
        setError(`Phase 1 failed: ${err.message}`);
      }
    }
  }, [phase]);

  // Phase 2: Initialize HealthConnect
  useEffect(() => {
    const initHealthConnect = async () => {
      if (phase >= 2) {
        try {
          const initialized = await HealthConnectService.initializeHealthConnect();
          console.log('Phase 2: HealthConnect initialized:', initialized);
        } catch (err) {
          setError(`Phase 2 failed: ${err.message}`);
        }
      }
    };
    initHealthConnect();
  }, [phase]);

  // Phase 3: Request notification permissions
  useEffect(() => {
    const requestPerms = async () => {
      if (phase >= 3) {
        try {
          await StepCounterService.requestNotificationPermissions();
          console.log('Phase 3: Notification permissions requested');
        } catch (err) {
          setError(`Phase 3 failed: ${err.message}`);
        }
      }
    };
    requestPerms();
  }, [phase]);

  // Phase 4: Set up walking callbacks
  useEffect(() => {
    if (phase >= 4) {
      try {
        StepCounterService.setWalkingCallbacks(
          () => console.log('Walking detected'),
          () => console.log('Walking stopped')
        );
        console.log('Phase 4: Walking callbacks set');
      } catch (err) {
        setError(`Phase 4 failed: ${err.message}`);
      }
    }
  }, [phase]);

  // Phase 5: Add notification listeners
  useEffect(() => {
    const setupListeners = async () => {
      if (phase >= 5) {
        try {
          notificationListener.current = await StepCounterService.addNotificationReceivedListener(
            notification => console.log('Notification received:', notification)
          );

          responseListener.current = await StepCounterService.addNotificationResponseReceivedListener(
            response => console.log('Notification response:', response)
          );
          
          console.log('Phase 5: Notification listeners added');
        } catch (err) {
          setError(`Phase 5 failed: ${err.message}`);
        }
      }
    };
    setupListeners();

    return () => {
      if (notificationListener.current) {
        StepCounterService.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        StepCounterService.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [phase]);

  // Phase 6: Load data from Supabase
  useEffect(() => {
    const loadData = async () => {
      if (phase >= 6) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const user = await supabase.auth.getUser();
          
          if (user.data.user) {
            const { data } = await supabase
              .from('daily_steps')
              .select('*')
              .eq('user_id', user.data.user.id)
              .eq('date', today)
              .single();
            
            console.log('Phase 6: Loaded Supabase data:', data);
          }
        } catch (err) {
          setError(`Phase 6 failed: ${err.message}`);
        }
      }
    };
    loadData();
  }, [phase]);

  const runPhase = (phaseNum) => {
    setError(null);
    setPhase(phaseNum);
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🔬 Progressive Component Test</Text>
          <Text style={styles.subtitle}>
            Add features incrementally to find crash point
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Phase: {phase}/6</Text>
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Run Component Phases</Text>
          
          <TouchableOpacity 
            style={[styles.button, phase >= 1 && styles.buttonSuccess]}
            onPress={() => runPhase(1)}
          >
            <Text style={styles.buttonText}>
              {phase >= 1 ? '✅ ' : ''}Phase 1: Basic State
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, phase >= 2 && styles.buttonSuccess]}
            onPress={() => runPhase(2)}
          >
            <Text style={styles.buttonText}>
              {phase >= 2 ? '✅ ' : ''}Phase 2: Init HealthConnect
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, phase >= 3 && styles.buttonSuccess]}
            onPress={() => runPhase(3)}
          >
            <Text style={styles.buttonText}>
              {phase >= 3 ? '✅ ' : ''}Phase 3: Notification Permissions
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, phase >= 4 && styles.buttonSuccess]}
            onPress={() => runPhase(4)}
          >
            <Text style={styles.buttonText}>
              {phase >= 4 ? '✅ ' : ''}Phase 4: Walking Callbacks
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, phase >= 5 && styles.buttonSuccess]}
            onPress={() => runPhase(5)}
          >
            <Text style={styles.buttonText}>
              {phase >= 5 ? '✅ ' : ''}Phase 5: Notification Listeners
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, phase >= 6 && styles.buttonSuccess]}
            onPress={() => runPhase(6)}
          >
            <Text style={styles.buttonText}>
              {phase >= 6 ? '✅ ' : ''}Phase 6: Load Supabase Data
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What Each Phase Tests</Text>
          <Text style={styles.instructionText}>
            Phase 1: Basic React state{'\n'}
            Phase 2: HealthConnect initialization{'\n'}
            Phase 3: Notification permission requests{'\n'}
            Phase 4: StepCounter callback setup{'\n'}
            Phase 5: Notification event listeners{'\n'}
            Phase 6: Supabase data loading{'\n\n'}
            If a phase crashes, that's where the issue is!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  errorText: {
    fontSize: 14,
    color: '#f44336',
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#2196f3',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonSuccess: {
    backgroundColor: '#4caf50',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});
