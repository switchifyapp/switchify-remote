export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ResponseMode = 'ack' | 'none';
export type PcPlatform = 'windows' | 'macos' | null;

export type PointerProfile = {
  displayId: string;
  scaleFactor: number;
  bounds: { x: number; y: number; width: number; height: number };
  maxDelta: number;
  recommendedDeltas: { small: number; medium: number; large: number };
  capabilities: {
    noAckMouseMove: boolean;
    noAckCommands: string[];
    supportedCommands: string[];
    mouseRepeat: { supported: boolean; enabled: boolean; intervalMs: number; minIntervalMs: number; maxIntervalMs: number };
    pointerSpeed: { supported: boolean; setSupported: boolean; scalePercent: number; minScalePercent: number; maxScalePercent: number; stepPercent: number; baseMoveDelta: number; effectiveMoveDelta: number };
    displayNavigation: { supported: boolean; displayCount: number };
  };
};

export type SwitchBinding = { switchId: number; label: string; behavior: 'stateful' | 'pulse' | 'unassigned' };
export type SwitchProfile = { id: string; version: number; name: string; kind: 'grid3' | 'mapped'; bindings: SwitchBinding[] };
export type SwitchProfileCatalog = { catalogRevision: number; profiles: SwitchProfile[] };

export type ProtocolResponse =
  | { kind: 'ack'; id: string }
  | { kind: 'pairingComplete'; id: string; desktopId: string; deviceId: string; token: string }
  | { kind: 'pointerProfile'; id: string; profile: PointerProfile }
  | { kind: 'switchProfileCatalog'; id: string; catalog: SwitchProfileCatalog }
  | { kind: 'error'; id?: string; code: string; message: string }
  | { kind: 'invalid' };

export type PcStatus = { desktopId: string; displayName: string; platform: PcPlatform };
