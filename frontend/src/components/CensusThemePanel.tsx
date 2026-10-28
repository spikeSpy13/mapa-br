import { censusUniverseLabel, CENSUS_DEFINITIONS, CENSUS_THEMES, CENSUS_PROFILE } from '../lib/censusCatalog';
import { formatCensusValue, formatCensusPercent } from '../lib/censusValues';
import { formatarValorIndicador as format } from '../lib/geoStats';
import type { Navigation } from '../state/navigation';
import type { CensusRecord } from '../types/censusThemes';
export function CensusThemeValues({ record, theme }: { record?: CensusRecord; theme:string }) {
  return <dl className="census-theme-values">{Object.entries(CENSUS_DEFINITIONS).filter(([,m]) => m.tema === theme).map(([id,m]) => <div key={id} data-census-id={id}>
    <dt>{m.rotulo}</dt><dd data-census-value>{formatCensusValue(record?.[id])}</dd>
    {m.unidade !== 'BRL/mês' && <dd className="muted" data-census-percent>{formatCensusPercent(record?.[id])} · denominador: {record?.[id]?.denominador == null ? 'indisponível' : format(record[id]!.denominador)}</dd>}
    {m.unidade === 'BRL/mês' && record?.[id]?.status === 'divulgada' && <dd className="muted">Valor publicado diretamente para este nível, sem agregação de médias.</dd>}
    {record?.[id]?.cobertura && <dd className="muted">{record[id]!.cobertura!.divulgados}/{record[id]!.cobertura!.esperados} setores com contagem divulgada; {record[id]!.cobertura!.sigilo} sob sigilo, {record[id]!.cobertura!.ausentes} ausentes.</dd>}
    {record?.[id]?.motivo && <dd className="muted">{record[id]!.motivo}</dd>}
  </div>)}</dl>;
}
export function CensusThemePanel({ record, theme, loading, error, level }: { level:Navigation['level']; record?:CensusRecord; theme:string; loading:boolean; error?:string }) {
  const metrics = Object.entries(CENSUS_DEFINITIONS).filter(([,m]) => m.tema === theme);
  return <section className="census-theme-panel" aria-label={`Censo 2022 · ${CENSUS_THEMES[theme]}`}>
    <h3>{CENSUS_THEMES[theme]} · Censo 2022</h3><p className="muted">Referência: 1º de agosto de 2022 · unidade: {metrics[0]?.[1].unidade}.</p>
    {loading ? <p role="status">Carregando o tema selecionado…</p> : error ? <p role="alert">{error}</p> : <CensusThemeValues record={record} theme={theme} />}
    {!loading && !error && !record && <p role="status">Tema indisponível neste território ou arquivo ainda não preparado.</p>}
    <details className="source-details"><summary>Definições, universos e fontes do tema</summary>{metrics.map(([id,m]) => {
      const published = level !== 'bairro' && level !== 'distrito' && level !== 'setor';
      const sourceKey = m.unidade === 'BRL/mês' ? level === 'distrito' ? 'renda_distrito' : level === 'bairro' ? 'renda_bairro' : level === 'municipio' ? 'renda_municipio' : 'renda_setor' : m.arquivo;
      const f = (CENSUS_PROFILE.arquivos as Record<string,{url:string;arquivo:string;edicao:string}>)[sourceKey]!;
      const q = m.consolidado ? (CENSUS_PROFILE.consultas as Record<string,{url:string;tabela:string;variavel:string}>)[m.consolidado.consulta] : undefined;
      const moneyUnavailable = m.unidade === 'BRL/mês' && !['municipio','distrito','bairro','setor'].includes(level);
      return <div key={id}><strong>{m.rotulo}</strong><p>Unidade: {m.unidade}. Universo: {m.universo}. Denominador: {censusUniverseLabel(m.denominador)}. {m.nota}</p>
        {moneyUnavailable ? <p>Consolidado compatível não preparado neste nível. Não somar nem ponderar médias sem massa/denominador do mesmo universo.</p> : published && q ? <p><a href={q.url}>SIDRA · tabela {q.tabela}</a> · variável {q.variavel} · ano 2022 · categorias {m.consolidado!.categorias.join(' + ')}. Consolidado oficial direto, independente dos setores preparados.</p> : <p><a href={f.url}>{f.arquivo}</a> · edição {f.edicao}. {m.variaveis.join(' + ')}: {Object.values(m.definicoes).join('; ')}.</p>}
        <p>{m.unidade === 'BRL/mês' ? 'Média publicada diretamente no nível da fonte. Não agregamos médias setoriais para bairros/distritos; sem massa/denominador compatível.' : published ? 'Contagem consolidada oficial; não é a soma do recorte setorial preparado.' : 'Bairros/distritos: soma de contagens compatíveis; percentuais sobre a soma dos denominadores. Subtotais parciais não recebem percentuais.'}</p></div>;
    })}<p><a href={CENSUS_PROFILE.arquivos.dicionario.url}>Dicionário oficial</a> · <a href={CENSUS_PROFILE.errata.url}>Errata de 21/10/2026: V00003</a></p></details>
  </section>;
}
