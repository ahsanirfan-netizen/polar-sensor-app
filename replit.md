## Overview

This project is a React Native mobile application, built with Expo Development Build, that connects to a Polar Verity Sense heart rate sensor via Bluetooth Low Energy (BLE). Its primary purpose is to provide real-time heart rate and other physiological data from the sensor. The application supports two mutually exclusive sensor modes: **Standard Mode** (configurable HR-only or HR+PPI) and **SDK Mode** (PPG + ACC + Gyro). It incorporates local data persistence, cloud sync to Supabase, and automated sleep analysis processing. The business vision is to provide a robust and flexible platform for health and fitness monitoring, leveraging advanced sensor data for deeper insights into sleep patterns and recovery.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The application uses **React Native with Expo Development Build** and features a single-file functional component structure with React hooks for state management. Styling is handled using React Native's StyleSheet API, featuring a clean, card-based UI.

### Bluetooth Low Energy Architecture

The **react-native-ble-plx** library handles BLE communication, implementing the Polar Verity Sense protocol. It supports two modes:
-   **Standard Mode**: Configurable for HR-only or HR+PPI using the standard BLE HR service and optionally the Polar PMD service.
-   **SDK Mode**: Enables raw PPG, ACC, and Gyro data streaming, including two independent HR calculation algorithms (Peak Detection and FFT-Based) from raw PPG data.

Critical BLE configurations for reliable data streaming include:
-   **ACC Data Scaling**: ACC data in SDK Mode is in milliG (mG) units per official Polar documentation. Raw int16 values are divided by 1000 to convert to G-force.
-   **Gyro Data Scaling**: Gyro data in SDK Mode is in millidegrees per second (mdps) units. Raw int16 values are divided by 1000 to convert to degrees per second (deg/s).
-   **Delta Compression Packet Parsing**: The application correctly parses delta-compressed packets from the Polar sensor, which contain multiple samples per packet, ensuring full data rate (52 Hz) by handling different frame types (uncompressed vs. delta-compressed).
-   **MTU Configuration**: Requests an MTU of 247 bytes on Android to prevent packet truncation for large delta-compressed packets.
-   **BLE Connection Priority**: Sets connection priority to `High` on Android for optimal performance and data delivery intervals.

### Data Persistence Architecture

A local SQLite database (`polar_sensor.db`) stores sensor data using a batched insert system, flushing buffered readings every second via transactions. Recording is user-controlled and stops on disconnect.

### Chart Visualization Architecture

Real-time magnitude charts for ACC and GYRO data use **react-native-gifted-charts** with a performance-optimized architecture:
-   **Ref-based Data Accumulation**: Full-resolution sensor data (52 Hz) is stored in mutable refs (`accChartDataRaw`, `gyroChartDataRaw`) to avoid O(N) array copies on every state update.
-   **Batched State Updates**: Chart display state is updated every 20 samples (~2.6 Hz) instead of 52 Hz, reducing React re-renders by 20x.
-   **Intelligent Downsampling**: Display state contains ~150 downsampled points for smooth rendering while preserving full session history in refs.
-   **Responsive Design**: Chart widths dynamically calculated (screenWidth - 120px) to prevent overflow on different devices.
-   **Magnitude Calculation**: Charts display √(x² + y² + z²) for overall movement/rotation intensity with proper axis labels (G for ACC, deg/s for GYRO).
-   **ACC Y-Axis Limit**: ACC chart Y-axis is capped at 3G (since actual ACC values never exceed 2G in practice) for better visualization.
-   **Elapsed Time Timer**: Real-time timer displays elapsed time (HH:MM:SS format) below both charts, starting when sensor connects and resetting on disconnect.

### Core Features

-   **PPI Toggle in Standard Mode**: Allows switching between HR-only and HR+PPI.
-   **Overnight BLE Connection Persistence**: Maintains continuous data streaming with screen wake lock and an auto-reconnect mechanism with exponential backoff.
-   **Background Data Collection**: 
    -   **Android**: Uses native Kotlin foreground service with `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` and `PARTIAL_WAKE_LOCK` for true overnight survival
    -   **Android 14/15 Compliance**: Properly registers service type at runtime to avoid 6-hour legacy service limits
    -   **iOS**: Implements BLE state restoration to resume data collection when iOS wakes the app for BLE events
    -   **Persistent Notification**: Shows heart rate, recording time, and heartbeat counter updated with each notification update
    -   **Overnight Survival**: Native foreground service survives indefinitely on Android 14/15, tested on Google Pixel 9
    -   **Wake Lock Management**: Acquires and releases PARTIAL_WAKE_LOCK for minimal battery impact while preventing deep sleep
    -   **Lifecycle Logging**: Comprehensive logging of service events (onCreate, onDestroy, onTaskRemoved, heartbeats) for diagnostics
