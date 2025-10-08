import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

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

export default function StepCounterScreen() {
  const [stepCount, setStepCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [todaySteps, setTodaySteps] = useState(0);
  const [walkingSessions, setWalkingSessions] = useState([]);
  const [initialized, setInitialized] = useState(false);
  
  const isMounted = useRef(true);

  // NO automatic initialization - wait for user
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Step count updater
  useEffect(() => {
    if (!isWalking) return;
    
    const interval = setInterval(() => {
      if (isMounted.current) {
        setStepCount(StepCounterService.getStepCount());
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isWalking]);

  const runInitialization = async () => {
    try {
      console.log('Initializing step counter...');
      
      // Simple setup - callbacks only, no async calls that might fail
      if (isMounted.current) {
        StepCounterService.setWalkingCallbacks(
          () => {
            if (isMounted.current) {
              StepCounterService.startWalkingSession();
              setIsWalking(true);
            }
          },
          async () => {
            if (isMounted.current) {
              const session = StepCounterService.stopWalkingSession();
              setIsWalking(false);
              if (session && session.steps > 0) {
                await saveDailySteps(session);
                await loadTodaySteps();
              }
            }
          }
        );
      }

      // Load today's steps
      if (isMounted.current) {
        await loadTodaySteps();
      }

      // Mark as initialized
      if (isMounted.current) {
        setInitialized(true);
        console.log('Step counter initialized successfully');
      }
    } catch (error) {
      console.error('Init error:', error);
      // Initialize anyway so user can use the app
      if (isMounted.current) {
        setInitialized(true);
      }
    }
  };

  const loadTodaySteps = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const user = await supabase.auth.getUser();
      
      if (!user.data.user || !isMounted.current) return;

      const { data } = await supabase
        .from('daily_steps')
        .select('*')
        .eq('user_id', user.data.user.id)
        .eq('date', today)
        .single();

      if (data && isMounted.current) {
        setTodaySteps(data.total_steps || 0);
        setWalkingSessions(data.walking_sessions || []);
      }
    } catch (error) {
      console.log('No steps data yet');
    }
  };

  const saveDailySteps = async (session) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const user = await supabase.auth.getUser();
      
      if (!user.data.user) return;

      const { data: existingData } = await supabase
        .from('daily_steps')
        .select('*')
        .eq('user_id', user.data.user.id)
        .eq('date', today)
        .single();

      const newTotalSteps = (existingData?.total_steps || 0) + session.steps;
      const newSessions = [...(existingData?.walking_sessions || []), session];
      const estimatedDistance = session.steps * 0.762;
      const estimatedCalories = session.steps * 0.04;

      if (existingData) {
        await supabase
          .from('daily_steps')
          .update({
            total_steps: newTotalSteps,
            walking_sessions: newSessions,
            distance_meters: (existingData.distance_meters || 0) + estimatedDistance,
            calories_burned: (existingData.calories_burned || 0) + estimatedCalories,
          })
          .eq('id', existingData.id);
      } else {
        await supabase
          .from('daily_steps')
          .insert({
            user_id: user.data.user.id,
            date: today,
            total_steps: newTotalSteps,
            walking_sessions: newSessions,
            distance_meters: estimatedDistance,
            calories_burned: estimatedCalories,
          });
      }
    } catch (error) {
      console.error('Error saving steps:', error);
    }
  };

  const syncToHealthConnect = async (session) => {
    // SKIP HealthConnect in production - causes crashes
    // Steps are still saved to Supabase
    console.log('HealthConnect sync skipped (production build)');
  };

  const manualStart = () => {
    StepCounterService.startWalkingSession();
    setIsWalking(true);
  };

  const manualStop = async () => {
    const session = StepCounterService.stopWalkingSession();
    setIsWalking(false);
    if (session && session.steps > 0) {
      await saveDailySteps(session);
      await syncToHealthConnect(session);
      await loadTodaySteps();
    }
  };

  if (!StepCounterService || !HealthConnectService || !supabase) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Step Counter Unavailable</Text>
      </View>
    );
  }

  if (!initialized) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🚶 Step Counter</Text>
        <Text style={styles.subtitle}>Gyroscope-based walking detection</Text>
        <TouchableOpacity style={styles.initButton} onPress={runInitialization}>
          <Text style={styles.initButtonText}>Get Started</Text>
        </TouchableOpacity>
        <Text style={styles.note}>Steps are saved to your account</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Step Counter</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>Today's Steps</Text>
        <Text style={styles.bigNumber}>{todaySteps.toLocaleString()}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Current Session</Text>
        <Text style={styles.bigNumber}>{stepCount}</Text>
        <Text style={styles.status}>{isWalking ? '🟢 Walking' : '⚫ Not Walking'}</Text>
        
        {!isWalking ? (
          <TouchableOpacity style={styles.button} onPress={manualStart}>
            <Text style={styles.buttonText}>Start Walking</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.button, styles.stopBtn]} onPress={manualStop}>
            <Text style={styles.buttonText}>Stop Walking</Text>
          </TouchableOpacity>
        )}
      </View>

      {walkingSessions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Today's Sessions</Text>
          {walkingSessions.slice(-5).reverse().map((session, index) => (
            <View key={index} style={styles.sessionItem}>
              <Text style={styles.sessionText}>
                {session.steps} steps
              </Text>
              <Text style={styles.sessionTime}>
                {new Date(session.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 40,
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  bigNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2196f3',
  },
  status: {
    fontSize: 18,
    color: '#666',
    marginTop: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopBtn: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  initButton: {
    backgroundColor: '#2196f3',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 40,
  },
  initButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sessionText: {
    fontSize: 16,
    color: '#333',
  },
  sessionTime: {
    fontSize: 14,
    color: '#999',
  },
  errorText: {
    fontSize: 18,
    color: '#f44336',
    textAlign: 'center',
    marginTop: 100,
  },
  note: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
});
