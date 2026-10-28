import { districtMunicipalitySchema, districtDetailSchema, districtSectorIndexSchema, type DistrictMunicipality } from '../types/demography';
import { preparedMunicipality } from '../lib/preparedMunicipalities';
import { CENSUS_DEFINITIONS } from '../lib/censusCatalog';
import { censusThemeSchema } from '../types/censusThemes';
import { DataHttpError, type DataLoader } from './dataLoader';
import { buildSectorToGroupMap } from './sectorJoin';
import type { Navigation } from '../state/navigation';
import type { MapGeometry } from '../types/geometry';
import { demographicIndexSchema, demographicUfSchema, demographicMunicipalitySchema, neighborhoodLookupSchema, type NeighborhoodCoverage, type DemographicIndex, type Demography, type OfficialNeighborhood, type NeighborhoodSource } from '../types/demography';
export type OfficialStatistics = { status: 'indisponiveis' } | {
  status: 'disponiveis'; index: DemographicIndex; summary?: Demography; municipalitySummary?: Demography; rows: Record<string, Demography>; districtSummary?:DistrictMunicipality; districtSummaryUrl?:string; currentDistrict?:string; bairros?: Record<string, OfficialNeighborhood>; vinculoBairro?: NeighborhoodSource; setores?: Record<string, Demography>; unavailableStatistics?: string; neighborhoodBySector?: ReadonlyMap<string, string>; coverage?: NeighborhoodCoverage; neighborhoodLookupUrl?: string; territoriosSetores?: Record<string,{cd_distrito:string;nm_distrito:string;cd_subdistrito:string;nm_subdistrito:string|null}>;
};
export const UNKNOWN_NEIGHBORHOOD = 'Bairro não identificado na fonte';
export function neighborhoodName(group?: OfficialNeighborhood) { return group?.cd_bairro ? group.nome : UNKNOWN_NEIGHBORHOOD; }
export function sectorNeighborhood(stats: Extract<OfficialStatistics, { status: 'disponiveis' }> | undefined, code: string) {
  const id = stats?.neighborhoodBySector?.get(code), group = id ? stats?.bairros?.[id] : undefined;
  return id && group ? { id, group } : undefined;
}
export function sectorName(stats: Extract<OfficialStatistics, { status: 'disponiveis' }> | undefined, code: string) {
  const district = stats?.districtSummary && stats?.territoriosSetores?.[code];
  return `${district ? district.nm_distrito : neighborhoodName(sectorNeighborhood(stats, code)?.group)} — Setor ${code}`;
}
/** Usa exclusivamente o transporte/cache/cancelamento compartilhado do DataLoader. */
export async function loadOfficialDemography(loader: DataLoader, path: string | undefined, nav: Navigation, geo: MapGeometry, signal: AbortSignal): Promise<OfficialStatistics> {
  if (!path) return { status: 'indisponiveis' };
  const url = loader.resolve(path, loader.indexUrl);
  const index = demographicIndexSchema.parse(await loader.request(url, signal, raw => demographicIndexSchema.parse(raw)));
  let summary: Demography | undefined = nav.level === 'pais' ? index.brasil : nav.level === 'regiao' ? index.regioes[nav.cd_regiao]?.indicadores : nav.level === 'uf' ? index.ufs[nav.cd_uf] : undefined;
  let neighborhoodBySector: ReadonlyMap<string, string> | undefined, coverage: NeighborhoodCoverage | undefined;
  let neighborhoodLookupUrl: string | undefined;
  let municipalitySummary: Demography | undefined;
  let territoriosSetores: Extract<OfficialStatistics,{status:'disponiveis'}>['territoriosSetores'];
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
        if (preparedMunicipality(nav.cd_mun)?.particionar_por_distrito) {
          const districtSummary=districtMunicipalitySchema.parse(await loader.request(munUrl,signal,raw=>districtMunicipalitySchema.parse(raw)));
          if(districtSummary.cd_mun!==nav.cd_mun||districtSummary.cd_uf!==nav.cd_uf||(['populacao','domicilios'] as const).some(f=>districtSummary.indicadores[f].valor!==uf.municipios[nav.cd_mun]?.[f].valor))throw new Error('Resumo distrital de outro município');
          if(nav.level==='municipio'){
            const ids=geo.collection.features.map(f=>f.properties?.cd_distrito as string);
            if(geo.field!=='cd_distrito'||ids.length!==Object.keys(districtSummary.distritos).length||ids.some(c=>!(c in districtSummary.distritos)))throw new Error('Inventário de distritos/cartografia divergente');
            return {status:'disponiveis',index,summary:districtSummary.indicadores,municipalitySummary:districtSummary.indicadores,rows:Object.fromEntries(Object.entries(districtSummary.distritos).map(([c,d])=>[c,d.indicadores])),districtSummary,districtSummaryUrl:munUrl};
          }
          if(nav.level!=='distrito'&&nav.level!=='setor')throw new Error('Município usa distritos, não bairros');
          const code=nav.cd_distrito ?? await resolveSectorDistrict(loader,districtSummary,munUrl,nav.level==='setor'?nav.cd_setor:'',signal);
          const entry=districtSummary.distritos[code];if(!entry)throw new Error('Distrito fora do inventário');
          const part=districtDetailSchema.parse(await loader.request(loader.resolve(entry.arquivo_estatisticas,munUrl),signal,raw=>districtDetailSchema.parse(raw)));
          const ids=geo.collection.features.map(f=>f.properties?.cd_setor as string);
          if(part.cd_mun!==nav.cd_mun||part.cd_distrito!==code||geo.field!=='cd_setor'||ids.length!==entry.total_setores||Object.keys(part.setores).length!==ids.length||ids.some(c=>!(c in part.setores))||(['populacao','domicilios'] as const).some(f=>entry.indicadores[f].valor!==part.indicadores[f].valor))throw new Error('Partição distrital/cartografia divergente');
          const summary=nav.level==='setor'?part.setores[nav.cd_setor]:part.indicadores;if(!summary)throw new Error('Setor fora do distrito');
          return {status:'disponiveis',index,summary,municipalitySummary:districtSummary.indicadores,rows:part.setores,setores:part.setores,territoriosSetores:part.territorios_setores,districtSummary,districtSummaryUrl:munUrl,currentDistrict:code};
        }
        const mun = demographicMunicipalitySchema.parse(await loader.request(munUrl, signal, raw => demographicMunicipalitySchema.parse(raw)));
        if (mun.cd_mun !== nav.cd_mun || mun.cd_uf !== nav.cd_uf || (['populacao', 'domicilios'] as const).some(f => mun.indicadores[f].valor !== uf.municipios[nav.cd_mun]?.[f].valor || mun.indicadores[f].status !== uf.municipios[nav.cd_mun]?.[f].status)) throw new Error('Resumo municipal incompatível com o detalhe.');
        const ids = geo.collection.features.map(f => f.properties?.cd_setor as string);
        if (geo.field !== 'cd_setor' || ids.length !== Object.keys(mun.setores).length || ids.some(c => !(c in mun.setores))) throw new Error('Inventários estatístico/cartográfico divergentes.');
        municipalitySummary = mun.indicadores; territoriosSetores = mun.territorios_setores;
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
              Object.entries(lookup.fonte.recibos).some(([k,r]) => r?.sha256_local !== mun.vinculo_bairro?.recibos[k as keyof typeof lookup.fonte.recibos]?.sha256_local || r?.url !== mun.vinculo_bairro?.recibos[k as keyof typeof lookup.fonte.recibos]?.url)) throw new Error('Correspondência municipal diverge dos bairros auditados.');
          coverage = lookup.cobertura;
          neighborhoodLookupUrl = lookupUrl;
        }
        rows = mun.setores;
        if (nav.level === 'bairro' && !bairros?.[nav.id_agregacao]) throw new Error('Bairro fora do inventário auditado ou correspondência não auditada.');
        summary = nav.level === 'setor' ? mun.setores[nav.cd_setor] : nav.level === 'bairro' ? bairros![nav.id_agregacao]!.indicadores : mun.indicadores;
      }
    }
  }
  return { status: 'disponiveis', index, summary, municipalitySummary, rows, bairros, vinculoBairro, setores, neighborhoodBySector, coverage, neighborhoodLookupUrl, territoriosSetores };
}

