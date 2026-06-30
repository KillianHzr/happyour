const { withInfoPlist, withXcodeProject } = require("expo/config-plugins");

/**
 * Force l'app en iPhone-only et nettoie les résidus iPad laissés par prebuild.
 *
 * Contexte : même avec `ios.supportsTablet: false`, `expo prebuild` réinjecte la clé
 * `UISupportedInterfaceOrientations~ipad` dans Info.plist (bug expo/expo#32344).
 * Comme /ios est régénéré à chaque build EAS (CNG), on corrige ça à la source via
 * ce plugin plutôt qu'à la main après chaque prebuild.
 */
const withIphoneOnly = (config) => {
  // 1. Supprime la clé d'orientations iPad réinjectée par prebuild.
  config = withInfoPlist(config, (cfg) => {
    delete cfg.modResults["UISupportedInterfaceOrientations~ipad"];
    return cfg;
  });

  // 2. Garantit la device family iPhone-only ("1") quoi qu'il arrive.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const buildSettings = configurations[key].buildSettings;
      if (buildSettings && buildSettings.TARGETED_DEVICE_FAMILY !== undefined) {
        buildSettings.TARGETED_DEVICE_FAMILY = '"1"';
      }
    }
    return cfg;
  });

  return config;
};

module.exports = withIphoneOnly;
