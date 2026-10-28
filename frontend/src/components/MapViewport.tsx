import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as GLMap, type GeoJSONSource, type MapMouseEvent, type MapTouchEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Navigation } from '../state/navigation';
import { navigationSearch } from '../state/navigation';
import type { DataLoader, LoadedData } from '../services/dataLoader';
import { pontosTse } from '../services/tseLoader';
import type { MunicipioTse } from '../types/tseContract';
import { loadDemoGeometry } from '../services/demoGeometry';
import type { MapGeometry } from '../types/geometry';
import { metadadosMetrica, calcularBoundingBox, COLOR_SIGILO_OU_AUSENTE, COLOR_DESTAQUE_SELECIONADO, formatarValorIndicador } from '../lib/geoStats';
import type { MetricaAtiva } from '../store/useGeoStore';
import type { TerritoryPreview } from './useTerritoryPreview';
import { PolygonPreview, selectedTerritory, tooltipPosition } from './mapInteraction';

export interface MapRow { id: string; name: string; nav: Navigation; fill: string; sigilo: boolean; coverage: number | null; value: string }
interface Props {
  official?: boolean; officialGeometry?: MapGeometry; tse?: MunicipioTse | null;
  loader: DataLoader; data?: LoadedData; nav: Navigation; rows: MapRow[];
  metric: MetricaAtiva; select: (nav: Navigation) => void;
  metricContext?: string; parentNavigation?: Navigation; preview?: TerritoryPreview; onMapPreview?: (id: string | null) => void;
}
interface PointerPreview { id: string; code: string; point: { x: number; y: number }; tse?: { name: string; text: string } }
const kinds = ['ufs', 'municipios', 'distritos', 'setores'] as const;
const fields = { ufs: 'cd_uf', municipios: 'cd_mun', distritos: 'cd_distrito', setores: 'cd_setor' };
function kindFor(geo: MapGeometry) { return geo.field === 'cd_distrito' ? 'distritos' : geo.field === 'cd_setor' ? 'setores' : geo.field === 'cd_mun' ? 'municipios' : 'ufs'; }
const levelLabel = (row: MapRow) => ({ pais: 'País', regiao: 'Região', uf: 'UF', municipio: 'Município', bairro: 'Agrupamento', distrito: 'Distrito', setor: 'Setor censitário' })[row.nav.level];

