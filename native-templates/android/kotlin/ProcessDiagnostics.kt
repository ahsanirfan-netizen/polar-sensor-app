package com.polarsensor.app

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

object ProcessDiagnostics {
    private const val TAG = "ProcessDiagnostics"
    
    @RequiresApi(Build.VERSION_CODES.R)
    fun getExitReasons(context: Context, maxReasons: Int = 5): String {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val exitReasons = activityManager.getHistoricalProcessExitReasons(null, 0, maxReasons)
            
            val jsonArray = JSONArray()
            for (exitInfo in exitReasons) {
                val exitJson = JSONObject()
                exitJson.put("timestamp", formatTimestamp(exitInfo.timestamp))
                exitJson.put("reason", getReasonString(exitInfo.reason))
                exitJson.put("importance", getImportanceString(exitInfo.importance))
                exitJson.put("status", exitInfo.status)
                exitJson.put("description", exitInfo.description ?: "No description")
                exitJson.put("pid", exitInfo.pid)
                exitJson.put("rss", "${exitInfo.rss / 1024}KB")
                exitJson.put("pss", "${exitInfo.pss / 1024}KB")
                
                jsonArray.put(exitJson)
            }
            
            jsonArray.toString()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get exit reasons", e)
            JSONObject().apply {
                put("error", "Failed to get exit reasons: ${e.message}")
            }.toString()
        }
    }
    
    @RequiresApi(Build.VERSION_CODES.R)
    private fun getReasonString(reason: Int): String {
        return when (reason) {
            ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF (app exited normally)"
            ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED (killed by signal)"
            ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY (killed by LMK)"
            ApplicationExitInfo.REASON_CRASH -> "CRASH (uncaught exception)"
            ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE (native crash)"
            ApplicationExitInfo.REASON_ANR -> "ANR (Application Not Responding)"
            ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INITIALIZATION_FAILURE"
            ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "PERMISSION_CHANGE"
            ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RESOURCE_USAGE"
            ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED (force stopped)"
            ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
            ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
            ApplicationExitInfo.REASON_OTHER -> "OTHER"
            else -> "UNKNOWN ($reason)"
        }
    }
    
    @RequiresApi(Build.VERSION_CODES.R)
    private fun getImportanceString(importance: Int): String {
        return when (importance) {
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND -> "FOREGROUND"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE -> "FOREGROUND_SERVICE"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE -> "VISIBLE"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_PERCEPTIBLE -> "PERCEPTIBLE"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_CANT_SAVE_STATE -> "CANT_SAVE_STATE"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE -> "SERVICE"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_CACHED -> "CACHED"
            ActivityManager.RunningAppProcessInfo.IMPORTANCE_GONE -> "GONE"
            else -> "UNKNOWN ($importance)"
        }
    }
    
    private fun formatTimestamp(timestamp: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        return sdf.format(Date(timestamp))
    }
    
    fun getCurrentMemoryInfo(context: Context): String {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memoryInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memoryInfo)
            
            val runtime = Runtime.getRuntime()
            val usedMemory = runtime.totalMemory() - runtime.freeMemory()
            
            val jsonObject = JSONObject()
            jsonObject.put("availableMemoryMB", memoryInfo.availMem / 1024 / 1024)
            jsonObject.put("totalMemoryMB", memoryInfo.totalMem / 1024 / 1024)
            jsonObject.put("lowMemory", memoryInfo.lowMemory)
            jsonObject.put("threshold", memoryInfo.threshold / 1024 / 1024)
            jsonObject.put("heapUsedMB", usedMemory / 1024 / 1024)
            jsonObject.put("heapMaxMB", runtime.maxMemory() / 1024 / 1024)
            jsonObject.put("heapFreeMB", runtime.freeMemory() / 1024 / 1024)
            
            jsonObject.toString()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get memory info", e)
            JSONObject().apply {
                put("error", "Failed to get memory info: ${e.message}")
            }.toString()
        }
    }
}
