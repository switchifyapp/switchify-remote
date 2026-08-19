import { Platform } from 'react-native';
import { SelectorField } from '@/components/SelectorField';
import { preferencesStore, type RemoteSurface } from '@/storage/PreferencesStore';

export function SurfaceSelector({ selected }: { selected: RemoteSurface }) {
  const surfaces: RemoteSurface[] = Platform.OS === 'android' ? ['mouse', 'typing', 'window', 'forwarding'] : ['mouse', 'typing', 'window'];
  return <SelectorField label="Surface" modalTitle="Remote surface" hint="Opens the list of remote surfaces." options={surfaces.map((surface) => ({ key: surface, label: surface[0]!.toUpperCase() + surface.slice(1) }))} selectedKey={selected} onSelect={(surface) => void preferencesStore.update({ surface })} />;
}
