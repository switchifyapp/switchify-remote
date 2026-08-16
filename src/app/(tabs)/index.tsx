import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function PcsScreen() {
  return <Screen title="PCs" description="Connect securely to Switchify PC over Bluetooth."><EmptyState title="No saved PCs" body="Nearby computers will appear here when discovery is available." /></Screen>;
}
