import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';

// Use globalThis to persist across fast refresh
if (!globalThis.__debugConsole) {
  globalThis.__debugConsole = {
    logBuffer: [],
    logListeners: [],
    intercepted: false,
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

function addLog(type, args) {
  const message = args.map(arg => safeStringify(arg)).join(' ');
  
  const log = {
    id: Date.now() + Math.random(),
    type,
    message,
    timestamp: new Date().toLocaleTimeString()
  };
  
  globalThis.__debugConsole.logBuffer.push(log);
  if (globalThis.__debugConsole.logBuffer.length > 500) {
    globalThis.__debugConsole.logBuffer.shift();
  }
  
  globalThis.__debugConsole.logListeners.forEach(listener => 
    listener(globalThis.__debugConsole.logBuffer)
  );
}

export default function DebugConsole() {
  const [logs, setLogs] = useState(globalThis.__debugConsole.logBuffer);
  const [isVisible, setIsVisible] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    const listener = (newLogs) => setLogs([...newLogs]);
    globalThis.__debugConsole.logListeners.push(listener);
    
    return () => {
      const index = globalThis.__debugConsole.logListeners.indexOf(listener);
      if (index > -1) globalThis.__debugConsole.logListeners.splice(index, 1);
    };
  }, []);

  useEffect(() => {
    if (scrollViewRef.current && isVisible && autoScroll) {
      scrollViewRef.current.scrollToEnd({ animated: false });
    }
  }, [logs, isVisible, autoScroll]);

  const clearLogs = () => {
    globalThis.__debugConsole.logBuffer = [];
    setLogs([]);
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
        <TouchableOpacity 
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setIsVisible(false)}
        >
          <TouchableOpacity 
            style={styles.consolePanel}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <Text style={styles.headerText}>
                🐛 Debug Console ({logs.length} logs)
              </Text>
              <View style={styles.headerButtons}>
                <TouchableOpacity 
                  style={[styles.actionButton, autoScroll && styles.actionButtonActive]}
                  onPress={() => setAutoScroll(!autoScroll)}
                >
                  <Text style={styles.actionButtonText}>{autoScroll ? '⏸ Pause' : '▶ Auto'}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={clearLogs}
                >
                  <Text style={styles.actionButtonText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setIsVisible(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView 
              ref={scrollViewRef}
              style={styles.logContainer}
              contentContainerStyle={styles.logContent}
            >
              {logs.map((log) => (
                <View key={log.id} style={styles.logEntry}>
                  <Text style={[styles.timestamp, { color: getLogColor(log.type) }]}>
                    [{log.timestamp}]
                  </Text>
                  <Text style={[styles.logMessage, { color: getLogColor(log.type) }]}>
                    {log.message}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
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
