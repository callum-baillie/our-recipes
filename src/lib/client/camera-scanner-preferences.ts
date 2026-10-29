export const CAMERA_SCANNER_KEY = 'bord-camera-scanner-preferences';
export const defaultCameraPreferences = {
  facingMode: 'environment',
  vibrate: true,
  cooldownMs: 1500,
};
export function readCameraPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(CAMERA_SCANNER_KEY) ?? '{}');
    return {
      facingMode: value.facingMode === 'user' ? 'user' : 'environment',
      vibrate: value.vibrate !== false,
      cooldownMs: [1000, 1500, 2500].includes(value.cooldownMs) ? value.cooldownMs : 1500,
    };
  } catch {
    return defaultCameraPreferences;
  }
}