/** Temas particionados: usa o mesmo DataLoader; só é chamado ao escolher um tema. */
export async function loadOfficialTheme(loader: DataLoader, municipality: string | undefined, theme: string, signal: AbortSignal, reference?: { ufs: readonly string[]; setores: readonly string[]; bairros?: Record<string, { cd_setores: string[] }>; distrito?:string; distritos?:string[]; setoresPorDistrito?:Record<string,number> }) {
  if (!Object.values(CENSUS_DEFINITIONS).some(m => m.tema === theme)) throw new Error('Tema desconhecido.');
  const config = preparedMunicipality(municipality);
  if (municipality && !config) return null;
  const path = `statistics/temas/${theme}/${config && municipality ? `municipios/${config.cd_uf}/${municipality}${reference?.distrito ? `/${reference.distrito}` : ''}.json` : 'brasil.json'}`;
  try {
    const data = censusThemeSchema.parse(await loader.request(loader.resolve(path, loader.indexUrl), signal, raw => censusThemeSchema.parse(raw)));
    if (data.tema !== theme) throw new Error('Resposta de outro tema.');
    if (municipality ? !('cd_mun' in data) || data.cd_mun !== municipality : 'cd_mun' in data) throw new Error('Resposta temática de outro município/nível.');
    if ('cd_mun' in data && (!data.distritos || data.cd_distrito) && !reference?.setores.length) throw new Error('Inventário cartográfico municipal obrigatório.');
    if (reference) {
      if ('cd_mun' in data) {
        if(data.cd_distrito!==reference.distrito)throw new Error('Resposta temática de outro distrito');
        if(data.distritos)for(const [code,record] of Object.entries(data.distritos)){const total=reference.setoresPorDistrito?.[code]??(data.cd_distrito===code?reference.setores.length:undefined);if(total===undefined||Object.entries(record).some(([key,c])=>CENSUS_DEFINITIONS[key]?.unidade!=='BRL/mês'&&c.cobertura?.esperados!==total))throw new Error('Cobertura temática/distrital divergente');}
        if(data.distritos && (Object.keys(data.distritos).length!==reference.distritos?.length||reference.distritos.some(c=>!(c in data.distritos!))))throw new Error('Inventário temático/distrital divergente');
        if (Object.keys(data.setores).length !== reference.setores.length || reference.setores.some(c => !(c in data.setores))) throw new Error('Inventário temático/cartográfico divergente.');
        if (reference.bairros && (Object.keys(data.bairros).length !== Object.keys(reference.bairros).length || Object.entries(reference.bairros).some(([id,b]) => !(id in data.bairros) || Object.values(data.bairros[id]!).some(c => c.cobertura && c.cobertura.esperados !== b.cd_setores.length)))) throw new Error('Partição temática de bairros divergente.');
      } else if (Object.keys(data.ufs).length !== reference.ufs.length || reference.ufs.some(c => !(c in data.ufs))) throw new Error('Inventário estadual temático divergente.');
    }
    return data;
  } catch (error) { if (error instanceof DataHttpError && error.status === 404) return null; throw error; }
}

/** Índice atributivo oficial: nunca resolve distrito pelo prefixo setorial. */
export async function resolveSectorDistrict(loader:DataLoader,summary:DistrictMunicipality,url:string,sector:string,signal:AbortSignal){
 const index=districtSectorIndexSchema.parse(await loader.request(loader.resolve(summary.arquivo_indice_setores,url),signal,raw=>districtSectorIndexSchema.parse(raw)));
 const counts:Record<string,number>={};for(const d of Object.values(index.setores))counts[d]=(counts[d]??0)+1;
 if(index.cd_mun!==summary.cd_mun||Object.keys(index.setores).length!==summary.total_setores||Object.keys(counts).length!==Object.keys(summary.distritos).length||Object.entries(summary.distritos).some(([c,d])=>counts[c]!==d.total_setores))throw new Error('Índice setorial/distrital divergente');
 const code=index.setores[sector];if(!code)throw new Error('Setor fora do inventário municipal');return code;
}
