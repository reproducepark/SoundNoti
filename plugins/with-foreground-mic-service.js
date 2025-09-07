// Expo Config Plugin: Inject foregroundServiceType="microphone" for RN Background Actions service
// Ensures Android 14+ can start the foreground service for microphone usage

const { withAndroidManifest } = require('expo/config-plugins');

function ensureToolsNamespace(androidManifest) {
  const manifest = androidManifest.manifest || androidManifest;
  manifest.$ = manifest.$ || {};
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }
}

function addMicServiceType(androidManifest) {
  const manifest = androidManifest.manifest || androidManifest;
  const app = manifest.application && manifest.application[0];
  if (!app) return androidManifest;
  app.service = app.service || [];

  const targetNameFqn = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
  const targetNameShorthand = '.RNBackgroundActionsTask';

  let svc = app.service.find(
    (s) => s.$ && (s.$['android:name'] === targetNameFqn || s.$['android:name'] === targetNameShorthand)
  );

  if (!svc) {
    svc = {
      $: {
        'android:name': targetNameFqn,
        'android:enabled': 'true',
        'tools:node': 'merge',
      },
    };
    app.service.push(svc);
  }

  svc.$['android:foregroundServiceType'] = 'microphone';
  return androidManifest;
}

const withForegroundMicService = (config) => {
  return withAndroidManifest(config, (c) => {
    ensureToolsNamespace(c.modResults);
    addMicServiceType(c.modResults);
    return c;
  });
};

module.exports = withForegroundMicService;


