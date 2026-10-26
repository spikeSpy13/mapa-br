import { describe, it, expect, vi } from 'vitest';
import { demographySchema, demographicMunicipalitySchema, neighborhoodLookupSchema } from '../types/demography';
import { DataLoader } from './dataLoader';
import { loadOfficialDemography, sectorName, sectorNeighborhood } from './officialDemography';
const value = (n: number) => ({ valor: n, status: 'divulgada' });
const indicators = { populacao: value(3), domicilios: value(5) };
const detail = { schema_version: 'demografia-1', tipo_dados: 'oficiais', referencia: '2022-08-01', cd_uf: '42', cd_mun: '4205407', indicadores: indicators,
  setores: { '420540705000001': indicators } };
describe('contrato parcial oficial', () => {
  it('preserva zero, ausência e sigilo sem fabricar renda', () => {
    expect(demographySchema.parse({ populacao: value(0), domicilios: { valor: null, status: 'sigilo' } }).populacao.valor).toBe(0);
    expect(() => demographySchema.parse({ populacao: { valor: 0, status: 'sigilo' }, domicilios: value(1) })).toThrow();
    expect(() => demographySchema.parse({ ...indicators, responsaveis_renda: 0 })).toThrow();
    expect(() => demographySchema.parse({ ...indicators, populacao: value(-1) })).toThrow();
  });
  it('rejeita inventário de outro município e totais que não reconciliam', () => {
    demographicMunicipalitySchema.parse(detail);
    expect(() => demographicMunicipalitySchema.parse({ ...detail, cd_mun: '4209102' })).toThrow();
    expect(() => demographicMunicipalitySchema.parse({ ...detail, indicadores: { ...indicators, populacao: value(4) } })).toThrow();
    expect(() => demographicMunicipalitySchema.parse({ ...detail, cd_mun: 4205407 })).toThrow();
  });
  it('usa os mesmos cache e resolução relativa e recusa joins incompatíveis', async () => {
    const receipt = { url: 'https://apisidra.ibge.gov.br/example', url_final: 'https://apisidra.ibge.gov.br/example', sha256_local: 'a'.repeat(64), bytes: 1, downloaded_at: '2026-10-26' };
    const source = { fonte: 'fixture de teste', referencia: '2022-08-01', unidade: 'Pessoas', universo: 'teste', consolidado: { tabela: '4714', variavel: '93', recibo: receipt }, setorial: { arquivo: 'teste.zip', variavel: 'v0001', edicao: '20260520', definicao: 'teste', recibo: receipt, dicionario: receipt } };
    const codes = '11 12 13 14 15 16 17 21 22 23 24 25 26 27 28 29 31 32 33 35 41 42 43 50 51 52 53'.split(' ');
    const index = { schema_version: 'demografia-1', tipo_dados: 'oficiais', referencia: '2022-08-01', fontes: { populacao: source, domicilios: source }, brasil: indicators, regioes: Object.fromEntries(['1','2','3','4','5'].map(c => [c, { nome: c, indicadores: indicators }])), ufs: Object.fromEntries(codes.map(c => [c, indicators])), arquivos_uf: { '42': 'uf/42.json' } };
    const root = 'https://local.test/prefix/geo/official/';
    const files: Record<string, unknown> = { 'statistics/brasil.json': index,
      'statistics/uf/42.json': { schema_version: 'demografia-1', tipo_dados: 'oficiais', referencia: '2022-08-01', cd_uf: '42', municipios: { '4205407': indicators }, arquivos_municipio: { '4205407': '../municipios/42/4205407.json' } },
      'statistics/municipios/42/4205407.json': detail };
    const fetcher = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(files[String(url).slice(root.length)])));
    const loader = new DataLoader(root + 'catalogo.json', fetcher as typeof fetch);
    const geo = { collection: { type: 'FeatureCollection' as const, features: [] }, field: 'cd_uf', rowByFeature: new Map<string, string>() };
    const signal = new AbortController().signal;
    await loadOfficialDemography(loader, 'statistics/brasil.json', { level: 'pais' }, geo, signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const nav = { level: 'municipio' as const, cd_uf: '42', cd_mun: '4205407' };
    const sectors = { ...geo, field: 'cd_setor', collection: { ...geo.collection, features: [{ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [] }, properties: { cd_setor: '420540705000001' } }] } };
    const loaded = await loadOfficialDemography(loader, 'statistics/brasil.json', nav, sectors, signal);
    expect(loaded.status).toBe('disponiveis'); expect(fetcher).toHaveBeenCalledTimes(3);
    await loadOfficialDemography(loader, 'statistics/brasil.json', nav, sectors, signal); expect(fetcher).toHaveBeenCalledTimes(3);
    const unavailable = await loadOfficialDemography(loader, 'statistics/brasil.json', { level: 'municipio', cd_uf: '35', cd_mun: '3550308' }, { ...geo, field: 'cd_mun' }, signal);
    expect(unavailable.status === 'disponiveis' && unavailable.summary).toBeUndefined();
    await expect(loadOfficialDemography(loader, 'statistics/brasil.json', nav, { ...sectors, collection: { ...sectors.collection, features: [] } }, signal)).rejects.toThrow(/Inventários/);
    const membership = { metodo: 'atributos_oficiais_csv_dbf', campos: ['CD_SETOR', 'CD_BAIRRO', 'NM_BAIRRO'], membro_dbf: 'test.dbf', recibos: { basico: receipt, setores_sc: receipt, dicionario_malha: receipt } };
    files['statistics/municipios/42/4205407.json'] = { ...detail, arquivo_vinculo_bairro: '4205407.bairros.json', vinculo_bairro: membership, bairros: { 'bairro:4205407001': { cd_bairro: '4205407001', nome: 'Centro', cd_setores: ['420540705000001'], indicadores: indicators } } };
    const lookup = { schema_version: 'vinculo-bairro-1', cd_mun: '4205407', referencia_territorial: 'Censo 2022', fonte: membership, bairros: { '4205407001': 'Centro' }, setores: { '420540705000001': '4205407001' }, cobertura: { total_setores: 1, com_bairro: 1, sem_bairro: 0, bairros: 1 } };
    files['statistics/municipios/42/4205407.bairros.json'] = lookup;
    neighborhoodLookupSchema.parse(lookup);
    expect(() => neighborhoodLookupSchema.parse({ ...lookup, cobertura: { ...lookup.cobertura, sem_bairro: 1 } })).toThrow();
    loader.clear(); fetcher.mockClear();
    const named = await loadOfficialDemography(loader, 'statistics/brasil.json', nav, sectors, signal);
    if (named.status !== 'disponiveis') throw new Error('Estatísticas não carregadas');
    expect(sectorName(named, '420540705000001')).toBe('Centro — Setor 420540705000001');
    expect(sectorNeighborhood(named, '420540705000001')?.id).toBe('bairro:4205407001');
    expect(named.neighborhoodLookupUrl).toBe(root + 'statistics/municipios/42/4205407.bairros.json');
    expect(sectorName(undefined, '420540705000001')).toBe('Bairro não identificado na fonte — Setor 420540705000001');
    expect(fetcher).toHaveBeenCalledTimes(4);
    await loadOfficialDemography(loader, 'statistics/brasil.json', nav, sectors, signal);
    const neighborhood = await loadOfficialDemography(loader, 'statistics/brasil.json', { ...nav, level: 'bairro', id_agregacao: 'bairro:4205407001' }, sectors, signal);
    expect(neighborhood.status === 'disponiveis' && neighborhood.rows['420540705000001']).toEqual(indicators);
    expect(neighborhood.status === 'disponiveis' && neighborhood.rows['bairro:4205407001']).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(4);
    files['statistics/municipios/42/4205407.bairros.json'] = { ...lookup, bairros: { '4205407002': 'Outro' }, setores: { '420540705000001': '4205407002' } };
    loader.clear();
    await expect(loadOfficialDemography(loader, 'statistics/brasil.json', nav, sectors, signal)).rejects.toThrow(/Correspondência municipal diverge/);

  });
});

