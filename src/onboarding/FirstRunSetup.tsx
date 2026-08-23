import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useAccessibilityAnnouncement } from '@/components/useAccessibilityAnnouncement';
import { useConnectionManager } from '@/connection/ConnectionContext';
import type { ConnectionManager } from '@/connection/ConnectionManager';
import { useTheme } from '@/theme/ThemeContext';
import {
  firstRunSetupStore,
  type FirstRunSetupPhase,
  type FirstRunSetupStore,
} from './FirstRunSetupStore';

export const SWITCHIFY_PC_RELEASES_URL =
  'https://github.com/switchifyapp/switchify-pc/releases';

export function FirstRunSetupGate({
  children,
  store = firstRunSetupStore,
}: {
  children: ReactNode;
  store?: FirstRunSetupStore;
}) {
  const manager = useConnectionManager();
  const phase = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  useEffect(() => {
    void store.load();
  }, [store]);

  if (phase === 'loading') return <SetupLoading />;
  if (phase === 'complete') return children;
  return <FirstRunSetup manager={manager} phase={phase} store={store} />;
}

export function FirstRunSetup({
  manager,
  phase,
  store,
}: {
  manager: Pick<ConnectionManager, 'scan'>;
  phase: Exclude<FirstRunSetupPhase, 'loading' | 'complete'>;
  store: FirstRunSetupStore;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const announcement =
    phase === 'welcome'
      ? 'Step 1 of 2. Meet Switchify Remote.'
      : 'Step 2 of 2. Connect with Bluetooth.';
  useAccessibilityAnnouncement(announcement);

  const finish = async (scan: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await store.complete();
    } catch {
      Alert.alert(
        'Setup could not continue',
        'Try again. Your existing Switchify settings and paired PCs are unchanged.',
      );
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (scan) void manager.scan();
  };

  if (phase === 'welcome')
    return (
      <WelcomeStep busy={busy} continueSetup={() => store.showBluetooth()} />
    );
  return (
    <BluetoothStep
      busy={busy}
      back={() => store.showWelcome()}
      allow={() => void finish(true)}
      dismiss={() => void finish(false)}
    />
  );
}

function SetupLoading() {
  const { colors, spacing } = useTheme();
  return (
    <Screen title="Switchify Remote">
      <View
        style={{
          alignItems: 'center',
          flex: 1,
          gap: spacing.md,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator
          accessibilityLabel="Loading setup"
          color={colors.brand}
          size="large"
        />
      </View>
    </Screen>
  );
}

function WelcomeStep({
  busy,
  continueSetup,
}: {
  busy: boolean;
  continueSetup: () => void;
}) {
  const openDesktopDownload = async () => {
    try {
      await Linking.openURL(SWITCHIFY_PC_RELEASES_URL);
    } catch {
      Alert.alert(
        'Unable to open Switchify PC downloads',
        `Open ${SWITCHIFY_PC_RELEASES_URL} in your browser.`,
      );
    }
  };

  return (
    <Screen title="Meet Switchify Remote" description="Step 1 of 2">
      <Card variant="hero">
        <AppText accessibilityRole="header" variant="title">
          Control your computer from this device
        </AppText>
        <AppText muted>
          Use your phone or tablet as an accessible remote for a Windows PC or
          Mac.
        </AppText>
        <Feature
          icon="mouse"
          text="Move, click, drag and scroll the pointer."
        />
        <Feature
          icon="keyboard"
          text="Type text and use common computer keys."
        />
        <Feature
          icon="web-asset"
          text="Control windows and switch between tasks."
        />
      </Card>
      <Card>
        <AppText accessibilityRole="header" variant="title">
          Before you start
        </AppText>
        <AppText muted>
          Install and open Switchify PC on the computer you want to control.
        </AppText>
        <ActionButton
          icon="download"
          label="Get Switchify PC"
          tone="secondary"
          onPress={() => void openDesktopDownload()}
        />
      </Card>
      <ActionButton disabled={busy} label="Continue" onPress={continueSetup} />
    </Screen>
  );
}

function BluetoothStep({
  busy,
  back,
  allow,
  dismiss,
}: {
  busy: boolean;
  back: () => void;
  allow: () => void;
  dismiss: () => void;
}) {
  const { spacing } = useTheme();
  return (
    <Screen title="Connect with Bluetooth" description="Step 2 of 2">
      <Card variant="hero">
        <AppText accessibilityRole="header" variant="title">
          Connect directly to a nearby PC
        </AppText>
        <AppText muted>
          Switchify Remote uses Bluetooth to find and connect to computers
          running Switchify PC.
        </AppText>
        <Feature
          icon="verified-user"
          text="Choose a computer and compare the six-digit pairing code."
        />
        <Feature
          icon="computer"
          text="Approve the request on that computer before control begins."
        />
        <Feature
          icon="cloud-off"
          text="Remote commands are not routed through a Switchify account or cloud service."
        />
      </Card>
      <AppText muted>
        Your device will show its Bluetooth permission prompt after you choose
        Allow Bluetooth.
      </AppText>
      <View style={{ gap: spacing.md }}>
        <ActionButton
          busy={busy}
          disabled={busy}
          icon="bluetooth"
          label="Allow Bluetooth"
          onPress={allow}
        />
        <ActionButton
          disabled={busy}
          label="Not now"
          tone="secondary"
          onPress={dismiss}
        />
        <ActionButton
          disabled={busy}
          label="Back"
          tone="tertiary"
          onPress={back}
        />
      </View>
    </Screen>
  );
}

function Feature({
  icon,
  text,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  text: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        alignItems: 'flex-start',
        flexDirection: 'row',
        gap: spacing.md,
      }}
    >
      <MaterialIcons
        color={colors.brandText}
        importantForAccessibility="no"
        name={icon}
        size={24}
      />
      <AppText style={{ flex: 1 }}>{text}</AppText>
    </View>
  );
}
