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
  Alert,
  Switch
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
  const [sdkModeEnabled, setSdkModeEnabled] = useState(false);
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

  const enableSDKMode = async (device) => {
    try {
      const command = [0x02, 0x09];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
      console.log('SDK Mode enabled');
    } catch (error) {
      console.error('Failed to enable SDK mode:', error);
    }
  };

  const connectToDevice = async (device) => {
    try {
      bleManager.stopDeviceScan();
      setScanning(false);
      
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      
      await subscribeToPMD(connected);
      
      if (sdkModeEnabled) {
        await enableSDKMode(connected);
        await startMagStream(connected);
        Alert.alert('Connected', `Connected to ${device.name}. SDK Mode enabled - Magnetometer streaming.`);
      } else {
        Alert.alert('Connected', `Connected to ${device.name}. SDK Mode disabled - No sensors active.`);
      }
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

  const subscribeToPMD = async (device) => {
    try {
      device.monitorCharacteristicForService(
        PMD_SERVICE,
        PMD_DATA,
        (error, characteristic) => {
          if (error) {
            console.error('PMD monitor error:', error);
            return;
          }
          
          if (characteristic && characteristic.value) {
            const data = Buffer.from(characteristic.value, 'base64');
            const measurementType = data[0];
            
            switch (measurementType) {
              case 0x03:
                parsePPIData(data);
                break;
              case 0x01:
                parsePPGData(data);
                break;
              case 0x02:
                parseACCData(data);
                break;
              case 0x05:
                parseGyroData(data);
                break;
              case 0x06:
                parseMagData(data);
                break;
              default:
                console.log('Unknown measurement type:', measurementType);
            }
          }
        }
      );
    } catch (error) {
      console.error('Failed to subscribe to PMD:', error);
    }
  };

  const startPMDStream = async (device, command) => {
    try {
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
    } catch (error) {
      console.error('Failed to start PMD stream:', error);
    }
  };

  const startPPIStream = async (device) => {
    const command = [0x02, 0x03];
    await startPMDStream(device, command);
  };

  const startPPGStream = async (device) => {
    const command = [0x02, 0x01, 0x00, 0x01, 0x87, 0x00, 0x01, 0x01, 0x16, 0x00, 0x04, 0x01, 0x04];
    await startPMDStream(device, command);
  };

  const startACCStream = async (device) => {
    const command = [0x02, 0x02, 0x00, 0x01, 0xC8, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00];
    await startPMDStream(device, command);
  };

  const startGyroStream = async (device) => {
    const command = [0x02, 0x05, 0x00, 0x01, 0xC8, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00];
    await startPMDStream(device, command);
  };

  const startMagStream = async (device) => {
    const command = [0x02, 0x06];
    await startPMDStream(device, command);
  };

  const parsePPIData = (data) => {
    try {
      console.log('PPI data received, length:', data.length, 'bytes:', Array.from(data.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      
      if (data.length < 17) {
        console.log('PPI data too short');
        return;
      }
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      while (offset + 6 <= data.length) {
        const ppiMs = data.readUInt16LE(offset);
        offset += 2;
        
        const errorEstimate = data.readUInt16LE(offset);
        offset += 2;
        
        const hr = data[offset];
        offset += 1;
        
        const flags = data[offset];
        offset += 1;
        
        console.log('PPI parsed - PPI:', ppiMs, 'ms, HR:', hr, 'bpm, Error:', errorEstimate);
        
        if (ppiMs > 0) {
          setPpi(ppiMs);
        }
        if (hr > 0) {
          setHeartRate(hr);
        }
      }
    } catch (error) {
      console.error('PPI parse error:', error);
    }
  };

  const parsePPGData = (data) => {
    try {
      if (data.length < 15) return;
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      if (offset + 3 <= data.length) {
        const ppg0 = (data[offset] | (data[offset+1] << 8) | (data[offset+2] << 16)) & 0x3FFFFF;
        if (ppg0 !== 0) {
          setPpg(ppg0);
        }
      }
    } catch (error) {
      console.error('PPG parse error:', error);
    }
  };

  const parseACCData = (data) => {
    try {
      console.log('ACC data received, length:', data.length, 'type:', '0x' + data[0].toString(16));
      if (data.length < 17) return;
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      if (offset + 6 <= data.length) {
        const x = data.readInt16LE(offset);
        const y = data.readInt16LE(offset + 2);
        const z = data.readInt16LE(offset + 4);
        
        console.log('ACC raw values - x:', x, 'y:', y, 'z:', z);
        
        setAccelerometer({ 
          x: x / 1000, 
          y: y / 1000, 
          z: z / 1000 
        });
      }
    } catch (error) {
      console.error('ACC parse error:', error);
    }
  };

  const parseGyroData = (data) => {
    try {
      console.log('Gyro data received, length:', data.length, 'type:', '0x' + data[0].toString(16));
      if (data.length < 17) return;
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      if (offset + 6 <= data.length) {
        const x = data.readInt16LE(offset);
        const y = data.readInt16LE(offset + 2);
        const z = data.readInt16LE(offset + 4);
        
        console.log('Gyro raw values - x:', x, 'y:', y, 'z:', z);
        
        setGyroscope({ 
          x: x / 100, 
          y: y / 100, 
          z: z / 100 
        });
      }
    } catch (error) {
      console.error('Gyro parse error:', error);
    }
  };

  const parseMagData = (data) => {
    try {
      console.log('Mag data received, length:', data.length, 'type:', '0x' + data[0].toString(16));
      if (data.length < 17) return;
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      if (offset + 6 <= data.length) {
        const x = data.readInt16LE(offset);
        const y = data.readInt16LE(offset + 2);
        const z = data.readInt16LE(offset + 4);
        
        console.log('Mag raw values - x:', x, 'y:', y, 'z:', z);
        
        setMagnetometer({ x, y, z });
      }
    } catch (error) {
      console.error('Mag parse error:', error);
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

  const toggleSdkMode = (value) => {
    if (connectedDevice) {
      Alert.alert(
        'SDK Mode Toggle',
        'Please disconnect before changing SDK mode.',
        [{ text: 'OK' }]
      );
      return;
    }
    setSdkModeEnabled(value);
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
          
          <View style={styles.sdkModeContainer}>
            <Text style={styles.sdkModeLabel}>SDK Mode: {sdkModeEnabled ? 'ON' : 'OFF'}</Text>
            <Text style={styles.sdkModeNote}>
              {sdkModeEnabled ? '✅ Magnetometer active' : '❌ No sensors active'}
            </Text>
          </View>
          
          <View style={styles.sensorCard}>
            <Text style={styles.sensorTitle}>Magnetometer (μT)</Text>
            <Text style={styles.sensorValue}>
              {sdkModeEnabled 
                ? `X: ${magnetometer.x} | Y: ${magnetometer.y} | Z: ${magnetometer.z}`
                : 'SDK Mode required'}
            </Text>
          </View>
          
          <Text style={styles.note}>
            {sdkModeEnabled 
              ? 'Testing magnetometer only. Enable SDK mode before connecting to stream data.' 
              : 'SDK mode is OFF. Disconnect and enable SDK mode to test magnetometer.'}
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
      
      <View style={styles.sdkToggleContainer}>
        <View style={styles.sdkToggleRow}>
          <Text style={styles.sdkToggleLabel}>SDK Mode</Text>
          <Switch
            value={sdkModeEnabled}
            onValueChange={toggleSdkMode}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={sdkModeEnabled ? '#007AFF' : '#f4f3f4'}
          />
        </View>
        <Text style={styles.sdkToggleDescription}>
          {sdkModeEnabled ? 'ON - Magnetometer will stream' : 'OFF - No sensors active'}
        </Text>
      </View>
      
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
  sdkToggleContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sdkToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sdkToggleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  sdkToggleDescription: {
    fontSize: 14,
    color: '#666',
  },
  sdkModeContainer: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  sdkModeLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 5,
  },
  sdkModeNote: {
    fontSize: 14,
    color: '#555',
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
