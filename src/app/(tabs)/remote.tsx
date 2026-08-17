import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function RemoteScreen() {
  return <Screen title="Remote"><EmptyState title="Connect a PC" body="Choose a saved or nearby PC before opening remote controls." /></Screen>;
}
