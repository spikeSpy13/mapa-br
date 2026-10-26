import { z } from 'zod';
import { cdMunSchema, cdSetorSchema, cdUfSchema, cdBairroSchema } from './contract';
/** Contrato parcial explícito: não é um payload estatístico 2.0 com renda fictícia. */
export const measureSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('divulgada'), valor: z.number().int().nonnegative().safe() }).strict(),
  z.object({ status: z.literal('ausente'), valor: z.null() }).strict(),
  z.object({ status: z.literal('sigilo'), valor: z.null() }).strict(),
]);
export const demographySchema = z.object({ populacao: measureSchema, domicilios: measureSchema }).strict();
export type Demography = z.infer<typeof demographySchema>;
export type DemographicMetric = keyof Demography;
const receipt = z.object({ url: z.string().url(), url_final: z.string().url(), sha256_local: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive(), downloaded_at: z.string() }).strict();
const source = z.object({ fonte: z.string(), referencia: z.literal('2022-08-01'), unidade: z.string(), universo: z.string(),
  consolidado: z.object({ tabela: z.string(), variavel: z.string(), recibo: receipt }).strict(),
  setorial: z.object({ arquivo: z.string(), variavel: z.string(), edicao: z.string(), definicao: z.string(), recibo: receipt, dicionario: receipt }).strict(),
}).strict();
const metadata = { schema_version: z.literal('demografia-1'), tipo_dados: z.literal('oficiais'), referencia: z.literal('2022-08-01') };
export const demographicIndexSchema = z.object({ ...metadata, fontes: z.object({ populacao: source, domicilios: source }).strict(),
  brasil: demographySchema, regioes: z.record(z.string().regex(/^[1-5]$/), z.object({ nome: z.string(), indicadores: demographySchema }).strict()),
  ufs: z.record(cdUfSchema, demographySchema), arquivos_uf: z.record(cdUfSchema, z.string().min(1)),
}).strict().superRefine((p, ctx) => {
  const codes = '11 12 13 14 15 16 17 21 22 23 24 25 26 27 28 29 31 32 33 35 41 42 43 50 51 52 53'.split(' ');
  if (codes.some(c => !(c in p.ufs)) || Object.keys(p.ufs).length !== 27 || Object.keys(p.regioes).length !== 5) ctx.addIssue({ code: 'custom', message: 'Panorama oficial incompleto' });
});
export type DemographicIndex = z.infer<typeof demographicIndexSchema>;
export const demographicUfSchema = z.object({ ...metadata, cd_uf: cdUfSchema, municipios: z.record(cdMunSchema, demographySchema), arquivos_municipio: z.record(cdMunSchema, z.string().min(1)) }).strict()
  .superRefine((p, ctx) => { if (Object.keys(p.municipios).some(c => !c.startsWith(p.cd_uf)) || Object.keys(p.arquivos_municipio).some(c => !(c in p.municipios))) ctx.addIssue({ code: 'custom', message: 'Municípios incompatíveis com a UF' }); });
const neighborhoodSchema = z.object({ cd_bairro: cdBairroSchema.nullable(), nome: z.string().min(1), cd_setores: z.array(cdSetorSchema).min(1), indicadores: demographySchema }).strict();
export type OfficialNeighborhood = z.infer<typeof neighborhoodSchema>;
const neighborhoodSource = z.object({ metodo: z.literal('atributos_oficiais_csv_dbf'), campos: z.tuple([z.literal('CD_SETOR'), z.literal('CD_BAIRRO'), z.literal('NM_BAIRRO')]), membro_dbf: z.string().min(1), recibos: z.object({ basico: receipt, setores_sc: receipt, dicionario_malha: receipt }).strict() }).strict();
export type NeighborhoodSource = z.infer<typeof neighborhoodSource>;
export const demographicMunicipalitySchema = z.object({ ...metadata, cd_uf: cdUfSchema, cd_mun: cdMunSchema, indicadores: demographySchema, setores: z.record(cdSetorSchema, demographySchema), bairros: z.record(z.string(), neighborhoodSchema).optional(), vinculo_bairro: neighborhoodSource.optional() }).strict()
  .superRefine((p, ctx) => {
    if (!p.cd_mun.startsWith(p.cd_uf) || !Object.keys(p.setores).length || Object.keys(p.setores).some(c => !c.startsWith(p.cd_mun))) ctx.addIssue({ code: 'custom', message: 'Inventário setorial incompatível' });
    if (!!p.bairros !== !!p.vinculo_bairro) ctx.addIssue({ code: 'custom', message: 'Bairros sem proveniência do vínculo' });
    if (p.bairros) {
      const seen = new Set<string>();
      for (const [id, group] of Object.entries(p.bairros)) {
        const expected = group.cd_bairro === null ? `sem_bairro:${p.cd_mun}` : `bairro:${group.cd_bairro}`;
        if (id !== expected || group.cd_bairro !== null && !group.cd_bairro.startsWith(p.cd_mun)) ctx.addIssue({ code: 'custom', message: 'Identificador de bairro incompatível' });
        for (const code of group.cd_setores) {
          if (seen.has(code) || !(code in p.setores)) ctx.addIssue({ code: 'custom', message: 'Setor duplicado/extra na partição de bairros' });
          seen.add(code);
        }
        for (const f of ['populacao', 'domicilios'] as const) {
          const values = group.cd_setores.map(c => p.setores[c]?.[f]);
          if (values.some(v => !v)) continue;
          const status = values.some(v => v!.status === 'sigilo') ? 'sigilo' : values.some(v => v!.status === 'ausente') ? 'ausente' : 'divulgada';
          const total = status === 'divulgada' ? values.reduce((sum, v) => sum + v!.valor!, 0) : null;
          if (group.indicadores[f].status !== status || group.indicadores[f].valor !== total) ctx.addIssue({ code: 'custom', message: 'Totais de bairro divergentes dos setores' });
        }
      }
      if (seen.size !== Object.keys(p.setores).length) ctx.addIssue({ code: 'custom', message: 'Bairros não conservam todos os setores' });
    }
    for (const f of ['populacao', 'domicilios'] as const) {
      const values = Object.values(p.setores).map(s => s[f]);
      if (values.every(v => v.status === 'divulgada') && (p.indicadores[f].status !== 'divulgada' || values.reduce((sum, v) => sum + v.valor!, 0) !== p.indicadores[f].valor)) ctx.addIssue({ code: 'custom', message: `Totais setoriais divergentes: ${f}` });
    }
  });

