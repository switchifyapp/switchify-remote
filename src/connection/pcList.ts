import type { SavedPc } from '@/storage/PairingStore';
import type { DiscoveredDesktop } from '@/transport/BleTransport';

export type PcListItem = DiscoveredDesktop & {
  saved: SavedPc | null;
  nearby: boolean;
};

export function mergePcList(saved: SavedPc[], discovered: DiscoveredDesktop[]): PcListItem[] {
  const rows = new Map<string, PcListItem>();
  for (const pc of saved) rows.set(pc.desktopId, { ...pc, rssi: null, saved: pc, nearby: false });
  for (const pc of discovered) {
    const pairing = rows.get(pc.desktopId)?.saved ?? null;
    rows.set(pc.desktopId, { ...pc, saved: pairing, nearby: true });
  }
  return [...rows.values()];
}

export function pcListAction(pc: PcListItem): 'Connect' | 'Request access' {
  return pc.saved ? 'Connect' : 'Request access';
}

export type DiscoveryButton = { label: string; busy: boolean; disabled: boolean };

/** A browser picker returns one PC and then stops, so the web offers to choose another instead of waiting. */
export function discoveryButton(scanning: boolean, discoveredCount: number, platform: string): DiscoveryButton {
  if (!scanning) return { label: 'Find nearby PCs', busy: false, disabled: false };
  if (platform === 'web' && discoveredCount > 0) return { label: 'Choose another PC', busy: false, disabled: false };
  return { label: 'Searching…', busy: true, disabled: true };
}
