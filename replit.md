# Replit Agent Instructions

## Overview

This is a basic React Native mobile application built with Expo framework. The project is a starter "Hello World" application that displays a simple text message on the screen. It's configured to run on iOS, Android, and web platforms, demonstrating cross-platform mobile development capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework Choice: React Native with Expo**
- **Problem Addressed**: Need for cross-platform mobile application development without maintaining separate codebases
- **Solution**: React Native provides a single JavaScript codebase that compiles to native iOS and Android applications, while Expo adds tooling and managed workflow
- **Rationale**: Expo simplifies the development process by handling native configuration and providing built-in components, making it ideal for rapid prototyping and development without native code expertise
- **Pros**: 
  - Single codebase for multiple platforms (iOS, Android, Web)
  - Hot reloading for faster development
  - Extensive component library
  - Simplified build and deployment process
- **Cons**: 
  - Limited access to some native APIs without ejecting
  - Larger app bundle size compared to pure native apps

**Component Structure**
- **Approach**: Functional components using React hooks
- **Rationale**: Modern React pattern that's simpler and more maintainable than class components
- **Current Implementation**: Single App.js component serving as the main entry point

**Styling Strategy**
- **Method**: StyleSheet API from React Native
- **Rationale**: Provides optimized styling with a CSS-like syntax while maintaining native performance
- **Pattern**: Styles defined at component level using StyleSheet.create()

### Project Configuration

**Expo Configuration (app.json)**
- Defines app metadata (name, slug, version)
- Configures platform-specific settings for iOS, Android, and Web
- Sets up assets (icons, splash screens)
- UI orientation locked to portrait mode
- Light interface style as default

**Build Configuration**
- Babel preset configured for Expo compatibility
- Entry point: expo/AppEntry.js (standard Expo convention)
- Scripts available for running on different platforms (start, android, ios, web)

### Development Workflow

**Hot Reloading Support**
- Expo provides fast refresh during development
- Changes reflect immediately without full app reload

**Cross-Platform Testing**
- Single codebase can be tested across web, iOS simulator, and Android emulator
- Web version available for quick browser-based testing

## External Dependencies

### Core Framework Dependencies

**Expo SDK (~51.0.0)**
- Purpose: Managed React Native workflow and tooling
- Provides: Build system, development server, and native module access
- Why chosen: Simplifies mobile development without requiring native development environment setup

**React Native (0.74.5)**
- Purpose: Core mobile application framework
- Provides: Native component rendering and JavaScript bridge
- Bundled with: Expo SDK for version compatibility

**React (18.2.0)**
- Purpose: UI library and component architecture
- Provides: Component lifecycle, hooks, and state management

**expo-status-bar (~1.12.1)**
- Purpose: Control and style the device status bar
- Provides: Cross-platform status bar component
- Usage: Currently set to "auto" mode

### Development Tools

**@babel/core (^7.20.0)**
- Purpose: JavaScript transpilation
- Provides: Modern JavaScript syntax support for older platforms
- Configuration: Using babel-preset-expo for Expo-specific transforms

**@expo/ngrok (^4.1.3)**
- Purpose: Development tunneling service
- Provides: Allows testing on physical devices without being on same network
- Use case: Remote testing and demonstration

### Asset Management

**Static Assets**
- Icons: Platform-specific app icons (iOS, Android, Web)
- Splash Screen: Loading screen with white background
- Favicon: Web-specific icon
- Pattern: All assets bundled using assetBundlePatterns configuration

### Platform Support

**Target Platforms**
- iOS: Tablet support enabled
- Android: Adaptive icon configuration
- Web: Progressive web app capabilities with favicon
- All platforms use the same React Native codebase