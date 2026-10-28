import { formatarValorIndicador } from './geoStats';
import type { CensusCell, CensusRecord, CensusTheme } from '../types/censusThemes';
import type { Navigation } from '../state/navigation';
export function censusNumeric(c?: CensusCell) { return c?.status === 'divulgada' && c.valor !== null ? typeof c.valor === 'string' ? Number(c.valor) : c.valor : null; }
export function formatCensusValue(c?: CensusCell): string {
  if (!c || c.status === 'ausente') return 'Indisponível';
  if (c.status === 'sigilo') return 'Sob sigilo';
  if (c.status === 'parcial') return `≥ ${formatarValorIndicador(c.valor as number)} (parcial)`;
  if (typeof c.valor === 'string') { const [whole, fraction] = c.valor.split('.'); return `R$ ${BigInt(whole!).toLocaleString('pt-BR')},${fraction}`; }
  return formatarValorIndicador(c.valor);
}
export function formatCensusPercent(c?: CensusCell) {
  if (c?.percentual !== null && c?.percentual !== undefined) return `${c.percentual.replace('.',',')}%`;
  return c?.status === 'sigilo' || c?.status_denominador === 'sigilo' ? 'Sob sigilo' : c?.status === 'parcial' ? 'Indisponível (base incompleta)' : 'Indisponível';
}
export function censusSummary(data: CensusTheme | null | undefined, nav: Navigation): CensusRecord | undefined {
  if (!data) return undefined;
  if ('cd_mun' in data) return nav.level === 'setor' ? data.setores[nav.cd_setor] : nav.level === 'distrito' ? data.distritos?.[nav.cd_distrito] : nav.level === 'bairro' ? data.bairros[nav.id_agregacao] : data.municipio;
  return nav.level === 'pais' ? data.brasil : nav.level === 'regiao' ? data.regioes[nav.cd_regiao] : nav.level === 'uf' ? data.ufs[nav.cd_uf] : 'cd_mun' in nav ? data.municipios[nav.cd_mun] : undefined;
}
export function censusRows(data: CensusTheme | null | undefined, field?: string): Record<string,CensusRecord> {
  return !data ? {} : 'cd_mun' in data ? field === 'cd_distrito' ? data.distritos??{} : data.setores : field === 'cd_uf' ? data.ufs : field === 'cd_mun' ? data.municipios : {};
}
