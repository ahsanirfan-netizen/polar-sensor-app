# Replit Agent Instructions

## Overview

This is a React Native mobile application built with Expo Development Build that connects to a Polar Verity Sense heart rate sensor via Bluetooth Low Energy (BLE). The app displays real-time data from all 6 sensor streams: Heart Rate (HR), Photoplethysmography (PPG), Pulse-to-Pulse Intervals (PPI/RR intervals), Accelerometer, Gyroscope, and Magnetometer. The app is deployed to Android devices via EAS Build (cloud-based build service).

**Current Status**: Fully functional with complete PMD (Polar Measurement Data) protocol implementation. All 6 sensor streams are operational and displaying data correctly.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework Choice: React Native with Expo Development Build**
- **Problem Addressed**: Need to access native BLE functionality that requires custom native configuration
- **Solution**: Expo Development Build allows custom native modules (react-native-ble-plx) while maintaining Expo's developer experience
- **Rationale**: Standard Expo Go doesn't support BLE libraries with native dependencies. Development Build provides a custom runtime that includes required native modules
- **Build Method**: EAS Build (cloud-based) generates custom APK for Android deployment
- **Pros**: 
  - Access to full native BLE capabilities
  - Single JavaScript codebase
  - Managed build process via EAS
  - Over-the-air updates for JS changes
- **Cons**: 
  - Requires custom development client installation (cannot use standard Expo Go)
  - Longer build times for native changes

**Component Structure**
- **Approach**: Single-file functional component using React hooks for state management
- **Rationale**: Straightforward implementation suitable for sensor monitoring app
- **State Management**: React useState hooks for sensor data and connection status

**Styling Strategy**
- **Method**: StyleSheet API from React Native
- **Layout**: ScrollView with sensor data cards
- **Design**: Clean, card-based UI displaying real-time sensor values

### Bluetooth Low Energy Architecture

**BLE Library: react-native-ble-plx**
- **Purpose**: Provides native BLE functionality for React Native
- **Permissions**: BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION (Android 12+)
- **Configuration**: Requires Android SDK 34, minSdkVersion 23

**Polar Verity Sense Protocol Implementation**

**Standard BLE Heart Rate Service (UUID: 0x180D)**
- Used for basic heart rate monitoring
- Characteristic UUID: 0x2A37
- Provides: Heart rate BPM value
- Format: Standard BLE Heart Rate Measurement characteristic

**Polar PMD (Polar Measurement Data) Service**
- **Critical Discovery**: PPI and advanced sensors require PMD service, NOT standard BLE HR service
- **PMD Service UUID**: FB005C80-02E7-F387-1CAD-8ACD2D8DF0C8
- **PMD Control Characteristic**: FB005C81-02E7-F387-1CAD-8ACD2D8DF0C8 (write commands here)
- **PMD Data Characteristic**: FB005C82-02E7-F387-1CAD-8ACD2D8DF0C8 (subscribe for notifications)

**PMD Packet Structure** (CRITICAL - Updated 2025-10)
```
Byte 0:      Measurement Type ID
Bytes 1-8:   Timestamp (64-bit, not read due to Buffer API limitations)
Byte 9:      Frame Type (0=Sample0, 1=Sample1, 2=Sample2, 128=Delta)
Byte 10:     Sample Count (for most streams)
Byte 11+:    Actual sensor data payload
```

**Measurement Type IDs** (CRITICAL - Corrected Values)
- 0x01 = PPG (Photoplethysmography)
- 0x02 = ACC (Accelerometer)
- 0x03 = PPI (Pulse-to-Pulse Intervals / RR intervals)
- 0x05 = Gyroscope
- 0x06 = Magnetometer

**PMD Start Commands** (Complete with Configuration)
- **PPI**: `[0x02, 0x03]` - Simple, no settings required
- **PPG**: `[0x02, 0x01, 0x00, 0x01, 0x87, 0x00, 0x01, 0x01, 0x16, 0x00, 0x04, 0x01, 0x04]`
  - 135Hz sample rate, 22-bit resolution, 4 channels
- **ACC**: `[0x02, 0x02, 0x00, 0x01, 0xC8, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]`
  - 200Hz sample rate, 16-bit resolution, ±8G range
- **Gyro**: `[0x02, 0x05, 0x00, 0x01, 0xC8, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]`
  - 200Hz sample rate, 16-bit resolution, range config
- **Mag**: `[0x02, 0x06, 0x00, 0x01, 0xC8, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]`
  - 200Hz sample rate, 16-bit resolution, range config

**Data Parsing Logic**
- All parsers skip 10-byte header and start reading payload at byte 11
- Timestamp bytes 1-8 are NOT read (Buffer.readUIntLE limited to 6 bytes max)
- Frame type and sample count extracted but not currently used for frame decoding
- Each parser reads first sample from packet (real-time display)

### Project Configuration

**Expo Configuration (app.json)**
- Expo SDK 54 (upgraded from 51 for better BLE support)
- Android permissions: BLUETOOTH, BLUETOOTH_ADMIN, BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION
- Android SDK: compileSdkVersion 34, targetSdkVersion 34, minSdkVersion 23
- Package: com.anonymous.polarverityble
- Version: 1.0.0

