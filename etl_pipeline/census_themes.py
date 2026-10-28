"""Extensão temática auditada do preparador demográfico, sem downloads no import."""
from __future__ import annotations
from decimal import Decimal, ROUND_HALF_EVEN
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from etl_pipeline.core_contract import normalize_code
from etl_pipeline.reference_data import REGIOES, UFS
from etl_pipeline.prepared_municipalities import CONFIG, MUNICIPALITIES
from etl_pipeline.audits.verify_2022_sc import source_rows
from etl_pipeline.prepare_census_demography import helper, measure, sidra_measure, municipal_share

PROFILE_PATH = Path(__file__).parent / 'manifests/census_themes.json'


def load_profile():
    profile = json.loads(PROFILE_PATH.read_text())
    for key, spec in profile['consultas'].items():
        spec.update(CONFIG['sidra_temas'][key])
    return profile


def xlsx_rows(path):
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as z:
        shared = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        rows = []
        for name in z.namelist():
            if not name.startswith('xl/worksheets/sheet') or not name.endswith('.xml'): continue
            for row in ET.fromstring(z.read(name)).findall('.//m:row', ns):
                values = []
                for c in row.findall('m:c', ns):
                    v = c.find('m:v', ns)
                    if v is not None: values.append(shared[int(v.text)] if c.get('t') == 's' else v.text)
                rows.append(values)
        return rows


def verify_dictionary(rows, metrics):
    for m in metrics.values():
        for key in ('definicoes', 'denominador_definicoes'):
            for variable, definition in m.get(key, {}).items():
                if not any(variable.upper() in row and definition in row for row in rows):
                    raise ValueError(f'Dicionário não confirma {variable}: {definition}')


def table_rows(path, spec, scope, expected, municipalities=None, columns=None):
    """Lê uma tabela nacional em streaming; só retém o recorte municipal."""
    found = {}
    cities = set(municipalities) if municipalities is not None else {code[:7] for code in expected}
    for row in source_rows(path, encoding=spec['encoding'], required_columns=[spec['codigo']]):
        code = row[spec['codigo']]
        if code[:7] not in cities: continue
        if normalize_code(code, scope) != code or code in found or code not in expected:
            raise ValueError(f'Código duplicado/extra/não canônico: {code}')
        found[code] = row if columns is None else {k:v for k,v in row.items() if k in columns}
    return found


def combine(values):
    if any(v['status'] == 'sigilo' for v in values): return {'valor': None, 'status': 'sigilo'}
    if any(v['status'] != 'divulgada' for v in values): return {'valor': None, 'status': 'ausente'}
    return {'valor': sum(v['valor'] for v in values), 'status': 'divulgada'}


def subtract(total, part):
    if total['status'] != 'divulgada' or part['status'] != 'divulgada': return combine([total, part])
    if part['valor'] > total['valor']: raise ValueError('Parcela excede universo')
    return {'valor': total['valor'] - part['valor'], 'status': 'divulgada'}


def cell(n, d=None, reason=None):
    d = d or {'valor': None, 'status': 'ausente'}
    p = municipal_share(n, d)['valor'] if n['status'] == 'divulgada' and isinstance(n['valor'], int) and d['status'] == 'divulgada' else None
    return {'valor': n['valor'], 'status': n['status'], 'denominador': d['valor'], 'status_denominador': d['status'], 'percentual': p, 'motivo': reason}


def money(raw, decimal_sep):
    if raw == '.': return cell({'valor':None,'status':'ausente'}, reason="Marcador '.' na fonte de renda: sem média numérica publicada. Não inferir zero, sigilo ou denominador.")
    n, status = helper.adapter.parse_ibge_numeric(raw, field='V06004', decimal_sep=decimal_sep, allow_sigilo=True)
    return cell({'valor': format(n.quantize(Decimal('.01'), rounding=ROUND_HALF_EVEN), '.2f') if n is not None else None, 'status': status})


def aggregate(cells):
    """Nunca reconstrói X; subtotal conhecido é identificado como parcial."""
    known = [c for c in cells if c['status'] == 'divulgada']
    if len(known) == len(cells): n = {'valor': sum(c['valor'] for c in cells), 'status': 'divulgada'}
    elif known: n = {'valor': sum(c['valor'] for c in known), 'status': 'parcial'}
    else: n = {'valor': None, 'status': 'sigilo' if any(c['status'] == 'sigilo' for c in cells) else 'ausente'}
    d = combine([{'valor': c['denominador'], 'status': c['status_denominador']} for c in cells])
    result = cell(n, d, 'Soma apenas das contagens divulgadas; não é o total do grupo.' if len(known) != len(cells) else None)
    result['cobertura'] = {'divulgados': len(known), 'esperados': len(cells), 'sigilo': sum(c['status'] == 'sigilo' for c in cells), 'ausentes': sum(c['status'] == 'ausente' for c in cells)}
    return result


