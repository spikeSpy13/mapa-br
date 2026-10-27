import { createContext, createElement, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { z } from 'zod';
import { navigationSearch, parseNavigation, validateNavigation } from '../state/navigation';
import type { Navigation } from '../state/navigation';
import { cdUfSchema, cdRegiaoSchema, cdBairroSchema } from '../types/contract';

export type NivelDrillDown = Navigation['level'];
const metricSchema = z.enum(['renda_media_responsavel', 'pib_per_capita', 'pib_total_bi',
  'populacao', 'domicilios', 'cobertura_renda_proporcao', 'setores_sob_sigilo']);
export type MetricaAtiva = z.infer<typeof metricSchema>;

export interface GeoState {
  navigation: Navigation;
  routeError: string;
  metrica: MetricaAtiva;
  regioesPorUf: Readonly<Record<string, string>>;
  comparacaoMunicipio: string | null;
  bairrosComparados: readonly string[];
  adicionarBairroComparado: (id: string) => void;
  removerBairroComparado: (id: string) => void;
  limparComparacao: () => void;
  navigate: (nav: Navigation) => void;
  sincronizarUrl: () => void;
  registrarRegioes: (items: readonly { cd_uf: string; cd_regiao: string }[]) => void;
  irParaPais: () => void;
  selecionarRegiao: (code: string) => void;
  selecionarUf: (code: string, region?: string) => void;
  selecionarMunicipio: (uf: string, municipality: string) => void;
  selecionarBairro: (id: string | null) => void;
  setMetrica: (metric: MetricaAtiva) => void;
  voltarNivel: () => void;
}

function readRoute(browser: Window) {
  try { return { navigation: parseNavigation(browser.location.search), routeError: '' }; }
  catch { return { navigation: { level: 'pais' } as Navigation,
    routeError: 'Este endereço contém uma seleção inválida. Volte ao Brasil para recomeçar.' }; }
}

export function createGeoStore(browser: Window = window) {
  const initialRoute = readRoute(browser);
  const comparisonScope = (nav: Navigation, current: GeoState) => 'cd_mun' in nav && nav.cd_mun !== current.comparacaoMunicipio ?
    { comparacaoMunicipio: nav.cd_mun, bairrosComparados: [] } : {};
  return createStore<GeoState>((set, get) => ({
    ...initialRoute, metrica: 'renda_media_responsavel', regioesPorUf: {},
    comparacaoMunicipio: 'cd_mun' in initialRoute.navigation ? initialRoute.navigation.cd_mun : null, bairrosComparados: [],
    adicionarBairroComparado: id => {
      const nav = get().navigation;
      if (!('cd_mun' in nav) || typeof id !== 'string' || !id.startsWith('bairro:')) throw new Error('Selecione um bairro oficial do município.');
      const code = cdBairroSchema.parse(id.slice('bairro:'.length));
      if (!code.startsWith(nav.cd_mun)) throw new Error('Bairro de outro município.');
      set(state => state.bairrosComparados.includes(id) || state.bairrosComparados.length >= 3 ? state : { bairrosComparados: [...state.bairrosComparados, id] });
    },
    removerBairroComparado: id => set(state => ({ bairrosComparados: state.bairrosComparados.filter(c => c !== id) })),
    limparComparacao: () => set({ bairrosComparados: [] }),
    navigate: nav => {
      const clean = validateNavigation(nav);
      const url = new URL(browser.location.href);
      const modo = url.searchParams.get('modo');
      url.search = navigationSearch(clean);
      if (modo) url.searchParams.set('modo', modo);
      if (url.href !== browser.location.href) browser.history.pushState(null, '', url);
      set({ navigation: clean, routeError: '', ...comparisonScope(clean, get()) });
    },
    sincronizarUrl: () => { const route = readRoute(browser); set({ ...route, ...comparisonScope(route.navigation, get()) }); },
    registrarRegioes: items => {
      const mapping: Record<string, string> = {};
      for (const item of items) {
        const code = cdUfSchema.parse(item.cd_uf); const region = cdRegiaoSchema.parse(item.cd_regiao);
        if (mapping[code] && mapping[code] !== region) throw new Error('UF associada a regiões diferentes.');
        mapping[code] = region;
      }
      set({ regioesPorUf: mapping });
    },
    irParaPais: () => get().navigate({ level: 'pais' }),
    selecionarRegiao: cd_regiao => get().navigate({ level: 'regiao', cd_regiao }),
    selecionarUf: (cd_uf, region) => {
      cdUfSchema.parse(cd_uf);
      if (region !== undefined) {
        cdRegiaoSchema.parse(region);
        const known = get().regioesPorUf[cd_uf];
        if (known && known !== region) throw new Error('UF incompatível com a região informada.');
        get().navigate({ level: 'uf', cd_uf });
        set({ regioesPorUf: { ...get().regioesPorUf, [cd_uf]: region } });
      } else get().navigate({ level: 'uf', cd_uf });
    },
    selecionarMunicipio: (cd_uf, cd_mun) => get().navigate({ level: 'municipio', cd_uf, cd_mun }),
    selecionarBairro: id => {
      const nav = get().navigation;
      if (nav.level !== 'municipio' && nav.level !== 'bairro') throw new Error('Selecione um município antes do bairro.');
      get().navigate(id === null ? { level: 'municipio', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun } :
        { level: 'bairro', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun, id_agregacao: id });
    },
    setMetrica: value => set({ metrica: metricSchema.parse(value) }),
    voltarNivel: () => {
      const nav = get().navigation;
      if (nav.level === 'bairro' || nav.level === 'setor') get().navigate({ level: 'municipio', cd_uf: nav.cd_uf, cd_mun: nav.cd_mun });
      else if (nav.level === 'municipio') get().navigate({ level: 'uf', cd_uf: nav.cd_uf });
      else if (nav.level === 'uf' && get().regioesPorUf[nav.cd_uf]) get().navigate({ level: 'regiao', cd_regiao: get().regioesPorUf[nav.cd_uf]! });
      else get().irParaPais();
    },
  }));
}

type GeoStore = ReturnType<typeof createGeoStore>;
const GeoContext = createContext<GeoStore | null>(null);
export function GeoStoreProvider({ children }: { children: ReactNode }) {
  // Uma store por aplicação/montagem: suporta links profundos e testes isolados,
  // sem estado singleton capturado antes de window.location estar configurado.
  const [store] = useState(createGeoStore);
  useEffect(() => {
    const sync = () => store.getState().sincronizarUrl();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [store]);
  return createElement(GeoContext.Provider, { value: store }, children);
}
export function useGeoStore<T>(selector: (state: GeoState) => T): T {
  const store = useContext(GeoContext);
  if (!store) throw new Error('useGeoStore requer GeoStoreProvider.');
  return useStore(store, selector);
}
