import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';

let Notifications = null;
let StepCounterService = null;
let HealthConnectService = null;
let supabase = null;

try {
  Notifications = require('expo-notifications');
  StepCounterService = require('./StepCounterService').default;
  HealthConnectService = require('./HealthConnectService').default;
  supabase = require('./supabaseClient').supabase;
} catch (error) {
  console.error('Failed to load dependencies:', error);
}

export default function StepCounterScreen() {
  if (!Notifications || !StepCounterService || !HealthConnectService || !supabase) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Failed to load step counter</Text>
        <Text style={styles.errorSubtext}>Please restart the app</Text>
      </View>
    );
  }
  const [stepCount, setStepCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [todaySteps, setTodaySteps] = useState(0);
  const [walkingSessions, setWalkingSessions] = useState([]);
  const [showWalkingPrompt, setShowWalkingPrompt] = useState(false);
  const [showStopPrompt, setShowStopPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    const init = async () => {
      try {
        await initializeStepCounter();
        await loadTodaySteps();
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    init();
    
    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const initializeStepCounter = async () => {
    try {
      const initialized = await HealthConnectService.initializeHealthConnect();
      if (initialized) {
        const granted = await HealthConnectService.requestPermissions();
        if (!granted) {
          console.log('Health Connect permissions not granted');
        }
      }
    } catch (error) {
      console.error('Health Connect initialization error:', error);
    }

    try {
      await StepCounterService.requestNotificationPermissions();
    } catch (error) {
      console.error('Notification permissions error:', error);
    }
  };

  const loadTodaySteps = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const user = await supabase.auth.getUser();
      
      if (!user.data.user) {
        console.log('No user logged in');
        return;
      }

      const { data, error } = await supabase
        .from('daily_steps')
        .select('*')
        .eq('user_id', user.data.user.id)
        .eq('date', today)
        .single();

      if (data) {
        setTodaySteps(data.total_steps);
        setWalkingSessions(data.walking_sessions || []);
      }
    } catch (error) {
      console.log('No steps data for today yet');
    }
  };

  const handleWalkingConfirmation = useCallback(async (confirmed) => {
    setShowWalkingPrompt(false);
    
    if (confirmed) {
      StepCounterService.startWalkingSession();
      setIsWalking(true);
    } else {
      StepCounterService.recordRejection();
    }
  }, []);

  const handleStopWalkingConfirmation = useCallback(async (confirmed) => {
    setShowStopPrompt(false);
    
    if (confirmed) {
      const session = StepCounterService.stopWalkingSession();
      setIsWalking(false);
      
      if (session && session.steps > 0) {
        await saveDailySteps(session);
        
        await HealthConnectService.syncStepsToHealthConnect(
          session.steps,
          session.startTime,
          session.endTime
        );
        
        Alert.alert(
          'Walk Completed',
          `You walked ${session.steps} steps!`,
          [{ text: 'Great!' }]
        );
      }
    } else {
      StepCounterService.recordRejection();
    }
  }, []);

  useEffect(() => {
    if (isWalking) {
      const interval = setInterval(() => {
        setStepCount(StepCounterService.getStepCount());
      }, 500);
      
      return () => clearInterval(interval);
    }
  }, [isWalking]);

  useEffect(() => {
    try {
      StepCounterService.setWalkingCallbacks(
        () => setShowWalkingPrompt(true),
        () => setShowStopPrompt(true)
      );

      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification response:', response);
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
      });
    } catch (error) {
      console.error('Error setting up notification listeners:', error);
    }
  }, [handleWalkingConfirmation, handleStopWalkingConfirmation]);

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
        await supabase.from('daily_steps').insert({
          user_id: user.data.user.id,
          date: today,
          total_steps: newTotalSteps,
          walking_sessions: newSessions,
          distance_meters: estimatedDistance,
          calories_burned: estimatedCalories,
        });
      }

      setTodaySteps(newTotalSteps);
      setWalkingSessions(newSessions);
    } catch (error) {
      console.error('Error saving daily steps:', error);
    }
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Step Counter</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Steps</Text>
        <Text style={styles.stepCount}>{todaySteps.toLocaleString()}</Text>
        <Text style={styles.cardSubtitle}>
          {isWalking ? '🚶 Currently Walking' : '⏸️ Not Walking'}
        </Text>
      </View>

      {!isWalking ? (
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => handleWalkingConfirmation(true)}
        >
          <Text style={styles.buttonText}>Start Walking</Text>
        </TouchableOpacity>
      ) : (
        <View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Session</Text>
            <Text style={styles.stepCount}>
              {stepCount}
            </Text>
            <Text style={styles.cardSubtitle}>steps</Text>
          </View>
          <TouchableOpacity
            style={styles.stopButton}
            onPress={() => handleStopWalkingConfirmation(true)}
          >
            <Text style={styles.buttonText}>Stop Walking</Text>
          </TouchableOpacity>
        </View>
      )}

      {showWalkingPrompt && (
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>🚶 Walking Detected!</Text>
          <Text style={styles.promptText}>Are you walking?</Text>
          <View style={styles.promptButtons}>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonYes]}
              onPress={() => handleWalkingConfirmation(true)}
            >
              <Text style={styles.promptButtonText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonNo]}
              onPress={() => handleWalkingConfirmation(false)}
            >
              <Text style={styles.promptButtonText}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showStopPrompt && (
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>⏸️ Walking Stopped?</Text>
          <Text style={styles.promptText}>Did you stop walking?</Text>
          <View style={styles.promptButtons}>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonYes]}
              onPress={() => handleStopWalkingConfirmation(true)}
            >
              <Text style={styles.promptButtonText}>Yes, Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.promptButton, styles.promptButtonNo]}
              onPress={() => handleStopWalkingConfirmation(false)}
            >
              <Text style={styles.promptButtonText}>No, Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.sessionsContainer}>
        <Text style={styles.sectionTitle}>Today's Walking Sessions</Text>
        {walkingSessions.length === 0 ? (
          <Text style={styles.emptyText}>No walking sessions yet today</Text>
        ) : (
          walkingSessions.map((session, index) => (
            <View key={index} style={styles.sessionCard}>
              <View style={styles.sessionRow}>
                <Text style={styles.sessionTime}>
                  {formatTime(session.startTime)} - {formatTime(session.endTime)}
                </Text>
                <Text style={styles.sessionSteps}>{session.steps} steps</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 How it works</Text>
        <Text style={styles.infoText}>
          • Walking is detected using sensor patterns
        </Text>
        <Text style={styles.infoText}>
          • You'll get a notification to confirm when walking starts/stops
        </Text>
        <Text style={styles.infoText}>
          • Steps are counted only during confirmed walking sessions
        </Text>
        <Text style={styles.infoText}>
          • Data syncs to Health Connect automatically
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
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
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  stepCount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    margin: 16,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#f44336',
    margin: 16,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sessionsContainer: {
    margin: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    paddingVertical: 20,
  },
  sessionCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionTime: {
    fontSize: 14,
    color: '#666',
  },
  sessionSteps: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    margin: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
    lineHeight: 20,
  },
  promptCard: {
    backgroundColor: '#FFF9C4',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FBC02D',
  },
  promptTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F57F17',
    textAlign: 'center',
    marginBottom: 8,
  },
  promptText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  promptButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  promptButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  promptButtonYes: {
    backgroundColor: '#4CAF50',
  },
  promptButtonNo: {
    backgroundColor: '#f44336',
  },
  promptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
