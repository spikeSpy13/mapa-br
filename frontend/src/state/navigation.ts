import { cdMunSchema, cdRegiaoSchema, cdUfSchema, cdSetorSchema } from '../types/contract';

export type Navigation =
  | { level: 'pais' }
  | { level: 'regiao'; cd_regiao: string }
  | { level: 'uf'; cd_uf: string }
  | { level: 'municipio'; cd_uf: string; cd_mun: string }
  | { level: 'distrito'; cd_uf: string; cd_mun: string; cd_distrito: string }
  | { level: 'setor'; cd_uf: string; cd_mun: string; cd_setor: string; cd_distrito?: string }
  | { level: 'bairro'; cd_uf: string; cd_mun: string; id_agregacao: string };

export function validateNavigation(nav: Navigation): Navigation {
  // A borda das ações valida os valores originais ANTES de URLSearchParams,
  // que converteria números silenciosamente em texto.
  switch (nav.level) {
    case 'pais': return { level: nav.level };
    case 'regiao': return { level: nav.level, cd_regiao: cdRegiaoSchema.parse(nav.cd_regiao) };
    case 'uf': return { level: nav.level, cd_uf: cdUfSchema.parse(nav.cd_uf) };
    case 'municipio': case 'bairro': case 'distrito': case 'setor': {
      const cd_uf = cdUfSchema.parse(nav.cd_uf);
      const cd_mun = cdMunSchema.parse(nav.cd_mun);
      if (!cd_mun.startsWith(cd_uf)) throw new Error('Município incompatível com a UF.');
      if (nav.level === 'municipio') return { level: nav.level, cd_uf, cd_mun };
      const cd_distrito = 'cd_distrito' in nav && nav.cd_distrito !== undefined ? nav.cd_distrito : undefined;
      if (cd_distrito !== undefined && (typeof cd_distrito !== 'string' || !/^\d{9}$/.test(cd_distrito) || !cd_distrito.startsWith(cd_mun))) throw new Error('Distrito incompatível com o município.');
      if (nav.level === 'distrito') { if (!cd_distrito) throw new Error('Distrito obrigatório.'); return {level:'distrito',cd_uf,cd_mun,cd_distrito}; }
      if (nav.level === 'setor') {
        const cd_setor = cdSetorSchema.parse(nav.cd_setor);
        if (!cd_setor.startsWith(cd_mun)) throw new Error('Setor incompatível com o município.');
        return { level: nav.level, cd_uf, cd_mun, cd_setor, ...(cd_distrito ? {cd_distrito} : {}) };
      }
      if (typeof nav.id_agregacao !== 'string' || !nav.id_agregacao.trim()) throw new Error('Identificador de grupo inválido.');
      return { level: nav.level, cd_uf, cd_mun, id_agregacao: nav.id_agregacao };
    }
    default: throw new Error('Nível geográfico inválido.');
  }
}

export function parseNavigation(search: string): Navigation {
  const query = new URLSearchParams(search);
  const level = query.get('level') ?? 'pais';
  if (level === 'pais') return { level };
  if (level === 'regiao') return { level, cd_regiao: cdRegiaoSchema.parse(query.get('cd_regiao')) };
  const cd_uf = cdUfSchema.parse(query.get('cd_uf'));
  if (level === 'uf') return { level, cd_uf };
  const cd_mun = cdMunSchema.parse(query.get('cd_mun'));
  if (!cd_mun.startsWith(cd_uf)) throw new Error('Município incompatível com a UF da URL.');
  if (level === 'municipio') return { level, cd_uf, cd_mun };
  if (level === 'distrito') return validateNavigation({level,cd_uf,cd_mun,cd_distrito:query.get('cd_distrito')!});
  if (level === 'setor') return validateNavigation({ level, cd_uf, cd_mun, cd_setor: query.get('cd_setor')!, ...(query.has('cd_distrito') ? {cd_distrito:query.get('cd_distrito')!} : {}) });
  const id_agregacao = query.get('id_agregacao');
  if (level === 'bairro' && id_agregacao) return { level, cd_uf, cd_mun, id_agregacao };
  throw new Error('Navegação inválida.');
}

export function navigationSearch(nav: Navigation): string {
  const clean = validateNavigation(nav);
  if (clean.level === 'pais') return '';
  return `?${new URLSearchParams(clean).toString()}`;
}
