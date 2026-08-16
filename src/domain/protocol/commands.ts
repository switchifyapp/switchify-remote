import { authProof } from './canonical';
import { PROTOCOL_VERSION } from './constants';
import type { JsonObject, ResponseMode } from './types';

export type AuthenticatedCommandInput = {
  id: string;
  deviceId: string;
  token: string;
  timestamp: number;
  type: string;
  payload?: JsonObject;
  responseMode?: ResponseMode;
};

export function pairingRequest(input: { id: string; deviceId: string; deviceName: string; desktopId: string; requestNonce: string }): string {
  return JSON.stringify({
    version: PROTOCOL_VERSION,
    id: input.id,
    type: 'pairing.request',
    payload: { deviceId: input.deviceId, deviceName: input.deviceName, desktopId: input.desktopId, requestNonce: input.requestNonce },
  });
}

export function authenticatedCommand(input: AuthenticatedCommandInput): string {
  const payload = input.payload ?? {};
  const responseMode = input.responseMode ?? 'ack';
  const command: Record<string, unknown> = {
    version: PROTOCOL_VERSION,
    id: input.id,
    deviceId: input.deviceId,
    timestamp: input.timestamp,
    type: input.type,
    payload,
  };
  if (responseMode !== 'ack') command.responseMode = responseMode;
  command.auth = authProof({ ...input, payload, responseMode });
  return JSON.stringify(command);
}

export const commandPayloads = {
  ping: () => ['connection.ping', {}] as const,
  pointerProfile: () => ['pointer.profile', {}] as const,
  pointerSpeed: (scalePercent: number) => ['pointer.speed.set', { scalePercent }] as const,
  displayMove: (direction: 'up' | 'down' | 'left' | 'right') => ['pointer.display.move', { direction }] as const,
  move: (dx: number, dy: number) => ['mouse.move', { dx, dy }] as const,
  scroll: (dx: number, dy: number) => ['mouse.scroll', { dx, dy }] as const,
  repeatStart: (command: { type: 'mouse.move' | 'mouse.scroll'; dx: number; dy: number }) => ['mouse.repeat.start', { command }] as const,
  repeatStop: () => ['mouse.repeat.stop', {}] as const,
  dragStart: (button = 'left') => ['mouse.dragStart', { button }] as const,
  dragEnd: (button = 'left') => ['mouse.dragEnd', { button }] as const,
  click: (button = 'left') => ['mouse.click', { button }] as const,
  doubleClick: (button = 'left') => ['mouse.doubleClick', { button }] as const,
  rightClick: () => ['mouse.rightClick', {}] as const,
  typeText: (text: string) => ['keyboard.typeText', { text }] as const,
  streamOpen: (streamId: string) => ['keyboard.textStream.open', { streamId }] as const,
  streamChunk: (streamId: string, seq: number, text: string) => ['keyboard.textStream.chunk', { streamId, seq, text }] as const,
  streamKey: (streamId: string, seq: number, key: string) => ['keyboard.textStream.key', { streamId, seq, key }] as const,
  streamClose: (streamId: string, expectedCount: number) => ['keyboard.textStream.close', { streamId, expectedCount }] as const,
  key: (key: string) => ['keyboard.key', { key }] as const,
  shortcut: (keys: string[]) => ['keyboard.shortcut', { keys }] as const,
  modifierDown: (key: string) => ['keyboard.modifierDown', { key }] as const,
  modifierUp: (key: string) => ['keyboard.modifierUp', { key }] as const,
  windowControl: (action: string) => ['window.control', { action }] as const,
};
