import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  StyleSheet, 
  Text, 
  View, 
  Button, 
  FlatList, 
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import * as Device from 'expo-device';
import { Buffer } from 'buffer';

const bleManager = new BleManager();

// Polar BLE UUIDs
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_CHARACTERISTIC = '00002a37-0000-1000-8000-00805f9b34fb';
const PMD_SERVICE = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';
const PMD_CONTROL = 'fb005c81-02e7-f387-1cad-8acd2d8df0c8';
const PMD_DATA = 'fb005c82-02e7-f387-1cad-8acd2d8df0c8';

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [heartRate, setHeartRate] = useState(null);
  const [ppg, setPpg] = useState(null);
  const [ppi, setPpi] = useState(null);
  const [accelerometer, setAccelerometer] = useState({ x: 0, y: 0, z: 0 });
  const [gyroscope, setGyroscope] = useState({ x: 0, y: 0, z: 0 });
  const [magnetometer, setMagnetometer] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    requestPermissions();
    
    return () => {
      if (connectedDevice) {
        connectedDevice.cancelConnection();
      }
      bleManager.destroy();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        
        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          Alert.alert(
            'Permissions Required',
            'Please grant all Bluetooth permissions to scan for Polar devices.'
          );
        }
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Location Permission Required',
            'Please grant location permission to scan for Bluetooth devices.'
          );
        }
      }
    }
  };

  const scanForDevices = () => {
    setDevices([]);
    setScanning(true);
    
    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Scan error:', error);
        setScanning(false);
        return;
      }
      
      if (device && device.name && device.name.includes('Polar')) {
        setDevices(prevDevices => {
          const exists = prevDevices.find(d => d.id === device.id);
          if (!exists) {
            return [...prevDevices, device];
          }
          return prevDevices;
        });
      }
    });
    
    setTimeout(() => {
      bleManager.stopDeviceScan();
      setScanning(false);
    }, 10000);
  };

  const connectToDevice = async (device) => {
    try {
      bleManager.stopDeviceScan();
      setScanning(false);
      
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      
      await subscribeToHeartRate(connected);
      
      Alert.alert('Connected', `Connected to ${device.name}`);
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert('Connection Error', error.message);
    }
  };

  const subscribeToHeartRate = async (device) => {
    try {
      device.monitorCharacteristicForService(
        HEART_RATE_SERVICE,
        HEART_RATE_CHARACTERISTIC,
        (error, characteristic) => {
          if (error) {
            console.error('HR monitor error:', error);
            return;
          }
          
          if (characteristic && characteristic.value) {
            const data = Buffer.from(characteristic.value, 'base64');
            
            const flags = data[0];
            const hrFormat = flags & 0x01;
            const sensorContactStatus = (flags >> 1) & 0x03;
            const energyExpendedPresent = (flags >> 3) & 0x01;
            const rrIntervalPresent = (flags >> 4) & 0x01;
            
            let offset = 1;
            
            let hr;
            if (hrFormat === 0) {
              hr = data[offset];
              offset += 1;
            } else {
              hr = data.readUInt16LE(offset);
              offset += 2;
            }
            setHeartRate(hr);
            
            if (energyExpendedPresent) {
              offset += 2;
            }
            
            if (rrIntervalPresent && offset < data.length) {
              const rrIntervals = [];
              while (offset + 1 < data.length) {
                const rr1024 = data.readUInt16LE(offset);
                const rrMs = Math.round((rr1024 / 1024) * 1000);
                rrIntervals.push(rrMs);
                offset += 2;
              }
              if (rrIntervals.length > 0) {
                setPpi(rrIntervals[rrIntervals.length - 1]);
              }
            }
          }
        }
      );
    } catch (error) {
      console.error('Failed to subscribe to HR:', error);
    }
  };

  const disconnect = async () => {
    if (connectedDevice) {
      await connectedDevice.cancelConnection();
      setConnectedDevice(null);
      setHeartRate(null);
      setPpg(null);
      setPpi(null);
      setAccelerometer({ x: 0, y: 0, z: 0 });
      setGyroscope({ x: 0, y: 0, z: 0 });
      setMagnetometer({ x: 0, y: 0, z: 0 });
    }
  };

  const renderDevice = ({ item }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => connectToDevice(item)}
    >
      <Text style={styles.deviceName}>{item.name}</Text>
      <Text style={styles.deviceId}>{item.id}</Text>
    </TouchableOpacity>
  );

  if (connectedDevice) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.dataContainer}>
          <Text style={styles.title}>Polar Verity Sense Data</Text>
          <Text style={styles.deviceName}>{connectedDevice.name}</Text>
          
          <View style={styles.sensorCard}>
            <Text style={styles.sensorTitle}>Heart Rate</Text>
            <Text style={styles.sensorValue}>
              {heartRate !== null ? `${heartRate} BPM` : 'Waiting...'}
            </Text>
          </View>
          
          <View style={styles.sensorCard}>
            <Text style={styles.sensorTitle}>PPI (RR Interval)</Text>
            <Text style={styles.sensorValue}>
              {ppi !== null ? `${ppi} ms` : 'Waiting...'}
            </Text>
          </View>
          
          <View style={styles.sensorCard}>
            <Text style={styles.sensorTitle}>PPG (Optical Sensor)</Text>
            <Text style={styles.sensorNote}>Requires PMD service - coming soon</Text>
          </View>
          
          <View style={styles.sensorCard}>
            <Text style={styles.sensorTitle}>Accelerometer</Text>
            <Text style={styles.sensorNote}>Requires PMD service - coming soon</Text>
          </View>
          
          <View style={styles.sensorCard}>
            <Text style={styles.sensorTitle}>Gyroscope</Text>
            <Text style={styles.sensorNote}>Requires PMD service - coming soon</Text>
          </View>
          
          <View style={styles.sensorCard}>
            <Text style={styles.sensorTitle}>Magnetometer</Text>
            <Text style={styles.sensorNote}>Requires PMD service - coming soon</Text>
          </View>
          
          <Text style={styles.note}>
            ✅ Currently showing: Heart Rate & RR Intervals (PPI){'\n'}
            ⏳ Coming: PPG, Accelerometer, Gyroscope, Magnetometer{'\n\n'}
            These require implementing Polar's proprietary PMD protocol.
          </Text>
        </ScrollView>
        
        <View style={styles.buttonContainer}>
          <Button title="Disconnect" onPress={disconnect} color="#dc3545" />
        </View>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Polar Device Scanner</Text>
      <Text style={styles.subtitle}>Looking for Polar Verity Sense</Text>
      
      <View style={styles.buttonContainer}>
        <Button
          title={scanning ? 'Scanning...' : 'Scan for Devices'}
          onPress={scanForDevices}
          disabled={scanning}
        />
      </View>
      
      {devices.length > 0 && (
        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={(item) => item.id}
          style={styles.deviceList}
        />
      )}
      
      {devices.length === 0 && !scanning && (
        <Text style={styles.emptyText}>
          No Polar devices found. Make sure your Polar Verity Sense is turned on.
        </Text>
      )}
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  buttonContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  deviceList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  deviceItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 5,
  },
  deviceId: {
    fontSize: 12,
    color: '#999',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
    paddingHorizontal: 40,
  },
  dataContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sensorCard: {
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sensorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sensorValue: {
    fontSize: 20,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  sensorNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    fontStyle: 'italic',
  },
  note: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
});
