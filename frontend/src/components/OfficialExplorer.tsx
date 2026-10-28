import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataHttpError, DataLoader } from '../services/dataLoader';
import { neighborhoodName, sectorName, sectorNeighborhood, loadOfficialTheme, resolveSectorDistrict } from '../services/officialDemography';
import { loadOfficialCartography } from '../services/officialGeometry';
import { navigationSearch, type Navigation } from '../state/navigation';
import { useGeoStore } from '../store/useGeoStore';
import { metadadosMetrica, criarEscalaCoropletica, CHOROPLETH_COLORS, formatarValorIndicador, formatarMedidaDemografica as display } from '../lib/geoStats';
import type { DemographicMetric } from '../types/demography';
import type { MapRow } from './MapViewport';
import { useTerritoryPreview } from './useTerritoryPreview';
import { TerritoryInspector } from './TerritoryInspector';
import { NeighborhoodComparison } from './NeighborhoodComparison';
import { censusUniverseLabel, CENSUS_DEFINITIONS, CENSUS_THEMES, censusDefinition, isCensusMetric } from '../lib/censusCatalog';
import { censusNumeric, censusRows, censusSummary, formatCensusValue } from '../lib/censusValues';
import { preparedMunicipality, preparedMunicipalityNames } from '../lib/preparedMunicipalities';
import { CensusThemePanel } from './CensusThemePanel';
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
  const baseMetric: DemographicMetric = metrica === 'domicilios' ? 'domicilios' : 'populacao';
  const metric = isCensusMetric(metrica) ? metrica : baseMetric;
  const definition = censusDefinition(metric), theme = definition?.tema;
  const municipalityConfig = preparedMunicipality('cd_mun' in nav ? nav.cd_mun : undefined);
  const municipalityName = municipalityConfig?.nome ?? ('cd_mun' in nav ? nav.cd_mun : 'município selecionado');
  const themeMunicipality = 'cd_mun' in nav && municipalityConfig ? nav.cd_mun : undefined;
  const thematic = useQuery({ queryKey: ['censo-temas', loader.indexUrl, theme ?? '', themeMunicipality ?? 'brasil', stats?.currentDistrict??'resumo'],
    queryFn: ({ signal }) => loadOfficialTheme(loader, themeMunicipality, theme!, signal, { ufs: ufs.map(f => f.properties.cd_uf), setores: data?.geometry.field === 'cd_setor' ? data.geometry.collection.features.map(f => f.properties!.cd_setor as string) : [], bairros: stats?.bairros, distrito:stats?.currentDistrict, setoresPorDistrito:stats?.districtSummary?Object.fromEntries(Object.entries(stats.districtSummary.distritos).map(([c,d])=>[c,d.total_setores])):undefined, distritos:stats?.currentDistrict?[stats.currentDistrict]:data?.geometry.field==='cd_distrito'?data.geometry.collection.features.map(f=>f.properties!.cd_distrito as string):undefined }), enabled: !!theme && !!data });
  const themeData = theme ? thematic.data : undefined;
  const thematicRows = censusRows(themeData, data?.geometry.field);
  const themeSummary = censusSummary(themeData, nav);
  const thematicKey = isCensusMetric(metric) ? metric.slice(6) : '';
  const numberFor = (id: string) => theme ? censusNumeric(thematicRows[id]?.[thematicKey]) : stats?.rows[id]?.[baseMetric].valor;
  const unit = definition?.unidade ?? (metric === 'populacao' ? 'pessoas' : 'domicílios');
  const territories = useMemo(() => {
    if (!data) return [];
    return data.geometry.collection.features.map(f => {
      const p = f.properties!;
      const target: Navigation = data.geometry.field === 'cd_distrito' ? {level:'distrito',cd_uf:p.cd_uf,cd_mun:p.cd_mun,cd_distrito:p.cd_distrito} : data.geometry.field === 'cd_setor' ? { level: 'setor', cd_uf: p.cd_uf, cd_mun: p.cd_mun, cd_setor: p.cd_setor, ...(p.cd_distrito?{cd_distrito:p.cd_distrito}:{}) } :
        data.geometry.field === 'cd_mun' ? { level: 'municipio', cd_uf: p.cd_uf, cd_mun: p.cd_mun } : { level: 'uf', cd_uf: p.cd_uf };
      return { id: p[data.geometry.field] as string, name: p.cd_setor ? sectorName(stats, p.cd_setor) : p.nm_distrito ?? p.nm_mun ?? `${p.nm_uf} (${p.sigla_uf})`, nav: target };
    });
  }, [data, stats, nav]);
  const scale = useMemo(() => criarEscalaCoropletica(territories.map(t => numberFor(t.id))), [territories, stats, metric, thematicRows]);
  const rows: MapRow[] = useMemo(() => territories.map(t => ({ ...t, fill: scale.obterCor(numberFor(t.id)),
    sigilo: theme ? thematicRows[t.id]?.[thematicKey]?.status === 'sigilo' : stats?.rows[t.id]?.[baseMetric].status === 'sigilo', coverage: null, value: theme ? formatCensusValue(thematicRows[t.id]?.[thematicKey]) : display(stats?.rows[t.id]?.[baseMetric]) })), [territories, stats, scale, metric, thematicRows]);
  const selectedSector = nav.level === 'setor' ? nav.cd_setor : undefined;
  const selectedId = selectedSector ?? (nav.level === 'distrito'?nav.cd_distrito:nav.level === 'bairro' ? nav.id_agregacao : undefined);
  const bairro = nav.level === 'bairro' ? stats?.bairros?.[nav.id_agregacao] : undefined;
  const identity = selectedSector ? sectorNeighborhood(stats, selectedSector) : undefined;
  const parent: Navigation | undefined = nav.level==='setor'&&stats?.currentDistrict?{level:'distrito',cd_uf:nav.cd_uf,cd_mun:nav.cd_mun,cd_distrito:stats.currentDistrict}:nav.level === 'setor' && identity ? { level: 'bairro', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun, id_agregacao: identity.id } : undefined;
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
    if (!sections.has(key)) sections.set(key, { label: stats?.districtSummary&&stats.currentDistrict?`${stats.districtSummary.distritos[stats.currentDistrict]?.nome} · distrito`:data?.geometry.field === 'cd_setor' ? neighborhoodName(membership?.group) : '', id: membership?.id, rows: [] });
    sections.get(key)!.rows.push(row);
  }
  const inspectorRows:MapRow[] = nav.level==='distrito'?[...rows,{id:nav.cd_distrito,name:stats?.districtSummary?.distritos[nav.cd_distrito]?.nome??nav.cd_distrito,nav,fill:'',sigilo:themeSummary?.[thematicKey]?.status==='sigilo',coverage:null,value:theme?formatCensusValue(themeSummary?.[thematicKey]):display(stats?.summary?.[baseMetric])}]:bairro && nav.level === 'bairro' ? [...rows, { id: nav.id_agregacao, name: neighborhoodName(bairro), nav, fill: '', sigilo: theme ? themeSummary?.[thematicKey]?.status === 'sigilo' : bairro.indicadores[baseMetric].status === 'sigilo', coverage: null, value: theme ? formatCensusValue(themeSummary?.[thematicKey]) : display(bairro.indicadores[baseMetric]) }] : rows;
  const sectorLookup=useQuery({queryKey:['indice-setores-distritos',loader.indexUrl,'cd_mun' in nav?nav.cd_mun:'',search],queryFn:({signal})=>resolveSectorDistrict(loader,stats!.districtSummary!,stats!.districtSummaryUrl!,search,signal),enabled:nav.level==='municipio'&&!!stats?.districtSummary&&/^\d{15}$/.test(search)});
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
      {parent && stats?.currentDistrict && <><span>/</span><button onClick={()=>navigate(parent)}>{stats.districtSummary?.distritos[stats.currentDistrict]?.nome}</button></>}
      {parent && identity && <><span>/</span><button onClick={() => navigate(parent)}>{neighborhoodName(identity.group)}</button></>}
      {selectedId && <><span>/</span><span aria-current="page">{nav.level==='distrito'?stats?.districtSummary?.distritos[nav.cd_distrito]?.nome:bairro ? neighborhoodName(bairro) : selectedSector}</span></>}
    </div><select aria-label="Selecionar UF" value={uf?.cd_uf ?? ''} onChange={e => { if (e.target.value) navigate({ level: 'uf', cd_uf: e.target.value }); }}>
      <option value="">Ir para uma UF</option>{ufs.map(f => <option key={f.properties.cd_uf} value={f.properties.cd_uf}>{f.properties.sigla_uf} · {f.properties.nm_uf}</option>)}</select></nav>
    {routeError && <p role="alert" className="notice">{routeError}</p>}
    <main className="split-screen"><section className="map-panel" aria-label="Exploração territorial">
      <div className="map-heading"><div><span className="eyebrow">CARTOGRAFIA OFICIAL / {nav.level.toUpperCase()}</span><h1>{title ?? 'Carregando território…'}</h1></div><span className="level-tag">CENSO 2022</span></div>
      <div className="map-controls"><label>Colorir por <select aria-label="Colorir por" disabled={!stats} value={metric} onChange={e => setMetrica(e.target.value as typeof metric)}><option value="populacao">População</option><option value="domicilios">Domicílios</option>{Object.entries(CENSUS_THEMES).map(([id,label]) => <optgroup key={id} label={label}>{Object.entries(CENSUS_DEFINITIONS).filter(([,m]) => m.tema === id).map(([key,m]) => <option key={key} value={`censo_${key}`}>{m.rotulo}</option>)}</optgroup>)}</select></label></div>
      <div className="region-pills" aria-label="Regiões do Brasil">{Object.entries(stats?.index.regioes ?? {}).map(([id, r]) => <button key={id} aria-pressed={nav.level === 'regiao' && nav.cd_regiao === id} onClick={() => navigate({ level: 'regiao', cd_regiao: id })}>{r.nome}</button>)}</div>
      {!stats?.summary && <p role="status" className="metric-fallback">Indicadores indisponíveis para este recorte. A identificação e a navegação territorial permanecem disponíveis.</p>}
      {error ? <div className="empty-map" role="alert"><h2>Não foi possível abrir a geometria oficial</h2><p>{message}</p><button onClick={() => { loader.clear(); void client.resetQueries({ queryKey: ['cartografia', loader.indexUrl] }); }}>Tentar novamente</button><button onClick={() => navigate({ level: 'pais' })}>Voltar ao Brasil</button></div> :
        <Suspense fallback={<p role="status">Preparando mapa local…</p>}><MapViewport loader={loader} official officialGeometry={data?.geometry} nav={nav} rows={rows} metric={metric} select={navigate} preview={hover.preview} onMapPreview={hover.fromMap} parentNavigation={parent} metricContext={definition ? `${unit} · 2022 · ${definition.universo}` : undefined} /></Suspense>}
      {query.isPending && !error && <p role="status">Carregando o recorte selecionado…</p>}
      {stats?.unavailableStatistics && <p role="status" className="notice">{stats.unavailableStatistics}</p>}
      {theme && data?.geometry.field === 'cd_mun' && <p className="muted">Novos indicadores municipais preparados para {preparedMunicipalityNames}; os resumos Brasil/regiões/UFs são consolidados oficiais independentes.</p>}
      {data?.unavailableGeometry && <p role="status" className="notice">{data.unavailableGeometry} O contorno do território selecionado permanece visível.</p>}
      <div className="map-footer" data-testid="official-legend"><strong>{metadadosMetrica(metric).label} · {unit} · 2022</strong>
        <p>Quantis R-7 {data?.geometry.field === 'cd_setor' ? stats?.currentDistrict?'dos setores do distrito':'dos setores do município' : data?.geometry.field==='cd_distrito'?'dos distritos':'do recorte'} · {formatarValorIndicador(scale.min, metric)} a {formatarValorIndicador(scale.max, metric)}</p>
        {definition && <p>Universo: {definition.universo}. {definition.unidade === 'BRL/mês' ? 'Média publicada diretamente; não agregada de médias setoriais.' : `Percentuais no painel sobre ${censusUniverseLabel(definition.denominador)}.`}</p>}
        {scale.max !== null && <div className="legend-scale">{CHOROPLETH_COLORS.map((c, i) => <div key={c}><span style={{ background: c }} /><small>≤ {formatarValorIndicador(metadadosMetrica(metric).unidade === 'moeda' ? scale.quebras[i] ?? scale.max! : Math.floor(scale.quebras[i] ?? scale.max!), metric)}</small></div>)}</div>}
        <p>Cinza: ausente ou sigilo (distintos no painel). Zero é valor divulgado. Rosa: seleção. {data?.geometry.field === 'cd_mun' ? 'Totais municipais consolidados.' : data?.geometry.field === 'cd_setor' ? 'Cada setor tem seu próprio valor; rosa destaca a seleção.' :data?.geometry.field==='cd_distrito'?'Totais dos distritos, derivados dos setores oficiais.':'Totais de cada UF.'}</p></div>
    </section><aside className="analytics" aria-label="Identificação territorial">
      <span className="eyebrow">TERRITÓRIO / IBGE</span><h2>{title ?? 'Carregando…'}</h2>
      <div className="kpi-grid" data-testid="official-kpis">{(['populacao', 'domicilios'] as const).map(f => <div className="kpi-card" key={f}><span>{metadadosMetrica(f).label}</span><strong data-testid={`official-${f}`}>{display(stats?.summary?.[f])}</strong><small>{f === 'populacao' ? 'Pessoas residentes' : 'Todas as espécies · inclui vagos e uso ocasional'}</small></div>)}</div>
      <label className="census-theme-select">Tema do Censo <select aria-label="Tema do Censo" value={theme ?? ''} onChange={e => { const first = Object.entries(CENSUS_DEFINITIONS).find(([,m]) => m.tema === e.target.value); setMetrica(first ? `censo_${first[0]}` : baseMetric); }}>
        <option value="">População e domicílios</option>{Object.entries(CENSUS_THEMES).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {theme && <CensusThemePanel level={nav.level} record={themeSummary} theme={theme} loading={thematic.isPending} error={thematic.error ? 'O arquivo temático falhou na validação ou no carregamento. A cartografia foi preservada.' : undefined} />}
      <p className="muted">{data ? `${new Intl.NumberFormat('pt-BR').format(data.geometry.collection.features.length)} ${data.geometry.field === 'cd_setor' ? 'setores censitários' : data.geometry.field === 'cd_mun' ? 'municípios' : data.geometry.field==='cd_distrito'?'distritos':'unidades da federação'} no mapa` : 'Aguardando a malha local.'}</p>
      {selectedSector && <div className="origin-badge" data-testid="sector-neighborhood">Setor censitário: <strong>{selectedSector}</strong>{!stats?.districtSummary&&<><p>Bairro: <strong>{neighborhoodName(identity?.group)}</strong></p><p>Código do bairro: {identity?.group.cd_bairro ?? 'Não informado na fonte'}</p></>}<p>Município IBGE: {'cd_mun' in nav ? nav.cd_mun : ''}</p>{stats?.territoriosSetores?.[selectedSector] && <><p>Distrito: {stats.territoriosSetores[selectedSector]!.nm_distrito} · {stats.territoriosSetores[selectedSector]!.cd_distrito}</p><p>Subdistrito: {stats.territoriosSetores[selectedSector]!.nm_subdistrito ?? 'Nome não informado na fonte'} · {stats.territoriosSetores[selectedSector]!.cd_subdistrito}</p></>}{parent && <button className="neighborhood-action" onClick={() => navigate(parent)}>{stats?.districtSummary?'Voltar ao distrito':identity?.group.cd_bairro ? 'Voltar ao bairro' : 'Voltar ao grupo sem bairro'}</button>}</div>}
      {stats?.districtSummary&&<p className="notice" data-testid="district-coverage">{Object.keys(stats.districtSummary.distritos).length} distritos oficiais · {stats.districtSummary.total_setores.toLocaleString('pt-BR')} setores. Associação CD_DIST/NM_DIST conferida no CSV básico e DBF; nenhum bairro declarado. {stats.currentDistrict?`Distrito: ${stats.districtSummary.distritos[stats.currentDistrict]?.nome} · ${stats.currentDistrict}`:'Selecione um distrito para carregar seus setores.'}</p>}
      {nav.level==='distrito'&&<button className="neighborhood-action" onClick={()=>navigate({level:'municipio',cd_uf:nav.cd_uf,cd_mun:nav.cd_mun})}>Voltar ao município</button>}
      {stats?.coverage && <p className="notice" data-testid="neighborhood-coverage">Associação municipal setor–bairro: {stats.coverage.com_bairro} de {stats.coverage.total_setores} setores ({new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(stats.coverage.com_bairro / stats.coverage.total_setores)}), em {stats.coverage.bairros} bairros. {stats.coverage.sem_bairro} setores: Bairro não identificado na fonte.</p>}
      {data?.geometry.field === 'cd_setor' && <p className="muted">{stats?.districtSummary?'Setores do distrito declarado no CD_DIST; não são bairros.':bairro ? 'Soma dos setores pelo vínculo oficial CD_BAIRRO, sem criar novos limites. O grupo sem bairro não é um bairro oficial.' : 'Exibindo setores censitários individuais. Os vínculos declarados de bairro estão disponíveis abaixo quando auditados.'}</p>}
      {bairro && <div className="origin-badge">{bairro.cd_bairro === null ? neighborhoodName(bairro) : `Bairro declarado IBGE: ${bairro.cd_bairro}`} · {bairro.cd_setores.length} setores
        <button className="neighborhood-action" onClick={() => 'cd_mun' in nav && navigate({ level: 'municipio', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun })}>Ver todos os setores de {municipalityName}</button>
      </div>}
      <div className="ranking"><h3>Navegar por território</h3><label className="muted" htmlFor="territory-search">Buscar nome ou código</label><input id="territory-search" type="search" value={search} onChange={e => setSearch(e.target.value)} />
        {stats?.districtSummary&&nav.level==='municipio'&&/^\d{15}$/.test(search)&&<div aria-live="polite">{sectorLookup.isPending?<p>Buscando código no índice territorial…</p>:sectorLookup.data?<button className="ranking-row" onClick={()=>navigate({level:'setor',cd_uf:nav.cd_uf,cd_mun:nav.cd_mun,cd_distrito:sectorLookup.data!,cd_setor:search})}>Abrir setor {search} · distrito {stats.districtSummary.distritos[sectorLookup.data]?.nome}</button>:<p>Setor não encontrado no inventário municipal.</p>}</div>}
        {stats?.bairros && stats.municipalitySummary && 'cd_mun' in nav && <NeighborhoodComparison municipalityName={municipalityName} groups={stats.bairros} municipality={stats.municipalitySummary} coverage={stats.coverage}
          visibleIds={new Set(neighborhoodOptions.map(([id]) => id))} metric={baseMetric} setMetric={setMetrica} thematic={definition && themeData && 'cd_mun' in themeData ? { key: thematicKey, theme: definition.tema, bairros: themeData.bairros } : undefined} selected={bairrosComparados}
          add={adicionarBairroComparado} remove={removerBairroComparado} clear={limparComparacao} sourceUrl={stats.index.fontes.populacao.setorial.recibo.url}
          open={id => { hover.clear(); navigate({ level: 'bairro', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun, id_agregacao: id }); }} />}
        <div ref={hover.listRef} role="region" className="ranking-rows official-territories" aria-label="Lista de territórios">{[...sections.entries()].map(([id, section]) => <section className="neighborhood-sector-group" key={id} data-neighborhood-section={section.id}>
          {section.label && <h3>{section.id && 'cd_mun' in nav ? <button className="neighborhood-heading" data-neighborhood-id={section.id} aria-pressed={nav.level === 'bairro' && nav.id_agregacao === section.id} aria-label={`Abrir bairro ${section.label}`} onClick={() => 'cd_mun' in nav && navigate({ level: 'bairro', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun, id_agregacao: section.id! })}>{section.label}<small>{section.rows.length} setores na lista</small></button> : section.label}</h3>}
          {section.rows.map(r => <button className={`ranking-row territory-interactive${hover.preview?.id === r.id ? ' is-hovered' : ''}${selectedId === r.id ? ' is-selected' : ''}`} key={r.id} data-territory-id={r.id} data-hovered={hover.preview?.id === r.id ? 'true' : undefined} aria-pressed={selectedId === r.id} {...hover.handlers(r.id)} onClick={() => { hover.clear(); navigate(r.nav); }}><span className="rank-name"><strong>{r.name}</strong><small>{r.id}</small></span><span>{r.value} <span aria-hidden="true">{selectedId === r.id ? '✓' : '→'}</span></span></button>)}
        </section>)}</div>
        {rows.length > 0 && !filtered.length && !(stats?.districtSummary&&nav.level==='municipio'&&/^\d{15}$/.test(search)) && <p role="status">Nenhum território encontrado para a busca.</p>}
        <TerritoryInspector rows={inspectorRows} preview={hover.preview} selected={selectedId ?? null} metric={metric} />
      </div><div className="source-details"><strong>Fontes e disponibilidade</strong><p>Malhas oficiais IBGE, referência Censo 2022. PIB e TSE não estão disponíveis neste modo. Renda somente quando publicada diretamente na fonte do nível selecionado.</p>{stats && <div data-testid="official-sources"><p>Referência estatística: 1º de agosto de 2022 · Dados do Universo.</p>{(['populacao', 'domicilios'] as const).map(f => { const source = stats.index.fontes[f]; const sector = nav.level === 'setor' || nav.level === 'bairro' || nav.level === 'distrito'; return <p key={f}>{metadadosMetrica(f).label}: {source.fonte} · {source.unidade} · {source.universo}. {sector ? <><a href={source.setorial.recibo.url}>{source.setorial.arquivo}</a> · variável {source.setorial.variavel} · edição {source.setorial.edicao} · <a href={source.setorial.dicionario.url}>Dicionário</a></> : <><a href={source.consolidado.recibo.url}>SIDRA tabela {source.consolidado.tabela}</a> · variável {source.consolidado.variavel} · edição consultada em {source.consolidado.recibo.downloaded_at.slice(0, 10)}</>}</p>; })}<p>Panorama nacional obtido diretamente dos consolidados oficiais; independe das cidades preparadas. {preparedMunicipalityNames}: somas setoriais conferidas contra os respectivos totais municipais SIDRA.</p></div>}
      {stats?.districtSummary&&<p data-testid="official-district-source">Vínculo setor–distrito: CD_DIST/NM_DIST do CSV básico e do DBF, códigos textuais e partição completa. Totais distritais de contagens são somas dos setores associados. <a href={stats.districtSummary.fonte_distritos.recibos.dicionario_malha.url}>Dicionário da malha</a>.</p>}
      {stats?.vinculoBairro && <p data-testid="official-neighborhood-source">Vínculo setor–bairro: CD_SETOR, CD_BAIRRO e NM_BAIRRO iguais no CSV básico 20260520 e no DBF setorial CD2022. <a href={stats.vinculoBairro.recibos.dicionario_malha.url}>Dicionário da malha, aba Setor</a>. Setores sem bairro mantidos em grupo explícito.</p>}
      {stats?.neighborhoodLookupUrl && <p><a href={stats.neighborhoodLookupUrl} target="_blank" rel="noreferrer">Consultar correspondência municipal setor–bairro e cobertura</a></p>}
      {stats && <p><a href={`${import.meta.env.BASE_URL}geo/official/statistics/brasil.json`} target="_blank" rel="noreferrer">Consultar tabelas, variáveis, edições e recibos dos indicadores</a></p>}
      <a href={`${import.meta.env.BASE_URL}geo/official/proveniencia.json`} target="_blank" rel="noreferrer">Consultar fontes, transformações e hashes da cartografia</a></div>
    </aside></main><footer className="page-footer"><span>MAPA BR / TERRITÓRIO EM PERSPECTIVA</span><span>Brasil → UF → Município → Bairro/Setor censitário</span></footer>
  </div>;
}
