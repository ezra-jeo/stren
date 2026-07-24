"use client";

import { useEffect, useRef } from 'react';

type Options = { enabled: boolean; onUid: (uid: string) => void; idleMs?: number };

/** Reader-safe local capture. It exists only in RFID mode and never steals form typing. */
export function useRfidKeyboardInput({ enabled, onUid, idleMs = 80 }: Options) {
  const buffer = useRef('');
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      const next = buffer.current;
      buffer.current = '';
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      if (next) onUid(next);
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input:not([data-rfid-capture]), textarea, [contenteditable="true"]')) return;
      if (event.key === 'Enter') { flush(); return; }
      if (event.key.length !== 1 || !/[0-9a-fA-F:\-\s]/.test(event.key)) return;
      buffer.current = `${buffer.current}${event.key}`.slice(0, 64);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, idleMs);
    };
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); if (timer.current !== null) window.clearTimeout(timer.current); buffer.current = ''; };
  }, [enabled, idleMs, onUid]);
}
