const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBackgroundActions(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    if (!manifest.application) {
      manifest.application = [{}];
    }

    const application = manifest.application[0];

    if (!application.service) {
      application.service = [];
    }

    const serviceExists = application.service.some(
      (service) => service.$?.['android:name'] === 'com.asterinet.react.bgactions.RNBackgroundActionsTask'
    );

    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': 'com.asterinet.react.bgactions.RNBackgroundActionsTask',
          'android:foregroundServiceType': 'connectedDevice',
          'android:exported': 'false'
        }
      });
    }

    return config;
  });
};
