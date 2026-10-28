import { beforeEach, describe, expect, it } from 'vitest';
import { createGeoStore } from './useGeoStore';
import { brasilSchema } from '../types/contract';
import { fixtures } from '../test/fixtures';

beforeEach(() => window.history.replaceState(null, '', '/'));
describe('store geográfica compartilhada', () => {
  it('compara no máximo três bairros e preserva o escopo municipal na navegação e no histórico', () => {
    const store = createGeoStore(), a = store.getState();
    a.selecionarMunicipio('42', '4205407');
    for (const id of ['bairro:4205407001', 'bairro:4205407002', 'bairro:4205407003', 'bairro:4205407004', 'bairro:4205407001']) a.adicionarBairroComparado(id);
    expect(store.getState().bairrosComparados).toEqual(['bairro:4205407001', 'bairro:4205407002', 'bairro:4205407003']);
    a.navigate({ level: 'setor', cd_uf: '42', cd_mun: '4205407', cd_setor: '420540705000001' });
    expect(store.getState().bairrosComparados).toHaveLength(3);
    a.navigate({ level: 'bairro', cd_uf: '42', cd_mun: '4205407', id_agregacao: 'bairro:4205407001' });
    expect(store.getState().bairrosComparados).toHaveLength(3);
    a.removerBairroComparado('bairro:4205407002');
    expect(store.getState().bairrosComparados).toHaveLength(2);
    expect(() => a.adicionarBairroComparado('bairro:3550308001')).toThrow();
    expect(() => a.adicionarBairroComparado('sem_bairro:4205407')).toThrow();
    expect(() => a.adicionarBairroComparado(4205407001 as unknown as string)).toThrow();
    a.limparComparacao(); expect(store.getState().bairrosComparados).toEqual([]);
    a.adicionarBairroComparado('bairro:4205407001');
    a.selecionarMunicipio('42', '4209102'); expect(store.getState().bairrosComparados).toEqual([]);
    a.selecionarMunicipio('42', '4205407'); a.adicionarBairroComparado('bairro:4205407001');
    window.history.replaceState(null, '', '?level=municipio&cd_uf=35&cd_mun=3550308'); a.sincronizarUrl();
    expect(store.getState().bairrosComparados).toEqual([]);
  });
  function ready() {
    const store = createGeoStore();
    store.getState().registrarRegioes(brasilSchema.parse(fixtures['brasil.json']).ufs.map(u => u.metadata));
    return store;
  }
  it('retorna ao distrito textual conhecido mesmo antes da carga dos dados', () => {
    const store=ready(),actions=store.getState();
    actions.navigate({level:'setor',cd_uf:'35',cd_mun:'3550308',cd_distrito:'355030801',cd_setor:'355030801000001'});
    actions.voltarNivel();
    expect(store.getState().navigation).toEqual({level:'distrito',cd_uf:'35',cd_mun:'3550308',cd_distrito:'355030801'});
    actions.voltarNivel();
    expect(store.getState().navigation).toEqual({level:'municipio',cd_uf:'35',cd_mun:'3550308'});
  });
  it('volta dos cinco níveis e usa a região da UF atual, sem preservar região antiga', () => {
    const store = ready(); const actions = store.getState();
    actions.selecionarRegiao('4'); actions.selecionarUf('35');
    actions.selecionarMunicipio('35', '3550308'); actions.selecionarBairro('subdist:35503080500:urbano');
    actions.voltarNivel();
    expect(store.getState().navigation).toEqual({ level: 'municipio', cd_uf: '35', cd_mun: '3550308' });
    actions.voltarNivel(); expect(store.getState().navigation).toEqual({ level: 'uf', cd_uf: '35' });
    actions.voltarNivel(); expect(store.getState().navigation).toEqual({ level: 'regiao', cd_regiao: '3' });
    actions.voltarNivel(); expect(store.getState().navigation).toEqual({ level: 'pais' });
    expect(window.location.search).toBe('');
  });
  it('limpa descendentes, permite sair do bairro e recusa grupo sem município', () => {
    const store = ready(); const actions = store.getState();
    expect(() => actions.selecionarBairro('grupo')).toThrow();
    actions.selecionarMunicipio('42', '4205407'); actions.selecionarBairro('demo:4205407:grupo-01');
    actions.selecionarBairro(null); expect(store.getState().navigation.level).toBe('municipio');
    actions.selecionarUf('35');
    expect(store.getState().navigation).toEqual({ level: 'uf', cd_uf: '35' });
    expect(window.location.search).not.toMatch(/cd_mun|id_agregacao/);
  });
  it('rejeita IDs numéricos antes de URLSearchParams ou String poderem mascará-los', () => {
    const store = ready(); const actions = store.getState();
    for (const invalid of [42, null, undefined, '4', '4P']) {
      expect(() => actions.selecionarUf(invalid as string)).toThrow();
      expect(store.getState().navigation).toEqual({ level: 'pais' });
      expect(window.location.search).toBe('');
    }
    expect(() => actions.selecionarRegiao(4 as unknown as string)).toThrow();
    expect(() => actions.selecionarMunicipio('35', '4205407')).toThrow();
    expect(() => actions.selecionarUf('35', '4')).toThrow();
  });
  it('lê links profundos e sincroniza histórico mantendo a métrica ativa', () => {
    window.history.replaceState(null, '', '?level=bairro&cd_uf=42&cd_mun=4205407&id_agregacao=demo%3A4205407%3Agrupo-01');
    const store = ready(); const actions = store.getState();
    expect(store.getState().navigation.level).toBe('bairro');
    actions.setMetrica('setores_sob_sigilo');
    window.history.replaceState(null, '', '?level=uf&cd_uf=35'); actions.sincronizarUrl();
    expect(store.getState().navigation).toEqual({ level: 'uf', cd_uf: '35' });
    expect(store.getState().metrica).toBe('setores_sob_sigilo');
    actions.setMetrica('pib_total_bi'); expect(store.getState().metrica).toBe('pib_total_bi');
    window.history.replaceState(null, '', '?level=municipio&cd_uf=35&cd_mun=4205407'); actions.sincronizarUrl();
    expect(store.getState().routeError).not.toBe('');
    expect(store.getState().navigation).toEqual({ level: 'pais' });
  });
});
