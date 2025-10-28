## Overview

This project is a React Native mobile application, built with Expo Development Build, that connects to a Polar Verity Sense heart rate sensor via Bluetooth Low Energy (BLE). Its primary purpose is to provide real-time heart rate and other physiological data from the sensor, supporting two mutually exclusive sensor modes: Standard Mode (configurable HR-only or HR+PPI) and SDK Mode (PPG + ACC + Gyro). The application includes local data persistence, cloud synchronization to Supabase, and automated sleep analysis processing. The business vision is to provide a robust and flexible platform for health and fitness monitoring, leveraging advanced sensor data for deeper insights into sleep patterns and recovery.

## Recent Changes (October 28, 2025)

**Full Diagnostic Suite Implemented**
- **Objective**: Identify why Android kills the app after 4.8 hours and enable 8+ hour overnight recordings
- **Diagnostic Components Added**:
  1. **Process Exit Diagnostics**: Captures `ActivityManager.getHistoricalProcessExitReasons()` on app startup to identify exact reason Android killed the process (LOW_MEMORY, ANR, SIGNALED, etc.)
  2. **Battery Optimization Check**: Programmatically verifies and requests battery optimization exemption on startup
  3. **Watchdog Service**: AlarmManager-based monitoring that checks service health every 5 minutes and logs memory status (survives Doze mode)
  4. **Memory Monitoring**: Logs heap usage, system memory, and low-memory warnings every 5 minutes to logcat
  5. **Enhanced Native Logging**: Foreground service logs timeout/destroy events with stack traces and runtime statistics

- **How to Use Diagnostics**:
  1. Build APK with diagnostics: `eas build --platform android --profile development`
  2. Install and run overnight test
  3. If app crashes, immediately run: `adb bugreport > bugreport-$(date +%Y%m%d).zip`
  4. Open app to see exit reason diagnostics in Debug Console
  5. Extract bugreport.zip and search for "WatchdogReceiver" to see memory snapshots before crash

**Previous Progress (4.8 Hour Survival)**:
- First crash: 58 minutes (1 hour)
- Current crash: 288 minutes (4.8 hours) - **5x improvement**
- Target: 480 minutes (8 hours)
- Root cause: Silent process death (likely Android 15 Doze mode or Low Memory Killer)
- Fixes applied: BLE monitor cleanup, wake lock timeout, enhanced logging

**Previous Changes (October 27, 2025)**
- Fixed BLE monitor memory leak (3 monitors never cleaned up)
- Added refs for `hrMonitorRef`, `pmdMonitorRef`, `pmdControlMonitorRef`
- Added monitor cleanup in disconnect and unmount

**Previous Changes (October 26, 2025)**
- Removed chart visualization to eliminate UI-related memory crash
- Added MAX_DB_BUFFER_SIZE = 5000 with automatic flush
- Added Debug Console crash log viewer with "💥 Crash" button

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The application uses React Native with Expo Development Build, featuring a single-file functional component structure with React hooks for state management. Styling is handled using React Native's StyleSheet API, featuring a clean, card-based UI.

### Bluetooth Low Energy Architecture

The `react-native-ble-plx` library handles BLE communication, implementing the Polar Verity Sense protocol. It supports Standard Mode (HR-only or HR+PPI) and SDK Mode (raw PPG, ACC, Gyro data streaming with dual HR calculation). Critical BLE configurations include ACC and Gyro data scaling, delta compression packet parsing, MTU configuration (247 bytes on Android), and setting BLE connection priority to `High` on Android for reliable data streaming.

### Data Persistence Architecture

A local SQLite database (`polar_sensor.db`) stores sensor data using a batched insert system, flushing buffered readings every second via transactions. Recording is user-controlled.


### Core Features

-   **PPI Toggle in Standard Mode**: Allows switching between HR-only and HR+PPI.
-   **Overnight BLE Connection Persistence**: Maintains continuous data streaming with screen wake lock and auto-reconnect with exponential backoff.
-   **Battery Optimization Guidance**: Provides proactive user guidance for Android battery optimization settings to prevent app termination during overnight recordings.
-   **Background Data Collection**:
    -   **Android**: Uses a native Kotlin foreground service with `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` and `PARTIAL_WAKE_LOCK` for overnight survival, complying with Android 14/15 requirements.
    -   **iOS**: Implements BLE state restoration.
    -   **Persistent Notification**: Displays real-time heart rate, recording time, and heartbeat count.
-   **Dual HR Calculation in SDK Mode**: Uses Peak Detection and FFT-Based algorithms on PPG data.
-   **Local SQLite Database**: Persists sensor data using batched inserts.
-   **Cloud Sync to Supabase**: Automatically syncs sensor readings and sessions to Supabase PostgreSQL with Row Level Security.
-   **Automated Sleep Analysis**: A Python Flask backend processes PPG and accelerometer data using multiple algorithms: Native Algorithm, Cole-Kripke Algorithm, and HAVOK Analysis (Hankel Alternative View of Koopman decomposition for ultradian rhythm detection).
-   **Tab Navigation**: Provides views for real-time monitoring and sleep analysis.
-   **On-Device Debug Console**: A floating overlay captures and displays console logs.

### Sleep Analysis Algorithms

#### HAVOK (Hankel Alternative View of Koopman) Analysis
This algorithm detects ultradian rhythms and state transitions in overnight sensor data using SVD decomposition on a Hankel matrix. It identifies ultradian cycles (30 min to 3 hours) and provides metrics like the number of cycles, average cycle duration, rhythm stability score, and chaos indicator. It requires 6-8 hours of overnight ACC + PPG data, downsampled to 1-minute epochs.

### Database Schema

The project utilizes Supabase tables: `sessions`, `sensor_readings`, `sleep_analysis`, `sleep_analysis_hypnospy`, and `sleep_analysis_havok`.

### Project Configuration

The project uses Expo SDK 54 with Android SDK versions `compileSdkVersion 35`, `targetSdkVersion 35`, and `minSdkVersion 26`. Required Android permissions include `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `POST_NOTIFICATIONS`, and `WAKE_LOCK`. Notification permission is handled at runtime. EAS Build is used for APK generation via GitHub Actions.

## External Dependencies

### Core Framework Dependencies

-   Expo SDK (~54.0.0)
-   React Native (0.76.5)
-   React (18.3.1)

### BLE and Sensor Dependencies

-   react-native-ble-plx (3.2.1)
-   react-native-background-actions
-   @notifee/react-native
-   buffer
-   expo-device
-   expo-keep-awake
-   fft.js

### Data Persistence Dependencies

-   expo-sqlite
-   @supabase/supabase-js
-   react-native-get-random-values
-   react-native-url-polyfill

### Backend Dependencies (Python Flask API)

-   Flask (3.1.0)
-   pandas (2.2.3)
-   numpy (1.26.4)
-   scipy (1.14.1)
-   supabase (2.13.2)
-   gunicorn (23.0.0)

### Build and Development Tools

-   eas-cli
-   expo-dev-client
-   @expo/ngrok
-   expo-build-properties
-   GitHub Actions