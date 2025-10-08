import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

// DIAGNOSTIC VERSION - No native modules, just basic UI
export default function StepCounterScreenDiagnostic() {
  const [diagnosticStep, setDiagnosticStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const runDiagnostic = async (stepNumber) => {
    setErrorMessage(null);
    
    try {
      switch (stepNumber) {
        case 1:
          // Test 1: Load StepCounterService
          const StepCounterService = require('./StepCounterService').default;
          if (!StepCounterService) throw new Error('StepCounterService is null');
          setDiagnosticStep(1);
          break;
          
        case 2:
          // Test 2: Load HealthConnectService
          const HealthConnectService = require('./HealthConnectService').default;
          if (!HealthConnectService) throw new Error('HealthConnectService is null');
          setDiagnosticStep(2);
          break;
          
        case 3:
          // Test 3: Load Supabase client
          const { supabase } = require('./supabaseClient');
          if (!supabase) throw new Error('Supabase is null');
          setDiagnosticStep(3);
          break;
          
        case 4:
          // Test 4: Try to initialize HealthConnect
          const HC = require('./HealthConnectService').default;
          await HC.initializeHealthConnect();
          setDiagnosticStep(4);
          break;
          
        case 5:
          // Test 5: Try to load notifications via StepCounterService
          const SCS = require('./StepCounterService').default;
          const loaded = await SCS.loadNotifications();
          if (!loaded) throw new Error('Failed to load notifications');
          setDiagnosticStep(5);
          break;
          
        default:
          setErrorMessage('Unknown test step');
      }
    } catch (error) {
      setErrorMessage(`Test ${stepNumber} failed: ${error.message}`);
      console.error(`Diagnostic test ${stepNumber} failed:`, error);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🔍 Step Counter Diagnostics</Text>
          <Text style={styles.subtitle}>
            Run tests to identify which module causes the crash
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Status</Text>
          <Text style={styles.statusText}>
            Step: {diagnosticStep}/5
          </Text>
          {errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Run Diagnostic Tests</Text>
          
          <TouchableOpacity 
            style={[styles.button, diagnosticStep >= 1 && styles.buttonSuccess]}
            onPress={() => runDiagnostic(1)}
          >
            <Text style={styles.buttonText}>
              {diagnosticStep >= 1 ? '✅ ' : ''}Test 1: Load StepCounterService
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, diagnosticStep >= 2 && styles.buttonSuccess]}
            onPress={() => runDiagnostic(2)}
          >
            <Text style={styles.buttonText}>
              {diagnosticStep >= 2 ? '✅ ' : ''}Test 2: Load HealthConnectService
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, diagnosticStep >= 3 && styles.buttonSuccess]}
            onPress={() => runDiagnostic(3)}
          >
            <Text style={styles.buttonText}>
              {diagnosticStep >= 3 ? '✅ ' : ''}Test 3: Load Supabase Client
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, diagnosticStep >= 4 && styles.buttonSuccess]}
            onPress={() => runDiagnostic(4)}
          >
            <Text style={styles.buttonText}>
              {diagnosticStep >= 4 ? '✅ ' : ''}Test 4: Initialize HealthConnect
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, diagnosticStep >= 5 && styles.buttonSuccess]}
            onPress={() => runDiagnostic(5)}
          >
            <Text style={styles.buttonText}>
              {diagnosticStep >= 5 ? '✅ ' : ''}Test 5: Load Notifications
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Instructions</Text>
          <Text style={styles.instructionText}>
            1. Run each test in order{'\n'}
            2. If a test crashes the app, that module is the problem{'\n'}
            3. If all tests pass, the issue is in the component itself
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
  statusText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
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
