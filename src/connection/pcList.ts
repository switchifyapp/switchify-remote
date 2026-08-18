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
