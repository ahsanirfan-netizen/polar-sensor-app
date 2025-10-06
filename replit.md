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

### Data Persistence Architecture

A local SQLite database (`polar_sensor.db`) is used for storing sensor data. It employs a batched insert system that flushes buffered sensor readings to the database every 1 second via a transaction, preventing race conditions and ensuring data integrity. Recording is user-controlled and automatically stops on disconnect.

### Core Features

-   **PPI Toggle in Standard Mode**: Users can switch between HR-only and HR+PPI, affecting PMD service subscription and HR calculation.
-   **Overnight BLE Connection Persistence**: Includes a screen wake lock (`expo-keep-awake`) and an auto-reconnect mechanism with exponential backoff to maintain continuous data streaming.
-   **Dual HR Calculation in SDK Mode**: Integrates the `fft.js` library and employs a circular PPG buffer to perform Peak Detection and FFT-Based HR calculations every 2 seconds from raw PPG data.
-   **Local SQLite Database**: Persists sensor data for post-processing, utilizing batched inserts and robust error handling.
-   **Cloud Sync to Supabase**: Automatic syncing of sensor readings and sessions to Supabase PostgreSQL database with Row Level Security (RLS) policies.
-   **Automated Sleep Analysis**: Python Flask backend processes PPG and accelerometer data to calculate sleep metrics (onset, wake time, efficiency, awakenings, WASO) and stores results in Supabase.
-   **Tab Navigation**: Simple tab-based UI allowing users to switch between real-time sensor monitoring and sleep analysis views.

### Project Configuration

The project uses **Expo SDK 54** with Android SDK versions `compileSdkVersion 34`, `targetSdkVersion 34`, and `minSdkVersion 23`. Required permissions include `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and `ACCESS_FINE_LOCATION`. EAS Build is used for cloud-based APK generation.

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