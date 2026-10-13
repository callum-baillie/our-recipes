const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const NETWORK_SECURITY_RESOURCE = 'bord_network_security_config';
const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">bord.tower</domain>
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </domain-config>
</network-security-config>
`;

function withBordAndroidNetworkSecurity(config) {
  config = withAndroidManifest(config, (androidConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidConfig.modResults);
    application.$['android:networkSecurityConfig'] = `@xml/${NETWORK_SECURITY_RESOURCE}`;
    return androidConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const resourceDirectory = path.join(
        androidConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await mkdir(resourceDirectory, { recursive: true });
      await writeFile(
        path.join(resourceDirectory, `${NETWORK_SECURITY_RESOURCE}.xml`),
        NETWORK_SECURITY_XML,
        'utf8',
      );
      return androidConfig;
    },
  ]);
}

module.exports = withBordAndroidNetworkSecurity;
