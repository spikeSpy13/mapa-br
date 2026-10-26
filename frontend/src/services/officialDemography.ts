import { DataHttpError, type DataLoader } from './dataLoader';
import { buildSectorToGroupMap } from './sectorJoin';
import type { Navigation } from '../state/navigation';
import type { MapGeometry } from '../types/geometry';
import { demographicIndexSchema, demographicUfSchema, demographicMunicipalitySchema, neighborhoodLookupSchema, type NeighborhoodCoverage, type DemographicIndex, type Demography, type OfficialNeighborhood, type NeighborhoodSource } from '../types/demography';
export type OfficialStatistics = { status: 'indisponiveis' } | {
  status: 'disponiveis'; index: DemographicIndex; summary?: Demography; rows: Record<string, Demography>; bairros?: Record<string, OfficialNeighborhood>; vinculoBairro?: NeighborhoodSource; setores?: Record<string, Demography>; unavailableStatistics?: string; neighborhoodBySector?: ReadonlyMap<string, string>; coverage?: NeighborhoodCoverage; neighborhoodLookupUrl?: string;
};
export const UNKNOWN_NEIGHBORHOOD = 'Bairro não identificado na fonte';
export function neighborhoodName(group?: OfficialNeighborhood) { return group?.cd_bairro ? group.nome : UNKNOWN_NEIGHBORHOOD; }
export function sectorNeighborhood(stats: Extract<OfficialStatistics, { status: 'disponiveis' }> | undefined, code: string) {
  const id = stats?.neighborhoodBySector?.get(code), group = id ? stats?.bairros?.[id] : undefined;
  return id && group ? { id, group } : undefined;
}
export function sectorName(stats: Extract<OfficialStatistics, { status: 'disponiveis' }> | undefined, code: string) {
  return `${neighborhoodName(sectorNeighborhood(stats, code)?.group)} — Setor ${code}`;
}
/** Usa exclusivamente o transporte/cache/cancelamento compartilhado do DataLoader. */
export async function loadOfficialDemography(loader: DataLoader, path: string | undefined, nav: Navigation, geo: MapGeometry, signal: AbortSignal): Promise<OfficialStatistics> {
  if (!path) return { status: 'indisponiveis' };
  const url = loader.resolve(path, loader.indexUrl);
  const index = demographicIndexSchema.parse(await loader.request(url, signal, raw => demographicIndexSchema.parse(raw)));
  let summary: Demography | undefined = nav.level === 'pais' ? index.brasil : nav.level === 'regiao' ? index.regioes[nav.cd_regiao]?.indicadores : nav.level === 'uf' ? index.ufs[nav.cd_uf] : undefined;
  let neighborhoodBySector: ReadonlyMap<string, string> | undefined, coverage: NeighborhoodCoverage | undefined;
  let neighborhoodLookupUrl: string | undefined;
  let bairros: Record<string, OfficialNeighborhood> | undefined, vinculoBairro: NeighborhoodSource | undefined, setores: Record<string, Demography> | undefined;
  let rows: Record<string, Demography> = geo.field === 'cd_uf' ? index.ufs : {};
  if ('cd_uf' in nav && index.arquivos_uf[nav.cd_uf]) {
    const ufUrl = loader.resolve(index.arquivos_uf[nav.cd_uf]!, url);
    let uf;
    try { uf = demographicUfSchema.parse(await loader.request(ufUrl, signal, raw => demographicUfSchema.parse(raw))); }
    catch (error) {
      if (nav.level !== 'uf' || !(error instanceof DataHttpError) || error.status !== 404) throw error;
      return { status: 'disponiveis', index, summary, rows: geo.field === 'cd_uf' ? index.ufs : {}, unavailableStatistics: 'Indicadores municipais indisponíveis localmente. O resumo da UF vem diretamente do SIDRA e foi preservado.' };
    }
    if (uf.cd_uf !== nav.cd_uf) throw new Error('Estatísticas de outra UF.');
    if (geo.field === 'cd_mun') rows = uf.municipios;
    if ('cd_mun' in nav) {
      summary = nav.level === 'municipio' ? uf.municipios[nav.cd_mun] : undefined;
      const detail = uf.arquivos_municipio[nav.cd_mun];
      if (detail) {
        const munUrl = loader.resolve(detail, ufUrl);
        const mun = demographicMunicipalitySchema.parse(await loader.request(munUrl, signal, raw => demographicMunicipalitySchema.parse(raw)));
        if (mun.cd_mun !== nav.cd_mun || mun.cd_uf !== nav.cd_uf || (['populacao', 'domicilios'] as const).some(f => mun.indicadores[f].valor !== uf.municipios[nav.cd_mun]?.[f].valor || mun.indicadores[f].status !== uf.municipios[nav.cd_mun]?.[f].status)) throw new Error('Resumo municipal incompatível com o detalhe.');
        const ids = geo.collection.features.map(f => f.properties?.cd_setor as string);
        if (geo.field !== 'cd_setor' || ids.length !== Object.keys(mun.setores).length || ids.some(c => !(c in mun.setores))) throw new Error('Inventários estatístico/cartográfico divergentes.');
        bairros = mun.bairros; vinculoBairro = mun.vinculo_bairro; setores = mun.setores;
        if (bairros) {
          neighborhoodBySector = buildSectorToGroupMap(Object.entries(bairros).map(([id_agregacao, b]) => ({ ...b, id_agregacao })));
          const known = Object.values(bairros).filter(b => b.cd_bairro !== null);
          coverage = { total_setores: neighborhoodBySector.size, com_bairro: known.reduce((sum, b) => sum + b.cd_setores.length, 0), sem_bairro: Object.values(bairros).filter(b => b.cd_bairro === null).reduce((sum, b) => sum + b.cd_setores.length, 0), bairros: known.length };
        }
        if (mun.arquivo_vinculo_bairro) {
          const lookupUrl = loader.resolve(mun.arquivo_vinculo_bairro, munUrl);
          const lookup = neighborhoodLookupSchema.parse(await loader.request(lookupUrl, signal, raw => neighborhoodLookupSchema.parse(raw)));
          if (lookup.cd_mun !== nav.cd_mun || Object.keys(lookup.setores).length !== neighborhoodBySector?.size ||
              Object.entries(lookup.setores).some(([code, bairro]) => { const group = bairros?.[neighborhoodBySector?.get(code) ?? '']; return !group || group.cd_bairro !== bairro || bairro !== null && group.nome !== lookup.bairros[bairro]; }) ||
              (['basico', 'setores_sc', 'dicionario_malha'] as const).some(k => lookup.fonte.recibos[k].sha256_local !== mun.vinculo_bairro?.recibos[k].sha256_local || lookup.fonte.recibos[k].url !== mun.vinculo_bairro?.recibos[k].url)) throw new Error('Correspondência municipal diverge dos bairros auditados.');
          coverage = lookup.cobertura;
          neighborhoodLookupUrl = lookupUrl;
        }
        rows = mun.setores;
        if (nav.level === 'bairro' && !bairros?.[nav.id_agregacao]) throw new Error('Bairro fora do inventário auditado ou correspondência não auditada.');
        summary = nav.level === 'setor' ? mun.setores[nav.cd_setor] : nav.level === 'bairro' ? bairros![nav.id_agregacao]!.indicadores : mun.indicadores;
      }
    }
  }
  return { status: 'disponiveis', index, summary, rows, bairros, vinculoBairro, setores, neighborhoodBySector, coverage, neighborhoodLookupUrl };
}
