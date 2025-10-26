package com.polarsensor.app

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
        Log.d(TAG, "onStartCommand() - Service starting - Android ${Build.VERSION.SDK_INT}")
        
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
    
    override fun onTimeout(startId: Int) {
        Log.w(TAG, "onTimeout() called - Android 15 is about to kill the service!")
        Log.w(TAG, "Service ran for ${(System.currentTimeMillis() - startTime) / 60000} minutes")
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
