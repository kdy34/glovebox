// Adopts the UIKit scene life cycle, which apps built with the iOS 27 SDK must use: without it
// the app asserts at launch ("UIScene life cycle is required for apps built with this SDK").
// Expo SDK 57 ships `ExpoAppSceneDelegate` (EXExpoAppSceneDelegate) but its prebuild template
// still uses the app-delegate window, so this plugin wires it up:
//  1. Info.plist declares a single window scene backed by EXExpoAppSceneDelegate.
//  2. AppDelegate conforms to ExpoReactNativeFactoryProvider and leaves creating the window and
//     starting React Native to the scene delegate.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
      },
    ],
  },
};

const CLASS_DECL = 'class AppDelegate: ExpoAppDelegate {';
const CLASS_DECL_NEW = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
// The template's window bootstrap inside didFinishLaunching; the scene delegate does this now.
const WINDOW_BLOCK = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function patchAppDelegate(src) {
  if (src.includes(CLASS_DECL_NEW)) return src;
  if (!src.includes(CLASS_DECL) || !WINDOW_BLOCK.test(src)) {
    throw new Error('withSceneLifecycle: AppDelegate.swift does not match the Expo SDK 57 template; update the plugin.');
  }
  return src
    .replace(CLASS_DECL, CLASS_DECL_NEW)
    .replace(WINDOW_BLOCK, '\n    // The window is created by ExpoAppSceneDelegate (plugins/withSceneLifecycle.js).\n');
}

const withSceneLifecycle = (config) => {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return c;
  });
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('withSceneLifecycle expects a Swift AppDelegate.');
    c.modResults.contents = patchAppDelegate(c.modResults.contents);
    return c;
  });
};

module.exports = withSceneLifecycle;
module.exports.patchAppDelegate = patchAppDelegate;
