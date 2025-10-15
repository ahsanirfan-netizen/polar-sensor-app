# Replit Agent Instructions

## Overview

This project is a React Native mobile application, built with Expo Development Build, that connects to a Polar Verity Sense heart rate sensor via Bluetooth Low Energy (BLE). Its primary purpose is to provide real-time heart rate and other physiological data from the sensor. The application supports two mutually exclusive sensor modes: **Standard Mode** (configurable HR-only or HR+PPI) and **SDK Mode** (PPG + ACC + Gyro). The application incorporates local data persistence for overnight recording, cloud sync to Supabase, and automated sleep analysis processing. The business vision is to provide a robust and flexible platform for health and fitness monitoring, leveraging advanced sensor data for deeper insights into sleep patterns and recovery.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The application uses **React Native with Expo Development Build** and features a single-file functional component structure with React hooks for state management. Styling is handled using React Native's StyleSheet API, featuring a clean, card-based UI.

### Bluetooth Low Energy Architecture

The **react-native-ble-plx** library handles BLE communication, implementing the Polar Verity Sense protocol. The application supports two mutually exclusive operating modes:

-   **Standard Mode**: Configurable for HR-only or HR+PPI, utilizing the standard BLE HR service and optionally the Polar PMD service for PPI.
-   **SDK Mode**: Enables raw PPG, ACC, and Gyro data streaming, requiring a specific SDK mode command. This mode also includes two independent HR calculation algorithms (Peak Detection and FFT-Based) from raw PPG data, running every 2 seconds.

The Polar PMD Service (UUID: `FB005C80-02E7-F387-1CAD-8ACD2D8DF0C8`) is used for advanced sensor data, requiring specific control and data characteristics for configuration and streaming.

**CRITICAL: ACC Data Scaling in SDK Mode (FIXED Oct 2025)**
- In SDK Mode, ACC data arrives as 16-bit signed integers (int16), NOT milliG as documented by Polar
- **Empirically determined scale factor: 1000** (sensor outputs ~1000 counts per G)
- At rest with gravity: typical raw values x=-800, y=-300, z=-500 → magnitude ~1.0G ✅
- Walking motion: values vary by ±200-600 counts → 0.2-0.6G acceleration changes ✅
- **Previous incorrect factor (÷16384)**: Caused 16x under-scaling, showed 0.06G at rest instead of 1.0G, making motion undetectable
- **Root cause**: Polar sensor uses custom ADC encoding, not standard ±2G = ±32768 mapping

**CRITICAL: Delta Compression Packet Parsing (FIXED Oct 2025)**
- Polar Verity Sense uses **delta compression** to optimize BLE bandwidth
- Packets arrive every **1-2 seconds** (not 4 Hz as initially expected), containing **~50-70 samples each** at 52 Hz internal sampling
- **Header structure**: Bytes 0-9 (PMD type, timestamp, frame type), samples start at byte 10
- **Frame type byte 9**:
  - `0x00`: Uncompressed format (all samples 6 bytes)
  - `0x81` (129): Delta compressed format (first sample 6 bytes, rest 3 bytes)
  
**Delta Compressed Format (0x81)**:
- **First sample** (6 bytes): Full x,y,z values as int16 (2 bytes each)
- **Subsequent samples** (3 bytes each): dx,dy,dz deltas as int8 (1 byte each)
- Reconstruct by adding deltas: `x[n] = x[n-1] + dx`, `y[n] = y[n-1] + dy`, `z[n] = z[n-1] + dz`

**Example**: 223-byte packet = 10 header + 6 first sample + 207 delta samples = 1 + 69 = 70 total samples

**Previous bug**: Assumed all samples were 6 bytes → only extracted 1 sample per packet (98.5% data loss!)
**Fix**: Check frame type and parse accordingly → full 52 Hz data rate achieved

**CRITICAL: MTU (Maximum Transmission Unit) Configuration**
- Android default MTU is **23 bytes**, limiting BLE notifications to ~20 byte payload
- Polar's delta compressed packets are **200+ bytes**
- Without MTU negotiation, packets truncate to 22 bytes → only 2 samples extracted
- **Solution**: Request `device.requestMTU(247)` immediately after `discoverAllServicesAndCharacteristics()`
- Applied to both initial connection and reconnection paths
- iOS ignores MTU requests (uses 185-byte default which is sufficient)

