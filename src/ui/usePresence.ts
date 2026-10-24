import { useEffect, useState } from 'react';

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keep something mounted for `exitMs` after `show` turns false, so a CSS
 * transition can play it out (React would otherwise remove it at once).
 * With reduced motion it leaves immediately.
 */
export function usePresence(show: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    if (reducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [show, exitMs]);

  return { mounted: show || mounted, leaving: !show && mounted };
}
