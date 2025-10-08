import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
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

export default function StepCounterScreenSafe() {
  const [stepCount, setStepCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [todaySteps, setTodaySteps] = useState(0);
  const [walkingSessions, setWalkingSessions] = useState([]);
  const [showWalkingPrompt, setShowWalkingPrompt] = useState(false);
  const [showStopPrompt, setShowStopPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  
  const notificationListener = useRef();
  const responseListener = useRef();
  const isMounted = useRef(true);

  // CONSOLIDATED initialization - single useEffect instead of multiple
  useEffect(() => {
    isMounted.current = true;
    
    const initializeAll = async () => {
      try {
        // Step 1: Initialize services
        const hcInitialized = await HealthConnectService.initializeHealthConnect();
        if (hcInitialized && isMounted.current) {
          await HealthConnectService.requestPermissions();
        }

        // Step 2: Request notification permissions
        if (isMounted.current) {
          await StepCounterService.requestNotificationPermissions();
        }

        // Step 3: Set up callbacks
        if (isMounted.current) {
          StepCounterService.setWalkingCallbacks(
            () => isMounted.current && setShowWalkingPrompt(true),
            () => isMounted.current && setShowStopPrompt(true)
          );
        }

        // Step 4: Set up notification listeners
        if (isMounted.current) {
          notificationListener.current = await StepCounterService.addNotificationReceivedListener(
            notification => console.log('Notification received:', notification)
          );

          responseListener.current = await StepCounterService.addNotificationResponseReceivedListener(
            response => {
              if (!isMounted.current) return;
              
              const actionId = response.actionIdentifier;
              if (actionId === 'confirm_yes') {
                handleWalkingConfirmation(true);
              } else if (actionId === 'confirm_no') {
                handleWalkingConfirmation(false);
              } else if (actionId === 'stop_yes') {
                handleStopWalkingConfirmation(true);
              } else if (actionId === 'stop_no') {
                handleStopWalkingConfirmation(false);
              }
            }
          );
        }

        // Step 5: Load data
        if (isMounted.current) {
          await loadTodaySteps();
        }

        if (isMounted.current) {
          setInitialized(true);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Initialization error:', error);
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };

    initializeAll();

    return () => {
      isMounted.current = false;
      if (notificationListener.current) {
        StepCounterService.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        StepCounterService.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Separate useEffect for step count updates - simpler, less prone to issues
  useEffect(() => {
    if (!isWalking) return;
    
    const interval = setInterval(() => {
      if (isMounted.current) {
        setStepCount(StepCounterService.getStepCount());
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isWalking]);

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
        setTodaySteps(data.total_steps);
        setWalkingSessions(data.walking_sessions || []);
      }
    } catch (error) {
      console.log('No steps data for today yet');
    }
  };

  const handleWalkingConfirmation = useCallback(async (confirmed) => {
    if (!isMounted.current) return;
    
    setShowWalkingPrompt(false);

    if (confirmed) {
      StepCounterService.startWalkingSession();
      setIsWalking(true);
    } else {
      StepCounterService.recordRejection();
    }
  }, []);

  const handleStopWalkingConfirmation = useCallback(async (confirmed) => {
    if (!isMounted.current) return;
    
    setShowStopPrompt(false);

    if (confirmed) {
      const session = StepCounterService.stopWalkingSession();
      setIsWalking(false);

      if (session && session.steps > 0) {
        await saveDailySteps(session);
        await syncToHealthConnect(session);
        await loadTodaySteps();
        
        if (isMounted.current) {
          Alert.alert(
            'Walk Completed',
            `You walked ${session.steps} steps!`,
            [{ text: 'Great!' }]
          );
        }
      }
    } else {
      StepCounterService.recordRejection();
    }
  }, []);

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
      console.error('Error saving daily steps:', error);
    }
  };

  const syncToHealthConnect = async (session) => {
    try {
      await HealthConnectService.syncStepsToHealthConnect(
        session.steps,
        session.startTime,
        session.endTime
      );
    } catch (error) {
      console.error('Error syncing to Health Connect:', error);
    }
  };

  const manualStartWalking = () => {
    StepCounterService.startWalkingSession();
    setIsWalking(true);
  };

  const manualStopWalking = async () => {
    const session = StepCounterService.stopWalkingSession();
    setIsWalking(false);

    if (session && session.steps > 0) {
      await saveDailySteps(session);
      await syncToHealthConnect(session);
      await loadTodaySteps();
      
      Alert.alert(
        'Walk Completed',
        `You walked ${session.steps} steps!`,
        [{ text: 'Great!' }]
      );
    }
  };

  if (!StepCounterService || !HealthConnectService || !supabase) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Step Counter Unavailable</Text>
        <Text style={styles.errorSubtext}>Required modules could not be loaded</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Initializing step counter...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🚶 Step Counter</Text>
          <Text style={styles.subtitle}>
            Gyroscope-based walking detection with Health Connect sync
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's Steps</Text>
          <Text style={styles.stepsCount}>{todaySteps.toLocaleString()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Session</Text>
          <Text style={styles.sessionSteps}>{stepCount} steps</Text>
          <Text style={styles.statusText}>
            Status: {isWalking ? '🟢 Walking' : '⚫ Not Walking'}
          </Text>
          
          {!isWalking ? (
            <TouchableOpacity style={styles.startButton} onPress={manualStartWalking}>
              <Text style={styles.buttonText}>Start Walking</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={manualStopWalking}>
              <Text style={styles.buttonText}>Stop Walking</Text>
            </TouchableOpacity>
          )}
        </View>

        {walkingSessions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Walking Sessions Today</Text>
            {walkingSessions.map((session, index) => (
              <View key={index} style={styles.sessionItem}>
                <Text style={styles.sessionText}>
                  Session {index + 1}: {session.steps} steps
                </Text>
                <Text style={styles.sessionTime}>
                  {new Date(session.startTime).toLocaleTimeString()} - {new Date(session.endTime).toLocaleTimeString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {showWalkingPrompt && (
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Walking Detected 🚶</Text>
            <Text style={styles.promptText}>Are you walking?</Text>
            <View style={styles.promptButtons}>
              <TouchableOpacity 
                style={[styles.promptButton, styles.yesButton]} 
                onPress={() => handleWalkingConfirmation(true)}
              >
                <Text style={styles.promptButtonText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.promptButton, styles.noButton]} 
                onPress={() => handleWalkingConfirmation(false)}
              >
                <Text style={styles.promptButtonText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showStopPrompt && (
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Walking Stopped ⏸️</Text>
            <Text style={styles.promptText}>Did you stop walking?</Text>
            <View style={styles.promptButtons}>
              <TouchableOpacity 
                style={[styles.promptButton, styles.yesButton]} 
                onPress={() => handleStopWalkingConfirmation(true)}
              >
                <Text style={styles.promptButtonText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.promptButton, styles.noButton]} 
                onPress={() => handleStopWalkingConfirmation(false)}
              >
                <Text style={styles.promptButtonText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
  stepsCount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2196f3',
    textAlign: 'center',
  },
  sessionSteps: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4caf50',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#f44336',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sessionText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  sessionTime: {
    fontSize: 12,
    color: '#999',
  },
  promptCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 20,
    margin: 16,
    borderWidth: 2,
    borderColor: '#ffc107',
  },
  promptTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
    textAlign: 'center',
  },
  promptText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  promptButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  promptButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  yesButton: {
    backgroundColor: '#4caf50',
  },
  noButton: {
    backgroundColor: '#f44336',
  },
  promptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f44336',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#999',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
});
