import type { MapGeometry } from '../types/geometry';
import type { Navigation } from '../state/navigation';
export const selectedTerritory = (nav: Navigation) => nav.level === 'bairro' ? nav.id_agregacao : nav.level === 'setor' ? nav.cd_setor : null;
export function tooltipPosition(point: { x: number; y: number } | undefined, width: number, height: number, tooltipWidth: number, tooltipHeight: number) {
  if (!point) return { left: 10, top: 10 };
  const x = point.x + 14 + tooltipWidth > width - 10 ? point.x - 14 - tooltipWidth : point.x + 14;
  const y = point.y + 14 + tooltipHeight > height - 10 ? point.y - 14 - tooltipHeight : point.y + 14;
  return { left: Math.max(10, Math.min(x, width - tooltipWidth - 10)), top: Math.max(10, Math.min(y, height - tooltipHeight - 10)) };
}
type FeatureStateMap = { setFeatureState: (target: { source: string; id: string }, state: { hover: boolean }) => void };
/** Índice UI inverso, não um cache de dados. Hover toca só as feições anterior/nova. */
export class PolygonPreview {
  private source = '';
  private byRow = new Map<string, string[]>();
  private current: string | null = null;
  setGeometry(map: FeatureStateMap, geometry?: MapGeometry) {
    this.set(map, null);
    this.byRow.clear();
    this.source = geometry ? `${geometry.field === 'cd_setor' ? 'setores' : geometry.field === 'cd_mun' ? 'municipios' : 'ufs'}-source` : '';
    if (geometry) for (const feature of geometry.collection.features) {
      const code = feature.properties![geometry.field] as string;
      const row = geometry.rowByFeature.get(code);
      if (row) { const codes = this.byRow.get(row); if (codes) codes.push(code); else this.byRow.set(row, [code]); }
    }
  }
  set(map: FeatureStateMap, id: string | null) {
    const next = id !== null && this.byRow.has(id) ? id : null;
    if (next === this.current) return;
    for (const code of this.byRow.get(this.current ?? '') ?? []) map.setFeatureState({ source: this.source, id: code }, { hover: false });
    for (const code of this.byRow.get(next ?? '') ?? []) map.setFeatureState({ source: this.source, id: code }, { hover: true });
    this.current = next;
  }
}
