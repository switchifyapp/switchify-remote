import { render } from '@testing-library/react-native';
import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { MouseSurface } from './MouseSurface';
import { RemoteSession } from './RemoteSession';
import { TypingSurface } from './TypingSurface';
import { WindowSurface } from './WindowSurface';

function profile(supportedCommands: string[]): PointerProfile {
  return { displayId: 'display', scaleFactor: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, maxDelta: 128, recommendedDeltas: { small: 32, medium: 64, large: 128 }, capabilities: { noAckCommands: [], noAckMouseMove: false, supportedCommands, mouseRepeat: { supported: false, enabled: false, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2000 }, pointerSpeed: { supported: true, setSupported: true, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 64, effectiveMoveDelta: 64 }, displayNavigation: { supported: true, displayCount: 2 } } };
}

const manager = { send: jest.fn(async () => true) } as unknown as ConnectionManager;

describe('capability-driven remote surfaces', () => {
  it('disables unsupported mouse controls', async () => {
    const session = new RemoteSession(manager, profile(['mouse.click']));
    const view = await render(<MouseSurface session={session} state={session.snapshot()} />);
    expect(view.getByLabelText('Left click').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Double click').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Move up').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Faster').props.accessibilityState.disabled).toBe(true);
  });

  it('falls back to draft typing when streams are unsupported', async () => {
    const session = new RemoteSession(manager, profile(['keyboard.typeText', 'keyboard.key']));
    const view = await render(<TypingSurface session={session} mode="draft" draft="protected draft" />);
    expect(view.getByLabelText('Type live').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Write a draft').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Send to PC').props.accessibilityState.disabled).toBe(false);
  });

  it('gates modifiers, shortcuts, and window commands independently', async () => {
    const session = new RemoteSession(manager, profile(['keyboard.modifierDown']));
    const view = await render(<WindowSurface session={session} state={session.snapshot()} platform="windows" />);
    expect(view.getByLabelText('Ctrl').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Next app').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('A').props.accessibilityState.disabled).toBe(true);
  });
});