**CRITICAL: BLE Connection Priority Configuration**
- Android BLE connection priority controls packet delivery interval
- Priority levels: **ConnectionPriority.High = 1** (7.5-10ms), **Balanced = 0** (50ms), **LowPower = 2** (100-125ms)
- Using `device.requestConnectionPriority(ConnectionPriority.High)` for optimal performance
- Real-world performance with Polar Verity Sense on Android:
  - **35-38 Hz sample rate** (0.5-0.52 Hz packet rate × 71 samples/packet)
  - Delta compression delivers **71 samples per packet**
  - Performance limited by Android BLE stack and sensor firmware, not connection priority
- This sample rate is adequate for sleep analysis (overnight trends) and step counting (walking cadence detection)
- Called immediately after MTU negotiation on both connection and reconnection

### Data Persistence Architecture

A local SQLite database (`polar_sensor.db`) is used for storing sensor data. It employs a batched insert system that flushes buffered sensor readings to the database every 1 second via a transaction, preventing race conditions and ensuring data integrity. Recording is user-controlled and automatically stops on disconnect.

### Core Features

-   **PPI Toggle in Standard Mode**: Users can switch between HR-only and HR+PPI, affecting PMD service subscription and HR calculation.
-   **Overnight BLE Connection Persistence**: Includes a screen wake lock (`expo-keep-awake`) and an auto-reconnect mechanism with exponential backoff to maintain continuous data streaming.
-   **Dual HR Calculation in SDK Mode**: Employs Peak Detection and FFT-Based algorithms to calculate heart rate every 2 seconds from raw PPG data in a circular buffer.
-   **Local SQLite Database**: Persists sensor data for post-processing, utilizing batched inserts and robust error handling.
-   **Cloud Sync to Supabase**: Automatic syncing of sensor readings and sessions to Supabase PostgreSQL database with Row Level Security (RLS) policies.
-   **Automated Sleep Analysis**: Python Flask backend processes PPG and accelerometer data to calculate sleep metrics (onset, wake time, efficiency, awakenings, WASO) and stores results in Supabase.
-   **Gyro-Based Step Counting**: Morlet wavelet CWT ridge detection on gyroscope data (0.5-4 Hz walking range) with dominant axis selection, wavelet scalogram analysis, ridge-based walking detection, frequency integration step counting, and Health Connect sync.
-   **Tab Navigation**: Tab-based UI allowing users to switch between real-time sensor monitoring, sleep analysis, and step counting views.
-   **On-Device Debug Console**: Floating button overlay that captures and displays all console logs on-device using Modal component (renders above all UI). Features include pause/resume auto-scroll, safe serialization for errors/circular objects/BigInt/Symbols, and persistence across fast refresh using globalThis.

### Step Counting Architecture

The step counting feature employs **Morlet Wavelet Continuous Wavelet Transform (CWT)** for ridge detection on gyroscope data, providing accurate walking detection and step counting:

-   **Wavelet-Based Ridge Detection**: Uses Continuous Wavelet Transform with Morlet wavelet (ω=6) on 3.46-second windows of gyroscope data. CWT analyzes the signal at 25 scales covering the 0.8-3.5 Hz walking frequency range. Analysis runs every 2 seconds for continuous monitoring. Features include signal energy filtering to reject weak noise, frequency-weighted ridge detection that prefers realistic walking cadences (1.0-2.5 Hz weighted 1.5x, >3.0 Hz penalized 0.5x), and biomechanical clamping to 0.8-3.5 Hz (48-210 steps/min).
-   **Dominant Axis Selection**: Automatically selects the gyroscope axis (X, Y, or Z) with the highest variance over a 50-sample window, ensuring optimal signal capture regardless of device orientation. Gyroscopes naturally filter gravity (no DC offset) and provide cleaner periodic walking signals than accelerometers.
-   **Gyro Normalization**: Raw gyroscope values (typically 1000-5000 range) are divided by 1000 to normalize to 0-5 range for consistent wavelet analysis.
-   **Circular Buffer System**: Maintains a 128-sample circular buffer (power-of-2 for efficient processing) at 37 Hz effective sample rate of normalized gyroscope values. Automatically handles sample wrapping and DC removal.
-   **Ridge Threshold Detection**: Walking detected when wavelet ridge strength exceeds configurable threshold (default 0.1). Ridge detection inherently filters non-periodic motion by requiring sustained oscillatory patterns in the scalogram. No autocorrelation needed - the wavelet naturally identifies periodic walking patterns. User-configurable threshold (range 0.05-0.5) persists via AsyncStorage.
-   **Consecutive Frame Confirmation**: Requires N consecutive detection frames before starting step counting, and N consecutive stationary frames before stopping (default N=3, configurable 1-10). This eliminates phantom steps from noise spikes and residual motion, ensuring accurate start/stop transitions. User-configurable via AsyncStorage persistence. Higher values reduce phantom steps but increase startup delay.
-   **Frequency Integration Step Counting**: Uses ridge frequency for continuous step integration: `steps += ridgeFrequency × Δt`. Double-precision accumulator prevents rounding errors. Elapsed time clamped to CWT interval (2s) to prevent overcounting from clock jitter.
-   **Real-Time Metrics**: Displays total steps, walking status (🚶 WALKING / Standing Still), cadence (steps/min), ridge frequency (Hz), ridge strength, and wavelet scale for debugging and calibration.
-   **CWT Scalogram Visualization**: Real-time bar chart displays all 25 wavelet scales (0.8-3.5 Hz) with color-coded ridge indicators. Green bars indicate ridge detection above threshold (walking detected), blue shows above-threshold coefficients, orange shows ridge below threshold, and light blue shows below-threshold values. Updates every 2 seconds with CWT analysis results. Built with react-native-svg-charts for on-device visualization.
-   **Health Connect Integration**: Automatically syncs step data to Android Health Connect, making it available to Google Fit, Samsung Health, and the entire Android health ecosystem.
-   **Supabase Storage**: Daily steps are stored in a dedicated `daily_steps` table with walking session details, distance estimates, and calorie calculations.