export function MapViewport({ loader, data, nav, rows, metric, select, tse, official = false, officialGeometry, preview = null, onMapPreview, parentNavigation, metricContext }: Props) {
  const container = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null), active = useRef<MapGeometry | undefined>(undefined);
  const hoverPaint = useRef(new PolygonPreview()), frame = useRef<number | null>(null), dismissed = useRef<string | null>(null);
  const pointerRef = useRef<PointerPreview | null>(null);
  const [pointer, setPointer] = useState<PointerPreview | null>(null);
  const [geometry, setGeometry] = useState<MapGeometry>();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [mapReady, setMapReady] = useState(false), [sourceReady, setSourceReady] = useState(false);
  const [error, setError] = useState('');
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  const latest = useRef({ byId, select, nav, metric, official, onMapPreview, parentNavigation });
  latest.current = { byId, select, nav, metric, official, onMapPreview, parentNavigation };
  const selected = selectedTerritory(nav), scope = navigationSearch(nav);
  const key = nav.level === 'municipio' || nav.level === 'bairro' || nav.level === 'distrito' || nav.level === 'setor' ? `municipio:${nav.cd_mun}` : scope;

  function clearPreview(notify = true) {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    pointerRef.current = null; setPointer(null);
    if (map.current) { hoverPaint.current.set(map.current, null); map.current.getCanvas().style.cursor = ''; }
    if (notify) latest.current.onMapPreview?.(null);
  }
  useEffect(() => { clearPreview(); dismissed.current = null; }, [scope, metric, tse]);
  useEffect(() => {
    const controller = new AbortController();
    setGeometry(undefined); setSourceReady(false); setError('');
    if (official) setGeometry(officialGeometry);
    else if (data) void loadDemoGeometry(loader, data, nav, controller.signal).then(value => {
      if (!controller.signal.aborted) setGeometry(value);
    }, e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Falha na geometria.'); });
    return () => controller.abort();
  }, [loader, data?.index, data?.uf, data?.municipio, key, official, officialGeometry]);

  function update(instance: GLMap, geo: MapGeometry) {
    const source = `${kindFor(geo)}-source`, currentSelected = selectedTerritory(latest.current.nav);
    if (!instance.getSource(source)) return;
    for (const f of geo.collection.features) {
      const code = f.properties![geo.field] as string, group = geo.rowByFeature.get(code)!;
      const row = latest.current.byId.get(group);
      const isSelected = geo.selectedFeatureIds ? geo.selectedFeatureIds.has(code) : currentSelected === group;
      instance.setFeatureState({ source, id: code }, { fill: row?.fill ?? COLOR_SIGILO_OU_AUSENTE,
        sigilo: row?.sigilo ?? false, coverage: row?.coverage ?? null, selected: isSelected,
        dimmed: currentSelected !== null && !isSelected });
    }
  }
  useEffect(() => {
    if (!container.current) return;
    let instance: GLMap;
    try {
      instance = new maplibregl.Map({ container: container.current, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0b151e' } }] },
        center: [-52, -15], zoom: 2, renderWorldCopies: false, maxZoom: official ? 18 : 15 });
    } catch { setError('WebGL indisponível. Use a navegação por botões abaixo.'); return; }
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    instance.on('error', () => setError('Falha ao renderizar o mapa. A navegação por botões continua disponível.'));
    instance.on('load', () => {
      for (const kind of kinds) {
        const source = `${kind}-source`;
        instance.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: fields[kind] });
        instance.addLayer({ id: `${kind}-fill`, type: 'fill', source, layout: { visibility: 'none' }, paint: {
          'fill-color': ['coalesce', ['feature-state', 'fill'], COLOR_SIGILO_OU_AUSENTE],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], .95,
            ['boolean', ['feature-state', 'hover'], false], .9,
            ['boolean', ['feature-state', 'dimmed'], false], .22, .78],
        } });
        instance.addLayer({ id: `${kind}-line`, type: 'line', source, layout: { visibility: 'none' }, paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], COLOR_DESTAQUE_SELECIONADO,
            ['all', ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'sigilo'], false]], '#ffd166',
            ['boolean', ['feature-state', 'hover'], false], '#a6efc8',
            ['boolean', ['feature-state', 'sigilo'], false], '#f5b75d', '#b5d8e9'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], official ? 3 : 4,
            ['boolean', ['feature-state', 'hover'], false], official ? 2.6 : 3.2,
            official ? kind === 'setores' ? .6 : .9 : 2],
        } });
      }
      instance.addSource('tse-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id_local' });
      instance.addLayer({ id: 'tse-locais', type: 'circle', source: 'tse-source', paint: {
        'circle-radius': 7, 'circle-color': ['case', ['boolean', ['get', 'alocado'], false], '#38bdf8', '#94a3b8'],
        'circle-stroke-color': ['case', ['boolean', ['get', 'selected'], false], COLOR_DESTAQUE_SELECIONADO, '#ffffff'],
        'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 4, 2],
      } });
      function hit(event: MapMouseEvent | MapTouchEvent, click = false) {
        const geo = active.current;
        if (!geo || instance.isMoving() || ('points' in event && event.points.length !== 1)) { clearPreview(); return; }
        const features = instance.queryRenderedFeatures(event.point, { layers: ['tse-locais', `${kindFor(geo)}-fill`] });
        const electoral = features.find(f => f.layer.id === 'tse-locais')?.properties;
        if (electoral && typeof electoral.id_local === 'string') {
          if (dismissed.current === `tse:${electoral.id_local}` && !click) return;
          const next = { id: `tse:${electoral.id_local}`, code: electoral.id_local, point: event.point,
            tse: { name: electoral.nm_local, text: `Aptos: ${electoral.eleitores_aptos} · votos válidos: ${electoral.votos_validos} · ${electoral.alocado ? 'alocação declarada em setor' : 'sem alocação em setor'}` } };
          if (!pointerRef.current?.tse) { hoverPaint.current.set(instance, null); latest.current.onMapPreview?.(null); }
          pointerRef.current = next; setPointer(next); instance.getCanvas().style.cursor = 'pointer'; return;
        }
        const code = features.find(f => f.layer.id === `${kindFor(geo)}-fill`)?.properties?.[geo.field];
        const group = typeof code === 'string' ? geo.rowByFeature.get(code) : undefined;
        const row = group ? latest.current.byId.get(group) : undefined;
        if (!row) { clearPreview(); dismissed.current = null; return; }
        if (click) {
          const current = latest.current.nav;
          clearPreview(); dismissed.current = null;
          latest.current.select(selectedTerritory(current) === row.id && (current.level === 'bairro' || current.level === 'distrito' || current.level === 'setor') ?
            latest.current.parentNavigation ?? { level: 'municipio', cd_uf: current.cd_uf, cd_mun: current.cd_mun } : row.nav); return;
        }
        if (dismissed.current === row.id) return;
        dismissed.current = null;
        if (pointerRef.current?.id !== row.id || pointerRef.current.tse) latest.current.onMapPreview?.(row.id);
        const next = { id: row.id, code, point: event.point };
        hoverPaint.current.set(instance, row.id);
        pointerRef.current = next; setPointer(next); instance.getCanvas().style.cursor = 'pointer';
      }
      instance.on('mousemove', event => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => { frame.current = null; hit(event); });
      });
      instance.on('touchstart', event => { clearPreview(); hit(event); });
      instance.on('click', event => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; hit(event, true); });
      instance.on('movestart', () => clearPreview());
      setMapReady(true);
    });
    const leave = () => { clearPreview(); dismissed.current = null; };
    instance.getCanvas().addEventListener('pointerleave', leave);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { dismissed.current = pointerRef.current?.id ?? null; clearPreview(); }
    };
    window.addEventListener('keydown', onKeyDown);
    const observer = new ResizeObserver(() => {
      instance.resize();
      setSize({ width: container.current?.clientWidth ?? 0, height: container.current?.clientHeight ?? 0 });
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect(); window.removeEventListener('keydown', onKeyDown);
      instance.getCanvas().removeEventListener('pointerleave', leave);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      map.current = null; active.current = undefined; instance.remove();
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    clearPreview(); hoverPaint.current.setGeometry(instance, geometry);
    active.current = geometry;
    for (const kind of kinds) instance.setLayoutProperty(`${kind}-fill`, 'visibility', geometry && kindFor(geometry) === kind ? 'visible' : 'none');
    for (const kind of kinds) instance.setLayoutProperty(`${kind}-line`, 'visibility', geometry && kindFor(geometry) === kind ? 'visible' : 'none');
    if (!geometry) return;
    const source = `${kindFor(geometry)}-source`;
    instance.removeFeatureState({ source });
    (instance.getSource(source) as GeoJSONSource).setData(geometry.collection);
    update(instance, geometry);
    instance.once('idle', () => { if (active.current === geometry) setSourceReady(true); });
  }, [geometry, mapReady]);
  useEffect(() => { if (map.current && geometry && mapReady) update(map.current, geometry); }, [rows, nav, geometry, mapReady]);
  useEffect(() => {
    if (map.current && mapReady) hoverPaint.current.set(map.current, preview?.id ?? null);
    if (preview?.origin === 'list') { pointerRef.current = null; setPointer(null); }
  }, [preview, mapReady, geometry]);
  useEffect(() => {
    const source = mapReady ? map.current?.getSource('tse-source') as GeoJSONSource | undefined : undefined;
    source?.setData(pontosTse(tse, selected));
  }, [tse, selected, mapReady]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !geometry || !mapReady) return;
    const features = selected ? geometry.collection.features.filter(f => geometry.selectedFeatureIds ? geometry.selectedFeatureIds.has(f.properties![geometry.field] as string) : geometry.rowByFeature.get(f.properties![geometry.field] as string) === selected) : geometry.collection.features;
    const bounds = calcularBoundingBox(features);
    if (bounds) instance.fitBounds(bounds, { padding: 35, duration: 0 });
  }, [geometry, selected, mapReady]);

  const hoveredRow = preview ? byId.get(preview.id) : undefined;
  const rowPoint = preview?.origin === 'map' && pointer?.id === preview.id ? pointer.point : undefined;
  const rowCode = hoveredRow ? rowPoint ? pointer!.code : hoveredRow.id : '';
  const isTse = !!pointer?.tse;
  const tooltip = isTse ? { name: pointer!.tse!.name, code: pointer!.code, level: 'Local de votação TSE', text: pointer!.tse!.text, point: pointer!.point, selected: false, sigilo: false } : hoveredRow ? {
    name: hoveredRow.name, code: rowCode, level: levelLabel(hoveredRow), point: rowPoint,
    text: `${metadadosMetrica(metric).label}: ${hoveredRow.value}${metricContext ? ` · ${metricContext}` : ''}${official ? '' : ` · cobertura ${hoveredRow.coverage === null ? 'desconhecida' : formatarValorIndicador(hoveredRow.coverage, 'cobertura_renda_proporcao')}`}`,
    selected: selected === hoveredRow.id || !!geometry?.selectedFeatureIds?.has(hoveredRow.id), sigilo: hoveredRow.sigilo,
  } : null;
  useLayoutEffect(() => {
    if (!popup.current || !stage.current || !tooltip) return;
    const position = tooltipPosition(tooltip.point, stage.current.clientWidth, stage.current.clientHeight, popup.current.offsetWidth, popup.current.offsetHeight);
    popup.current.style.left = `${position.left}px`; popup.current.style.top = `${position.top}px`;
  }, [tooltip, size]);
  return <div className="demo-map-wrap" data-preview-id={hoveredRow?.id} data-selected-id={selected ?? undefined}>
    <div className="demo-map-header"><p className="demo-map-label">{official ? 'LIMITES OFICIAIS IBGE · CENSO 2022' : 'GEOMETRIAS SINTÉTICAS · SEM LIMITES OFICIAIS'}</p>
      <div className="map-interaction-legend"><span className="legend-chip legend-chip-hover"><i />Prévia</span><span className="legend-chip legend-chip-selected"><i />Seleção</span><span className="legend-chip legend-chip-sigilo"><i />Sigilo</span></div></div>
    {tse && <p className="demo-map-label">● Pontos TSE: ciano = alocação declarada; cinza = não alocado. Votos do local, não da população residente.</p>}
    <div className="demo-map-stage" ref={stage}>
      <div ref={container} className="demo-map" data-testid={official ? 'official-map' : 'demo-map'} data-ready={mapReady && sourceReady && !!geometry && !error} data-feature-count={geometry?.collection.features.length ?? 0} data-layer={geometry?.field} aria-label={official ? 'Mapa de limites oficiais do IBGE; navegação também disponível na lista' : 'Mapa de polígonos sintéticos; navegação também disponível na lista'} />
      {tooltip && <div ref={popup} className={`map-tooltip${tooltip.selected ? ' is-selected' : ''}`} aria-hidden="true" data-testid="map-tooltip">
        <div className="map-tooltip-head"><span className="map-tooltip-level">{tooltip.level}</span><code className="map-tooltip-code">{tooltip.code}</code></div>
        <strong className="map-tooltip-title">{tooltip.name}</strong><span className="map-tooltip-metric">{tooltip.text}</span>
        <div className="map-tooltip-badges">{tooltip.selected && <span className="map-tooltip-badge badge-selected">✓ Selecionado</span>}{tooltip.sigilo && <span className="map-tooltip-badge badge-sigilo">Contém sigilo</span>}</div>
      </div>}
    </div>
    {error ? <p role="alert">{error}</p> : !sourceReady ? <p role="status">Carregando malha local…</p> : null}
    <p className="demo-map-hover" role="status">{tooltip ? `${tooltip.name} · ${tooltip.code} · ${tooltip.text}${tooltip.selected ? ' · Selecionado' : ''}${tooltip.sigilo ? ' · Contém sigilo' : ''}` : 'Passe o cursor ou use Tab na lista para uma prévia. Clique, pressione Enter ou toque para abrir. Esc limpa a prévia.'}</p>
  </div>;
}
export default MapViewport;
