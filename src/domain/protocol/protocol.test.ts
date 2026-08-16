import { authProof, stableStringify } from './canonical';
import { authenticatedCommand } from './commands';
import { createFrames, createFramesForWriteLimit, decodeFrame, encodeFrame, encodedFrameBytes, FrameReassembler, validateFrame } from './framing';
import { parseResponse, parseStatus } from './responses';

describe('Switchify PC protocol v1', () => {
  it('matches the Android canonical authentication fixture', () => {
    expect(stableStringify({ z: 1, a: true })).toBe('{"a":true,"z":1}');
    expect(authProof({ id: 'req-1', deviceId: 'device-1', timestamp: 1000, type: 'connection.ping', payload: {}, token: 'shared-token' })).toBe('98bZHKWHa3ooOYZyXBuYpzOdbPWGW5FV04fEjxAl9sI');
  });

  it('does not serialize the pairing token into authenticated commands', () => {
    const raw = authenticatedCommand({ id: 'profile-1', deviceId: 'device-1', token: 'shared-token', timestamp: 1000, type: 'pointer.profile' });
    expect(JSON.parse(raw)).toMatchObject({ version: 1, id: 'profile-1', deviceId: 'device-1', type: 'pointer.profile', auth: 'lgHsjgfWbqbrE-ugPTIDzjxm5MjEdNRpbHQV9B4ZNPM' });
    expect(raw).not.toContain('shared-token');
  });

  it('round trips single and multi-frame UTF-8 messages', () => {
    const frames = createFrames('Switchify 👋 remote', 'message-1', 5);
    const reassembler = new FrameReassembler();
    for (const frame of frames.slice(0, -1)) expect(reassembler.accept(frame)).toEqual({ kind: 'incomplete' });
    expect(reassembler.accept(frames.at(-1)!)).toEqual({ kind: 'complete', message: 'Switchify 👋 remote' });
    expect(decodeFrame(encodeFrame(frames[0]!))).toEqual(frames[0]);
  });

  it('rejects malformed and oversized frames and expires partial messages', () => {
    const frame = createFrames('abc', 'message-1')[0]!;
    expect(validateFrame({ ...frame, version: 2 })).toBe('invalid_frame');
    expect(validateFrame({ ...frame, totalBytes: 4 }, 3)).toBe('message_too_large');
    let now = 1000;
    const reassembler = new FrameReassembler(() => now, 100);
    expect(reassembler.accept({ ...frame, isFinal: false })).toEqual({ kind: 'incomplete' });
    now = 1101;
    expect(reassembler.clearExpired()).toBe(1);
  });

  it('adapts every encoded frame to the negotiated BLE write limit', () => {
    const frames = createFramesForWriteLimit('🙂'.repeat(300), 'message-with-a-long-identifier', 182);
    expect(frames.length).toBeGreaterThan(1);
    expect(Math.max(...frames.map(encodedFrameBytes))).toBeLessThanOrEqual(182);
    const reassembler = new FrameReassembler();
    let result = reassembler.accept(frames[0]!);
    for (const frame of frames.slice(1)) result = reassembler.accept(frame);
    expect(result).toEqual({ kind: 'complete', message: '🙂'.repeat(300) });
    expect(() => createFramesForWriteLimit('a', 'message', 20)).toThrow('too small');
  });

  it('ignores duplicate fragments and completes after out-of-order delivery', () => {
    const frames = createFrames('fragmented message', 'duplicate-test', 4);
    const reassembler = new FrameReassembler();
    expect(reassembler.accept(frames[0]!)).toEqual({ kind: 'incomplete' });
    expect(reassembler.accept(frames[0]!)).toEqual({ kind: 'incomplete' });
    expect(reassembler.accept(frames.at(-1)!)).toEqual({ kind: 'incomplete' });
    let result = reassembler.accept(frames[1]!);
    for (const frame of frames.slice(2, -1)) result = reassembler.accept(frame);
    expect(result).toEqual({ kind: 'complete', message: 'fragmented message' });
  });

  it('parses status, acknowledgements, pairing, and sanitized errors', () => {
    expect(parseStatus('{"protocolVersion":1,"desktopId":"pc-1","displayName":"Desk","platform":"windows"}')).toEqual({ desktopId: 'pc-1', displayName: 'Desk', platform: 'windows' });
    expect(parseResponse('{"type":"ack","id":"a","ok":true,"error":null}')).toEqual({ kind: 'ack', id: 'a' });
    expect(parseResponse('{"type":"pairing.complete","id":"p","ok":true,"error":null,"payload":{"desktopId":"pc-1","deviceId":"phone-1","token":"secret"}}')).toEqual({ kind: 'pairingComplete', id: 'p', desktopId: 'pc-1', deviceId: 'phone-1', token: 'secret' });
    expect(parseResponse('{"type":"error","error":{"code":"auth_failed","message":"invalid_signature"}}')).toEqual({ kind: 'error', code: 'auth_failed', message: 'invalid_signature' });
    expect(parseResponse('not json')).toEqual({ kind: 'invalid' });
  });
});
