import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { censusCellSchema, censusThemeSchema, type CensusCell } from '../types/censusThemes';
import { CENSUS_PROFILE, CENSUS_DEFINITIONS, censusMetricEntries } from '../lib/censusCatalog';
import { censusNumeric, censusRows, censusSummary, formatCensusPercent, formatCensusValue } from '../lib/censusValues';
import { CensusThemeValues } from '../components/CensusThemePanel';
import { loadOfficialTheme } from './officialDemography';
import { DataLoader } from './dataLoader';
import { createGeoStore } from '../store/useGeoStore';
import { metadadosMetrica } from '../lib/geoStats';
const cell = (n:number,d:number,p:string|null): CensusCell => ({ valor:n,status:'divulgada',denominador:d,status_denominador:'divulgada',percentual:p,motivo:null });
function fixture() {
 const receipt=(s:{url:string;sha256:string})=>({url:s.url,url_final:s.url,sha256_local:s.sha256,bytes:1,downloaded_at:'2026-10-27'});
 const fontes=Object.fromEntries([...Object.entries(CENSUS_PROFILE.arquivos).map(([k,s])=>[k,receipt(s)]),...Object.entries(CENSUS_PROFILE.consultas).map(([k,s])=>['sidra_'+k,receipt(s)])]);
 const r=Object.fromEntries(Object.entries(CENSUS_DEFINITIONS).filter(([,m])=>m.tema==='sexo_idade').map(([k])=>[k,cell(1,32,'3.12')]));
 const codes='11 12 13 14 15 16 17 21 22 23 24 25 26 27 28 29 31 32 33 35 41 42 43 50 51 52 53'.split(' ');
 return {schema_version:'censo-temas-1',referencia:'2022-08-01',tema:'sexo_idade',metricas:Object.keys(r),fontes,brasil:r,regioes:Object.fromEntries(['1','2','3','4','5'].map(c=>[c,r])),ufs:Object.fromEntries(codes.map(c=>[c,r])),municipios:{'4205407':r}};
}
describe('novos temas oficiais',()=>{
 it('distingue unidades, zero, sigilo, ausência, parcial e denominador zero com HALF_EVEN exato',()=>{
  for(const [n,d,p] of [[1,32,'3.12'],[3,32,'9.38'],[0,10,'0.00'],[0,0,null]] as const) expect(censusCellSchema.safeParse(cell(n,d,p)).success).toBe(true);
  expect(censusCellSchema.safeParse(cell(1,32,'3.13')).success).toBe(false);
  expect(censusCellSchema.safeParse(cell(12,10,'120.00')).success).toBe(false);
  const partial:CensusCell={...cell(3,12,null),status:'parcial',cobertura:{divulgados:1,esperados:3,sigilo:1,ausentes:1}};
  expect(censusCellSchema.safeParse(partial).success).toBe(true);
  expect(censusCellSchema.safeParse({...partial,percentual:'25.00'}).success).toBe(false);
  expect(censusNumeric(partial)).toBeNull();
  expect(formatCensusValue(partial)).toBe('≥ 3 (parcial)');
  expect(formatCensusValue(cell(0,0,null))).toBe('0');
  expect(formatCensusPercent(cell(0,0,null))).toBe('Indisponível');
  expect(formatCensusValue({...cell(0,0,null),valor:'10816.47',denominador:null,status_denominador:'ausente'})).toBe('R$ 10.816,47');
  expect(formatCensusValue({...partial,status:'sigilo',valor:null,cobertura:undefined})).toBe('Sob sigilo');
  expect(formatCensusValue(undefined)).toBe('Indisponível');
 });
 it('valida catálogo, edições, referências e tipos sem aceitar dinheiro como contagem',()=>{
  const f=fixture();censusThemeSchema.parse(f);
  expect(censusThemeSchema.safeParse({...f,referencia:'2010-08-01'}).success).toBe(false);
  expect(censusThemeSchema.safeParse({...f,fontes:{}}).success).toBe(false);
  const wrong=structuredClone(f);wrong.brasil.homens={...cell(1,32,'3.12'),valor:'1.00'} as unknown as CensusCell;
  expect(censusThemeSchema.safeParse(wrong).success).toBe(false);
  const outdated=structuredClone(f);outdated.fontes.demografia!.sha256_local='0'.repeat(64);
  expect(censusThemeSchema.safeParse(outdated).success).toBe(false);
 });
 it('carrega sob demanda pelo mesmo cache e mantém consolidados independentes de arquivos municipais',async()=>{
  const payload=fixture(),fetcher=vi.fn(async(_url: RequestInfo | URL)=>new Response(JSON.stringify(payload)));
  const loader=new DataLoader('https://local.test/prefix/geo/official/catalogo.json',fetcher as typeof fetch);
  const signal=new AbortController().signal;
  const data=await loadOfficialTheme(loader,undefined,'sexo_idade',signal);
  expect(fetcher.mock.calls[0]?.[0]).toContain('/statistics/temas/sexo_idade/brasil.json');
  await loadOfficialTheme(loader,undefined,'sexo_idade',signal);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(censusSummary(data,{level:'pais'})?.homens?.valor).toBe(1);
  expect(censusRows(data,'cd_uf')['42']?.homens?.valor).toBe(1);
  await expect(loadOfficialTheme(loader,undefined,'sexo_idade',signal,{ufs:['99'],setores:[]})).rejects.toThrow(/Inventário/);
 });
 it('isola cache, caminho e inventário temático por município sem fixar contagens',async()=>{
  const national=fixture(),record=national.brasil;
  const make=(code:string,id:string)=>({schema_version:national.schema_version,referencia:national.referencia,tema:national.tema,metricas:national.metricas,fontes:national.fontes,cd_mun:code,municipio:record,bairros:{[`sem_bairro:${code}`]:record},setores:{[id]:record}});
  const agudos=make('3500709','350070905000001'),bauru=make('3506003','350600305000002'),floripa=make('4205407','420540705000001');
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>new Response(JSON.stringify(String(url).includes('/3506003.json')?bauru:String(url).includes('/35/')?agudos:floripa)));
  const loader=new DataLoader('https://local.test/geo/official/catalogo.json',fetcher as typeof fetch),signal=new AbortController().signal;
  const ref=(id:string)=>({ufs:[],setores:[id]});
  const first=await loadOfficialTheme(loader,'3500709','sexo_idade',signal,ref('350070905000001'));
  const second=await loadOfficialTheme(loader,'4205407','sexo_idade',signal,ref('420540705000001'));
  expect(first&&'cd_mun' in first&&first.cd_mun).toBe('3500709');expect(second&&'cd_mun' in second&&second.cd_mun).toBe('4205407');
  const third=await loadOfficialTheme(loader,'3506003','sexo_idade',signal,ref('350600305000002'));expect(third&&'cd_mun' in third&&third.cd_mun).toBe('3506003');
  await loadOfficialTheme(loader,'3500709','sexo_idade',signal,ref('350070905000001'));
  await loadOfficialTheme(loader,'3506003','sexo_idade',signal,ref('350600305000002'));expect(fetcher).toHaveBeenCalledTimes(3);
  await expect(loadOfficialTheme(loader,'3500709','sexo_idade',signal,ref('350070905000002'))).rejects.toThrow(/Inventário/);
  await expect(loadOfficialTheme(loader,'3500709','sexo_idade',signal)).rejects.toThrow(/Inventário/);
  const sameUf=new DataLoader('https://local.test/geo/official/catalogo.json',vi.fn(async()=>new Response(JSON.stringify(agudos))) as typeof fetch);
  await expect(loadOfficialTheme(sameUf,'3506003','sexo_idade',signal,ref('350600305000002'))).rejects.toThrow(/outro município/);
  const wrong=new DataLoader('https://local.test/geo/official/catalogo.json',vi.fn(async()=>new Response(JSON.stringify(floripa))) as typeof fetch);
  await expect(loadOfficialTheme(wrong,'3500709','sexo_idade',signal,ref('350070905000001'))).rejects.toThrow(/outro município/);
 });
 it('registra somente os 25 indicadores comprovados e mostra rótulos e estados completos',()=>{
  const store=createGeoStore();
  for(const [metric] of censusMetricEntries){store.getState().setMetrica(metric);expect(metadadosMetrica(metric).oficial).toBe(true);}
  expect(censusMetricEntries).toHaveLength(25);
  expect(()=>store.getState().setMetrica('censo_inventado' as never)).toThrow();
  render(<CensusThemeValues theme="cor_raca" record={{raca_branca:cell(0,10,'0.00'),raca_preta:{...cell(0,10,null),valor:null,status:'sigilo'},raca_parda:{...cell(0,10,null),valor:null,status:'ausente'}}}/>);
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getAllByText('Sob sigilo').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Indisponível').length).toBeGreaterThan(0);
 });
});
