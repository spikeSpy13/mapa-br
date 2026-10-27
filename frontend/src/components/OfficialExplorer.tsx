import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataHttpError, DataLoader } from '../services/dataLoader';
import { neighborhoodName, sectorName, sectorNeighborhood } from '../services/officialDemography';
import { loadOfficialCartography } from '../services/officialGeometry';
import { navigationSearch, type Navigation } from '../state/navigation';
import { useGeoStore } from '../store/useGeoStore';
import { criarEscalaCoropletica, CHOROPLETH_COLORS, formatarValorIndicador, METRICAS_CATALOGO, formatarMedidaDemografica as display } from '../lib/geoStats';
import type { DemographicMetric } from '../types/demography';
import type { MapRow } from './MapViewport';
import { useTerritoryPreview } from './useTerritoryPreview';
import { TerritoryInspector } from './TerritoryInspector';
import { NeighborhoodComparison } from './NeighborhoodComparison';
const MapViewport = lazy(() => import('./MapViewport'));

export function OfficialExplorer({ loader }: { loader: DataLoader }) {
  const { navigation: nav, navigate, registrarRegioes, voltarNivel, routeError, metrica, setMetrica, bairrosComparados, adicionarBairroComparado, removerBairroComparado, limparComparacao } = useGeoStore(s => s);
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const hover = useTerritoryPreview(navigationSearch(nav));
  const country = useQuery({ queryKey: ['cartografia', loader.indexUrl, ''], queryFn: ({ signal }) => loadOfficialCartography(loader, { level: 'pais' }, signal) });
  const selected = useQuery({ queryKey: ['cartografia', loader.indexUrl, navigationSearch(nav)],
    queryFn: ({ signal }) => loadOfficialCartography(loader, nav, signal), enabled: nav.level !== 'pais' && !!country.data });
  const query = nav.level === 'pais' ? country : selected;
  const data = query.data;
  const error = country.error ?? query.error;
  const ufs = country.data?.country.features ?? [];
  useEffect(() => { if (country.data) registrarRegioes(country.data.country.features.map(f => f.properties)); }, [country.data, registrarRegioes]);
  useEffect(() => setSearch(''), [navigationSearch(nav)]);
  const uf = 'cd_uf' in nav ? ufs.find(f => f.properties.cd_uf === nav.cd_uf)?.properties : undefined;
  const title = data?.title ?? (nav.level === 'pais' ? 'Brasil' : nav.level === 'uf' ? uf?.nm_uf : undefined);
  const stats = data?.statistics.status === 'disponiveis' ? data.statistics : undefined;
  const metric: DemographicMetric = metrica === 'domicilios' ? 'domicilios' : 'populacao';
  const territories = useMemo(() => {
    if (!data) return [];
    return data.geometry.collection.features.map(f => {
      const p = f.properties!;
      const target: Navigation = data.geometry.field === 'cd_setor' ? { level: 'setor', cd_uf: p.cd_uf, cd_mun: p.cd_mun, cd_setor: p.cd_setor } :
        data.geometry.field === 'cd_mun' ? { level: 'municipio', cd_uf: p.cd_uf, cd_mun: p.cd_mun } : { level: 'uf', cd_uf: p.cd_uf };
      return { id: p[data.geometry.field] as string, name: p.cd_setor ? sectorName(stats, p.cd_setor) : p.nm_mun ?? `${p.nm_uf} (${p.sigla_uf})`, nav: target };
    });
  }, [data, stats, nav]);
  const scale = useMemo(() => criarEscalaCoropletica(territories.map(t => stats?.rows[t.id]?.[metric].valor)), [territories, stats, metric]);
  const rows: MapRow[] = useMemo(() => territories.map(t => ({ ...t, fill: scale.obterCor(stats?.rows[t.id]?.[metric].valor),
    sigilo: stats?.rows[t.id]?.[metric].status === 'sigilo', coverage: null, value: display(stats?.rows[t.id]?.[metric]) })), [territories, stats, scale, metric]);
  const selectedSector = nav.level === 'setor' ? nav.cd_setor : undefined;
  const selectedId = selectedSector ?? (nav.level === 'bairro' ? nav.id_agregacao : undefined);
  const bairro = nav.level === 'bairro' ? stats?.bairros?.[nav.id_agregacao] : undefined;
  const identity = selectedSector ? sectorNeighborhood(stats, selectedSector) : undefined;
  const parent: Navigation | undefined = nav.level === 'setor' && identity ? { level: 'bairro', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun, id_agregacao: identity.id } : undefined;
  const goBack = () => parent ? navigate(parent) : voltarNivel();
  const normalizeSearch = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
  const matches = (text: string) => normalizeSearch(text).includes(normalizeSearch(search));
  const neighborhoodOptions = Object.entries(stats?.bairros ?? {})
    .filter(([id, b]) => matches(`${neighborhoodName(b)} ${b.cd_bairro ?? ''} ${id}`) || b.cd_setores.some(matches))
    .sort(([, a], [, b]) => Number(a.cd_bairro === null) - Number(b.cd_bairro === null) || neighborhoodName(a).localeCompare(neighborhoodName(b), 'pt-BR'));
  const selectedCodes = useMemo(() => bairro ? new Set(bairro.cd_setores) : undefined, [bairro]);
  const filtered = rows.filter(r => (!selectedCodes || selectedCodes.has(r.id)) && matches(`${r.name} ${r.id} ${sectorNeighborhood(stats, r.id)?.group.cd_bairro ?? ''}`))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const sections = new Map<string, { label: string; id?: string; rows: MapRow[] }>();
  for (const row of filtered) {
    const membership = data?.geometry.field === 'cd_setor' ? sectorNeighborhood(stats, row.id) : undefined;
    const key = membership?.id ?? (data?.geometry.field === 'cd_setor' ? 'unknown' : 'territories');
    if (!sections.has(key)) sections.set(key, { label: data?.geometry.field === 'cd_setor' ? neighborhoodName(membership?.group) : '', id: membership?.id, rows: [] });
    sections.get(key)!.rows.push(row);
  }
  const inspectorRows = bairro && nav.level === 'bairro' ? [...rows, { id: nav.id_agregacao, name: neighborhoodName(bairro), nav, fill: '', sigilo: bairro.indicadores[metric].status === 'sigilo', coverage: null, value: display(bairro.indicadores[metric]) }] : rows;
  const message = error instanceof DataHttpError && error.status === 404 ? 'Arquivo de geometria oficial indisponível localmente ou estatísticas ausentes. Execute a preparação das malhas e da demografia desta entrega.' :
    error instanceof Error && error.name !== 'ZodError' ? error.message : 'Os dados ou a geometria recebidos são incompatíveis com o catálogo auditado.';
  return <div className="app-shell official-shell">
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL} onClick={e => { e.preventDefault(); navigate({ level: 'pais' }); }}><span className="brand-symbol">▦</span> MAPA<span className="brand-br">BR</span><small>OBSERVATÓRIO TERRITORIAL</small></a>
      <a className="mode-link" href={`${import.meta.env.BASE_URL}?modo=demo`}>Abrir demonstração · dados simulados</a></header>
    <div className="provenance"><span>MAPA OFICIAL · IBGE</span>Censo 2022 · População e domicílios oficiais · Referência: 1º de agosto de 2022</div>
    <nav className="toolbar" aria-label="Navegação territorial"><div className="breadcrumbs">
      <button disabled={nav.level === 'pais'} onClick={goBack}>← Voltar nível</button><button onClick={() => navigate({ level: 'pais' })}>Brasil</button>
      {uf && <><span>/</span><button onClick={() => navigate({ level: 'uf', cd_uf: uf.cd_uf })}>{uf.nm_uf}</button></>}
      {'cd_mun' in nav && <><span>/</span><button onClick={() => navigate({ level: 'municipio', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun })}>{data?.geometry.collection.features[0]?.properties?.nm_mun ?? nav.cd_mun}</button></>}
      {parent && identity && <><span>/</span><button onClick={() => navigate(parent)}>{neighborhoodName(identity.group)}</button></>}
      {selectedId && <><span>/</span><span aria-current="page">{bairro ? neighborhoodName(bairro) : selectedSector}</span></>}
    </div><select aria-label="Selecionar UF" value={uf?.cd_uf ?? ''} onChange={e => { if (e.target.value) navigate({ level: 'uf', cd_uf: e.target.value }); }}>
      <option value="">Ir para uma UF</option>{ufs.map(f => <option key={f.properties.cd_uf} value={f.properties.cd_uf}>{f.properties.sigla_uf} · {f.properties.nm_uf}</option>)}</select></nav>
    {routeError && <p role="alert" className="notice">{routeError}</p>}
    <main className="split-screen"><section className="map-panel" aria-label="Exploração territorial">
      <div className="map-heading"><div><span className="eyebrow">CARTOGRAFIA OFICIAL / {nav.level.toUpperCase()}</span><h1>{title ?? 'Carregando território…'}</h1></div><span className="level-tag">CENSO 2022</span></div>
      <div className="map-controls"><label>Colorir por <select aria-label="Colorir por" disabled={!stats} value={metric} onChange={e => setMetrica(e.target.value as DemographicMetric)}><option value="populacao">População</option><option value="domicilios">Domicílios</option></select></label></div>
      <div className="region-pills" aria-label="Regiões do Brasil">{Object.entries(stats?.index.regioes ?? {}).map(([id, r]) => <button key={id} aria-pressed={nav.level === 'regiao' && nav.cd_regiao === id} onClick={() => navigate({ level: 'regiao', cd_regiao: id })}>{r.nome}</button>)}</div>
      {!stats?.summary && <p role="status" className="metric-fallback">Indicadores indisponíveis para este recorte. A identificação e a navegação territorial permanecem disponíveis.</p>}
      {error ? <div className="empty-map" role="alert"><h2>Não foi possível abrir a geometria oficial</h2><p>{message}</p><button onClick={() => { loader.clear(); void client.resetQueries({ queryKey: ['cartografia', loader.indexUrl] }); }}>Tentar novamente</button><button onClick={() => navigate({ level: 'pais' })}>Voltar ao Brasil</button></div> :
        <Suspense fallback={<p role="status">Preparando mapa local…</p>}><MapViewport loader={loader} official officialGeometry={data?.geometry} nav={nav} rows={rows} metric={metric} select={navigate} preview={hover.preview} onMapPreview={hover.fromMap} parentNavigation={parent} /></Suspense>}
      {query.isPending && !error && <p role="status">Carregando o recorte selecionado…</p>}
      {stats?.unavailableStatistics && <p role="status" className="notice">{stats.unavailableStatistics}</p>}
      {data?.unavailableGeometry && <p role="status" className="notice">{data.unavailableGeometry} O contorno do território selecionado permanece visível.</p>}
      <div className="map-footer" data-testid="official-legend"><strong>{METRICAS_CATALOGO[metric].label} · {metric === 'populacao' ? 'pessoas' : 'domicílios'} · 2022</strong>
        <p>Quantis R-7 {data?.geometry.field === 'cd_setor' ? 'dos setores do município' : 'do recorte'} · {formatarValorIndicador(scale.min)} a {formatarValorIndicador(scale.max)}</p>
        {scale.max !== null && <div className="legend-scale">{CHOROPLETH_COLORS.map((c, i) => <div key={c}><span style={{ background: c }} /><small>≤ {formatarValorIndicador(Math.floor(scale.quebras[i] ?? scale.max!))}</small></div>)}</div>}
        <p>Cinza: ausente ou sigilo (distintos no painel). Zero é valor divulgado. Rosa: seleção. {data?.geometry.field === 'cd_mun' ? 'Totais municipais consolidados.' : data?.geometry.field === 'cd_setor' ? 'Cada setor tem seu próprio valor; rosa destaca a seleção.' : 'Totais de cada UF.'}</p></div>
    </section><aside className="analytics" aria-label="Identificação territorial">
      <span className="eyebrow">TERRITÓRIO / IBGE</span><h2>{title ?? 'Carregando…'}</h2>
      <div className="kpi-grid" data-testid="official-kpis">{(['populacao', 'domicilios'] as const).map(f => <div className="kpi-card" key={f}><span>{METRICAS_CATALOGO[f].label}</span><strong data-testid={`official-${f}`}>{display(stats?.summary?.[f])}</strong><small>{f === 'populacao' ? 'Pessoas residentes' : 'Todas as espécies · inclui vagos e uso ocasional'}</small></div>)}</div>
      <p className="muted">{data ? `${new Intl.NumberFormat('pt-BR').format(data.geometry.collection.features.length)} ${data.geometry.field === 'cd_setor' ? 'setores censitários' : data.geometry.field === 'cd_mun' ? 'municípios' : 'unidades da federação'} no mapa` : 'Aguardando a malha local.'}</p>
      {selectedSector && <div className="origin-badge" data-testid="sector-neighborhood">Setor censitário: <strong>{selectedSector}</strong><p>Bairro: <strong>{neighborhoodName(identity?.group)}</strong></p><p>Código do bairro: {identity?.group.cd_bairro ?? 'Não informado na fonte'}</p><p>Município IBGE: {'cd_mun' in nav ? nav.cd_mun : ''}</p>{parent && <button className="neighborhood-action" onClick={() => navigate(parent)}>Voltar ao bairro</button>}</div>}
      {stats?.coverage && <p className="notice" data-testid="neighborhood-coverage">Associação municipal setor–bairro: {stats.coverage.com_bairro} de {stats.coverage.total_setores} setores ({new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(stats.coverage.com_bairro / stats.coverage.total_setores)}), em {stats.coverage.bairros} bairros. {stats.coverage.sem_bairro} setores: Bairro não identificado na fonte.</p>}
      {data?.geometry.field === 'cd_setor' && <p className="muted">{bairro ? 'Soma dos setores pelo vínculo oficial CD_BAIRRO, sem criar novos limites. O grupo sem bairro não é um bairro oficial.' : 'Exibindo setores censitários individuais. Os vínculos declarados de bairro estão disponíveis abaixo quando auditados.'}</p>}
      {bairro && <div className="origin-badge">{bairro.cd_bairro === null ? neighborhoodName(bairro) : `Bairro declarado IBGE: ${bairro.cd_bairro}`} · {bairro.cd_setores.length} setores
        <button className="neighborhood-action" onClick={() => 'cd_mun' in nav && navigate({ level: 'municipio', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun })}>Ver todos os setores de Florianópolis</button>
      </div>}
      <div className="ranking"><h3>Navegar por território</h3><label className="muted" htmlFor="territory-search">Buscar nome ou código</label><input id="territory-search" type="search" value={search} onChange={e => setSearch(e.target.value)} />
        {stats?.bairros && stats.municipalitySummary && 'cd_mun' in nav && <NeighborhoodComparison groups={stats.bairros} municipality={stats.municipalitySummary} coverage={stats.coverage}
          visibleIds={new Set(neighborhoodOptions.map(([id]) => id))} metric={metric} setMetric={setMetrica} selected={bairrosComparados}
          add={adicionarBairroComparado} remove={removerBairroComparado} clear={limparComparacao} sourceUrl={stats.index.fontes.populacao.setorial.recibo.url}
          open={id => { hover.clear(); navigate({ level: 'bairro', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun, id_agregacao: id }); }} />}
        <div ref={hover.listRef} role="region" className="ranking-rows official-territories" aria-label="Lista de territórios">{[...sections.entries()].map(([id, section]) => <section className="neighborhood-sector-group" key={id} data-neighborhood-section={section.id}>
          {section.label && <h3>{section.id && 'cd_mun' in nav ? <button className="neighborhood-heading" data-neighborhood-id={section.id} aria-pressed={nav.level === 'bairro' && nav.id_agregacao === section.id} aria-label={`Abrir bairro ${section.label}`} onClick={() => 'cd_mun' in nav && navigate({ level: 'bairro', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun, id_agregacao: section.id! })}>{section.label}<small>{section.rows.length} setores na lista</small></button> : section.label}</h3>}
          {section.rows.map(r => <button className={`ranking-row territory-interactive${hover.preview?.id === r.id ? ' is-hovered' : ''}${selectedId === r.id ? ' is-selected' : ''}`} key={r.id} data-territory-id={r.id} data-hovered={hover.preview?.id === r.id ? 'true' : undefined} aria-pressed={selectedId === r.id} {...hover.handlers(r.id)} onClick={() => { hover.clear(); navigate(r.nav); }}><span className="rank-name"><strong>{r.name}</strong><small>{r.id}</small></span><span>{r.value} <span aria-hidden="true">{selectedId === r.id ? '✓' : '→'}</span></span></button>)}
        </section>)}</div>
        {rows.length > 0 && !filtered.length && <p role="status">Nenhum território encontrado para a busca.</p>}
        <TerritoryInspector rows={inspectorRows} preview={hover.preview} selected={selectedId ?? null} metric={metric} />
      </div><div className="source-details"><strong>Fontes e disponibilidade</strong><p>Malhas oficiais IBGE, referência Censo 2022. Renda, PIB e TSE não estão disponíveis neste modo.</p>{stats && <div data-testid="official-sources"><p>Referência estatística: 1º de agosto de 2022 · Dados do Universo.</p>{(['populacao', 'domicilios'] as const).map(f => { const source = stats.index.fontes[f]; const sector = nav.level === 'setor' || nav.level === 'bairro'; return <p key={f}>{METRICAS_CATALOGO[f].label}: {source.fonte} · {source.unidade} · {source.universo}. {sector ? <><a href={source.setorial.recibo.url}>{source.setorial.arquivo}</a> · variável {source.setorial.variavel} · edição {source.setorial.edicao} · <a href={source.setorial.dicionario.url}>Dicionário</a></> : <><a href={source.consolidado.recibo.url}>SIDRA tabela {source.consolidado.tabela}</a> · variável {source.consolidado.variavel} · edição consultada em {source.consolidado.recibo.downloaded_at.slice(0, 10)}</>}</p>; })}<p>Panorama nacional obtido diretamente dos consolidados oficiais; independe das cidades preparadas. Florianópolis: soma setorial conferida contra os totais municipais SIDRA.</p></div>}
      {stats?.vinculoBairro && <p data-testid="official-neighborhood-source">Vínculo setor–bairro: CD_SETOR, CD_BAIRRO e NM_BAIRRO iguais no CSV básico 20260520 e no DBF setorial CD2022. <a href={stats.vinculoBairro.recibos.dicionario_malha.url}>Dicionário da malha, aba Setor</a>. Setores sem bairro mantidos em grupo explícito.</p>}
      {stats?.neighborhoodLookupUrl && <p><a href={stats.neighborhoodLookupUrl} target="_blank" rel="noreferrer">Consultar correspondência municipal setor–bairro e cobertura</a></p>}
      {stats && <p><a href={`${import.meta.env.BASE_URL}geo/official/statistics/brasil.json`} target="_blank" rel="noreferrer">Consultar tabelas, variáveis, edições e recibos dos indicadores</a></p>}
      <a href={`${import.meta.env.BASE_URL}geo/official/proveniencia.json`} target="_blank" rel="noreferrer">Consultar fontes, transformações e hashes da cartografia</a></div>
    </aside></main><footer className="page-footer"><span>MAPA BR / TERRITÓRIO EM PERSPECTIVA</span><span>Brasil → Santa Catarina → Florianópolis → Bairro → Setor censitário</span></footer>
  </div>;
}
