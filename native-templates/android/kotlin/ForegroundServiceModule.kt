package com.polarsensor.app

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
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

    @ReactMethod
    fun getExitReasons(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val exitReasons = ProcessDiagnostics.getExitReasons(reactApplicationContext, 5)
                promise.resolve(exitReasons)
            } else {
                promise.resolve("[]")
            }
        } catch (e: Exception) {
            promise.reject("EXIT_REASONS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getCurrentMemoryInfo(promise: Promise) {
        try {
            val memoryInfo = ProcessDiagnostics.getCurrentMemoryInfo(reactApplicationContext)
            promise.resolve(memoryInfo)
        } catch (e: Exception) {
            promise.reject("MEMORY_INFO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isBatteryOptimizationDisabled(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = reactApplicationContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
                val packageName = reactApplicationContext.packageName
                val isIgnoring = powerManager.isIgnoringBatteryOptimizations(packageName)
                promise.resolve(isIgnoring)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("BATTERY_OPT_CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestBatteryOptimizationExemption(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = reactApplicationContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
                val packageName = reactApplicationContext.packageName
                
                if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    reactApplicationContext.startActivity(intent)
                    promise.resolve("requested")
                } else {
                    promise.resolve("already_disabled")
                }
            } else {
                promise.resolve("not_needed")
            }
        } catch (e: Exception) {
            promise.reject("BATTERY_OPT_REQUEST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startWatchdog(promise: Promise) {
        try {
            WatchdogReceiver.schedule(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WATCHDOG_START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopWatchdog(promise: Promise) {
        try {
            WatchdogReceiver.cancel(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WATCHDOG_STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getBatteryOptimizationStatus(promise: Promise) {
        try {
            val status = ProcessDiagnostics.getBatteryOptimizationStatus(reactApplicationContext)
            promise.resolve(status)
        } catch (e: Exception) {
            promise.reject("BATTERY_STATUS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val canSchedule = alarmManager.canScheduleExactAlarms()
                promise.resolve(canSchedule)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ALARM_CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestExactAlarmPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(intent)
                promise.resolve("requested")
            } else {
                promise.resolve("not_needed")
            }
        } catch (e: Exception) {
            promise.reject("ALARM_REQUEST_ERROR", e.message, e)
        }
    }
}
