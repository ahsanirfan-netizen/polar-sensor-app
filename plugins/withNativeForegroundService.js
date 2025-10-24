const { withAndroidManifest, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Kotlin code for the native foreground service
const FOREGROUND_SERVICE_KOTLIN = `package com.polarsensor.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

class NativeForegroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var startTime: Long = 0
    private var heartbeatCount: Int = 0
    
    companion object {
        private const val TAG = "NativeForegroundService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "polar_sensor_foreground"
        var isRunning = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate() - Service created")
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand() - Service starting")
        
        when (intent?.action) {
            "START_SERVICE" -> {
                val deviceName = intent.getStringExtra("deviceName") ?: "Polar Sensor"
                startForegroundService(deviceName)
            }
            "UPDATE_NOTIFICATION" -> {
                val heartRate = intent.getStringExtra("heartRate")
                val recordingTime = intent.getStringExtra("recordingTime")
                val deviceName = intent.getStringExtra("deviceName") ?: "Polar Sensor"
                updateNotification(heartRate, recordingTime, deviceName)
            }
            "STOP_SERVICE" -> {
                stopForegroundService()
            }
        }
        
        return START_STICKY
    }

    private fun startForegroundService(deviceName: String) {
        Log.d(TAG, "Starting foreground service with FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE")
        startTime = System.currentTimeMillis()
        heartbeatCount = 0
        isRunning = true
        
        val notification = createNotification(
            "Connected to $deviceName",
            "Collecting sensor data...",
            deviceName
        )
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, 
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        
        Log.d(TAG, "Foreground service started successfully")
    }

    private fun updateNotification(heartRate: String?, recordingTime: String?, deviceName: String) {
        heartbeatCount++
        val elapsedMinutes = (System.currentTimeMillis() - startTime) / 60000
        
        Log.d(TAG, "Heartbeat #$heartbeatCount - Elapsed: $elapsedMinutes min - HR: $heartRate")
        
        val title = recordingTime?.let { "Recording: $it" } ?: "Connected to $deviceName"
        val hrText = heartRate?.let { "HR: $it bpm" } ?: "HR: --"
        val description = "$hrText | Heartbeat #$heartbeatCount"
        
        val notification = createNotification(title, description, deviceName)
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun stopForegroundService() {
        Log.d(TAG, "Stopping foreground service - Total heartbeats: $heartbeatCount")
        isRunning = false
        releaseWakeLock()
        stopForeground(true)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Polar Sensor Data Collection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Persistent notification for BLE sensor data collection"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created")
        }
    }

    private fun createNotification(title: String, description: String, deviceName: String): Notification {
        val notificationIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(description)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "$TAG::WakeLock"
            ).apply {
                acquire()
                Log.d(TAG, "Wake lock acquired")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock", e)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Wake lock released")
            }
        }
        wakeLock = null
    }

    override fun onDestroy() {
        Log.d(TAG, "onDestroy() - Service destroyed after $heartbeatCount heartbeats")
        isRunning = false
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.d(TAG, "onTaskRemoved() - App task removed, continuing service")
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}
`;

// Kotlin code for the React Native bridge module
const BRIDGE_MODULE_KOTLIN = `package com.polarsensor.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*

class ForegroundServiceModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NativeForegroundService"

    @ReactMethod
    fun startService(deviceName: String, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, NativeForegroundService::class.java).apply {
                action = "START_SERVICE"
                putExtra("deviceName", deviceName)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun updateNotification(heartRate: String?, recordingTime: String?, deviceName: String?, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, NativeForegroundService::class.java).apply {
                action = "UPDATE_NOTIFICATION"
                putExtra("heartRate", heartRate)
                putExtra("recordingTime", recordingTime)
                putExtra("deviceName", deviceName ?: "Polar Sensor")
            }
            
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_NOTIFICATION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, NativeForegroundService::class.java).apply {
                action = "STOP_SERVICE"
            }
            
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        try {
            promise.resolve(NativeForegroundService.isRunning)
        } catch (e: Exception) {
            promise.reject("IS_RUNNING_ERROR", e.message, e)
        }
    }
}
`;

// Kotlin code for the package registration
const PACKAGE_KOTLIN = `package com.polarsensor.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ForegroundServicePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(ForegroundServiceModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

function withNativeForegroundService(config) {
  // Modify AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const { manifest: manifestTag } = manifest;

    if (!manifestTag.application) {
      throw new Error('AndroidManifest.xml is missing <application> tag');
    }

    const application = manifestTag.application[0];

    // Add PARTIAL_WAKE_LOCK permission if not present
    if (!manifestTag['uses-permission']) {
      manifestTag['uses-permission'] = [];
    }

    const wakeLockExists = manifestTag['uses-permission'].some(
      (perm) => perm.$?.['android:name'] === 'android.permission.WAKE_LOCK'
    );

    if (!wakeLockExists) {
      manifestTag['uses-permission'].push({
        $: { 'android:name': 'android.permission.WAKE_LOCK' },
      });
    }

    // Add the native service to the manifest
    if (!application.service) {
      application.service = [];
    }

    const serviceExists = application.service.some(
      (service) => service.$?.['android:name'] === '.NativeForegroundService'
    );

    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': '.NativeForegroundService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'connectedDevice',
          'android:stopWithTask': 'false',
        },
      });
    }

    return config;
  });

  // Add Kotlin files and register the package
  config = withMainApplication(config, async (config) => {
    const { modResults } = config;
    const packageImport = 'import com.polarsensor.app.ForegroundServicePackage';
    const packageAdd = 'add(ForegroundServicePackage())';
    let importAdded = false;
    let packageAdded = false;

    // Add import if not present
    if (!modResults.contents.includes(packageImport)) {
      // Try multiple import insertion points for different Expo versions
      if (modResults.contents.includes('import com.facebook.react.defaults.DefaultReactNativeHost')) {
        modResults.contents = modResults.contents.replace(
          /import com\.facebook\.react\.defaults\.DefaultReactNativeHost/,
          `import com.facebook.react.defaults.DefaultReactNativeHost\n${packageImport}`
        );
        importAdded = true;
      } else if (modResults.contents.includes('package com.polarsensor.app')) {
        modResults.contents = modResults.contents.replace(
          /(package com\.polarsensor\.app\s+)/,
          `$1\n${packageImport}\n`
        );
        importAdded = true;
      } else {
        console.warn('⚠️ Could not find insertion point for ForegroundServicePackage import in MainApplication');
      }
    } else {
      importAdded = true;
    }

    // Add package registration if not present
    // Handle different Expo SDK versions and MainApplication.kt patterns
    if (!modResults.contents.includes('ForegroundServicePackage')) {
      let matched = false;
      
      // Pattern 1: PackageList(this).packages.apply { ... } (SDK 50-54)
      // This is the most common pattern, match more flexibly
      const applyPattern = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (applyPattern.test(modResults.contents)) {
        modResults.contents = modResults.contents.replace(
          applyPattern,
          (match) => `${match}\n          ${packageAdd}`
        );
        matched = true;
        console.log('✅ Using packages.apply pattern (SDK 50-54)');
      }
      
      // Pattern 2: val packages = PackageList(this).packages (alternative SDK 54)
      if (!matched && modResults.contents.includes('val packages = PackageList(this).packages')) {
        modResults.contents = modResults.contents.replace(
          /(val packages = PackageList\(this\)\.packages\s*\n)/,
          `$1          packages.${packageAdd}\n`
        );
        matched = true;
        console.log('✅ Using val packages pattern (SDK 54 alternative)');
      }
      
      // Pattern 3: return PackageList(this).packages (older versions)
      // Rewrite to use val packages so the add() doesn't get dropped
      if (!matched && /return\s+PackageList\(this\)\.packages/i.test(modResults.contents)) {
        modResults.contents = modResults.contents.replace(
          /(override fun getPackages[^}]*)(return\s+)PackageList\(this\)\.packages/,
          `$1val packages = PackageList(this).packages\n          packages.${packageAdd}\n          ${2}packages`
        );
        matched = true;
        console.log('✅ Using return packages pattern (older SDKs) - rewrote to use val packages');
      }
      
      if (matched) {
        packageAdded = true;
      } else {
        console.error('❌ Could not find any known MainApplication.kt pattern!');
        console.error('❌ Please check the generated MainApplication.kt manually');
        console.error('File preview:', modResults.contents.substring(0, 800));
      }
    } else {
      packageAdded = true;
    }

    if (importAdded && packageAdded) {
      console.log('✅ ForegroundServicePackage registered in MainApplication');
    }

    return config;
  });

  return config;
}

// This function is called during expo prebuild to inject the Kotlin files
function withKotlinFiles(config) {
  const platformProjectRoot = path.join(
    config.modRequest.platformProjectRoot,
    'app',
    'src',
    'main',
    'java',
    'com',
    'polarsensor',
    'app'
  );

  console.log('📁 Creating Kotlin files directory:', platformProjectRoot);

  // Ensure directory exists
  if (!fs.existsSync(platformProjectRoot)) {
    fs.mkdirSync(platformProjectRoot, { recursive: true });
    console.log('✅ Created directory');
  } else {
    console.log('✅ Directory already exists');
  }

  // Write the Kotlin files
  const serviceFile = path.join(platformProjectRoot, 'NativeForegroundService.kt');
  fs.writeFileSync(serviceFile, FOREGROUND_SERVICE_KOTLIN);
  console.log('✅ Written:', serviceFile);

  const moduleFile = path.join(platformProjectRoot, 'ForegroundServiceModule.kt');
  fs.writeFileSync(moduleFile, BRIDGE_MODULE_KOTLIN);
  console.log('✅ Written:', moduleFile);

  const packageFile = path.join(platformProjectRoot, 'ForegroundServicePackage.kt');
  fs.writeFileSync(packageFile, PACKAGE_KOTLIN);
  console.log('✅ Written:', packageFile);

  console.log('✅ All Kotlin files generated successfully');

  return config;
}

module.exports = function (config) {
  config = withNativeForegroundService(config);
  
  // Hook into the dangerous mod to write files during prebuild
  if (!config.mods) {
    config.mods = {};
  }
  if (!config.mods.android) {
    config.mods.android = {};
  }
  
  const existingDangerousMod = config.mods.android.dangerous;
  config.mods.android.dangerous = async (config) => {
    console.log('🔧 Running dangerous mod to generate Kotlin files...');
    if (existingDangerousMod) {
      config = await existingDangerousMod(config);
    }
    return withKotlinFiles(config);
  };
  
  return config;
};
