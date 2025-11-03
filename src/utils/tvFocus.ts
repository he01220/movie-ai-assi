type Dir = 'up' | 'down' | 'left' | 'right';

const FOCUS_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
].join(',');

const isVisible = (el: Element) => {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

const getFocusable = (): HTMLElement[] => {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUS_SELECTOR)).filter(isVisible);
};

const center = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const inDirection = (from: HTMLElement, to: HTMLElement, dir: Dir) => {
  const a = center(from);
  const b = center(to);
  if (dir === 'up') return b.y < a.y - 4; // small gap to avoid same-row ties
  if (dir === 'down') return b.y > a.y + 4;
  if (dir === 'left') return b.x < a.x - 4;
  if (dir === 'right') return b.x > a.x + 4;
  return false;
};

const distance = (from: HTMLElement, to: HTMLElement, dir: Dir) => {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // favor alignment in direction using projection weight
  if (dir === 'left' || dir === 'right') {
    return Math.hypot(dx, dy) + Math.abs(dy) * 0.25;
  } else {
    return Math.hypot(dx, dy) + Math.abs(dx) * 0.25;
  }
};

const findNext = (current: HTMLElement, dir: Dir): HTMLElement | null => {
  const candidates = getFocusable().filter((el) => el !== current && inDirection(current, el, dir));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => distance(current, a, dir) - distance(current, b, dir));
  return candidates[0] || null;
};

export const enableTVFocus = () => {
  const onKey = (e: KeyboardEvent) => {
    const key = e.key;
    const dir: Dir | null = key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : null;
    if (!dir) return;
    const active = (document.activeElement as HTMLElement) || document.body;
    const from = active && isVisible(active) ? active : getFocusable()[0];
    if (!from) return;
    const next = findNext(from, dir);
    if (next) {
      e.preventDefault();
      next.focus({ preventScroll: false });
      try { (next as any).scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch {}
    }
  };

  window.addEventListener('keydown', onKey);

  // ensure something is focused initially for TV remotes
  const init = () => {
    if (!document.activeElement || document.activeElement === document.body) {
      const first = getFocusable()[0];
      if (first) first.focus({ preventScroll: true });
    }
  };
  const onLoad = () => setTimeout(init, 0);
  window.addEventListener('load', onLoad);
  setTimeout(init, 50);

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('load', onLoad);
  };
};
