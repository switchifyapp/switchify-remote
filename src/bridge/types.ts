export type ExternalSwitchInfo = { keyCode: number; name: string };

export type BridgeSnapshot = {
  version: number;
  captureAvailable: boolean;
  externalSwitches: ExternalSwitchInfo[];
};

export type BridgeEvent =
  | ({ type: 'snapshot' } & BridgeSnapshot)
  | { type: 'repeatStop'; generation: number }
  | { type: 'switchEdge'; generation: number; sequence: number; keyCode: number; down: boolean; downTimeMs: number; eventTimeMs: number; cancelled: boolean };

export interface SwitchifyBridge {
  snapshot(): BridgeSnapshot;
  subscribe(listener: (event: BridgeEvent) => void): () => void;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  nextGeneration(): number;
  setRepeatActive(generation: number, active: boolean): Promise<boolean>;
  setForwardingActive(generation: number, active: boolean): Promise<boolean>;
}
