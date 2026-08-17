import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function DiagnosticsScreen() {
  return <Screen title="Diagnostics" description="Activity stays on this device."><EmptyState title="No activity yet" body="Sanitized connection events will appear here. Typed text and credentials are never recorded." /></Screen>;
}
