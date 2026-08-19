import { useRouter } from 'expo-router';

import { ListRow } from './ListRow';

export function DiagnosticsLink() {
  const router = useRouter();
  return <ListRow icon="troubleshoot" title="Diagnostics" description="Sanitized connection activity stored on this device." onPress={() => router.push('/diagnostics')} />;
}
