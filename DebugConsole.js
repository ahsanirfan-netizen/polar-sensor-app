import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use globalThis to persist across fast refresh
if (!globalThis.__debugConsole) {
  globalThis.__debugConsole = {
    logBuffer: [],
    logListeners: [],
    intercepted: false,
    persistenceInterval: null,
  };
}

// Intercept console methods (only once)
if (!globalThis.__debugConsole.intercepted) {
  globalThis.__debugConsole.intercepted = true;
  globalThis.__originalConsoleLog = console.log;
  globalThis.__originalConsoleError = console.error;
  globalThis.__originalConsoleWarn = console.warn;
  
  console.log = (...args) => {
    globalThis.__originalConsoleLog(...args);
    addLog('log', args);
  };

  console.error = (...args) => {
    globalThis.__originalConsoleError(...args);
    addLog('error', args);
  };

  console.warn = (...args) => {
    globalThis.__originalConsoleWarn(...args);
    addLog('warn', args);
  };
}

function safeStringify(arg) {
  // Handle primitives
  if (arg === null || arg === undefined) return String(arg);
  
  // Handle BigInt primitives - show with 'n' suffix
  if (typeof arg === 'bigint') return `${arg}n`;
  
  // Handle Symbol primitives
  if (typeof arg === 'symbol') return String(arg);
  
  // Handle non-objects
  if (typeof arg !== 'object') return String(arg);
  
  // Handle Error objects specially - preserve message and stack
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
  }
  
  // Try JSON.stringify with circular reference and BigInt handling
  try {
    const seen = new WeakSet();
    return JSON.stringify(arg, (key, value) => {
      // Handle BigInt values in objects
      if (typeof value === 'bigint') {
        return `${value}n`;
      }
      // Handle Symbol values in objects
      if (typeof value === 'symbol') {
        return String(value);
      }
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    }, 2);
  } catch (error) {
    // Last resort fallback
    return String(arg);
  }
}

// Save logs to AsyncStorage for crash recovery
async function savePersistentLogs() {
  try {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    // Filter logs from last 5 minutes with full timestamp
    const recentLogs = globalThis.__debugConsole.logBuffer
      .filter(log => log.fullTimestamp && log.fullTimestamp >= fiveMinutesAgo)
      .map(log => ({
        type: log.type,
        message: log.message,
        timestamp: log.timestamp,
        fullTimestamp: log.fullTimestamp
      }));
    
    if (recentLogs.length > 0) {
      await AsyncStorage.setItem('DEBUG_CRASH_LOGS', JSON.stringify(recentLogs));
      await AsyncStorage.setItem('DEBUG_LAST_SAVE', now.toString());
    } else {
      // Clear stale crash logs if no recent logs exist (app has been quiet >5 minutes)
      await AsyncStorage.removeItem('DEBUG_CRASH_LOGS');
      await AsyncStorage.removeItem('DEBUG_LAST_SAVE');
    }
  } catch (error) {
    globalThis.__originalConsoleError('Failed to save crash logs:', error);
  }
}

// Load crash logs from previous session
export async function loadCrashLogs() {
  try {
    const crashLogs = await AsyncStorage.getItem('DEBUG_CRASH_LOGS');
    const lastSave = await AsyncStorage.getItem('DEBUG_LAST_SAVE');
    
    if (crashLogs && lastSave) {
      const logs = JSON.parse(crashLogs);
      const saveTime = parseInt(lastSave);
      const now = Date.now();
      const minutesAgo = Math.round((now - saveTime) / 60000);
      
      return {
        logs,
        minutesAgo,
        saveTime: new Date(saveTime).toLocaleString()
      };
    }
    return null;
  } catch (error) {
    globalThis.__originalConsoleError('Failed to load crash logs:', error);
    return null;
  }
}

// Clear crash logs after viewing
export async function clearCrashLogs() {
  try {
    await AsyncStorage.removeItem('DEBUG_CRASH_LOGS');
    await AsyncStorage.removeItem('DEBUG_LAST_SAVE');
  } catch (error) {
    globalThis.__originalConsoleError('Failed to clear crash logs:', error);
  }
}

function addLog(type, args) {
  const message = args.map(arg => safeStringify(arg)).join(' ');
  
  const log = {
    id: Date.now() + Math.random(),
    type,
    message,
    timestamp: new Date().toLocaleTimeString(),
    fullTimestamp: Date.now() // For 5-minute filtering
  };
  
  globalThis.__debugConsole.logBuffer.push(log);
  if (globalThis.__debugConsole.logBuffer.length > 500) {
    globalThis.__debugConsole.logBuffer.shift();
  }
  
  globalThis.__debugConsole.logListeners.forEach(listener => 
    listener(globalThis.__debugConsole.logBuffer)
  );
}

// Start persistent log saving (every 10 seconds)
if (!globalThis.__debugConsole.persistenceInterval) {
  globalThis.__debugConsole.persistenceInterval = setInterval(() => {
    savePersistentLogs();
  }, 10000); // Save every 10 seconds
}