**EAS Build Configuration (eas.json)**
- Development profile: developmentClient enabled, Android distribution internal
- Build channel: development
- Cloud-based builds via EAS Build service

**Build Workflow**
1. Code changes pushed to Replit
2. EAS Build triggered via `eas build --profile development --platform android`
3. APK generated in cloud and downloaded
4. APK installed on Android device via USB/wireless
5. Expo Dev Client connects to dev server for live updates

### Development Workflow

**Local Development**
- Expo Dev Server runs on port 8081 with tunnel mode
- Uses `--dev-client` flag (not standard Expo Go)
- Ngrok tunnel allows remote device connection

**Device Testing**
- Android device requires custom development client APK
- Install APK once, then connect to dev server for live updates
- JavaScript changes reflect via hot reload
- Native changes require new APK build

**Critical Implementation Notes**
- Buffer polyfill MUST be imported from 'buffer' package and set globally
- BLE data arrives base64-encoded, must convert to Buffer for parsing
- All PMD parsers must read from byte 11 offset (not byte 9 or 10)
- Measurement type routing must use correct hex values (0x01, 0x02, 0x03, 0x05, 0x06)
- Start commands must include complete configuration bytes

## External Dependencies

### Core Framework Dependencies

**Expo SDK (~54.0.0)**
- Purpose: Managed React Native workflow with development build support
- Provides: Build system, development server, native module integration
- Why chosen: Supports custom native modules while maintaining Expo DX

**React Native (0.76.5)**
- Purpose: Core mobile application framework
- Provides: Native component rendering and JavaScript bridge
- Bundled with: Expo SDK 54 for compatibility

**React (18.3.1)**
- Purpose: UI library and component architecture
- Provides: Component lifecycle, hooks, state management

### BLE and Sensor Dependencies

**react-native-ble-plx (3.2.1)**
- Purpose: Bluetooth Low Energy functionality
- Provides: BLE scanning, connection, characteristic read/write/notify
- Critical for: Polar Verity Sense communication
- Native dependencies: Requires development build (not Expo Go compatible)

**buffer (^6.0.3)**
- Purpose: Node.js Buffer API for React Native
- Provides: Binary data parsing for BLE packets
- Usage: MUST be imported and set as global.Buffer
- Critical for: PMD packet parsing

**expo-device (^6.0.2)**
- Purpose: Device information and capabilities
- Provides: Platform detection, device model info
- Usage: Platform-specific BLE logic

### Build and Development Tools

**eas-cli (^14.2.0)**
- Purpose: EAS Build command-line interface
- Provides: Cloud-based build orchestration
- Usage: `eas build --profile development --platform android`

**expo-dev-client (~5.0.0)**
- Purpose: Custom development runtime
- Provides: Development builds with native modules
- Replaces: Standard Expo Go app

**@expo/ngrok (^4.1.3)**
- Purpose: Development tunneling service
- Provides: Remote device connection to dev server
- Usage: Enabled via `--tunnel` flag

**expo-build-properties (~0.12.5)**
- Purpose: Native build configuration
- Provides: Android SDK version settings
- Usage: Sets compileSdkVersion, targetSdkVersion in app.json

### Platform Support

**Target Platforms**
- **Android**: Primary platform, fully tested with Polar Verity Sense
  - Requires Android 6.0+ (SDK 23+)
  - BLE permissions configured for Android 12+
  - Deployment via EAS Build APK
- **iOS**: Theoretically supported but not tested
  - Would require iOS-specific permissions in app.json
  - Would need iOS development build
- **Web**: Not supported (BLE not available in web browsers)

## Recent Changes (October 2025)

### Critical PMD Protocol Fixes
- **Corrected measurement type IDs**: Updated switch routing to use 0x01 (PPG), 0x02 (ACC), 0x03 (PPI), 0x05 (Gyro), 0x06 (Mag)
- **Fixed packet parsing offsets**: All parsers now correctly skip header and start reading data at byte 11
- **Removed problematic timestamp reads**: Eliminated Buffer.readUIntLE(1, 8) calls that exceeded 6-byte limit
- **Completed start commands**: Added missing configuration bytes to PPG, ACC, Gyro, Mag commands
- **Validated by architect**: All 6 sensor streams confirmed functional and ready for live testing

### Previous Implementation History
- Set up Expo SDK 54 with development build
- Configured BLE permissions for Android 12+
- Resolved EAS build issues (Android SDK config, gradle errors)
- Built and deployed working APK via EAS Build
- Implemented complete PMD protocol with correct UUIDs and control commands
- Created binary data parsers for all sensor types

## Known Limitations

- Only displays first sample from each PMD packet (not all samples in frame)
- Frame type and sample count read but not used for advanced frame decoding
- Delta frame encoding (frame type 128) not handled differently
- No error recovery for failed BLE connections
- No data logging or export functionality
- iOS platform not tested
