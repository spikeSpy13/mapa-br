import { describe, it, expect, vi } from 'vitest';
import { PolygonPreview, selectedTerritory, tooltipPosition } from './mapInteraction';
import type { MapGeometry } from '../types/geometry';
const geometry = (field: string, pairs: [string, string][]): MapGeometry => ({ field, rowByFeature: new Map(pairs), collection: {
  type: 'FeatureCollection', features: pairs.map(([code]) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { [field]: code } })),
} });
describe('prévia MapLibre separada da seleção', () => {
  it('atualiza somente grupos anterior/novo, preserva seleção e limpa a fonte anterior', () => {
    const map = { setFeatureState: vi.fn() }, paint = new PolygonPreview();
    paint.setGeometry(map, geometry('cd_setor', [['001A', 'grupo:a'], ['001B', 'grupo:a'], ['002', 'grupo:b']]));
    paint.set(map, 'grupo:a');
    expect(map.setFeatureState.mock.calls).toEqual([[{ source: 'setores-source', id: '001A' }, { hover: true }], [{ source: 'setores-source', id: '001B' }, { hover: true }]]);
    paint.set(map, 'grupo:a'); expect(map.setFeatureState).toHaveBeenCalledTimes(2);
    paint.set(map, 'grupo:b'); expect(map.setFeatureState).toHaveBeenCalledTimes(5);
    paint.setGeometry(map, geometry('cd_uf', [['42', '42']]));
    expect(map.setFeatureState).toHaveBeenLastCalledWith({ source: 'setores-source', id: '002' }, { hover: false });
    paint.set(map, 'grupo:a'); expect(map.setFeatureState).toHaveBeenCalledTimes(6);
    paint.set(map, '42'); expect(map.setFeatureState).toHaveBeenLastCalledWith({ source: 'ufs-source', id: '42' }, { hover: true });
    expect(selectedTerritory({ level: 'setor', cd_uf: '42', cd_mun: '4205407', cd_setor: '420540705000001' })).toBe('420540705000001');
    expect(map.setFeatureState.mock.calls.every(([, state]) => Object.keys(state).join() === 'hover')).toBe(true);
  });
  it('mede e limita tooltips nos cantos e em telas estreitas, sem deslocar o mapa', () => {
    expect(tooltipPosition({ x: 385, y: 295 }, 390, 300, 248, 170)).toEqual({ left: 123, top: 111 });
    expect(tooltipPosition({ x: 0, y: 0 }, 250, 300, 230, 100)).toEqual({ left: 10, top: 14 });
    expect(tooltipPosition(undefined, 390, 300, 248, 100)).toEqual({ left: 10, top: 10 });
  });
});