def national_rows(path, spec):
    rows = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(rows, list) or len(rows) < 2: raise ValueError('Consolidado SIDRA vazio')
    result = {}
    expected = {'1': {'1'}, '2': set(REGIOES), '3': {u[0] for u in UFS}, '6': set(MUNICIPALITIES)}
    dimension = 'D5C' if spec['tabela'] == '9514' and len(spec['dimensoes']['D5C']) > 1 else 'D4C'
    categories = set(spec['dimensoes'][dimension])
    for r in rows[1:]:
        if r['D2C'] != spec['variavel'] or r['D2N'] != spec['rotulo_variavel'] or r['D3C'] != '2022' or r['D3N'] != '2022' or r['MN'] != spec['unidade']:
            raise ValueError('Variável, unidade ou referência SIDRA divergente')
        if r['NC'] not in expected or r['D1C'] not in expected[r['NC']]: raise ValueError('Território SIDRA inesperado')
        for col, labels in spec['dimensoes'].items():
            if r[col] not in labels or r[col[:-1]+'N'] != labels[r[col]]: raise ValueError('Categoria SIDRA divergente')
        key = (r['NC'], r['D1C'], r[dimension])
        if key in result: raise ValueError('Consolidado SIDRA duplicado')
        result[key] = sidra_measure(r['V'], 'contagem')
    for level, codes in expected.items():
        if not categories or any((level, code, cat) not in result for code in codes for cat in categories):
            raise ValueError('Consolidado SIDRA incompleto')
    return result


def read_national(profile, cache):
    national, receipts = {}, {}
    for k, original in profile['consultas'].items():
        spec = {**original, **CONFIG['sidra_temas'][k]}
        path, receipt = helper.download(spec['url'], cache, timeout=60)
        if receipt['sha256_local'] != spec['sha256']: raise ValueError('Snapshot SIDRA mudou; requer nova auditoria')
        receipts['sidra_'+k] = receipt
        national[k] = national_rows(path, spec)
    return national, receipts


def global_cell(national, spec, level, code):
    query = spec.get('consolidado')
    if not query: return cell({'valor':None,'status':'ausente'}, reason='Sem consolidado compatível preparado para este nível; V06001 não valida o peso de V06004.')
    data = national[query['consulta']]
    n = combine([data[(level, code, c)] for c in query['categorias']])
    d = national['sexo'][(level, code, '6794')] if not query['denominador'] else combine([data[(level, code, c)] for c in query['denominador']])
    return cell(n, d)


def write_national(repo, profile, national, receipts):
    out = repo / 'frontend/public/geo/official/statistics/temas'
    for theme in dict.fromkeys(m['tema'] for m in profile['metricas'].values()):
        metrics = {k:m for k,m in profile['metricas'].items() if m['tema'] == theme}
        record = lambda level,code: {k:global_cell(national,m,level,code) for k,m in metrics.items()}
        payload = {'schema_version':'censo-temas-1','referencia':'2022-08-01','tema':theme,'metricas':list(metrics),'fontes':receipts,
            'brasil':record('1','1'),'regioes':{c:record('2',c) for c in REGIOES},'ufs':{c:record('3',c) for c,*_ in UFS},
            'municipios':{city:record('6',city) for city in MUNICIPALITIES} if theme != 'renda' else {}}
        helper.atomic_json(out / theme / 'brasil.json', payload, compact=True)


def prepare_national_themes(repo):
    """Não lê malhas, básico, setores, bairros nem arquivos de renda."""
    profile = load_profile()
    national, receipts = read_national(profile, repo / 'data/raw/cache')
    write_national(repo, profile, national, receipts)
    return {'status':'consolidados_diretos','ufs':27,'regioes':5,'fontes':receipts}


