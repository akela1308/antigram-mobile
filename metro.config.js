const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Добавляем .cube файлы (LUT фильтры) как ассеты
config.resolver.assetExts.push('cube')

module.exports = config
