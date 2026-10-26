import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, FocusEvent, KeyboardEvent } from 'react';
export type TerritoryPreview = { id: string; origin: 'map' | 'list' } | null;
/** Prévia efêmera e local à interface; nunca escreve navegação/URL ou cache de dados. */
export function useTerritoryPreview(scope: string) {
  const [state, setState] = useState<{ scope: string; preview: TerritoryPreview }>({ scope, preview: null });
  const preview = state.scope === scope ? state.preview : null;
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setState(previous => previous.scope === scope ? previous : { scope, preview: null }), [scope]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || preview?.origin !== 'map') return;
    const row = list.querySelector<HTMLElement>(`[data-territory-id="${CSS.escape(preview.id)}"]`);
    if (!row) return;
    const box = list.getBoundingClientRect(), target = row.getBoundingClientRect();
    if (target.top < box.top || target.bottom > box.bottom) list.scrollTop += target.top - box.top - list.clientHeight / 3;
  }, [preview?.id, preview?.origin]);
  const clear = useCallback(() => setState({ scope, preview: null }), [scope]);
  const fromMap = useCallback((id: string | null) => setState(previous => {
    const next = id === null ? null : { id, origin: 'map' as const };
    return previous.scope === scope && previous.preview?.id === next?.id && previous.preview?.origin === next?.origin ? previous : { scope, preview: next };
  }), [scope]);
  const fromList = (id: string) => setState({ scope, preview: { id, origin: 'list' } });
  const leaveList = (id: string) => setState(previous => previous.scope === scope && previous.preview?.origin === 'list' && previous.preview.id === id ? { scope, preview: null } : previous);
  const handlers = (id: string) => ({
    onPointerEnter: (e: PointerEvent<HTMLElement>) => { if (e.pointerType !== 'touch') fromList(id); },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => { if (e.currentTarget !== document.activeElement) leaveList(id); },
    onFocus: () => fromList(id),
    onBlur: (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.matches(':hover')) leaveList(id); },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Escape') { e.stopPropagation(); clear(); } },
  });
  return { preview, fromMap, clear, handlers, listRef };
}