export default function DebugConsole() {
  const [logs, setLogs] = useState(globalThis.__debugConsole.logBuffer);
  const [isVisible, setIsVisible] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [crashLogsLoaded, setCrashLogsLoaded] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    const listener = (newLogs) => setLogs([...newLogs]);
    globalThis.__debugConsole.logListeners.push(listener);
    
    // Load crash logs into console on first mount
    const loadCrashLogsIntoConsole = async () => {
      if (!crashLogsLoaded) {
        try {
          const crashData = await loadCrashLogs();
          if (crashData && crashData.logs.length > 0) {
            // Add separator
            globalThis.__debugConsole.logBuffer.unshift({
              id: 'crash-separator',
              type: 'warn',
              message: `========== CRASH LOGS FROM ${crashData.saveTime} (${crashData.minutesAgo} min ago) ==========`,
              timestamp: '---',
              fullTimestamp: Date.now()
            });
            
            // Add crash logs to beginning of buffer
            crashData.logs.reverse().forEach(log => {
              globalThis.__debugConsole.logBuffer.unshift({
                id: `crash-${log.fullTimestamp}-${Math.random()}`,
                type: log.type,
                message: log.message,
                timestamp: log.timestamp,
                fullTimestamp: log.fullTimestamp
              });
            });
            
            setLogs([...globalThis.__debugConsole.logBuffer]);
            setCrashLogsLoaded(true);
            globalThis.__originalConsoleLog('📋 Crash logs loaded into Debug Console');
          }
        } catch (error) {
          globalThis.__originalConsoleError('Failed to load crash logs into console:', error);
        }
      }
    };
    
    loadCrashLogsIntoConsole();
    
    return () => {
      const index = globalThis.__debugConsole.logListeners.indexOf(listener);
      if (index > -1) globalThis.__debugConsole.logListeners.splice(index, 1);
    };
  }, [crashLogsLoaded]);

  useEffect(() => {
    if (flatListRef.current && isVisible && autoScroll && logs.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [logs, isVisible, autoScroll]);

  const clearLogs = () => {
    globalThis.__debugConsole.logBuffer = [];
    setLogs([]);
  };

  const showCrashLogs = async () => {
    try {
      const crashData = await loadCrashLogs();
      if (crashData && crashData.logs.length > 0) {
        const logText = crashData.logs.map(log => 
          `[${log.timestamp}] ${log.message}`
        ).join('\n\n');
        
        Alert.alert(
          `⚠️ Crash Logs (${crashData.minutesAgo} min ago)`,
          `Found ${crashData.logs.length} logs from the last 5 minutes before crash.\n\nLast saved: ${crashData.saveTime}\n\n${logText.slice(0, 3000)}${logText.length > 3000 ? '\n\n... (truncated)' : ''}`,
          [
            {
              text: 'Clear Logs',
              style: 'destructive',
              onPress: async () => {
                await clearCrashLogs();
                Alert.alert('Cleared', 'Crash logs have been cleared.');
              }
            },
            { text: 'OK', style: 'cancel' }
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert('No Crash Logs', 'No crash logs found from previous session.');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to load crash logs: ${error.message}`);
    }
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'error': return '#ff6b6b';
      case 'warn': return '#ffa94d';
      default: return '#51cf66';
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <TouchableOpacity 
        style={styles.floatingButton}
        onPress={() => setIsVisible(!isVisible)}
      >
        <Text style={styles.floatingButtonText}>
          🐛 {logs.length}
        </Text>
      </TouchableOpacity>

      {/* Full screen overlay in Modal - renders on top of everything */}
      <Modal
        visible={isVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity 
            style={styles.overlayDismissArea}
            activeOpacity={1}
            onPress={() => setIsVisible(false)}
          />
          
          <View style={styles.consolePanel}>
            <View style={styles.header}>
              <Text style={styles.headerText}>
                🐛 Debug Console ({logs.length} logs)
              </Text>
              <View style={styles.headerButtons}>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={showCrashLogs}
                >
                  <Text style={styles.actionButtonText}>💥 Crash</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.actionButton, autoScroll && styles.actionButtonActive]}
                  onPress={() => setAutoScroll(!autoScroll)}
                >
                  <Text style={styles.actionButtonText}>{autoScroll ? '⏸' : '▶'}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={clearLogs}
                >
                  <Text style={styles.actionButtonText}>🗑</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setIsVisible(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <FlatList
              ref={flatListRef}
              data={logs}
              style={styles.logContainer}
              contentContainerStyle={styles.logContent}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.logEntry}>
                  <Text style={[styles.timestamp, { color: getLogColor(item.type) }]}>
                    [{item.timestamp}]
                  </Text>
                  <Text style={[styles.logMessage, { color: getLogColor(item.type) }]}>
                    {item.message}
                  </Text>
                </View>
              )}
              showsVerticalScrollIndicator={true}
              persistentScrollbar={true}
              removeClippedSubviews={false}
              windowSize={10}
              maxToRenderPerBatch={20}
              initialNumToRender={20}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 999999,
  },
  floatingButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  overlayDismissArea: {
    flex: 1,
  },
  consolePanel: {
    backgroundColor: '#1a1a1a',
    height: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2d2d2d',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  actionButtonActive: {
    backgroundColor: '#28a745',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  logContent: {
    padding: 12,
    flexGrow: 1,
  },
  logEntry: {
    flexDirection: 'row',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  timestamp: {
    fontSize: 10,
    marginRight: 8,
    fontFamily: 'monospace',
  },
  logMessage: {
    fontSize: 11,
    flex: 1,
    fontFamily: 'monospace',
  },
});
