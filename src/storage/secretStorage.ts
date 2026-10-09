import * as SecureStore from 'expo-secure-store';

export type SecretStorage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'> & {
  getOrCreateItemAsync?: (name: string, create: () => string) => Promise<string>;
};

export const secretStorage: SecretStorage = SecureStore;
