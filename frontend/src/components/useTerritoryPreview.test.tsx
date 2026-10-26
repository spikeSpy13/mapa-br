import { renderHook, act } from '@testing-library/react';
import { it, expect } from 'vitest';
import { useTerritoryPreview } from './useTerritoryPreview';
it('não reaproveita prévia em outra rota e não deixa blur antigo limpar uma nova prévia do mapa', () => {
  const { result, rerender } = renderHook(({ scope }) => useTerritoryPreview(scope), { initialProps: { scope: 'uf:42' } });
  act(() => result.current.handlers('4205407').onFocus());
  expect(result.current.preview).toEqual({ id: '4205407', origin: 'list' });
  act(() => result.current.fromMap('4209102'));
  act(() => result.current.handlers('4205407').onBlur({ currentTarget: { matches: () => false } } as never));
  expect(result.current.preview?.id).toBe('4209102');
  rerender({ scope: 'uf:35' }); expect(result.current.preview).toBeNull();
  rerender({ scope: 'uf:42' }); expect(result.current.preview).toBeNull();
  rerender({ scope: 'uf:35' });
  act(() => result.current.handlers('3550308').onFocus());
  act(() => result.current.clear()); expect(result.current.preview).toBeNull();
});
