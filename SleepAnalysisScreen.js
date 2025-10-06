import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from './supabaseClient';

let SLEEP_API_URL;
try {
  const envModule = require('./env.js');
  SLEEP_API_URL = envModule.SLEEP_API_URL;
} catch (error) {
  SLEEP_API_URL = process.env.EXPO_PUBLIC_SLEEP_API_URL || process.env.SLEEP_API_URL;
}

export default function SleepAnalysisScreen() {
  const [sessions, setSessions] = useState([]);
  const [analyses, setAnalyses] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingSessionId, setProcessingSessionId] = useState(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      if (!supabase) {
        Alert.alert('Offline Mode', 'Sleep analysis requires cloud sync to be configured.');
        setLoading(false);
        return;
      }

      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .order('start_time', { ascending: false });

      if (sessionsError) throw sessionsError;

      setSessions(sessionsData || []);

      const { data: analysesData, error: analysesError } = await supabase
        .from('sleep_analysis')
        .select('*');

      if (analysesError) throw analysesError;

      const analysisMap = {};
      (analysesData || []).forEach(analysis => {
        analysisMap[analysis.session_id] = analysis;
      });
      setAnalyses(analysisMap);

    } catch (error) {
      console.error('Error loading sessions:', error);
      Alert.alert('Error', 'Failed to load sessions: ' + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  const analyzeSleep = async (sessionId) => {
    if (!SLEEP_API_URL) {
      Alert.alert(
        'Configuration Error',
        'Sleep analysis API is not configured. Please check your environment settings.'
      );
      return;
    }

    setProcessingSessionId(sessionId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        Alert.alert('Authentication Error', 'Please sign in again.');
        return;
      }

      const response = await fetch(`${SLEEP_API_URL}/analyze-sleep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.status === 'completed') {
          Alert.alert(
            'Analysis Complete!',
            result.cached ? 'Loaded existing analysis.' : 'Sleep analysis completed successfully!'
          );
          loadSessions();
        } else if (result.status === 'processing') {
          Alert.alert('Processing', 'Analysis already in progress. Please check back in a moment.');
          setTimeout(() => loadSessions(), 3000);
        }
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Error analyzing sleep:', error);
      Alert.alert('Error', 'Failed to analyze sleep: ' + error.message);
    } finally {
      setProcessingSessionId(null);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '0h 0m';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const renderSessionCard = (session) => {
    const analysis = analyses[session.id];
    const hasAnalysis = analysis && analysis.processing_status === 'completed';
    const isProcessing = analysis?.processing_status === 'processing' || processingSessionId === session.id;
    const hasError = analysis?.processing_status === 'error';

    return (
      <View key={session.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sessionTitle}>
            {session.device_name || 'Polar Sensor'}
          </Text>
          <Text style={styles.sessionDate}>
            {formatDate(session.start_time)}
          </Text>
        </View>

        <View style={styles.sessionStats}>
          <Text style={styles.statText}>
            📊 {session.total_records?.toLocaleString() || 0} records
          </Text>
          <Text style={styles.statText}>
            {session.session_mode === 'sdk' ? '🔬 SDK Mode' : '❤️ Standard Mode'}
          </Text>
        </View>

        {hasAnalysis && (
          <View style={styles.analysisSection}>
            <Text style={styles.sectionTitle}>Sleep Analysis</Text>
            
            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Sleep Time</Text>
                <Text style={styles.metricValue}>
                  {formatDuration(analysis.total_sleep_time_minutes)}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Efficiency</Text>
                <Text style={styles.metricValue}>
                  {analysis.sleep_efficiency_percent?.toFixed(1) || 0}%
                </Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Sleep Onset</Text>
                <Text style={styles.metricValueSmall}>
                  {analysis.sleep_onset ? new Date(analysis.sleep_onset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Wake Time</Text>
                <Text style={styles.metricValueSmall}>
                  {analysis.wake_time ? new Date(analysis.wake_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Awakenings</Text>
                <Text style={styles.metricValue}>
                  {analysis.number_of_awakenings || 0}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>WASO</Text>
                <Text style={styles.metricValue}>
                  {formatDuration(analysis.wake_after_sleep_onset_minutes)}
                </Text>
              </View>
            </View>

            {analysis.hr_metrics?.avg_hr && (
              <View style={styles.hrSection}>
                <Text style={styles.hrLabel}>Avg HR: {analysis.hr_metrics.avg_hr.toFixed(0)} bpm</Text>
                <Text style={styles.hrLabel}>
                  Range: {analysis.hr_metrics.min_hr?.toFixed(0)} - {analysis.hr_metrics.max_hr?.toFixed(0)} bpm
                </Text>
              </View>
            )}
          </View>
        )}

        {hasError && (
          <View style={styles.errorSection}>
            <Text style={styles.errorText}>⚠️ Analysis Error</Text>
            <Text style={styles.errorDetail}>{analysis.processing_error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            isProcessing && styles.buttonDisabled,
            hasAnalysis && styles.buttonSuccess,
          ]}
          onPress={() => analyzeSleep(session.id)}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.buttonText}>  Processing...</Text>
            </View>
          ) : hasAnalysis ? (
            <Text style={styles.buttonText}>Refresh Analysis</Text>
          ) : (
            <Text style={styles.buttonText}>Analyze Sleep</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading sessions...</Text>
      </View>
    );
  }

  if (!supabase) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>⚠️ Cloud sync not configured</Text>
        <Text style={styles.subtitle}>Sleep analysis requires Supabase connection</Text>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No sessions found</Text>
        <Text style={styles.subtitle}>Record some sensor data first</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Sleep Analysis</Text>
        <Text style={styles.subtitle}>
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded
        </Text>
      </View>

      {sessions.map(renderSessionCard)}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Pull to refresh • Sleep analysis powered by PPG + ACC data
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#007AFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#e0e0e0',
  },
  card: {
    backgroundColor: '#fff',
    margin: 15,
    marginTop: 10,
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 10,
    marginBottom: 10,
  },
  sessionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sessionDate: {
    fontSize: 14,
    color: '#666',
  },
  sessionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statText: {
    fontSize: 13,
    color: '#666',
  },
  analysisSection: {
    marginTop: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  metricValueSmall: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  hrSection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  hrLabel: {
    fontSize: 12,
    color: '#666',
  },
  errorSection: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  errorText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 4,
  },
  errorDetail: {
    fontSize: 12,
    color: '#856404',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  buttonSuccess: {
    backgroundColor: '#34C759',
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