it('bairros exigem partição integral, vínculo auditado e totais reconciliados sem fabricar renda', () => {
  const receipt = { url: 'https://ftp.ibge.gov.br/test.zip', url_final: 'https://ftp.ibge.gov.br/test.zip', sha256_local: 'a'.repeat(64), bytes: 1, downloaded_at: '2026-10-26' };
  const vinculo = { metodo: 'atributos_oficiais_csv_dbf', campos: ['CD_SETOR', 'CD_BAIRRO', 'NM_BAIRRO'], membro_dbf: 'test.dbf', recibos: { basico: receipt, setores_sc: receipt, dicionario_malha: receipt } };
  const group = { cd_bairro: '4205407001', nome: 'Centro', cd_setores: ['420540705000001'], indicadores: indicators };
  const grouped = { ...detail, bairros: { 'bairro:4205407001': group }, vinculo_bairro: vinculo };
  demographicMunicipalitySchema.parse(grouped);
  expect(() => demographicMunicipalitySchema.parse({ ...grouped, vinculo_bairro: undefined })).toThrow();
  expect(() => demographicMunicipalitySchema.parse({ ...grouped, bairros: {} })).toThrow();
  expect(() => demographicMunicipalitySchema.parse({ ...grouped, bairros: { ...grouped.bairros, 'sem_bairro:4205407': { ...group, cd_bairro: null } } })).toThrow();
  expect(() => demographicMunicipalitySchema.parse({ ...grouped, bairros: { 'bairro:4205407001': { ...group, indicadores: { ...indicators, populacao: value(4) } } } })).toThrow();
  expect(() => demographicMunicipalitySchema.parse({ ...grouped, bairros: { 'bairro:4205407001': { ...group, cd_setores: ['420540705000002'] } } })).toThrow();
});
