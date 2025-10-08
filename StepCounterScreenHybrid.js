import React, { useState, useEffect, useRef, useCallback } from 'react';
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

export default function StepCounterScreenHybrid() {
  const [stepCount, setStepCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [todaySteps, setTodaySteps] = useState(0);
  const [walkingSessions, setWalkingSessions] = useState([]);
  const [phase, setPhase] = useState(0);
  const [phaseStatus, setPhaseStatus] = useState({});
  
  const notificationListener = useRef();
  const responseListener = useRef();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    // Start with phase 0 - no automatic initialization
    console.log('Component mounted - waiting for user action');
    
    return () => {
      isMounted.current = false;
      if (notificationListener.current) {
        StepCounterService?.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        StepCounterService?.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const runPhase = async (phaseNumber) => {
    try {
      console.log(`Running phase ${phaseNumber}`);
      
      switch(phaseNumber) {
        case 1: // Initialize HealthConnect
          const hcInit = await HealthConnectService.initializeHealthConnect();
          if (hcInit) {
            await HealthConnectService.requestPermissions();
          }
          setPhaseStatus(prev => ({...prev, 1: 'success'}));
          break;
          
        case 2: // Request Notifications
          await StepCounterService.requestNotificationPermissions();
          setPhaseStatus(prev => ({...prev, 2: 'success'}));
          break;
          
        case 3: // Set up callbacks - NO PROMPTS, just logging
          StepCounterService.setWalkingCallbacks(
            () => console.log('Walking detected callback'),
            () => console.log('Walking stopped callback')
          );
          setPhaseStatus(prev => ({...prev, 3: 'success'}));
          break;
          
        case 4: // Set up notification listeners
          notificationListener.current = await StepCounterService.addNotificationReceivedListener(
            notification => console.log('Notification received:', notification)
          );
          responseListener.current = await StepCounterService.addNotificationResponseReceivedListener(
            response => console.log('Notification response:', response)
          );
          setPhaseStatus(prev => ({...prev, 4: 'success'}));
          break;
          
        case 5: // Load Supabase data
          await loadTodaySteps();
          setPhaseStatus(prev => ({...prev, 5: 'success'}));
          break;
          
        case 6: // Add full UI features with state updates
          // Re-setup callbacks with actual state updates
          StepCounterService.setWalkingCallbacks(
            () => {
              console.log('Walking detected - updating state');
              if (isMounted.current) {
                setIsWalking(true);
                StepCounterService.startWalkingSession();
              }
            },
            () => {
              console.log('Walking stopped - updating state');
              if (isMounted.current) {
                handleWalkingStop();
              }
            }
          );
          setPhaseStatus(prev => ({...prev, 6: 'success'}));
          break;
      }
      
      setPhase(phaseNumber);
      console.log(`Phase ${phaseNumber} completed successfully`);
    } catch (error) {
      console.error(`Phase ${phaseNumber} error:`, error);
      setPhaseStatus(prev => ({...prev, [phaseNumber]: 'error'}));
    }
  };

  const loadTodaySteps = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const user = await supabase.auth.getUser();
      
      if (!user.data.user) return;

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

  const handleWalkingStop = async () => {
    const session = StepCounterService.stopWalkingSession();
    setIsWalking(false);

    if (session && session.steps > 0) {
      await saveDailySteps(session);
      await syncToHealthConnect(session);
      await loadTodaySteps();
      console.log(`Walk completed: ${session.steps} steps`);
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

      if (existingData) {
        await supabase
          .from('daily_steps')
          .update({
            total_steps: newTotalSteps,
            walking_sessions: newSessions,
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

  const manualStart = () => {
    StepCounterService.startWalkingSession();
    setIsWalking(true);
  };

  const manualStop = async () => {
    await handleWalkingStop();
  };

  useEffect(() => {
    if (!isWalking) return;
    
    const interval = setInterval(() => {
      if (isMounted.current) {
        setStepCount(StepCounterService.getStepCount());
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isWalking]);

  if (!StepCounterService || !HealthConnectService || !supabase) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Step Counter Unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Hybrid Diagnostic Test</Text>
          <Text style={styles.subtitle}>
            Run phases manually, then use full UI
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phase Control</Text>
          <TouchableOpacity 
            style={[styles.phaseButton, phaseStatus[1] === 'success' && styles.phaseSuccess]}
            onPress={() => runPhase(1)}
          >
            <Text style={styles.buttonText}>Phase 1: Init HealthConnect</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.phaseButton, phaseStatus[2] === 'success' && styles.phaseSuccess]}
            onPress={() => runPhase(2)}
          >
            <Text style={styles.buttonText}>Phase 2: Notification Perms</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.phaseButton, phaseStatus[3] === 'success' && styles.phaseSuccess]}
            onPress={() => runPhase(3)}
          >
            <Text style={styles.buttonText}>Phase 3: Setup Callbacks (logging only)</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.phaseButton, phaseStatus[4] === 'success' && styles.phaseSuccess]}
            onPress={() => runPhase(4)}
          >
            <Text style={styles.buttonText}>Phase 4: Notification Listeners</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.phaseButton, phaseStatus[5] === 'success' && styles.phaseSuccess]}
            onPress={() => runPhase(5)}
          >
            <Text style={styles.buttonText}>Phase 5: Load Supabase Data</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.phaseButton, phaseStatus[6] === 'success' && styles.phaseSuccess]}
            onPress={() => runPhase(6)}
          >
            <Text style={styles.buttonText}>Phase 6: Enable Full UI Features</Text>
          </TouchableOpacity>
        </View>

        {phase >= 5 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Today's Steps</Text>
            <Text style={styles.stepsCount}>{todaySteps.toLocaleString()}</Text>
          </View>
        )}

        {phase >= 6 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Session</Text>
            <Text style={styles.sessionSteps}>{stepCount} steps</Text>
            <Text style={styles.statusText}>
              Status: {isWalking ? '🟢 Walking' : '⚫ Not Walking'}
            </Text>
            
            {!isWalking ? (
              <TouchableOpacity style={styles.startButton} onPress={manualStart}>
                <Text style={styles.buttonText}>Start Walking</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.stopButton} onPress={manualStop}>
                <Text style={styles.buttonText}>Stop Walking</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {phase >= 6 && walkingSessions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Walking Sessions Today</Text>
            {walkingSessions.map((session, index) => (
              <View key={index} style={styles.sessionItem}>
                <Text style={styles.sessionText}>
                  Session {index + 1}: {session.steps} steps
                </Text>
              </View>
            ))}
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
  phaseButton: {
    backgroundColor: '#2196f3',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  phaseSuccess: {
    backgroundColor: '#4caf50',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
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
  sessionItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sessionText: {
    fontSize: 16,
    color: '#333',
  },
  errorText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f44336',
  },
});
