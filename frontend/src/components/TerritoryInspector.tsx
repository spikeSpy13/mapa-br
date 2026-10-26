import type { MapRow } from './MapViewport';
import type { TerritoryPreview } from './useTerritoryPreview';
import type { MetricaAtiva } from '../store/useGeoStore';
import { METRICAS_CATALOGO } from '../lib/geoStats';
export function TerritoryInspector({ rows, preview, selected, metric }: { rows: MapRow[]; preview: TerritoryPreview; selected: string | null; metric: MetricaAtiva }) {
  const row = rows.find(r => r.id === (preview?.id ?? selected));
  const temporary = !!row && row.id !== selected;
  return <div className={`territory-inspector${row ? ' is-active' : ''}`} data-testid="territory-inspector" aria-live="off">
    {row ? <><div className="inspector-head"><span className="eyebrow">{temporary ? '◎ PRÉVIA TEMPORÁRIA · ESC PARA LIMPAR' : '● TERRITÓRIO SELECIONADO'}</span><code>{row.id}</code></div>
      <div className="inspector-body"><strong>{row.name}</strong><span>{METRICAS_CATALOGO[metric].label}: {row.value}</span></div>
      {row.sigilo && <span className="inspector-placeholder">Contém sigilo; ausência não é zero.</span>}</> :
      <span className="inspector-placeholder">Passe o cursor ou use Tab na lista para destacar no mapa. Clique, Enter ou toque abre o território.</span>}
  </div>;
}
