export default {
  expo: {
    name: "Polar Sensor",
    slug: "polar-sensor-app",
    version: "1.0.1",
    orientation: "portrait",
    userInterfaceStyle: "light",
    scheme: "polarsensor",
    plugins: [
      [
        "react-native-ble-plx",
        {
          isBackgroundEnabled: true,
          modes: ["peripheral", "central"],
          bluetoothAlwaysPermission: "Allow $(PRODUCT_NAME) to connect to Polar devices"
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            buildToolsVersion: "35.0.0",
            minSdkVersion: 26
          }
        }
      ],
      "expo-sqlite",
      "react-native-health-connect"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.polarsensor.app",
      infoPlist: {
        UIBackgroundModes: ["bluetooth-central", "processing"]
      }
    },
    android: {
      package: "com.polarsensor.app",
      permissions: [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
        "android.permission.WAKE_LOCK",
        "android.permission.health.READ_STEPS",
        "android.permission.health.WRITE_STEPS",
        "android.permission.health.READ_DISTANCE",
        "android.permission.health.WRITE_DISTANCE",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.WRITE_HEART_RATE",
        "android.permission.health.READ_SLEEP",
        "android.permission.health.WRITE_SLEEP"
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "polarsensor"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    extra: {
      eas: {
        projectId: "d382f1f0-f8a2-4e52-8012-1754e997c15a"
      },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    }
  }
};
