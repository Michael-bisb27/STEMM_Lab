const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

function withFirebaseFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      const tag = '# [withFirebaseFix]';

      // Prevent duplicate injections
      if (!contents.includes(tag)) {
        const targetString = 'post_install do |installer|';

        if (contents.includes(targetString)) {
          // The block snippet to inject inside the existing hook
          const snippet = `
  ${tag}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
    end
    rnfb_targets = [
      'RNFBApp',
      'RNFBCrashlytics',
      'RNFBPerf',
      'RNFBCrashlyticsInitProvider',
      'RNFBCrashlyticsSwizzle'
    ]
    if rnfb_targets.include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['DEFINES_MODULE'] = 'NO'
      end
    end
  end`;

          // Inject your logic directly below the opening line of Expo's post_install block
          contents = contents.replace(targetString, `${targetString}${snippet}`);
          fs.writeFileSync(podfilePath, contents);
        } else {
          console.warn(`[withFirebaseFix] Could not find standard '${targetString}' block in Podfile.`);
        }
      }

      return config;
    },
  ]);
}

module.exports = withFirebaseFix;