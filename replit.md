# Replit Agent Instructions

## Overview

This project is a React Native mobile application, built with Expo Development Build, that connects to a Polar Verity Sense heart rate sensor via Bluetooth Low Energy (BLE). Its primary purpose is to provide real-time heart rate and other physiological data from the sensor. The application supports two mutually exclusive sensor modes due to hardware limitations: **Standard Mode** (configurable HR-only or HR+PPI) and **SDK Mode** (PPG + ACC + Gyro). The application is deployed to Android devices using EAS Build. The business vision is to provide a robust and flexible platform for health and fitness monitoring, leveraging advanced sensor data for deeper insights.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The application uses **React Native with Expo Development Build** to access native BLE functionality while maintaining a streamlined developer experience. It employs a single-file functional component structure with React hooks for state management. Styling is handled using React Native's StyleSheet API, featuring a clean, card-based UI.

### Bluetooth Low Energy Architecture

The **react-native-ble-plx** library handles BLE communication. The application implements the Polar Verity Sense protocol, which dictates two mutually exclusive operating modes:

-   **Standard Mode**: Configurable for HR-only or HR+PPI. This mode uses the standard BLE HR service and optionally the Polar PMD service for PPI, with HR calculated from PPI intervals. No SDK mode command is sent.
-   **SDK Mode**: Enables raw PPG, ACC, and Gyro data streaming. This mode requires sending an SDK mode command (`[0x02, 0x09]`) which disables Polar's onboard HR/PPI algorithms.

The Polar PMD Service (UUID: `FB005C80-02E7-F387-1CAD-8ACD2D8DF0C8`) is critical for advanced sensor data. It uses specific control and data characteristics for configuring and receiving sensor streams. PMD packet parsing involves skipping a 10-byte header and correctly interpreting measurement type IDs (0x01=PPG, 0x02=ACC, 0x03=PPI, 0x05=Gyro). Specific start commands with configuration bytes are used to initiate PPG, ACC, and Gyro streams.

### Project Configuration

The project uses **Expo SDK 54** with `compileSdkVersion 34`, `targetSdkVersion 34`, and `minSdkVersion 23` for Android. Permissions include `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and `ACCESS_FINE_LOCATION`. EAS Build is used for cloud-based APK generation, supporting a development workflow with custom development clients and `ngrok` for remote device connections.

## External Dependencies

### Core Framework Dependencies

-   **Expo SDK (~54.0.0)**: Managed React Native workflow with development build support.
-   **React Native (0.76.5)**: Core mobile application framework.
-   **React (18.3.1)**: UI library and component architecture.

### BLE and Sensor Dependencies

-   **react-native-ble-plx (3.2.1)**: Provides Bluetooth Low Energy functionality for scanning, connection, and characteristic interaction.
-   **buffer (^6.0.3)**: Node.js Buffer API polyfill, essential for binary data parsing of BLE packets.
-   **expo-device (^6.0.2)**: For retrieving device information.

### Build and Development Tools

-   **eas-cli (^14.2.0)**: Command-line interface for EAS Build, orchestrating cloud-based builds.
-   **expo-dev-client (~5.0.0)**: Custom development runtime for native module support.
-   **@expo/ngrok (^4.1.3)**: Development tunneling service for remote device connections.
-   **expo-build-properties (~0.12.5)**: For configuring native build properties within `app.json`.

### Platform Support

-   **Android**: Primary target platform, fully tested and deployed.
-   **iOS**: Theoretically supported but not currently tested.

## Recent Changes (October 2025)

### PPI Toggle Feature in Standard Mode (Oct 3, 2025)

**Added user-controlled PPI toggle**: Users can now choose between HR-only or HR+PPI in Standard Mode.

**HR-only mode (PPI disabled)**:
-   Subscribes only to standard BLE HR service
-   HR values come directly from device's validated algorithms
-   No PMD service subscription, no PPI stream started
-   Faster connection (no 25-second PPI initialization wait)

**HR+PPI mode (PPI enabled)**:
-   Subscribes to both standard BLE HR service and PMD service
-   HR calculated from PPI intervals using formula: `HR = 60000 / PPI_ms`
-   Standard BLE HR values logged but ignored to keep PPI-calculated HR authoritative
-   PPI takes ~25 seconds to initialize

**Implementation details**:
-   Used refs (`ppiEnabledRef`) to avoid stale closure issues in BLE monitor callbacks
-   Both HR callback and PPI parser read latest state from ref
-   Toggle disabled while connected (must disconnect to change)
-   Conditional UI shows PPI card only when enabled
-   Conditional disconnect logic stops PPI stream only if enabled

**Validated by architect**: All callbacks correctly reference current state, no closure bugs, ready for device testing.