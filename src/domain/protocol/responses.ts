import type { JsonObject, JsonValue, PcStatus, PointerProfile, ProtocolResponse, SwitchProfileCatalog } from './types';

function object(value: JsonValue | undefined): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function number(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function string(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseStatus(raw: string): PcStatus | null {
  try {
    const value = JSON.parse(raw) as JsonObject;
    if (value.protocolVersion !== 1) return null;
    const desktopId = string(value.desktopId);
    if (!desktopId) return null;
    const platform = value.platform === 'windows' || value.platform === 'macos' ? value.platform : null;
    return { desktopId, displayName: string(value.displayName)?.trim() || 'Switchify PC', platform };
  } catch {
    return null;
  }
}

export function parseResponse(raw: string): ProtocolResponse {
  try {
    const value = JSON.parse(raw) as JsonObject;
    const id = string(value.id);
    if (value.type === 'error') {
      const error = object(value.error);
      if (!error || typeof error.code !== 'string' || typeof error.message !== 'string') return { kind: 'invalid' };
      return { kind: 'error', ...(id ? { id } : {}), code: error.code, message: error.message };
    }
    if (!id || value.ok !== true || value.error != null) return { kind: 'invalid' };
    if (value.type === 'ack') return { kind: 'ack', id };
    const payload = object(value.payload);
    if (!payload) return { kind: 'invalid' };
    if (value.type === 'pairing.complete') {
      const desktopId = string(payload.desktopId);
      const deviceId = string(payload.deviceId);
      const token = string(payload.token);
      return desktopId && deviceId && token ? { kind: 'pairingComplete', id, desktopId, deviceId, token } : { kind: 'invalid' };
    }
    if (value.type === 'pointer.profile') {
      const profile = parsePointerProfile(payload);
      return profile ? { kind: 'pointerProfile', id, profile } : { kind: 'invalid' };
    }
    if (value.type === 'switch.profile.list') {
      const catalog = parseSwitchProfileCatalog(payload);
      return catalog ? { kind: 'switchProfileCatalog', id, catalog } : { kind: 'invalid' };
    }
    return { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

function parseSwitchProfileCatalog(payload: JsonObject): SwitchProfileCatalog | null {
  const revision = number(payload.catalogRevision);
  if (revision === null || !Number.isInteger(revision) || revision < 0 || !Array.isArray(payload.profiles) || payload.profiles.length > 34) return null;
  const profiles = payload.profiles.map((entry) => {
    const profile = object(entry);
    if (!profile) return null;
    const id = string(profile.id), version = number(profile.version), name = string(profile.name);
    if (!id || !name || !version || !Number.isInteger(version) || (profile.kind !== 'grid3' && profile.kind !== 'mapped') || !Array.isArray(profile.bindings) || profile.bindings.length > 8) return null;
    const bindings = profile.bindings.map((entry) => {
      const binding = object(entry);
      if (!binding) return null;
      const switchId = number(binding.switchId), label = string(binding.label);
      if (!switchId || !Number.isInteger(switchId) || switchId < 1 || switchId > 8 || !label || !['stateful', 'pulse', 'unassigned'].includes(String(binding.behavior))) return null;
      return { switchId, label, behavior: binding.behavior as 'stateful' | 'pulse' | 'unassigned' };
    });
    if (bindings.some((binding) => binding === null)) return null;
    return { id, version, name, kind: profile.kind as 'grid3' | 'mapped', bindings: bindings as NonNullable<(typeof bindings)[number]>[] };
  });
  return profiles.some((profile) => profile === null) ? null : { catalogRevision: revision, profiles: profiles as NonNullable<(typeof profiles)[number]>[] };
}

function parsePointerProfile(payload: JsonObject): PointerProfile | null {
  const bounds = object(payload.bounds);
  const deltas = object(payload.recommendedDeltas);
  const capabilities = object(payload.capabilities) ?? {};
  const repeat = object(capabilities.mouseRepeat) ?? {};
  const speed = object(capabilities.pointerSpeed) ?? {};
  const displays = object(capabilities.displayNavigation) ?? {};
  const displayId = string(payload.displayId);
  const scaleFactor = number(payload.scaleFactor);
  const maxDelta = number(payload.maxDelta);
  if (!displayId || scaleFactor === null || maxDelta === null || !bounds || !deltas) return null;
  const bx = number(bounds.x), by = number(bounds.y), bw = number(bounds.width), bh = number(bounds.height);
  const small = number(deltas.small), medium = number(deltas.medium), large = number(deltas.large);
  if ([bx, by, bw, bh, small, medium, large].some((entry) => entry === null)) return null;
  const strings = (value: JsonValue | undefined) => Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
  const numeric = (value: JsonValue | undefined, fallback: number) => number(value) ?? fallback;
  const bool = (value: JsonValue | undefined) => value === true;
  return {
    displayId, scaleFactor, maxDelta,
    bounds: { x: bx!, y: by!, width: bw!, height: bh! },
    recommendedDeltas: { small: small!, medium: medium!, large: large! },
    capabilities: {
      noAckMouseMove: bool(capabilities.noAckMouseMove),
      noAckCommands: strings(capabilities.noAckCommands),
      supportedCommands: strings(capabilities.supportedCommands),
      mouseRepeat: { supported: bool(repeat.supported), enabled: bool(repeat.enabled), intervalMs: numeric(repeat.intervalMs, 250), minIntervalMs: numeric(repeat.minIntervalMs, 100), maxIntervalMs: numeric(repeat.maxIntervalMs, 2000) },
      pointerSpeed: { supported: bool(speed.supported), setSupported: bool(speed.setSupported), scalePercent: numeric(speed.scalePercent, 100), minScalePercent: numeric(speed.minScalePercent, 5), maxScalePercent: numeric(speed.maxScalePercent, 225), stepPercent: numeric(speed.stepPercent, 5), baseMoveDelta: numeric(speed.baseMoveDelta, 128), effectiveMoveDelta: numeric(speed.effectiveMoveDelta, 128) },
      displayNavigation: { supported: bool(displays.supported), displayCount: numeric(displays.displayCount, 1) },
    },
  };
}
