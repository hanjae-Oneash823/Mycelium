import { useEffect, useState } from 'react';
import { FONT_CHANGE_EVENT, getFontStackRaw } from './fontSettings';

/** Live `font-family` stack string, for Canvas 2D `ctx.font` and other contexts that can't read CSS custom properties. Re-renders when the app font setting changes. */
export function useFontStack(): string {
  const [stack, setStack] = useState(getFontStackRaw);

  useEffect(() => {
    const handler = () => setStack(getFontStackRaw());
    window.addEventListener(FONT_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FONT_CHANGE_EVENT, handler);
  }, []);

  return stack;
}
