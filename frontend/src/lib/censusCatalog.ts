import profile from '../../../etl_pipeline/manifests/census_themes.json';
export type CensusMetric = `censo_${string}`;
export interface CensusDefinition {
  tema: string; rotulo: string; unidade: string; arquivo: string; variaveis: string[];
  consolidado?: {consulta:string;categorias:string[];denominador:string[]}|null; definicoes: Record<string,string>; universo: string; denominador: string; agregacao: string; nota: string;
}
export const CENSUS_DEFINITIONS: Record<string, CensusDefinition> = profile.metricas;
export const CENSUS_PROFILE = profile;
export const CENSUS_THEMES: Record<string,string> = { sexo_idade: 'Sexo e idade', cor_raca: 'Cor ou raça', alfabetizacao: 'Alfabetização · 15 anos ou mais', habitacao: 'Habitação', agua: 'Abastecimento de água', esgoto: 'Esgotamento sanitário', lixo: 'Destino do lixo', renda: 'Renda publicada' };
export function isCensusMetric(metric: unknown): metric is CensusMetric { return typeof metric === 'string' && metric.startsWith('censo_') && Object.hasOwn(CENSUS_DEFINITIONS, metric.slice(6)); }
export function censusDefinition(metric: string) { return isCensusMetric(metric) ? CENSUS_DEFINITIONS[metric.slice(6)] : undefined; }
export const censusMetricEntries = Object.entries(CENSUS_DEFINITIONS).map(([id, m]) => [`censo_${id}` as CensusMetric, {
  id: `censo_${id}` as CensusMetric, label: m.rotulo, unidade: m.unidade === 'BRL/mês' ? 'moeda' as const : 'inteiro' as const,
  disponivelEmBairro: true, descricao: `${m.nota} Referência Censo 2022; universo ${m.denominador}.`, oficial: true,
}] as const);

export const censusUniverseLabel = (key:string) => ({ populacao: 'população residente', pessoas_15_mais: 'pessoas de 15 anos ou mais', dppo: 'domicílios particulares permanentes ocupados', domicilios_permanentes: 'domicílios particulares permanentes (ocupados, vagos e uso ocasional)' } as Record<string,string>)[key] ?? key;
