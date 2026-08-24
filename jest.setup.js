/* global jest */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurTargetView: View, BlurView: View };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
