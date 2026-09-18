import { useEffect } from 'react';
import type { RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

const XTERM_THEME = {
  background: '#080808',
  foreground: 'rgba(255,255,255,0.85)',
  cursor: '#f59e0b',
};

export function useXtermSession(terminalId: string | null, containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!terminalId || !container) return;

    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: "var(--font-main), var(--font-kr), monospace",
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    const dataDisposable = term.onData((data) => {
      invoke('write_terminal', { id: terminalId, data }).catch(() => {});
    });
    const resizeDisposable = term.onResize(({ rows, cols }) => {
      invoke('resize_terminal', { id: terminalId, rows, cols }).catch(() => {});
    });

    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(container);

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      const snapshot = await invoke<string>('terminal_snapshot', { id: terminalId }).catch(() => '');
      if (cancelled) return;
      if (snapshot) term.write(snapshot);
      unlisten = await listen<string>(`terminal:${terminalId}:data`, (event) => {
        term.write(event.payload);
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [terminalId, containerRef]);
}
