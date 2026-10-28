import { z } from 'zod';
import { cdMunSchema, cdSetorSchema, cdUfSchema } from './contract';
import { CENSUS_DEFINITIONS, CENSUS_PROFILE } from '../lib/censusCatalog';
import { preparedMunicipality } from '../lib/preparedMunicipalities';
import { cdBairroSchema } from './contract';
import { roundRatioHalfEven } from '../lib/exactRatio';
const status = z.enum(['divulgada','ausente','sigilo','parcial']);
const count = z.number().int().nonnegative().safe();
const decimal = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/);
export const censusCellSchema = z.object({ valor: z.union([count, decimal, z.null()]), status,
  denominador: count.nullable(), status_denominador: z.enum(['divulgada','ausente','sigilo']), percentual: decimal.nullable(), motivo: z.string().nullable(),
  cobertura: z.object({ divulgados: count, esperados: count, sigilo: count, ausentes: count }).strict().optional(),
}).strict().superRefine((v, ctx) => {
  const bad = (s: string) => ctx.addIssue({ code:'custom', message:s });
  if ((v.status === 'divulgada' || v.status === 'parcial') !== (v.valor !== null)) bad('Estado e valor temático incompatíveis');
  if ((v.status_denominador === 'divulgada') !== (v.denominador !== null)) bad('Denominador incompatível');
  if (v.status === 'parcial' && (!v.cobertura || typeof v.valor !== 'number')) bad('Parcial exige subtotal inteiro e cobertura explícita');
  if (v.status === 'parcial' && v.cobertura && (v.cobertura.divulgados === 0 || v.cobertura.divulgados >= v.cobertura.esperados)) bad('Parcial exige observações divulgadas e faltantes');
  if (v.cobertura && (v.cobertura.divulgados + v.cobertura.sigilo + v.cobertura.ausentes !== v.cobertura.esperados || v.status === 'divulgada' && v.cobertura.divulgados !== v.cobertura.esperados)) bad('Cobertura temática inconsistente');
  let expected: string | null = null;
  if (v.status === 'divulgada' && typeof v.valor === 'number' && Number.isSafeInteger(v.valor) && v.valor >= 0 && v.denominador !== null && Number.isSafeInteger(v.denominador) && v.denominador > 0) {
    if (v.valor > v.denominador) bad('Contagem excede universo');
    const q = roundRatioHalfEven(BigInt(v.valor), BigInt(v.denominador), 10000n)!;
    expected = `${q / 100n}.${(q % 100n).toString().padStart(2,'0')}`;
  }
  if (v.percentual !== expected) bad('Percentual não corresponde ao numerador/denominador completo HALF_EVEN');
});
export type CensusCell = z.infer<typeof censusCellSchema>;
export type CensusRecord = Record<string,CensusCell>;
const record = z.record(censusCellSchema);
const receipt = z.object({ url:z.string().url(), url_final:z.string().url(), sha256_local:z.string().regex(/^[a-f0-9]{64}$/), bytes:count, downloaded_at:z.string() }).strict();
const common = { schema_version:z.literal('censo-temas-1'), referencia:z.literal('2022-08-01'), tema:z.string(), metricas:z.array(z.string()).min(1), fontes:z.record(receipt) };
const national = z.object({ ...common, brasil:record, regioes:z.record(z.string().regex(/^[1-5]$/),record), ufs:z.record(cdUfSchema,record), municipios:z.record(cdMunSchema,record) }).strict();
const municipal = z.object({ ...common, cd_mun:cdMunSchema, cd_distrito:z.string().regex(/^\d{9}$/).optional(), distritos:z.record(z.string().regex(/^\d{9}$/),record).optional(), municipio:record, bairros:z.record(record), setores:z.record(cdSetorSchema,record) }).strict();
export const censusThemeSchema = z.union([national,municipal]).superRefine((p,ctx) => {
  const bad = (message:string) => ctx.addIssue({ code:'custom', message });
  const expected = Object.entries(CENSUS_DEFINITIONS).filter(([, m]) => m.tema === p.tema).map(([id]) => id);
  if (!expected.length || new Set(p.metricas).size !== expected.length || expected.some(k => !p.metricas.includes(k))) bad('Catálogo temático divergente');
  const records = 'cd_mun' in p ? [p.municipio,...Object.values(p.bairros),...Object.values(p.setores),...Object.values(p.distritos??{})] : [p.brasil,...Object.values(p.regioes),...Object.values(p.ufs),...Object.values(p.municipios)];
  for (const r of records) {
    if (Object.keys(r).length !== expected.length || expected.some(k => !(k in r))) { bad('Indicadores do registro divergentes'); continue; }
    for (const [k,c] of Object.entries(r)) {
      if (c.valor !== null && (CENSUS_DEFINITIONS[k]?.unidade === 'BRL/mês' ? typeof c.valor !== 'string' : typeof c.valor !== 'number')) bad('Contagem e valor monetário não são intercambiáveis');
    }
  }
  if ('cd_mun' in p) {
    if (!preparedMunicipality(p.cd_mun) || (!Object.keys(p.setores).length && !Object.keys(p.distritos??{}).length) || Object.keys(p.setores).some(c => !c.startsWith(p.cd_mun)) || Object.keys(p.bairros).some(id => id !== `sem_bairro:${p.cd_mun}` && !(id.startsWith('bairro:') && cdBairroSchema.safeParse(id.slice(7)).success && id.slice(7).startsWith(p.cd_mun)))) bad('Inventário municipal temático incompatível');
    if(p.distritos&&(Object.keys(p.distritos).some(c=>!c.startsWith(p.cd_mun))||!preparedMunicipality(p.cd_mun)?.particionar_por_distrito))bad('Distritos temáticos incompatíveis');
    if(p.cd_distrito&&(!p.cd_distrito.startsWith(p.cd_mun)||Object.keys(p.distritos??{}).length!==1||!p.distritos?.[p.cd_distrito]||!Object.keys(p.setores).length))bad('Partição temática distrital incompatível');
    if(p.cd_distrito){
      for(const key of expected){
        if(CENSUS_DEFINITIONS[key]?.unidade==='BRL/mês')continue; // Média distrital publicada diretamente.
        const cells=Object.values(p.setores).map(r=>r[key]!);
        if(cells.some(c=>!c)){bad('Indicador setorial obrigatório ausente');continue;}
        if(cells.some(c=>c.status==='parcial'||c.cobertura!==undefined))bad('Observação setorial não pode conter agregado parcial');
        const known=cells.filter(c=>c.status==='divulgada');
        const state=known.length===cells.length?'divulgada':known.length?'parcial':cells.some(c=>c.status==='sigilo')?'sigilo':'ausente';
        const value=known.length?known.reduce((n,c)=>n+(c.valor as number),0):null;
        const ds=cells.some(c=>c.status_denominador==='sigilo')?'sigilo':cells.some(c=>c.status_denominador!=='divulgada')?'ausente':'divulgada';
        const denominator=ds==='divulgada'?cells.reduce((n,c)=>n+c.denominador!,0):null;
        const a=p.distritos?.[p.cd_distrito]?.[key];
        const coverage={divulgados:known.length,esperados:cells.length,sigilo:cells.filter(c=>c.status==='sigilo').length,ausentes:cells.filter(c=>c.status==='ausente').length};
        if(!a||a.status!==state||a.valor!==value||a.status_denominador!==ds||a.denominador!==denominator||!a.cobertura||Object.entries(coverage).some(([k,v])=>a.cobertura![k as keyof typeof coverage]!==v))bad('Agregado distrital diverge dos setores/denominadores/cobertura');
      }
    }
  } else if (Object.keys(p.ufs).length !== 27 || Object.keys(p.regioes).length !== 5) bad('Panorama nacional temático incompleto');
  const requiredSources = [...('cd_mun' in p ? Object.keys(CENSUS_PROFILE.arquivos) : []), ...Object.keys(CENSUS_PROFILE.consultas).map(k => `sidra_${k}`)];
  if (requiredSources.some(k => !(k in p.fontes))) bad('Proveniência temática incompleta');
  for (const [key, r] of Object.entries(p.fontes)) {
    const spec = key.startsWith('sidra_') ? (CENSUS_PROFILE.consultas as Record<string,{url:string;sha256:string}>)[key.slice(6)] : (CENSUS_PROFILE.arquivos as Record<string,{url:string;sha256:string}>)[key];
    if (!spec || spec.url !== r.url || spec.sha256 !== r.sha256_local) bad('Edição da fonte temática divergente');
  }
});
export type CensusTheme = z.infer<typeof censusThemeSchema>;
