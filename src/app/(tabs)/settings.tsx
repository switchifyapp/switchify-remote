import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function SettingsScreen() {
  return <Screen title="Settings"><EmptyState title="Remote preferences" body="Connection and control preferences will appear here." /></Screen>;
}
