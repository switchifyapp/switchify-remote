import * as SecureStore from 'expo-secure-store';

export type SecretStorage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;

export const secretStorage: SecretStorage = SecureStore;