**CWT Advantages Over FFT:**
- **Time-frequency localization**: Detects exact walking start/stop times, not just average frequency
- **Adaptive to cadence changes**: Tracks natural speed variations during walking
- **Inherent periodicity filtering**: Ridge presence indicates rhythmic motion; random movements produce no ridge
- **Multi-scale analysis**: Simultaneously detects slow walking (0.5 Hz) and fast running (4 Hz)

### Database Schema

**Supabase Tables Required:**
- `sessions`: Stores sensor recording sessions (created via Supabase dashboard)
- `sensor_readings`: Stores raw PPG, ACC, Gyro data (created via Supabase dashboard)
- `sleep_analysis`: Stores sleep analysis results from backend (created via Supabase dashboard)
- `sleep_analysis_hypnospy`: Stores Cole-Kripke algorithm results (created via Supabase dashboard)
- `daily_steps`: Stores daily step counts and walking sessions (SQL provided in `supabase_daily_steps_table.sql`)

**Setup Instructions:**
1. Run the SQL in `supabase_daily_steps_table.sql` in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
2. This creates the table, indexes, RLS policies, and permissions

### Project Configuration

The project uses **Expo SDK 54** with Android SDK versions `compileSdkVersion 35`, `targetSdkVersion 35`, and `minSdkVersion 26`. Required permissions include `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`, and Health Connect permissions (`health.READ_STEPS`, `health.WRITE_STEPS`, etc.). EAS Build is used for cloud-based APK generation.

## External Dependencies

### Core Framework Dependencies

-   **Expo SDK (~54.0.0)**
-   **React Native (0.76.5)**
-   **React (18.3.1)**

### BLE and Sensor Dependencies

-   **react-native-ble-plx (3.2.1)**
-   **buffer (^6.0.3)**
-   **expo-device (^6.0.2)**
-   **expo-keep-awake**: For screen wake lock functionality.
-   **fft.js**: For FFT-based heart rate calculations from PPG data (SDK mode only).
-   **discrete-wavelets**: Custom Morlet wavelet implementation for CWT-based step counting.

### Data Persistence Dependencies

-   **expo-sqlite**: For local SQLite database integration.
-   **@supabase/supabase-js**: For cloud database and authentication.
-   **expo-secure-store**: For secure token storage.
-   **react-native-get-random-values**: Required polyfill for Supabase.
-   **react-native-url-polyfill**: Required polyfill for Supabase.

### Visualization Dependencies

-   **react-native-svg**: SVG rendering for React Native.
-   **react-native-svg-charts**: Chart library for real-time CWT scalogram visualization.

### Backend Dependencies (Python Flask API)

-   **Flask (3.1.0)**: Web framework for sleep analysis API.
-   **pandas (2.2.3)**: Data processing and analysis.
-   **numpy (1.26.4)**: Numerical computations.
-   **scipy (1.14.1)**: Scientific algorithms (peak detection).
-   **supabase (2.13.2)**: Python client for Supabase.
-   **gunicorn (23.0.0)**: Production WSGI server.

### Build and Development Tools

-   **eas-cli (^14.2.1)**
-   **expo-dev-client (~5.0.0)**
-   **@expo/ngrok (^4.1.3)**
-   **expo-build-properties (~0.12.5)**
-   **GitHub Actions**: Automated APK builds with free tier (2,000 minutes/month).