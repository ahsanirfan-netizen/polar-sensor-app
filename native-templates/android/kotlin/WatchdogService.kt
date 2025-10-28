package com.polarsensor.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log
import java.text.SimpleDateFormat
import java.util.*

class WatchdogReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "WatchdogReceiver"
        private const val WATCHDOG_INTERVAL = 5 * 60 * 1000L // 5 minutes
        private const val ACTION_WATCHDOG = "com.polarsensor.app.WATCHDOG_CHECK"
        
        fun schedule(context: Context) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val intent = Intent(context, WatchdogReceiver::class.java).apply {
                    action = ACTION_WATCHDOG
                }
                
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    12345,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL,
                        pendingIntent
                    )
                } else {
                    alarmManager.setExact(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL,
                        pendingIntent
                    )
                }
                
                Log.d(TAG, "Watchdog alarm scheduled for ${WATCHDOG_INTERVAL / 1000}s from now")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule watchdog", e)
            }
        }
        
        fun cancel(context: Context) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val intent = Intent(context, WatchdogReceiver::class.java).apply {
                    action = ACTION_WATCHDOG
                }
                
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    12345,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                
                alarmManager.cancel(pendingIntent)
                Log.d(TAG, "Watchdog alarm cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to cancel watchdog", e)
            }
        }
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_WATCHDOG) {
            val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
            Log.d(TAG, "⏰ Watchdog check at $timestamp")
            
            val isServiceRunning = NativeForegroundService.isRunning
            Log.d(TAG, "Service running: $isServiceRunning")
            
            if (!isServiceRunning) {
                Log.e(TAG, "⚠️⚠️⚠️ SERVICE DIED! Service is not running but watchdog is active")
                Log.e(TAG, "⚠️ Last watchdog check: $timestamp")
                Log.e(TAG, "⚠️ This indicates the service was killed by Android OS")
            }
            
            val memoryInfo = ProcessDiagnostics.getCurrentMemoryInfo(context)
            Log.d(TAG, "Current memory: $memoryInfo")
            
            schedule(context)
        }
    }
}
