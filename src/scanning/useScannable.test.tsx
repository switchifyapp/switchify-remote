import { ScanController } from '@switchify/scanning';
import { ScanProvider } from '@switchify/scanning/native';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ControlButton } from '@/components/ControlButton';
import { ScanningEnabledContext, ScanVisibleContext } from './ScanningContext';

function Scanned({ controller, enabled = true, visible = true, children }: { controller: ScanController; enabled?: boolean; visible?: boolean; children: ReactNode }) {
  return <ScanProvider controller={controller}><ScanningEnabledContext.Provider value={enabled}><ScanVisibleContext.Provider value={visible}>{children}</ScanVisibleContext.Provider></ScanningEnabledContext.Provider></ScanProvider>;
}

const controllers: ScanController[] = [];
const controllerFor = () => { const controller = new ScanController({ options: { automatic: false } }); controllers.push(controller); return controller; };

afterEach(() => { controllers.splice(0).forEach((controller) => controller.destroy()); });

describe('scannable controls', () => {
  it('are highlighted and pressed by a switch, like a tap', async () => {
    const controller = controllerFor();
    const pressA = jest.fn();
    const pressB = jest.fn();
    await render(<Scanned controller={controller}><ControlButton label="A" onPress={pressA} /><ControlButton label="B" onPress={pressB} /></Scanned>);
    await act(async () => { controller.flush(); controller.start(); });
    expect(screen.getAllByTestId('scan-highlight', { includeHiddenElements: true })).toHaveLength(1);
    await act(async () => { controller.dispatch('next'); controller.dispatch('select'); });
    expect(pressA.mock.calls.length + pressB.mock.calls.length).toBe(1);
  });

  it('take no part while scanning is off, hidden, or disabled', async () => {
    for (const props of [{ enabled: false }, { visible: false }]) {
      const controller = controllerFor();
      const press = jest.fn();
      const view = await render(<Scanned controller={controller} {...props}><ControlButton label="A" onPress={press} /></Scanned>);
      await act(async () => { controller.flush(); controller.start(); controller.dispatch('select'); });
      expect(screen.queryByTestId('scan-highlight', { includeHiddenElements: true })).toBeNull();
      expect(press).not.toHaveBeenCalled();
      await view.unmount();
    }
    const controller = controllerFor();
    const press = jest.fn();
    await render(<Scanned controller={controller}><ControlButton label="A" disabled onPress={press} /></Scanned>);
    await act(async () => { controller.flush(); controller.start(); controller.dispatch('select'); });
    expect(press).not.toHaveBeenCalled();
  });
});
