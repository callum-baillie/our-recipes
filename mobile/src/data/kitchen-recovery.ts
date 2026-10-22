import * as SecureStore from 'expo-secure-store';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import {
  kitchenCommandRecovery,
  type KitchenDraftScope,
} from '../../../shared/mobile-domain/kitchen-recovery';
export * from '../../../shared/mobile-domain/kitchen-recovery';
export async function nativeKitchenRecovery(scope: KitchenDraftScope) {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify([scope.instanceUrl, scope.userId, scope.profileId, scope.kitchenId]),
  );
  return kitchenCommandRecovery(
    {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    },
    `bord.kitchen.operation.${digest}`,
    scope,
  );
}

async function setupKey(scope: KitchenDraftScope) {
  return `bord.kitchen.setup.${await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([scope.instanceUrl, scope.userId, scope.profileId, scope.kitchenId]))}`;
}
export async function readKitchenSetupStep(scope: KitchenDraftScope) {
  const value = await SecureStore.getItemAsync(await setupKey(scope));
  const step = Number(value);
  return value !== null && Number.isInteger(step) && step >= 0 && step <= 3 ? step : 0;
}
export async function writeKitchenSetupStep(scope: KitchenDraftScope, step: number) {
  if (!Number.isInteger(step) || step < 0 || step > 3) throw new Error('Invalid setup step.');
  await SecureStore.setItemAsync(await setupKey(scope), String(step));
}
