import * as SecureStore from 'expo-secure-store';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { chatRecovery } from '../../../shared/mobile-domain/chat-recovery';
export * from '../../../shared/mobile-domain/chat-recovery';
export async function nativeChatRecovery(instanceUrl: string, userId: string) {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify([instanceUrl, userId]),
  );
  return chatRecovery(
    {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    },
    `bord.chat.operation.${digest}`,
    instanceUrl,
    userId,
  );
}
