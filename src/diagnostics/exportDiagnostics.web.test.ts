/** @jest-environment jsdom */
import { exportDiagnostics } from './exportDiagnostics.web';

const nodeText = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:util') as { TextEncoder: typeof TextEncoder; TextDecoder: typeof TextDecoder };
Object.assign(globalThis, { TextEncoder: nodeText.TextEncoder, TextDecoder: nodeText.TextDecoder });

describe('web diagnostics export', () => {
  it('downloads the sanitized log as a text file and releases the object URL', async () => {
    jest.useFakeTimers();
    try {
      const created: Blob[] = [];
      Object.assign(URL, {
        createObjectURL: jest.fn((blob: Blob) => { created.push(blob); return 'blob:diagnostics'; }),
        revokeObjectURL: jest.fn(),
      });
      let downloaded = '';
      const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
      await exportDiagnostics('connected: Connected to a PC.');
      expect(click).toHaveBeenCalledTimes(1);
      expect(downloaded).toBe('switchify-remote-diagnostics.txt');
      expect(created[0]?.type).toBe('text/plain');
      expect(document.querySelector('a')).toBeNull();
      jest.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:diagnostics');
    } finally {
      jest.useRealTimers();
    }
  });
});
