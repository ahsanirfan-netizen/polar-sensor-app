const { withAndroidManifest, withMainApplication } = require('@expo/config-plugins');

function withNativeForegroundService(config) {
  // Modify AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
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

    const serviceIndex = application.service.findIndex(
      (service) => service.$?.['android:name'] === '.NativeForegroundService'
    );

    const serviceConfig = {
      $: {
        'android:name': '.NativeForegroundService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'connectedDevice',
        'android:stopWithTask': 'false',
        'android:directBootAware': 'true',
      },
    };

    if (serviceIndex >= 0) {
      // Update existing service with all required attributes
      application.service[serviceIndex] = serviceConfig;
      console.log('✅ Updated existing NativeForegroundService in manifest');
    } else {
      // Add new service entry
      application.service.push(serviceConfig);
      console.log('✅ Added NativeForegroundService to manifest');
    }

    // Add watchdog receiver
    if (!application.receiver) {
      application.receiver = [];
    }

    const receiverIndex = application.receiver.findIndex(
      (receiver) => receiver.$?.['android:name'] === '.WatchdogReceiver'
    );

    const receiverConfig = {
      $: {
        'android:name': '.WatchdogReceiver',
        'android:enabled': 'true',
        'android:exported': 'false',
      },
    };

    if (receiverIndex >= 0) {
      application.receiver[receiverIndex] = receiverConfig;
      console.log('✅ Updated WatchdogReceiver in manifest');
    } else {
      application.receiver.push(receiverConfig);
      console.log('✅ Added WatchdogReceiver to manifest');
    }

    // Add SCHEDULE_EXACT_ALARM permission for watchdog (Android 12+)
    const scheduleAlarmExists = manifestTag['uses-permission'].some(
      (perm) => perm.$?.['android:name'] === 'android.permission.SCHEDULE_EXACT_ALARM'
    );

    if (!scheduleAlarmExists) {
      manifestTag['uses-permission'].push({
        $: { 'android:name': 'android.permission.SCHEDULE_EXACT_ALARM' },
      });
    }

    // Add REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission for battery exemption
    const batteryOptExists = manifestTag['uses-permission'].some(
      (perm) => perm.$?.['android:name'] === 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'
    );

    if (!batteryOptExists) {
      manifestTag['uses-permission'].push({
        $: { 'android:name': 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS' },
      });
    }

    return config;
  });

  // Add Kotlin files and register the package
  config = withMainApplication(config, (config) => {
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
    if (!modResults.contents.includes('ForegroundServicePackage()')) {
      let matched = false;
      
      // Pattern 1: PackageList(this).packages.apply { ... } (SDK 50-54)
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
      if (!matched && /return\s+PackageList\(this\)\.packages/i.test(modResults.contents)) {
        modResults.contents = modResults.contents.replace(
          /(override fun getPackages[^}]*)(return\s+)PackageList\(this\)\.packages/,
          `$1val packages = PackageList(this).packages\n          packages.${packageAdd}\n          ${2}packages`
        );
        matched = true;
        console.log('✅ Using return packages pattern (older SDKs)');
      }
      
      if (matched) {
        packageAdded = true;
      } else {
        console.error('❌ Could not find any known MainApplication.kt pattern!');
        console.error('❌ Please check the generated MainApplication.kt manually');
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

module.exports = withNativeForegroundService;
