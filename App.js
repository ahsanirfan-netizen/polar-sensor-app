import React, { useState, useEffect, useRef } from 'react';
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
import { useKeepAwake } from 'expo-keep-awake';
import FFT from 'fft.js';

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
  const [ppiEnabled, setPpiEnabled] = useState(false);
  const [heartRate, setHeartRate] = useState(null);
  const [ppg, setPpg] = useState(null);
  const [ppi, setPpi] = useState(null);
  const [accelerometer, setAccelerometer] = useState({ x: 0, y: 0, z: 0 });
  const [gyroscope, setGyroscope] = useState({ x: 0, y: 0, z: 0 });
  const [magnetometer, setMagnetometer] = useState({ x: 0, y: 0, z: 0 });
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const [totalDisconnections, setTotalDisconnections] = useState(0);
  const [totalReconnectAttempts, setTotalReconnectAttempts] = useState(0);
  const [successfulReconnects, setSuccessfulReconnects] = useState(0);
  const [failedReconnects, setFailedReconnects] = useState(0);
  const [totalPackets, setTotalPackets] = useState(0);
  const [packetsSinceReconnect, setPacketsSinceReconnect] = useState(0);
  
  const [hrPeakDetection, setHrPeakDetection] = useState(null);
  const [hrFFT, setHrFFT] = useState(null);

  const ppiEnabledRef = useRef(ppiEnabled);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const lastDeviceRef = useRef(null);
  const isManualDisconnectRef = useRef(false);
  
  const totalDisconnectionsRef = useRef(0);
  const totalReconnectAttemptsRef = useRef(0);
  const successfulReconnectsRef = useRef(0);
  const failedReconnectsRef = useRef(0);
  const totalPacketsRef = useRef(0);
  const packetsSinceReconnectRef = useRef(0);
  
  const ppgBufferRef = useRef([]);
  const ppgTimestampsRef = useRef([]);
  const ppgBufferSize = 1024;

  useEffect(() => {
    ppiEnabledRef.current = ppiEnabled;
  }, [ppiEnabled]);

  useEffect(() => {
    requestPermissions();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (connectedDevice) {
        connectedDevice.cancelConnection();
      }
      bleManager.destroy();
    };
  }, []);

  useKeepAwake();

  const incrementPacketCount = () => {
    totalPacketsRef.current = totalPacketsRef.current + 1;
    setTotalPackets(totalPacketsRef.current);
    
    packetsSinceReconnectRef.current = packetsSinceReconnectRef.current + 1;
    setPacketsSinceReconnect(packetsSinceReconnectRef.current);
  };

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

  const stopSDKMode = async (device) => {
    try {
      const command = [0x03, 0x09];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
      console.log('SDK Mode stopped');
    } catch (error) {
      console.error('Failed to stop SDK mode:', error);
    }
  };

  const stopPPGStream = async (device) => {
    try {
      const command = [0x03, 0x01];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
      console.log('PPG stream stopped');
    } catch (error) {
      console.error('Failed to stop PPG stream:', error);
    }
  };

  const stopACCStream = async (device) => {
    try {
      const command = [0x03, 0x02];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
      console.log('ACC stream stopped');
    } catch (error) {
      console.error('Failed to stop ACC stream:', error);
    }
  };

  const stopGyroStream = async (device) => {
    try {
      const command = [0x03, 0x05];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
      console.log('Gyro stream stopped');
    } catch (error) {
      console.error('Failed to stop Gyro stream:', error);
    }
  };

  const stopPPIStream = async (device) => {
    try {
      const command = [0x03, 0x03];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
      console.log('PPI stream stopped');
    } catch (error) {
      console.error('Failed to stop PPI stream:', error);
    }
  };

  const subscribeToPMDControl = async (device) => {
    try {
      device.monitorCharacteristicForService(
        PMD_SERVICE,
        PMD_CONTROL,
        (error, characteristic) => {
          if (error) {
            console.error('PMD Control monitor error:', error);
            return;
          }
          
          if (characteristic && characteristic.value) {
            const data = Buffer.from(characteristic.value, 'base64');
            console.log('PMD Control Response:', Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
          }
        }
      );
    } catch (error) {
      console.error('Failed to subscribe to PMD Control:', error);
    }
  };

  const queryAccelerometerSettings = async (device) => {
    try {
      const command = [0x01, 0x02, 0x00];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      console.log('Querying accelerometer settings...');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
    } catch (error) {
      console.error('Failed to query accelerometer settings:', error);
    }
  };

  const queryGyroscopeSettings = async (device) => {
    try {
      const command = [0x01, 0x05, 0x00];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      console.log('Querying gyroscope settings...');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
    } catch (error) {
      console.error('Failed to query gyroscope settings:', error);
    }
  };

  const queryPPGSettings = async (device) => {
    try {
      const command = [0x01, 0x01, 0x00];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      console.log('Querying PPG settings...');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
    } catch (error) {
      console.error('Failed to query PPG settings:', error);
    }
  };

  const queryPPISettings = async (device) => {
    try {
      const command = [0x01, 0x03, 0x00];
      const commandBuffer = Buffer.from(command);
      const base64Command = commandBuffer.toString('base64');
      console.log('Querying PPI settings...');
      await device.writeCharacteristicWithResponseForService(
        PMD_SERVICE,
        PMD_CONTROL,
        base64Command
      );
    } catch (error) {
      console.error('Failed to query PPI settings:', error);
    }
  };

  const attemptReconnect = async () => {
    if (isManualDisconnectRef.current || !lastDeviceRef.current) {
      console.log('Skipping reconnect - manual disconnect or no device');
      return;
    }

    const deviceInfo = lastDeviceRef.current;
    reconnectAttemptsRef.current = reconnectAttemptsRef.current + 1;
    const currentAttempt = reconnectAttemptsRef.current;
    
    totalReconnectAttemptsRef.current = totalReconnectAttemptsRef.current + 1;
    setTotalReconnectAttempts(totalReconnectAttemptsRef.current);
    
    console.log(`Reconnection attempt ${currentAttempt} for device ${deviceInfo.id}`);
    setReconnecting(true);
    setReconnectAttempts(currentAttempt);

    try {
      const device = await bleManager.connectToDevice(deviceInfo.id);
      await device.discoverAllServicesAndCharacteristics();
      
      console.log('Reconnected successfully!');
      successfulReconnectsRef.current = successfulReconnectsRef.current + 1;
      setSuccessfulReconnects(successfulReconnectsRef.current);
      
      packetsSinceReconnectRef.current = 0;
      setPacketsSinceReconnect(0);
      
      setConnectedDevice(device);
      setReconnecting(false);
      reconnectAttemptsRef.current = 0;
      setReconnectAttempts(0);
      
      setupDeviceMonitoring(device, deviceInfo);
      
      Alert.alert('Reconnected', `Successfully reconnected to ${deviceInfo.name}`);
    } catch (error) {
      console.error('Reconnection failed:', error);
      
      failedReconnectsRef.current = failedReconnectsRef.current + 1;
      setFailedReconnects(failedReconnectsRef.current);
      
      const backoffDelay = Math.min(2000 * Math.pow(1.5, currentAttempt - 1), 30000);
      console.log(`Will retry in ${backoffDelay}ms after ${currentAttempt} failed attempts`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        attemptReconnect();
      }, backoffDelay);
    }
  };

  const setupDeviceMonitoring = (device, deviceInfo) => {
    lastDeviceRef.current = deviceInfo;
    
    device.onDisconnected((error, disconnectedDevice) => {
      console.log('Device disconnected:', error?.message || 'Unknown reason');
      
      if (!isManualDisconnectRef.current) {
        console.log('Unexpected disconnect - will attempt reconnection');
        
        totalDisconnectionsRef.current = totalDisconnectionsRef.current + 1;
        setTotalDisconnections(totalDisconnectionsRef.current);
        
        setConnectedDevice(null);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          attemptReconnect();
        }, 2000);
      } else {
        console.log('Manual disconnect - no reconnection');
      }
    });
    
    if (sdkModeEnabled) {
      setupSDKMode(device, deviceInfo.name);
    } else {
      setupStandardMode(device, deviceInfo.name);
    }
  };

  const setupSDKMode = async (device, deviceName) => {
    try {
      console.log('SDK Mode - Starting raw sensor streams');
      
      await subscribeToPMDControl(device);
      await subscribeToPMD(device);
      await enableSDKMode(device);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await queryAccelerometerSettings(device);
      await queryGyroscopeSettings(device);
      await queryPPGSettings(device);
      console.log('Waiting for query responses...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log('Sending accelerometer start command...');
      await startACCStream(device);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('Sending gyroscope start command...');
      await startGyroStream(device);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('Sending PPG start command...');
      await startPPGStream(device);
    } catch (error) {
      console.error('Error setting up SDK mode:', error);
    }
  };

  const setupStandardMode = async (device, deviceName) => {
    try {
      console.log(`Standard Mode - Starting HR${ppiEnabled ? ' + PPI' : ' only'} stream(s)`);
      
      console.log('Subscribing to Heart Rate service...');
      await subscribeToHeartRate(device);
      
      if (ppiEnabled) {
        await subscribeToPMDControl(device);
        await subscribeToPMD(device);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('Starting PPI stream...');
        await startPPIStream(device);
      }
    } catch (error) {
      console.error('Error setting up standard mode:', error);
    }
  };

  const connectToDevice = async (device) => {
    try {
      bleManager.stopDeviceScan();
      setScanning(false);
      
      isManualDisconnectRef.current = false;
      reconnectAttemptsRef.current = 0;
      setReconnectAttempts(0);
      
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      
      const deviceInfo = {
        id: device.id,
        name: device.name
      };
      
      setupDeviceMonitoring(connected, deviceInfo);
      
      const modeText = sdkModeEnabled 
        ? 'SDK Mode - Streaming raw sensors (ACC + Gyro + PPG).'
        : ppiEnabled
          ? 'Standard Mode - Streaming HR + PPI. Note: PPI takes ~25 seconds to initialize.'
          : 'Standard Mode - Streaming HR only.';
      
      Alert.alert('Connected', `Connected to ${device.name}. ${modeText}\n\n📱 Screen will stay on while connected.\n🔄 Auto-reconnect enabled.`);
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert('Connection Error', error.message);
    }
  };

  const subscribeToHeartRate = async (device) => {
    try {
      console.log('Setting up HR characteristic monitor...');
      device.monitorCharacteristicForService(
        HEART_RATE_SERVICE,
        HEART_RATE_CHARACTERISTIC,
        (error, characteristic) => {
          if (error) {
            console.error('HR monitor error:', error);
            return;
          }
          
          if (characteristic && characteristic.value) {
            console.log('HR data received');
            incrementPacketCount();
            
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
            
            if (!ppiEnabledRef.current) {
              console.log('Heart Rate from BLE service:', hr);
              setHeartRate(hr);
            } else {
              console.log('Heart Rate from BLE service:', hr, '(ignored - using PPI-calculated HR)');
            }
            
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
    console.log('Starting PPI stream with command:', command.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    await startPMDStream(device, command);
    console.log('PPI stream start command sent');
  };

  const startPPGStream = async (device) => {
    const command = [0x02, 0x01, 0x00, 0x01, 0x87, 0x00, 0x01, 0x01, 0x16, 0x00, 0x04, 0x01, 0x04];
    console.log('Starting PPG stream with command (135Hz, 4 channels):', command.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    await startPMDStream(device, command);
    console.log('PPG stream start command sent');
  };

  const startACCStream = async (device) => {
    const command = [0x02, 0x02, 0x00, 0x01, 0x34, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00, 0x04, 0x01, 0x03];
    console.log('Starting ACC stream with command (with channel mask):', command.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    await startPMDStream(device, command);
    console.log('ACC stream start command sent');
  };

  const startGyroStream = async (device) => {
    const command = [0x02, 0x05, 0x00, 0x01, 0x34, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0xFA, 0x00, 0x04, 0x01, 0x03];
    console.log('Starting Gyro stream with command (52Hz, 250 deg/s):', command.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    await startPMDStream(device, command);
    console.log('Gyro stream start command sent');
  };

  const startMagStream = async (device) => {
    const command = [0x02, 0x06, 0x00, 0x01, 0x32, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x03];
    await startPMDStream(device, command);
  };

  const parsePPIData = (data) => {
    try {
      console.log('PPI data received, length:', data.length, 'bytes:', Array.from(data.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      incrementPacketCount();
      
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
        
        const hrByte = data[offset];
        offset += 1;
        
        const flags = data[offset];
        offset += 1;
        
        if (ppiMs > 0) {
          console.log('Updating PPI state to:', ppiMs);
          setPpi(() => ppiMs);
          
          if (ppiEnabledRef.current) {
            const calculatedHR = Math.round(60000 / ppiMs);
            console.log('PPI parsed - PPI:', ppiMs, 'ms, Calculated HR:', calculatedHR, 'bpm');
            console.log('Updating HR state to:', calculatedHR);
            setHeartRate(() => calculatedHR);
          } else {
            console.log('PPI parsed - PPI:', ppiMs, 'ms (HR not calculated, using standard service)');
          }
        }
      }
    } catch (error) {
      console.error('PPI parse error:', error);
    }
  };

  const parsePPGData = (data) => {
    try {
      incrementPacketCount();
      if (data.length < 15) return;
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      if (offset + 3 <= data.length) {
        const ppg0 = (data[offset] | (data[offset+1] << 8) | (data[offset+2] << 16)) & 0x3FFFFF;
        if (ppg0 !== 0) {
          setPpg(() => ppg0);
          
          ppgBufferRef.current.push(ppg0);
          ppgTimestampsRef.current.push(Date.now());
          
          if (ppgBufferRef.current.length > ppgBufferSize) {
            ppgBufferRef.current.shift();
            ppgTimestampsRef.current.shift();
          }
        }
      }
    } catch (error) {
      console.error('PPG parse error:', error);
    }
  };

  const calculateHRPeakDetection = () => {
    try {
      const buffer = ppgBufferRef.current;
      const timestamps = ppgTimestampsRef.current;
      
      if (buffer.length < 100) return;
      
      const windowSize = 5;
      const smoothed = [];
      const smoothedTimestamps = [];
      
      for (let i = windowSize; i < buffer.length - windowSize; i++) {
        let sum = 0;
        for (let j = -windowSize; j <= windowSize; j++) {
          sum += buffer[i + j];
        }
        smoothed.push(sum / (windowSize * 2 + 1));
        smoothedTimestamps.push(timestamps[i]);
      }
      
      const threshold = Math.max(...smoothed) * 0.6;
      
      const peakIndices = [];
      for (let i = 1; i < smoothed.length - 1; i++) {
        if (smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]) {
          if (smoothed[i] > threshold) {
            peakIndices.push(i);
          }
        }
      }
      
      if (peakIndices.length < 2) return;
      
      const intervals = [];
      for (let i = 1; i < peakIndices.length; i++) {
        const interval = smoothedTimestamps[peakIndices[i]] - smoothedTimestamps[peakIndices[i - 1]];
        if (interval > 0 && interval < 2000) {
          intervals.push(interval);
        }
      }
      
      if (intervals.length === 0) return;
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const hr = Math.round(60000 / avgInterval);
      
      if (hr >= 30 && hr <= 200) {
        setHrPeakDetection(hr);
      }
    } catch (error) {
      console.error('Peak detection error:', error);
    }
  };

  const calculateHRFFT = () => {
    try {
      const buffer = ppgBufferRef.current;
      const timestamps = ppgTimestampsRef.current;
      
      if (buffer.length < 512) return;
      
      const fftSize = 512;
      const signal = buffer.slice(-fftSize);
      
      const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
      const centered = signal.map(val => val - mean);
      
      const fft = new FFT(fftSize);
      const out = fft.createComplexArray();
      fft.realTransform(out, centered);
      
      const magnitudes = [];
      for (let i = 0; i < fftSize / 2; i++) {
        const real = out[i * 2];
        const imag = out[i * 2 + 1];
        magnitudes.push(Math.sqrt(real * real + imag * imag));
      }
      
      if (timestamps.length < 2) return;
      const sampleRate = 1000 / ((timestamps[timestamps.length - 1] - timestamps[timestamps.length - fftSize]) / fftSize);
      
      let maxMag = 0;
      let maxFreqIndex = 0;
      
      for (let i = 0; i < magnitudes.length; i++) {
        const freq = (i * sampleRate) / fftSize;
        if (freq >= 0.5 && freq <= 4.0) {
          if (magnitudes[i] > maxMag) {
            maxMag = magnitudes[i];
            maxFreqIndex = i;
          }
        }
      }
      
      const dominantFreq = (maxFreqIndex * sampleRate) / fftSize;
      const hr = Math.round(dominantFreq * 60);
      
      if (hr >= 30 && hr <= 200) {
        setHrFFT(hr);
      }
    } catch (error) {
      console.error('FFT calculation error:', error);
    }
  };

  useEffect(() => {
    if (!sdkModeEnabled || !connectedDevice) return;
    
    const interval = setInterval(() => {
      calculateHRPeakDetection();
      calculateHRFFT();
    }, 2000);
    
    return () => clearInterval(interval);
  }, [sdkModeEnabled, connectedDevice]);

  const parseACCData = (data) => {
    try {
      console.log('ACC data received, length:', data.length, 'type:', '0x' + data[0].toString(16));
      incrementPacketCount();
      if (data.length < 17) return;
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      if (offset + 6 <= data.length) {
        const x = data.readInt16LE(offset);
        const y = data.readInt16LE(offset + 2);
        const z = data.readInt16LE(offset + 4);
        
        console.log('ACC raw values - x:', x, 'y:', y, 'z:', z);
        
        setAccelerometer(() => ({ 
          x: x / 1000, 
          y: y / 1000, 
          z: z / 1000 
        }));
      }
    } catch (error) {
      console.error('ACC parse error:', error);
    }
  };

  const parseGyroData = (data) => {
    try {
      console.log('Gyro data received, length:', data.length, 'type:', '0x' + data[0].toString(16));
      incrementPacketCount();
      if (data.length < 17) return;
      
      const frameType = data[9];
      const sampleCount = data[10];
      let offset = 11;
      
      if (offset + 6 <= data.length) {
        const x = data.readInt16LE(offset);
        const y = data.readInt16LE(offset + 2);
        const z = data.readInt16LE(offset + 4);
        
        console.log('Gyro raw values - x:', x, 'y:', y, 'z:', z);
        
        setGyroscope(() => ({ 
          x: x / 100, 
          y: y / 100, 
          z: z / 100 
        }));
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
      try {
        isManualDisconnectRef.current = true;
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        if (sdkModeEnabled) {
          console.log('Stopping all sensor streams...');
          await stopPPGStream(connectedDevice);
          await new Promise(resolve => setTimeout(resolve, 100));
          await stopACCStream(connectedDevice);
          await new Promise(resolve => setTimeout(resolve, 100));
          await stopGyroStream(connectedDevice);
          await new Promise(resolve => setTimeout(resolve, 100));
          
          console.log('Stopping SDK mode...');
          await stopSDKMode(connectedDevice);
          await new Promise(resolve => setTimeout(resolve, 500));
        } else if (ppiEnabled) {
          console.log('Stopping PPI stream...');
          await stopPPIStream(connectedDevice);
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          console.log('No streams to stop (HR only mode)');
        }
        
        console.log('Disconnecting...');
        await connectedDevice.cancelConnection();
      } catch (error) {
        console.error('Error during disconnect:', error);
        await connectedDevice.cancelConnection();
      }
      
      setConnectedDevice(null);
      setHeartRate(null);
      setPpg(null);
      setPpi(null);
      setAccelerometer({ x: 0, y: 0, z: 0 });
      setGyroscope({ x: 0, y: 0, z: 0 });
      setMagnetometer({ x: 0, y: 0, z: 0 });
      setReconnecting(false);
      reconnectAttemptsRef.current = 0;
      setReconnectAttempts(0);
      lastDeviceRef.current = null;
      
      ppgBufferRef.current = [];
      ppgTimestampsRef.current = [];
      setHrPeakDetection(null);
      setHrFFT(null);
      
      totalDisconnectionsRef.current = 0;
      totalReconnectAttemptsRef.current = 0;
      successfulReconnectsRef.current = 0;
      failedReconnectsRef.current = 0;
      totalPacketsRef.current = 0;
      packetsSinceReconnectRef.current = 0;
      setTotalDisconnections(0);
      setTotalReconnectAttempts(0);
      setSuccessfulReconnects(0);
      setFailedReconnects(0);
      setTotalPackets(0);
      setPacketsSinceReconnect(0);
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

  const togglePpiMode = (value) => {
    if (connectedDevice) {
      Alert.alert(
        'PPI Toggle',
        'Please disconnect before changing PPI setting.',
        [{ text: 'OK' }]
      );
      return;
    }
    setPpiEnabled(value);
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

  if (connectedDevice || reconnecting) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.dataContainer}>
          <Text style={styles.title}>Polar Verity Sense Data</Text>
          <Text style={styles.deviceName}>{connectedDevice?.name || lastDeviceRef.current?.name}</Text>
          
          {reconnecting && (
            <View style={styles.reconnectingBanner}>
              <Text style={styles.reconnectingText}>
                🔄 Reconnecting... (Attempt {reconnectAttempts})
              </Text>
              <Text style={styles.reconnectingNote}>
                Auto-reconnect in progress. Screen will stay on.
              </Text>
            </View>
          )}
          
          {connectedDevice && !reconnecting && (
            <View style={styles.connectionStatusBanner}>
              <Text style={styles.connectionStatusText}>
                ✅ Connected | 📱 Screen On | 🔄 Auto-reconnect enabled
              </Text>
            </View>
          )}
          
          <View style={styles.sdkModeContainer}>
            <Text style={styles.sdkModeLabel}>{sdkModeEnabled ? 'SDK Mode' : 'Standard Mode'}</Text>
            <Text style={styles.sdkModeNote}>
              {sdkModeEnabled ? '✅ Raw sensors: PPG + ACC + Gyro' : '✅ Validated algorithms: HR + PPI'}
            </Text>
          </View>
          
          <View style={styles.diagnosticsCard}>
            <Text style={styles.diagnosticsTitle}>📊 Connection Diagnostics</Text>
            <View style={styles.diagnosticsGrid}>
              <View style={styles.diagnosticItem}>
                <Text style={styles.diagnosticLabel}>Disconnections</Text>
                <Text style={styles.diagnosticValue}>{totalDisconnections}</Text>
              </View>
              <View style={styles.diagnosticItem}>
                <Text style={styles.diagnosticLabel}>Reconnect Attempts</Text>
                <Text style={styles.diagnosticValue}>{totalReconnectAttempts}</Text>
              </View>
              <View style={styles.diagnosticItem}>
                <Text style={styles.diagnosticLabel}>Successful Reconnects</Text>
                <Text style={styles.diagnosticValue}>{successfulReconnects}</Text>
              </View>
              <View style={styles.diagnosticItem}>
                <Text style={styles.diagnosticLabel}>Failed Reconnects</Text>
                <Text style={styles.diagnosticValue}>{failedReconnects}</Text>
              </View>
              <View style={styles.diagnosticItem}>
                <Text style={styles.diagnosticLabel}>Total Packets</Text>
                <Text style={styles.diagnosticValue}>{totalPackets.toLocaleString()}</Text>
              </View>
              <View style={styles.diagnosticItem}>
                <Text style={styles.diagnosticLabel}>Packets Since Reconnect</Text>
                <Text style={styles.diagnosticValue}>{packetsSinceReconnect.toLocaleString()}</Text>
              </View>
            </View>
          </View>
          
          {sdkModeEnabled ? (
            <>
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>PPG (Raw Optical)</Text>
                <Text style={styles.sensorValue}>
                  {ppg !== null ? `PPG: ${ppg}` : 'Waiting for data...'}
                </Text>
              </View>
              
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>HR (Peak Detection)</Text>
                <Text style={styles.sensorValue}>
                  {hrPeakDetection !== null ? `${hrPeakDetection} BPM` : 'Calculating...'}
                </Text>
              </View>
              
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>HR (FFT Analysis)</Text>
                <Text style={styles.sensorValue}>
                  {hrFFT !== null ? `${hrFFT} BPM` : 'Calculating...'}
                </Text>
              </View>
              
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>Accelerometer (G)</Text>
                <Text style={styles.sensorValue}>
                  X: {accelerometer.x.toFixed(2)} | Y: {accelerometer.y.toFixed(2)} | Z: {accelerometer.z.toFixed(2)}
                </Text>
              </View>
              
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>Gyroscope (deg/s)</Text>
                <Text style={styles.sensorValue}>
                  X: {gyroscope.x.toFixed(2)} | Y: {gyroscope.y.toFixed(2)} | Z: {gyroscope.z.toFixed(2)}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>Heart Rate (BPM)</Text>
                <Text style={styles.sensorValue}>
                  {heartRate !== null ? `${heartRate} BPM` : 'Waiting for data...'}
                </Text>
              </View>
              
              {ppiEnabled && (
                <View style={styles.sensorCard}>
                  <Text style={styles.sensorTitle}>PPI / RR Interval (ms)</Text>
                  <Text style={styles.sensorValue}>
                    {ppi !== null ? `${ppi} ms` : 'Waiting for PPI data (~25s)...'}
                  </Text>
                </View>
              )}
            </>
          )}
          
          <Text style={styles.note}>
            {sdkModeEnabled 
              ? 'SDK Mode: Raw sensor data at custom rates. PPI/HR algorithms disabled.' 
              : ppiEnabled
                ? 'Standard Mode: HR + PPI. HR calculated from PPI intervals. PPI takes ~25s to initialize.'
                : 'Standard Mode: HR only from standard BLE service.'}
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
          {sdkModeEnabled ? 'SDK Mode: Raw PPG + ACC + Gyro' : `Standard Mode: HR${ppiEnabled ? ' + PPI' : ' only'}`}
        </Text>
      </View>
      
      {!sdkModeEnabled && (
        <View style={styles.sdkToggleContainer}>
          <View style={styles.sdkToggleRow}>
            <Text style={styles.sdkToggleLabel}>Enable PPI</Text>
            <Switch
              value={ppiEnabled}
              onValueChange={togglePpiMode}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={ppiEnabled ? '#007AFF' : '#f4f3f4'}
            />
          </View>
          <Text style={styles.sdkToggleDescription}>
            {ppiEnabled ? 'PPI intervals enabled (HR calculated from PPI)' : 'PPI disabled (HR from standard service)'}
          </Text>
        </View>
      )}
      
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
  reconnectingBanner: {
    backgroundColor: '#fff3cd',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffc107',
  },
  reconnectingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 5,
  },
  reconnectingNote: {
    fontSize: 13,
    color: '#856404',
  },
  connectionStatusBanner: {
    backgroundColor: '#d4edda',
    padding: 12,
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#28a745',
  },
  connectionStatusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#155724',
    textAlign: 'center',
  },
  diagnosticsCard: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  diagnosticsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  diagnosticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  diagnosticItem: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  diagnosticLabel: {
    fontSize: 11,
    color: '#6c757d',
    marginBottom: 4,
    fontWeight: '500',
  },
  diagnosticValue: {
    fontSize: 20,
    color: '#007AFF',
    fontWeight: 'bold',
  },
});
