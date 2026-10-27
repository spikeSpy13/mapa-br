import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { rankNeighborhoods, NeighborhoodComparison } from './NeighborhoodComparison';
import { demographicMunicipalitySchema, expectedMunicipalShare, percentageMeasureSchema, type Demography, type OfficialNeighborhood } from '../types/demography';
const values = (p: number, d: number): Demography => ({ populacao: { valor: p, status: 'divulgada' }, domicilios: { valor: d, status: 'divulgada' } });
function group(code: string | null, name: string, p: number, d: number): OfficialNeighborhood {
  return { cd_bairro: code, nome: name, cd_setores: ['420540705000001'], indicadores: values(p, d) };
}
describe('comparação de bairros', () => {
  it('ordena por valor, desempata pelo nome, preserva zero e deixa ausentes no final sem incluir grupo sem bairro', () => {
    const hidden = group('4205407004', 'Ausente', 0, 1); hidden.indicadores.populacao = { valor: null, status: 'ausente' };
    const groups: [string, OfficialNeighborhood][] = [['b', group('4205407001', 'Beta', 5, 2)], ['a', group('4205407002', 'Alfa', 5, 1)], ['z', group('4205407003', 'Zero', 0, 9)], ['u', group(null, 'Sem bairro', 100, 100)], ['h', hidden]];
    expect(rankNeighborhoods(groups, 'populacao').map(([id]) => id)).toEqual(['a', 'b', 'z', 'h']);
    expect(rankNeighborhoods(groups, 'domicilios').map(([id]) => id)).toEqual(['z', 'b', 'a', 'h']);
  });
  it('valida percentuais textuais exatos, HALF_EVEN e denominador municipal completo sem reclassificar ausência ou sigilo', () => {
    for (const [n, d, result] of [[1,32,'3.12'],[3,32,'9.38'],[1,20000,'0.00'],[3,20000,'0.02'],[0,10,'0.00']] as const) {
      expect(expectedMunicipalShare(values(n,0).populacao, values(d,0).populacao)).toEqual({ status: 'divulgada', valor: result });
    }
    const receipt = { url: 'https://ftp.ibge.gov.br/test', url_final: 'https://ftp.ibge.gov.br/test', sha256_local: 'a'.repeat(64), bytes: 1, downloaded_at: '2026-10-27' };
    const official = group('4205407001', 'Centro', 3, 4), unknown = group(null, 'Sem bairro', 1, 6);
    unknown.cd_setores = ['420540705000002'];
    official.participacao_municipal = { populacao: { valor: '75.00', status: 'divulgada' }, domicilios: { valor: '40.00', status: 'divulgada' } };
    const detail = { schema_version: 'demografia-1', tipo_dados: 'oficiais', referencia: '2022-08-01', cd_uf: '42', cd_mun: '4205407', indicadores: values(4, 10),
      setores: { '420540705000001': values(3,4), '420540705000002': values(1,6) }, bairros: { 'bairro:4205407001': official, 'sem_bairro:4205407': unknown },
      vinculo_bairro: { metodo: 'atributos_oficiais_csv_dbf', campos: ['CD_SETOR','CD_BAIRRO','NM_BAIRRO'], membro_dbf: 'test.dbf', recibos: { basico: receipt, setores_sc: receipt, dicionario_malha: receipt } } };
    demographicMunicipalitySchema.parse(detail);
    const invalidCount = structuredClone(detail); invalidCount.indicadores.populacao = { status: 'divulgada', valor: 3.5 };
    expect(demographicMunicipalitySchema.safeParse(invalidCount).success).toBe(false);
    for (const invalid of [7.88, '7.8', '100.01', 'NaN', '07.88']) expect(() => percentageMeasureSchema.parse({ status: 'divulgada', valor: invalid })).toThrow();
    official.participacao_municipal.populacao.valor = '100.00';
    expect(() => demographicMunicipalitySchema.parse(detail)).toThrow(/Participação incompatível/);
    expect(expectedMunicipalShare({ valor: null, status: 'sigilo' }, values(4,0).populacao).status).toBe('sigilo');
    expect(expectedMunicipalShare({ valor: null, status: 'ausente' }, values(4,0).populacao).status).toBe('ausente');
    expect(expectedMunicipalShare(values(0,0).populacao, values(0,0).populacao).status).toBe('ausente');
  });
  it('exibe zero, ausência, sigilo e denominador zero de forma distinta, incluindo os rótulos dos cartões', () => {
    const zero = group('4205407001', 'Zero', 0, 2), hidden = group('4205407002', 'Sigilo', 0, 2);
    zero.participacao_municipal = { populacao: { valor: null, status: 'ausente' }, domicilios: { valor: '100.00', status: 'divulgada' } };
    hidden.indicadores.populacao = { valor: null, status: 'sigilo' };
    hidden.participacao_municipal = { populacao: { valor: null, status: 'sigilo' }, domicilios: { valor: null, status: 'ausente' } };
    render(<NeighborhoodComparison groups={{ zero, hidden }} municipality={values(0,2)} metric="populacao" visibleIds={new Set(['zero','hidden'])} selected={['zero','hidden']} add={() => {}} remove={() => {}} clear={() => {}} open={() => {}} setMetric={() => {}} sourceUrl="https://ftp.ibge.gov.br/test" />);
    const cards = screen.getByTestId('comparison-cards');
    expect(within(cards).getByText('0')).toBeInTheDocument();
    expect(within(cards).getAllByText('Sob sigilo')).toHaveLength(2);
    expect(within(cards).getAllByText('Indisponível')).toHaveLength(2);
    expect(within(cards).getAllByText('Participação na população municipal')).toHaveLength(2);
  });
});
