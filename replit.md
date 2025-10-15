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
-   **ACC Data Scaling**: ACC data in SDK Mode is scaled by a factor of 1000 (1000 counts per G) for accurate gravitational force representation.
-   **Delta Compression Packet Parsing**: The application correctly parses delta-compressed packets from the Polar sensor, which contain multiple samples per packet, ensuring full data rate (52 Hz) by handling different frame types (uncompressed vs. delta-compressed).
-   **MTU Configuration**: Requests an MTU of 247 bytes on Android to prevent packet truncation for large delta-compressed packets.
-   **BLE Connection Priority**: Sets connection priority to `High` on Android for optimal performance and data delivery intervals.

### Data Persistence Architecture

A local SQLite database (`polar_sensor.db`) stores sensor data using a batched insert system, flushing buffered readings every second via transactions. Recording is user-controlled and stops on disconnect.

### Core Features

-   **PPI Toggle in Standard Mode**: Allows switching between HR-only and HR+PPI.
-   **Overnight BLE Connection Persistence**: Maintains continuous data streaming with screen wake lock and an auto-reconnect mechanism with exponential backoff.
-   **Dual HR Calculation in SDK Mode**: Uses Peak Detection and FFT-Based algorithms on PPG data.
-   **Local SQLite Database**: Persists sensor data with batched inserts.
-   **Cloud Sync to Supabase**: Automatically syncs sensor readings and sessions with Supabase PostgreSQL, leveraging Row Level Security.
-   **Automated Sleep Analysis**: A Python Flask backend processes PPG and accelerometer data to calculate sleep metrics (onset, wake time, efficiency, awakenings, WASO) and stores results in Supabase.
-   **Tab Navigation**: Provides views for real-time monitoring and sleep analysis.
-   **On-Device Debug Console**: A floating overlay captures and displays console logs with features like pause/resume auto-scroll and safe serialization.

### Database Schema

Supabase tables required: `sessions`, `sensor_readings`, `sleep_analysis`, and `sleep_analysis_hypnospy`.

### Project Configuration

Uses **Expo SDK 54** with Android SDK versions `compileSdkVersion 35`, `targetSdkVersion 35`, and `minSdkVersion 26`. Requires `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and `ACCESS_FINE_LOCATION` permissions. EAS Build is used for APK generation.

## External Dependencies

### Core Framework Dependencies

-   **Expo SDK (~54.0.0)**
-   **React Native (0.76.5)**
-   **React (18.3.1)**

### BLE and Sensor Dependencies

-   **react-native-ble-plx (3.2.1)**
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