-   **Dual HR Calculation in SDK Mode**: Uses Peak Detection and FFT-Based algorithms on PPG data.
-   **Real-Time Chart Visualization**: Displays magnitude charts for ACC (√(x² + y² + z²) in G) and GYRO (√(x² + y² + z²) in deg/s) showing all accumulated data from session start with intelligent downsampling for performance.
-   **Local SQLite Database**: Persists sensor data with batched inserts.
-   **Cloud Sync to Supabase**: Automatically syncs sensor readings and sessions with Supabase PostgreSQL, leveraging Row Level Security.
-   **Automated Sleep Analysis**: A Python Flask backend processes PPG and accelerometer data using multiple algorithms:
    -   **Native Algorithm**: Basic sleep detection using activity and heart rate thresholds
    -   **Cole-Kripke Algorithm**: Research-validated actigraphy-based sleep analysis
    -   **HAVOK Analysis**: Advanced ultradian rhythm detection using Hankel Alternative View of Koopman decomposition
-   **Tab Navigation**: Provides views for real-time monitoring and sleep analysis.
-   **On-Device Debug Console**: A floating overlay captures and displays console logs with features like pause/resume auto-scroll and safe serialization.

### Sleep Analysis Algorithms

#### HAVOK (Hankel Alternative View of Koopman) Analysis
HAVOK is a cutting-edge dynamical systems approach for detecting ultradian rhythms and state transitions in overnight sensor data:

**Algorithm Parameters:**
-   **stackmax (100)**: Time-delay embedding dimension for physiological data
-   **svd_rank (15)**: Number of singular value decomposition modes retained
-   **Ultradian range**: Detects cycles from 30 minutes to 3 hours (sleep cycles, rest-activity patterns)

**Data Requirements:**
-   Minimum 6-8 hours of overnight ACC + PPG data
-   Downsampled to 1-minute epochs for analysis
-   Uses same data collected for Cole-Kripke analysis

**Output Metrics:**
-   **Ultradian Cycles Detected**: Number of sleep cycles identified
-   **Average Cycle Duration**: Mean cycle length in minutes
-   **Rhythm Stability Score**: First SVD mode dominance (0-1, higher = more stable)
-   **State Transitions Count**: Number of significant physiological state changes
-   **Dominant Period**: Primary ultradian rhythm period in minutes
-   **Chaos Indicator**: Mean forcing magnitude (higher = more chaotic/fragmented sleep)

**Implementation:**
-   Uses SVD decomposition on Hankel matrix of sensor data
-   Autocorrelation-based cycle detection
-   Forcing signal analysis for state transition detection
-   Located in `backend/havok_analysis.py`

### Database Schema

Supabase tables required: `sessions`, `sensor_readings`, `sleep_analysis`, `sleep_analysis_hypnospy`, and `sleep_analysis_havok`.

### Project Configuration

Uses **Expo SDK 54** with Android SDK versions `compileSdkVersion 35`, `targetSdkVersion 35`, and `minSdkVersion 26`. 

**Required Android Permissions:**
-   **Bluetooth**: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`
-   **Location**: `ACCESS_FINE_LOCATION` (required for BLE scanning on Android)
-   **Foreground Service**: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`
-   **Notifications**: `POST_NOTIFICATIONS` (Android 13+, required for foreground service)
-   **Wake Lock**: `WAKE_LOCK` (prevents screen from sleeping during data collection)

**Notification Permission Handling:**
-   The app requests notification permission at runtime before starting the foreground service
-   On Android 13+ (API 33+), this permission is required for the persistent notification to appear
-   If permission is denied, the app displays a warning and may stop collecting data when the screen turns off
-   Foreground service initialization includes comprehensive error handling to prevent app crashes

**Error Handling Architecture:**
-   All foreground service calls are wrapped in try-catch blocks with graceful fallbacks
-   Notification permission is checked and requested before starting foreground service
-   Failed foreground service startup displays a user-friendly warning instead of crashing
-   Notification updates have silent error handling to prevent timer interruptions

EAS Build is used for APK generation via GitHub Actions.

## External Dependencies

### Core Framework Dependencies

-   **Expo SDK (~54.0.0)**
-   **React Native (0.76.5)**
-   **React (18.3.1)**

### BLE and Sensor Dependencies

-   **react-native-ble-plx (3.2.1)**
-   **react-native-background-actions** (Android foreground service)
-   **@notifee/react-native** (Notification permission handling)
-   **buffer (^6.0.3)**
-   **expo-device (^6.0.2)**
-   **expo-keep-awake**
-   **fft.js**

### Data Persistence Dependencies

-   **expo-sqlite**
-   **@supabase/supabase-js**
-   **expo-secure-store**
-   **react-native-get-random-values**
-   **react-native-url-polyfill**

### Backend Dependencies (Python Flask API)

-   **Flask (3.1.0)**
-   **pandas (2.2.3)**
-   **numpy (1.26.4)**
-   **scipy (1.14.1)**
-   **supabase (2.13.2)**
-   **gunicorn (23.0.0)**

### Build and Development Tools

-   **eas-cli (^14.2.1)**
-   **expo-dev-client (~5.0.0)**
-   **@expo/ngrok (^4.1.3)**
-   **expo-build-properties (~0.12.5)**
-   **GitHub Actions**