def prepare_themes(repo, details, basics):
    profile = load_profile()
    cache = repo / 'data/raw/cache'; out = repo / 'frontend/public/geo/official/statistics/temas'
    national, receipts = read_national(profile, cache)
    write_national(repo, profile, national, dict(receipts))
    specs = profile['arquivos']; paths = {}
    for k, spec in specs.items():
        paths[k], receipts[k] = helper.download(spec['url'], cache, timeout=60)
        if receipts[k]['sha256_local'] != spec['sha256']: raise ValueError(f'Edição temática {k} mudou; requer nova auditoria')
    dictionary = xlsx_rows(paths['dicionario']) + xlsx_rows(paths['dicionario_renda'])
    verify_dictionary(dictionary, profile['metricas'])
    # V00003 já foi corrigida nesta edição e NÃO é o universo DPPO.
    if not any('V00003' in row and profile['errata']['definicao'] in row for row in dictionary): raise ValueError('Definição da errata V00003 não confirmada')
    sources = {}
    codes = {code for detail in details.values() for code in detail['setores']}
    group_codes = {g['cd_bairro'] for detail in details.values() for g in detail['bairros'].values() if g['cd_bairro'] is not None}
    basic_rows = {code:row for rows in basics.values() for code,row in rows.items()}
    for k, spec in specs.items():
        if k.startswith('dicionario'): continue
        if k == 'basico': sources[k] = basic_rows; continue
        scope = 'cd_dist' if k == 'renda_distrito' else 'cd_bairro' if k == 'renda_bairro' else 'cd_mun' if k == 'renda_municipio' else 'cd_setor'
        expected = group_codes if scope == 'cd_bairro' else set(details) if scope == 'cd_mun' else codes
        cities = details
        if k == 'renda_distrito':
            cities = {c:d for c,d in details.items() if MUNICIPALITIES[c].get('particionar_por_distrito')}
            expected = {t['cd_distrito'] for d in cities.values() for t in d['territorios_setores'].values()}
        columns = {spec['codigo'],'NM_BAIRRO','NM_DIST','V06004','V00001'}
        columns.update(v for m in profile['metricas'].values() if m['arquivo']==k for v in m['variaveis'])
        if k == 'alfabetizacao': columns.update(f'V{n:05}' for n in range(644,657))
        sources[k] = table_rows(paths[k], spec, scope, expected, cities, columns)
    if set(sources['renda_bairro']) != group_codes: raise ValueError('Inventário de bairros da renda divergente')
    for detail in details.values():
        for g in detail['bairros'].values():
            if g['cd_bairro'] and sources['renda_bairro'][g['cd_bairro']]['NM_BAIRRO'] != g['nome']: raise ValueError('Nome de bairro da renda divergente')
    reports = {}
    for city, detail in details.items():
        city_sources = {k:{code:row for code,row in rows.items() if code.startswith(city)} for k,rows in sources.items()}
        reports[city] = prepare_city_themes(repo, profile, detail, basics[city], city_sources, national, receipts)
    helper.atomic_json(out / 'catalogo.json', profile)
    helper.atomic_json(repo / 'data/raw/census_themes.audit.json', {'municipios':reports})
    return reports


