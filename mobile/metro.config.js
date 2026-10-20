const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Pure payload contracts are consumed by both native code and root acceptance tests.
config.watchFolders = [require('node:path').resolve(__dirname, '../shared')];

module.exports = config;
