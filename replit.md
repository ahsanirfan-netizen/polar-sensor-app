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

**CRITICAL: ACC Data Scaling in SDK Mode**
- In SDK Mode, ACC data arrives as 16-bit ADC counts (NOT milliG as documented by Polar)
- Based on empirical testing, the sensor uses ±2G range configuration
- Scaling factor: **divide raw values by 16384** (32768/2) to get G-force
- Previous incorrect factor (÷1000) caused 16x scaling error, breaking step detection
- Variance was 44.559 instead of 0.15-0.3, magnitude was 34G instead of 1-2G

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
- Priority levels: **0 = HIGH** (7.5-10ms), **1 = BALANCED** (50ms), **2 = LOW_POWER** (100-125ms)
- Must use `device.requestConnectionPriority(0)` for HIGH priority (NOT 1!)
- HIGH priority enables ~1 Hz packet rate (71 samples × 1 Hz = 71 Hz sample rate potential)
- BALANCED mode (1) only gives ~0.5 Hz packet rate (35-38 Hz sample rate)
- Called immediately after MTU negotiation on both connection and reconnection

### Data Persistence Architecture

A local SQLite database (`polar_sensor.db`) is used for storing sensor data. It employs a batched insert system that flushes buffered sensor readings to the database every 1 second via a transaction, preventing race conditions and ensuring data integrity. Recording is user-controlled and automatically stops on disconnect.

### Core Features

-   **PPI Toggle in Standard Mode**: Users can switch between HR-only and HR+PPI, affecting PMD service subscription and HR calculation.
-   **Overnight BLE Connection Persistence**: Includes a screen wake lock (`expo-keep-awake`) and an auto-reconnect mechanism with exponential backoff to maintain continuous data streaming.
-   **Dual HR Calculation in SDK Mode**: Integrates the `fft.js` library and employs a circular PPG buffer to perform Peak Detection and FFT-Based HR calculations every 2 seconds from raw PPG data.
-   **Local SQLite Database**: Persists sensor data for post-processing, utilizing batched inserts and robust error handling.
-   **Cloud Sync to Supabase**: Automatic syncing of sensor readings and sessions to Supabase PostgreSQL database with Row Level Security (RLS) policies.
-   **Automated Sleep Analysis**: Python Flask backend processes PPG and accelerometer data to calculate sleep metrics (onset, wake time, efficiency, awakenings, WASO) and stores results in Supabase.
-   **Step Counting with Health Connect**: Hybrid human-in-the-loop step counting using gyroscope-based walking detection, user confirmation notifications, peak detection algorithm for step counting, and automatic Health Connect sync.
-   **Tab Navigation**: Tab-based UI allowing users to switch between real-time sensor monitoring, sleep analysis, and step counting views.
-   **On-Device Debug Console**: Floating button overlay that captures and displays all console logs on-device using Modal component (renders above all UI). Features include pause/resume auto-scroll, safe serialization for errors/circular objects/BigInt/Symbols, and persistence across fast refresh using globalThis.

### Step Counting Architecture

The step counting feature employs a hybrid human-in-the-loop approach combining automated sensor analysis with user confirmation for maximum accuracy:

-   **Walking Detection**: Uses gyroscope variance analysis to detect rhythmic walking patterns, achieving ~85-90% accuracy comparable to commercial smartwatches. BLE sensor streams (ACC and Gyro data from SDK Mode) are fed to StepCounterService for real-time pattern analysis.
-   **User Confirmation**: Sends push notifications with action buttons when walking is detected, allowing users to confirm or reject before step counting begins. Includes a 10-second cooldown after rejection to prevent notification spam.
-   **Peak Detection Algorithm**: Employs accelerometer magnitude analysis with adaptive thresholding to count individual steps during confirmed walking sessions.
-   **Notification System**: Uses Expo Notifications with response listeners for confirmation flow. Notification categories support Yes/No action buttons for walking start/stop prompts. Pending confirmation flags prevent duplicate notifications during user decision.
-   **Health Connect Integration**: Automatically syncs step data to Android Health Connect, making it available to Google Fit, Samsung Health, and the entire Android health ecosystem.
-   **Supabase Storage**: Daily steps are stored in a dedicated `daily_steps` table with walking session details, distance estimates, and calorie calculations.

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
-   **fft.js**: For efficient FFT calculations in HR algorithms.

### Data Persistence Dependencies

-   **expo-sqlite**: For local SQLite database integration.
-   **@supabase/supabase-js**: For cloud database and authentication.
-   **expo-secure-store**: For secure token storage.
-   **react-native-get-random-values**: Required polyfill for Supabase.
-   **react-native-url-polyfill**: Required polyfill for Supabase.

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