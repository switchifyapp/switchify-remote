import { Alert } from 'react-native';

import { ActionButton } from './ActionButton';

const UNPAIR_MESSAGE = "This removes saved access from this device. You'll need to pair with this computer again.";

export function UnpairButton({ displayName, onConfirm }: { displayName: string; onConfirm: () => void }) {
  const label = `Unpair ${displayName}`;

  const confirmUnpair = () => {
    Alert.alert(
      `${label}?`,
      UNPAIR_MESSAGE,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpair', style: 'destructive', onPress: onConfirm },
      ],
      { cancelable: true },
    );
  };

  return <ActionButton icon="link-off" label={label} tone="tertiary" onPress={confirmUnpair} />;
}