def prepare_city_themes(repo, profile, detail, basic_rows, sources, national, receipts):
    """Transforma o recorte já lido; nenhuma nova leitura das tabelas nacionais."""
    specs = profile['arquivos']
    city, uf, codes = detail['cd_mun'], detail['cd_uf'], set(detail['setores'])
    out = repo / 'frontend/public/geo/official/statistics/temas'
    partitioned = MUNICIPALITIES[city].get('particionar_por_distrito')
    from etl_pipeline.district_partitions import district_groups
    districts = district_groups(detail) if partitioned else {}
    for code,g in districts.items():
        row = sources['renda_distrito'].get(code)
        if row and row['NM_DIST'] != g['nome']: raise ValueError(f'Nome distrital da renda divergente: {code}')
    thematic_audit = {'errata': profile['errata'], 'arquivos': {}, 'reconciliacao': {}, 'renda': 'V06004 publicada diretamente em setor/município/bairro. Sem agregação de médias ou peso V06001.'}
    for name, data in sources.items():
        if specs[name].get('codigo') in ('setor','CD_setor','CD_SETOR'):
            missing = sorted(codes - data.keys())
            thematic_audit['arquivos'][name] = {'linhas': len(data), 'faltantes': missing, 'extras': [], 'faltantes_populacao_positiva': [c for c in missing if detail['setores'][c]['populacao']['valor'] > 0]}
            if thematic_audit['arquivos'][name]['faltantes_populacao_positiva']: raise ValueError('Omissões temáticas inesperadas em setores com moradores')
    missing = {'valor': None, 'status': 'ausente'}
    def value(row, variables):
        return combine([measure(row[v], v) for v in variables]) if row is not None else missing
    def denominator(kind, code):
        if kind == 'populacao': return detail['setores'][code]['populacao']
        if kind == 'dppo': return value(sources['caracteristicas_domicilio1'].get(code), ['V00001'])
        if kind == 'domicilios_permanentes': return combine([value(sources['caracteristicas_domicilio1'].get(code), ['V00001']), value(basic_rows[code], ['v0008','v0009'])])
        if kind == 'pessoas_15_mais': return value(sources['alfabetizacao'].get(code), [f'V{n:05}' for n in range(644,657)])
        return missing
    for theme in dict.fromkeys(m['tema'] for m in profile['metricas'].values()):
        metrics = {k:m for k,m in profile['metricas'].items() if m['tema'] == theme}
        common = {'schema_version':'censo-temas-1', 'referencia':'2022-08-01', 'tema':theme, 'metricas':list(metrics), 'fontes':receipts}
        sectors = {}
        for code in sorted(codes):
            record = {}
            for key, spec in metrics.items():
                if spec['unidade'] == 'BRL/mês':
                    row = sources['renda_setor'].get(code)
                    record[key] = money(row['V06004'], '.') if row else cell(missing, reason='Sem linha de renda na fonte; não inferir zero ou sigilo.')
                    continue
                row = basic_rows[code] if spec['arquivo'] == 'basico' else sources[spec['arquivo']].get(code)
                n = value(row, spec['variaveis']); d = denominator(spec['denominador'], code)
                if spec.get('operacao') == 'complemento': n = subtract(d, n)
                reason = 'Sem linha temática na fonte; população básica zero. Mantido ausente, sem imputação.' if row is None else None
                record[key] = cell(n, d, reason)
            sectors[code] = record
        groups = {}
        for gid, group in detail['bairros'].items():
            groups[gid] = {}
            for key, spec in metrics.items():
                if spec['unidade'] == 'BRL/mês':
                    row = sources['renda_bairro'].get(group['cd_bairro'])
                    groups[gid][key] = money(row['V06004'], ',') if row else cell(missing, reason='Sem média publicada para o grupo sem bairro. Não agregar V06004 sem massa/denominador compatível.')
                else: groups[gid][key] = aggregate([sectors[c][key] for c in group['cd_setores']])
        municipality = {key: global_cell(national,m,'6',city) for key,m in metrics.items()}
        if theme == 'renda': municipality = {key:money(sources['renda_municipio'][city]['V06004'], ',') for key in metrics}
        for key, m in metrics.items():
            if m['unidade'] == 'BRL/mês': continue
            aggregate_all = aggregate([r[key] for r in sectors.values()]); official = municipality[key]
            if aggregate_all['status'] == 'divulgada' and official['status'] == 'divulgada' and aggregate_all['valor'] != official['valor']:
                raise ValueError(f'Total completo diverge do consolidado: {key}')
            if aggregate_all['valor'] is not None and official['valor'] is not None and aggregate_all['valor'] > official['valor']:
                raise ValueError(f'Subtotal conhecido excede consolidado: {key}')
            thematic_audit['reconciliacao'][key] = {'soma_setores':aggregate_all, 'consolidado':official, 'comparacao':'igual' if aggregate_all['status'] == 'divulgada' else 'parcial; não reconcilia X nem ausências'}
        municipal_payload = {**common, 'cd_mun':city, 'municipio':municipality, 'bairros':groups, 'setores':sectors}
        if partitioned:
            district_records = {}
            for code,g in districts.items():
                records = {}
                for key,m in metrics.items():
                    if m['unidade'] == 'BRL/mês':
                        row = sources['renda_distrito'].get(code)
                        records[key] = money(row['V06004'], ',') if row else cell(missing, reason='Sem renda distrital publicada compatível. Não agregar médias setoriais.')
                    else: records[key] = aggregate([sectors[c][key] for c in g['cd_setores']])
                district_records[code] = records
                part = {**common,'cd_mun':city,'cd_distrito':code,'municipio':municipality,'distritos':{code:records},'bairros':{},'setores':{c:sectors[c] for c in g['cd_setores']}}
                helper.atomic_json(out / theme / f'municipios/{uf}/{city}/{code}.json',part,compact=True)
            municipal_payload.update(distritos=district_records, setores={}, bairros={})
        helper.atomic_json(out / theme / f'municipios/{uf}/{city}.json', municipal_payload, compact=True)
    return thematic_audit
