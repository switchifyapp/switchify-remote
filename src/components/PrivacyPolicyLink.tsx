import { Alert, Linking } from "react-native";

import { ListRow } from "./ListRow";

export const REMOTE_PRIVACY_POLICY_URL =
  "https://switchifyapp.com/privacy/remote";

export function PrivacyPolicyLink() {
  const openPrivacyPolicy = async () => {
    try {
      await Linking.openURL(REMOTE_PRIVACY_POLICY_URL);
    } catch {
      Alert.alert(
        "Unable to open privacy policy",
        `Open ${REMOTE_PRIVACY_POLICY_URL} in your browser.`,
      );
    }
  };

  return (
    <ListRow
      description="How Switchify Remote handles data."
      hint="Opens in your browser."
      icon="privacy-tip"
      onPress={() => void openPrivacyPolicy()}
      title="Privacy policy"
    />
  );
}
