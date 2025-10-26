package com.polarsensor.app

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
