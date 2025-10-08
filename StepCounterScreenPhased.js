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

export default function StepCounterScreenPhased() {
  const [stepCount, setStepCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [todaySteps, setTodaySteps] = useState(0);
  const [initPhase, setInitPhase] = useState('Starting...');
  const [initialized, setInitialized] = useState(false);
  
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    const initTimer = setTimeout(() => {
      if (isMounted.current) {
        runPhasedInitialization();
      }
    }, 500);

    return () => {
      isMounted.current = false;
      clearTimeout(initTimer);
    };
  }, []);

  // Helper to delay between phases (mimicking manual button clicks)
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const runPhasedInitialization = async () => {
    try {
      // Phase 1: HealthConnect
      setInitPhase('Phase 1/5: HealthConnect...');
      const hcInit = await HealthConnectService.initializeHealthConnect();
      if (hcInit && isMounted.current) {
        await HealthConnectService.requestPermissions();
      }
      await delay(200); // Pause between phases

      // Phase 2: Notifications
      if (!isMounted.current) return;
      setInitPhase('Phase 2/5: Notifications...');
      await StepCounterService.requestNotificationPermissions();
      await delay(200);

      // Phase 3: Callbacks
      if (!isMounted.current) return;
      setInitPhase('Phase 3/5: Callbacks...');
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
              await syncToHealthConnect(session);
              await loadTodaySteps();
            }
          }
        }
      );
      await delay(200);

      // Phase 4: Notification listeners
      if (!isMounted.current) return;
      setInitPhase('Phase 4/5: Listeners...');
      await StepCounterService.addNotificationReceivedListener(
        notification => console.log('Notification:', notification)
      );
      await StepCounterService.addNotificationResponseReceivedListener(
        response => console.log('Response:', response)
      );
      await delay(200);

      // Phase 5: Load data
      if (!isMounted.current) return;
      setInitPhase('Phase 5/5: Loading data...');
      await loadTodaySteps();
      await delay(200);

      if (isMounted.current) {
        setInitialized(true);
      }
    } catch (error) {
      console.error('Init error at phase:', initPhase, error);
      if (isMounted.current) {
        setInitPhase(`Error: ${error.message}`);
      }
    }
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
      console.error('Error saving steps:', error);
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
      console.error('Error syncing:', error);
    }
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
        <Text style={styles.loadingText}>{initPhase}</Text>
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
        <Text style={styles.status}>{isWalking ? 'Walking' : 'Not Walking'}</Text>
        
        {!isWalking ? (
          <TouchableOpacity style={styles.button} onPress={manualStart}>
            <Text style={styles.buttonText}>Start</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.button, styles.stopBtn]} onPress={manualStop}>
            <Text style={styles.buttonText}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>
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
    marginBottom: 20,
    color: '#333',
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
  errorText: {
    fontSize: 18,
    color: '#f44336',
    textAlign: 'center',
    marginTop: 100,
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 100,
  },
});
