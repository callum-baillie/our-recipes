import * as SecureStore from 'expo-secure-store';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { scannerRecovery } from '../../../shared/mobile-domain/scanner-recovery';
export * from '../../../shared/mobile-domain/scanner-recovery';
export async function nativeScannerRecovery(instanceUrl: string, userId: string) {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify([instanceUrl, userId]),
  );
  return scannerRecovery(
    {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    },
    `bord.scanner.${digest}`,
    instanceUrl,
    userId,
  );
}
