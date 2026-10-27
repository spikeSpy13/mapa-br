import { useMemo } from 'react';
import { CensusThemeValues } from './CensusThemePanel';
import { CENSUS_DEFINITIONS } from '../lib/censusCatalog';
import { censusNumeric, formatCensusValue, formatCensusPercent } from '../lib/censusValues';
import type { CensusRecord } from '../types/censusThemes';
import { neighborhoodName } from '../services/officialDemography';
import { METRICAS_CATALOGO, formatarMedidaDemografica as display, formatarPercentualExato as percent, formatarValorIndicador as format } from '../lib/geoStats';
import type { DemographicMetric, Demography, OfficialNeighborhood, NeighborhoodCoverage } from '../types/demography';

type Entry = [string, OfficialNeighborhood];
interface Props {
  groups: Record<string, OfficialNeighborhood>; municipality: Demography; coverage?: NeighborhoodCoverage;
  visibleIds: ReadonlySet<string>; metric: DemographicMetric; setMetric: (metric: DemographicMetric) => void;
  thematic?: { key: string; theme: string; bairros: Record<string,CensusRecord> };
  selected: readonly string[]; add: (id: string) => void; remove: (id: string) => void; clear: () => void;
  open: (id: string) => void; sourceUrl: string;
}
export function rankNeighborhoods(entries: Entry[], metric: DemographicMetric, value?: (id:string,b:OfficialNeighborhood) => number | null) {
  return entries.filter(([, b]) => b.cd_bairro !== null).sort(([aid, a], [bid, b]) => {
    const x = value ? value(aid,a) : a.indicadores[metric].valor, y = value ? value(bid,b) : b.indicadores[metric].valor;
    return (x === null ? y === null ? 0 : 1 : y === null ? -1 : y - x) || a.nome.localeCompare(b.nome, 'pt-BR') || a.cd_bairro!.localeCompare(b.cd_bairro!);
  });
}
function Values({ group }: { group: OfficialNeighborhood }) {
  return <dl className="comparison-values">
    <dt>População</dt><dd data-value="populacao">{display(group.indicadores.populacao)}</dd>
    <dt>Participação na população municipal</dt><dd data-share="populacao">{percent(group.participacao_municipal?.populacao)}</dd>
    <dt>Domicílios</dt><dd data-value="domicilios">{display(group.indicadores.domicilios)}</dd>
    <dt>Participação nos domicílios municipais</dt><dd data-share="domicilios">{percent(group.participacao_municipal?.domicilios)}</dd>
    <dt>{group.cd_bairro ? 'Setores associados' : 'Setores sem vínculo'}</dt><dd data-value="setores">{format(group.cd_setores.length)}</dd>
  </dl>;
}
export function NeighborhoodComparison({ groups, municipality, coverage, visibleIds, metric, setMetric, selected, add, remove, clear, open, sourceUrl, thematic }: Props) {
  const entries = useMemo(() => Object.entries(groups), [groups]);
  const thematicDefinition = thematic ? CENSUS_DEFINITIONS[thematic.key] : undefined;
  const numberFor = (id:string, b:OfficialNeighborhood) => thematic ? censusNumeric(thematic.bairros[id]?.[thematic.key]) : b.indicadores[metric].valor;
  const ranked = useMemo(() => rankNeighborhoods(entries, metric, numberFor), [entries, metric, thematic]);
  const max = Math.max(0, ...entries.map(([id, b]) => numberFor(id,b) ?? 0));
  const visible = ranked.filter(([id]) => visibleIds.has(id));
  const unknown = entries.filter(([, b]) => b.cd_bairro === null);
  return <section className="neighborhood-comparison" aria-label="Comparação entre bairros">
    <div className="comparison-heading"><h3>Comparar bairros</h3><button className="neighborhood-action" disabled={!selected.length} onClick={clear}>Limpar comparação</button></div>
    <p role="status" className="muted">{selected.length} de 3 bairros selecionados. {selected.length === 3 ? 'Limite atingido: remova um bairro para adicionar outro.' : 'Marque os bairros no ranking para comparar.'}</p>
    <p className="muted" data-testid="comparison-denominator">Total municipal completo: {display(municipality.populacao)} pessoas e {display(municipality.domicilios)} domicílios, incluindo os setores sem bairro identificado.</p>
    {coverage && <p className="muted">Associação territorial: {format(coverage.com_bairro)} de {format(coverage.total_setores)} setores. Essa cobertura por setores é diferente da participação na população ou nos domicílios.</p>}
    {!!selected.length && <div className="comparison-cards" data-testid="comparison-cards">{selected.map(id => {
      const b = groups[id];
      return b?.cd_bairro ? <article className="comparison-card" key={id} data-comparison-id={id} aria-label={`Comparação de ${b.nome}`}>
        <h4>{b.nome}</h4><small>Código IBGE {b.cd_bairro}</small><Values group={b} />{thematic && <CensusThemeValues record={thematic.bairros[id]} theme={thematic.theme} />}
        <button className="neighborhood-action" onClick={() => remove(id)} aria-label={`Remover ${b.nome} da comparação`}>Remover</button>
      </article> : null;
    })}</div>}
    <section className="official-neighborhoods" data-testid="official-neighborhoods" aria-labelledby="official-neighborhoods-title">
      <h4 id="official-neighborhoods-title">Bairros de Florianópolis</h4>
      <label className="ranking-metric">Indicador do ranking <select aria-label="Indicador do ranking" value={thematic ? `censo_${thematic.key}` : metric} onChange={e => { if (!e.target.value.startsWith('censo_')) setMetric(e.target.value as DemographicMetric); }}>
        <option value="populacao">População</option><option value="domicilios">Domicílios</option>{thematic && <option value={`censo_${thematic.key}`}>{thematicDefinition?.rotulo}</option>}
      </select></label>
      <p className="muted">Ordem decrescente, desempate pelo nome. Abra um bairro para destacar seus setores. Bairros e distritos são recortes distintos.</p>
      <p className="muted" data-testid="ranking-scale">Escala comum: 0 a {format(max, thematicDefinition?.unidade === 'BRL/mês' ? 'renda_media_responsavel' : metric)} {thematicDefinition?.unidade ?? (metric === 'populacao' ? 'pessoas' : 'domicílios')}. Valores parciais/indisponíveis ficam ao final, sem barra proporcional.</p>
      <ol className="ranking-rows neighborhood-ranking" aria-label={`Ranking por ${(thematicDefinition?.rotulo ?? METRICAS_CATALOGO[metric].label).toLocaleLowerCase('pt-BR')}`}>{visible.map(([id, b]) => {
        const checked = selected.includes(id), value = numberFor(id,b);
        return <li key={id} data-ranking-id={id} className="neighborhood-rank-item">
          <button className="ranking-row" data-group-id={id} aria-label={`Selecionar bairro ${b.nome}`} onClick={() => open(id)}>
            <span className="rank-name"><strong>{b.nome}</strong><small>{b.cd_bairro} · {format(b.cd_setores.length)} setores</small>
              <span className="neighborhood-bar" aria-hidden="true"><i style={{ width: `${value !== null && max > 0 ? value / max * 100 : 0}%` }} /></span>
            </span><span className="neighborhood-rank-value"><strong>{thematic ? formatCensusValue(thematic.bairros[id]?.[thematic.key]) : display(b.indicadores[metric])}</strong><small>{thematicDefinition?.unidade === 'BRL/mês' ? 'Valor publicado diretamente' : thematic ? `${formatCensusPercent(thematic.bairros[id]?.[thematic.key])} do universo` : b.participacao_municipal?.[metric].status === 'divulgada' ? `${percent(b.participacao_municipal[metric])} do município` : `Participação: ${percent(b.participacao_municipal?.[metric])}`}</small></span>
          </button>
          <label className="compare-toggle"><input type="checkbox" aria-label={`Comparar ${b.nome}`} checked={checked} disabled={!checked && selected.length >= 3} onChange={() => checked ? remove(id) : add(id)} />Comparar</label>
        </li>;
      })}</ol>
      {!visible.length && <p role="status">Nenhum bairro encontrado para a busca.</p>}
    </section>
    {unknown.map(([id, b]) => <section className="unidentified-neighborhood" aria-label="Setores sem bairro identificado" key={id}>
      <h4>{neighborhoodName(b)}</h4><p className="muted">Fora do ranking de bairros oficiais. Seus valores integram o total municipal usado nas participações.</p>
      <Values group={b} />{thematic && <CensusThemeValues record={thematic.bairros[id]} theme={thematic.theme} />}<button className="neighborhood-action" data-group-id={id} onClick={() => open(id)}>Abrir setores sem bairro identificado</button>
    </section>)}
    <p className="muted">População e domicílios: <a href={sourceUrl}>IBGE · Censo 2022</a> · referência 1º de agosto de 2022 · básico rev. 20260520, v0001/v0002. Totais dos bairros derivados dos setores associados oficialmente. Domicílios físicos de todas as espécies.</p>
    <p className="muted">Percentuais arredondados individualmente; a soma pode diferir de 100,00%.</p>
    {entries.some(([, b]) => !b.participacao_municipal) && <p className="muted">Percentuais não disponíveis no arquivo municipal carregado.</p>}
  </section>;
}
