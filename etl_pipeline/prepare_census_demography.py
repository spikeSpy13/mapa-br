#!/usr/bin/env python3
"""Censo 2022: demografia-1 e extensão temática auditada censo-temas-1.

Consolidados SIDRA, contagens setoriais e renda publicada diretamente, sem imputação.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import importlib
import io
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from etl_pipeline.core_contract import normalize_code, nonnegative
from etl_pipeline.reference_data import UFS, REGIOES
from etl_pipeline.prepared_municipalities import CONFIG, MUNICIPALITIES, PREPARED_UFS
from etl_pipeline.audits.verify_2022_sc import source_rows
from etl_pipeline.prepare_official_geometries import SOURCES, PINNED_SHA256, compare_inventory

helper = importlib.import_module('etl_pipeline.03_fetch_ibge_raw')
FIELDS = ('populacao', 'domicilios')
# Snapshots e recortes SIDRA estão na configuração municipal compartilhada.
SPECIES = 'Total de Domicílios (DPPO + DPPV + DPPUO + DPIO + DCCM + DCSM)'
# Dados do Universo; espécie Total explícita (não apenas domicílios ocupados).
QUERIES = {
    'populacao': ('4714', '93', 'Pessoas', 'População residente', ''),
    'domicilios': ('4711', '617', 'Domicílios', 'Domicílios recenseados', '/c3/59993'),
}

def measure(raw: str, field: str) -> dict:
    value, status = helper.adapter.parse_ibge_numeric(raw, field=field, decimal_sep=',', as_integer=True, allow_sigilo=True)
    if status != 'divulgada':
        return {'valor': None, 'status': status}
    return {'valor': nonnegative(value, field, integer=True), 'status': status}


def sidra_measure(raw, field):
    # Convenção oficial exclusiva da API SIDRA: '-' é zero absoluto.
    # https://apisidra.ibge.gov.br/home/ajuda (Valores especiais)
    # Não aplicar esta regra aos CSVs setoriais ou à ausência de linhas.
    return measure('0' if raw == '-' else raw, field)


def parse_sidra(rows, field):
    table, variable, unit, label, _ = QUERIES[field]
    if not isinstance(rows, list) or len(rows) < 2:
        raise ValueError(f'SIDRA {table}: resposta vazia')
    header = rows[0]
    for key, expected in [('D2C', 'Variável (Código)'), ('D3C', 'Ano (Código)')]:
        if header.get(key) != expected:
            raise ValueError(f'SIDRA {table}: dimensão inesperada {key}')
    result = {}
    for r in rows[1:]:
        if (r['D2C'] != variable or r['D2N'] != label or r['MN'] != unit or r['D3C'] != '2022'
                or r['D3N'] != '2022' or (field == 'domicilios' and (r['D4C'] != '59993' or r['D4N'] != 'Total'))):
            raise ValueError(f'SIDRA {table}: variável/unidade/ano/universo divergente')
        level = r['NC']
        code = r['D1C']
        expected = {'1': {'1'}, '2': set(REGIOES), '3': {u[0] for u in UFS}, '6': None}
        if level not in expected:
            raise ValueError('Nível territorial inesperado')
        if level == '6':
            normalize_code(code, 'cd_mun')
            if code[:2] not in PREPARED_UFS: raise ValueError('Município fora das UFs configuradas')
        elif code not in expected[level]: raise ValueError('Código SIDRA inesperado')
        key = (level, code)
        if key in result: raise ValueError('SIDRA duplicado')
        result[key] = sidra_measure(r['V'], field)
    for level in ('1', '2', '3'):
        if {c for l, c in result if l == level} != expected[level]:
            raise ValueError('SIDRA: panorama nacional incompleto')
    return result


def verify_dictionary(path):
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as z:
        strings = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        rows = []
        for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row', ns):
            values = []
            for c in r.findall('m:c', ns):
                v = c.find('m:v', ns)
                if v is not None: values.append(strings[int(v.text)] if c.get('t') == 's' else v.text)
            rows.append(values)
        if ['Básico', 'V0001', 'Total de pessoas'] not in rows or ['Básico', 'V0002', SPECIES] not in rows:
            raise ValueError('Dicionário básico mudou; revisar mapeamento')


def sector_municipality(codes):
    municipalities = {normalize_code(c, 'cd_setor')[:7] for c in codes}
    if len(municipalities) != 1: raise ValueError('Inventário deve pertencer a um único município')
    return municipalities.pop()


def district_identity(row):
    district = normalize_code(row['CD_DIST'], 'cd_dist')
    subdistrict = normalize_code(row['CD_SUBDIST'], 'cd_subdist')
    if district != row['CD_DIST'] or subdistrict != row['CD_SUBDIST'] or not district.startswith(row['CD_MUN']) or not subdistrict.startswith(district):
        raise ValueError('Distrito/subdistrito não canônico ou incompatível')
    return {'cd_distrito': district, 'nm_distrito': row['NM_DIST'], 'cd_subdistrito':subdistrict, 'nm_subdistrito':row['NM_SUBDIST'] or None}


def extract_sectors(rows, ids, territory=None, raw_out=None):
    municipality = sector_municipality(ids)
    sectors = {}
    for row in rows:
        if row['CD_MUN'] != municipality: continue
        code = normalize_code(row['CD_SETOR'], 'cd_setor')
        if code != row['CD_SETOR'] or not code.startswith(municipality) or code in sectors:
            raise ValueError('Setor duplicado, não canônico ou fora do município')
        if territory is not None: territory[code] = neighborhood_identity(row)
        if raw_out is not None: raw_out[code] = row
        sectors[code] = {f: measure(row[column], f) for f, column in zip(FIELDS, ('v0001', 'v0002'))}
    compare_inventory(list(sectors), ids, f'demografia vs geometria {municipality}')
    return sectors


def reconcile(sectors, municipality):
    totals = {}
    for field in FIELDS:
        values = [s[field] for s in sectors.values()]
        if municipality[field]['status'] != 'divulgada' or any(v['status'] != 'divulgada' for v in values):
            raise ValueError(f'Reconciliação municipal indisponível: {field}; sem imputação')
        total = sum(v['valor'] for v in values)
        if total != municipality[field]['valor']:
            raise ValueError(f'Divergência {field}: setores={total}, SIDRA={municipality[field]["valor"]}')
        totals[field] = total
    return totals


def neighborhood_identity(row):
    """Vínculo declarado pela origem, nunca deduzido de nome/prefixo do setor."""
    code, name = row['CD_BAIRRO'], row['NM_BAIRRO']
    if code in {'.', ''}:
        if name: raise ValueError('Nome de bairro sem código declarado')
        return None, None
    canonical = normalize_code(code, 'cd_bairro')
    if canonical != code or not code.startswith(row['CD_MUN']) or not name.strip():
        raise ValueError('Bairro declarado inválido/incompatível com o município')
    return code, name


def verify_neighborhood_links(territory, records):
    municipality = sector_municipality(territory)
    seen = set()
    for record in records:
        if record['CD_MUN'] != municipality: continue
        code = normalize_code(record['CD_SETOR'], 'cd_setor')
        if code != record['CD_SETOR'] or code in seen or code not in territory:
            raise ValueError('Inventário DBF duplicado/extra no vínculo de bairros')
        seen.add(code)
        if territory[code] != neighborhood_identity(record):
            raise ValueError(f'Vínculo CSV/DBF divergente: {code}')
    compare_inventory(list(seen), list(territory), 'CSV básico vs DBF: vínculo bairro')


def municipal_share(numerator, denominator):
    """Percentual do município completo; decimal textual, duas casas HALF_EVEN."""
    if denominator['status'] == 'divulgada' and denominator['valor'] == 0:
        return {'valor': None, 'status': 'ausente'}
    if numerator['status'] == 'sigilo' or denominator['status'] == 'sigilo':
        return {'valor': None, 'status': 'sigilo'}
    if numerator['status'] != 'divulgada' or denominator['status'] != 'divulgada':
        return {'valor': None, 'status': 'ausente'}
    n = nonnegative(numerator['valor'], 'numerador', integer=True)
    d = nonnegative(denominator['valor'], 'denominador', integer=True)
    if n > d: raise ValueError('Numerador excede total municipal')
    with localcontext() as context:
        context.prec = max(28, len(str(n)) + len(str(d)) + 6)
        value = (Decimal(n) * 100 / Decimal(d)).quantize(Decimal('0.01'), rounding=ROUND_HALF_EVEN)
    return {'valor': format(value, '.2f'), 'status': 'divulgada'}


def neighborhood_groups(sectors, territory, municipality=None):
    compare_inventory(list(territory), list(sectors), 'vínculo bairros vs setores')
    municipality_code = sector_municipality(sectors)
    groups = {}
    for code, (bairro, name) in territory.items():
        key = f'bairro:{bairro}' if bairro is not None else f'sem_bairro:{municipality_code}'
        if key not in groups:
            groups[key] = {'cd_bairro': bairro, 'nome': name or 'Setores sem bairro identificado', 'cd_setores': [], 'indicadores': {}}
        group = groups[key]
        if bairro is not None and group['nome'] != name: raise ValueError('Nomes divergentes para o mesmo bairro')
        group['cd_setores'].append(code)
    for group in groups.values():
        group['cd_setores'].sort()
        for field in FIELDS:
            values = [sectors[c][field] for c in group['cd_setores']]
            status = 'sigilo' if any(v['status'] == 'sigilo' for v in values) else 'ausente' if any(v['status'] == 'ausente' for v in values) else 'divulgada'
            group['indicadores'][field] = {'valor': sum(v['valor'] for v in values) if status == 'divulgada' else None, 'status': status}
        if municipality is not None:
            group['participacao_municipal'] = {f: municipal_share(group['indicadores'][f], municipality[f]) for f in FIELDS}
    return groups


def neighborhood_lookup(sectors, groups, source):
    """Dicionário normalizado leve, sem repetir o nome em cada setor."""
    mapping, names = {}, {}
    for group in groups.values():
        bairro = group['cd_bairro']
        if bairro is not None: names[bairro] = group['nome']
        for code in group['cd_setores']:
            if code in mapping: raise ValueError('Setor duplicado no arquivo de correspondência')
            mapping[code] = bairro
    compare_inventory(list(mapping), list(sectors), 'arquivo de correspondência vs setores')
    known = sum(code is not None for code in mapping.values())
    return {'schema_version': 'vinculo-bairro-1', 'cd_mun': sector_municipality(sectors), 'referencia_territorial': 'Censo 2022',
        'fonte': source, 'bairros': names, 'setores': dict(sorted(mapping.items())),
        'cobertura': {'total_setores': len(mapping), 'com_bairro': known, 'sem_bairro': len(mapping) - known, 'bairros': len(names)}}


def verify_neighborhood_sources(paths, territory, basic_rows=None):
    import shapefile
    # A aba Setor declara explicitamente CD_SETOR, CD_BAIRRO e NM_BAIRRO.
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(paths['dicionario_malha']) as z:
        strings = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        rows = []
        for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row', ns):
            values = []
            for cell in row.findall('m:c', ns):
                v = cell.find('m:v', ns)
                if v is not None: values.append(strings[int(v.text)] if cell.get('t') == 's' else v.text)
            rows.append(values)
        for expected in [['CD_SETOR', 'Geocódigo de Setor Censitário'], ['CD_BAIRRO', 'Código do Bairro'], ['NM_BAIRRO', 'Nome do Bairro'], ['CD_DIST','Código do Distrito'], ['NM_DIST','Nome do Distrito']]:
            if expected not in rows: raise ValueError('Dicionário de vínculo bairro mudou')
    with zipfile.ZipFile(paths['setores_uf']) as z:
        def member(ext):
            names = [n for n in z.namelist() if n.endswith(ext)]
            if len(names) != 1: raise ValueError('Membros DBF/CPG ambíguos')
            return names[0]
        encoding = z.read(member('.cpg')).decode('ascii').strip()
        reader = shapefile.Reader(dbf=io.BytesIO(z.read(member('.dbf'))), encoding=encoding)
        types = {f.name: f.field_type for f in reader.fields[1:]}
        if any(types.get(f) != 'C' for f in ['CD_SETOR', 'CD_MUN', 'CD_BAIRRO', 'NM_BAIRRO', 'CD_DIST','NM_DIST','CD_SUBDIST','NM_SUBDIST']):
            raise ValueError('Identificadores/nomes DBF não textuais')
        def records():
            for r in reader.iterRecords():
                row = r.as_dict()
                if basic_rows is not None and row['CD_SETOR'] in basic_rows and district_identity(row) != district_identity(basic_rows[row['CD_SETOR']]):
                    raise ValueError('Distrito/subdistrito CSV/DBF divergente')
                yield row
        verify_neighborhood_links(territory, records())
        return {'metodo': 'atributos_oficiais_csv_dbf', 'campos': ['CD_SETOR', 'CD_BAIRRO', 'NM_BAIRRO'], 'membro_dbf': member('.dbf')}


def prepare(repo: Path):
    cache = repo / 'data/raw/cache'
    output = repo / 'frontend/public/geo/official'
    destination = output / 'statistics'
    receipts, parsed = {}, {}
    for field in FIELDS:
        query = CONFIG['sidra_basico'][field]
        path, receipts[field] = helper.download(query['url'], cache)
        if receipts[field]['sha256_local'] != query['sha256']:
            raise ValueError(f'Snapshot SIDRA {field} mudou; revisar a nova edição antes de usar')
        parsed[field] = parse_sidra(json.loads(path.read_text()), field)
    if parsed['populacao'].keys() != parsed['domicilios'].keys():
        raise ValueError('Inventários SIDRA divergentes')
    def indicators(level, code): return {f: parsed[f][(level, code)] for f in FIELDS}
    municipalities = {code: indicators('6', code) for level, code in parsed['populacao'] if level == '6'}
    for kind in ('basico', 'dicionario_basico', 'dicionario_malha'):
        path, receipts[kind] = helper.download(SOURCES[kind], cache)
        if receipts[kind]['sha256_local'] != PINNED_SHA256[kind]: raise ValueError(f'Edição/hash {kind} divergente')
        if kind == 'dicionario_basico': verify_dictionary(path)
        elif kind == 'basico': basic = path
        else: dictionary = path
    # O CSV nacional é lido uma vez; reter somente os municípios configurados.
    basic_by_city = {code: [] for code in MUNICIPALITIES}
    for row in source_rows(basic, encoding='cp1252'):
        if row['CD_MUN'] in basic_by_city: basic_by_city[row['CD_MUN']].append(row)
    details, basics, reports = {}, {}, {}
    for city, cfg in MUNICIPALITIES.items():
        uf = cfg['cd_uf']
        ids = json.loads((output / f'setores/{uf}/{city}.inventory.json').read_text())['ids']
        territory, basic_rows = {}, {}
        sectors = extract_sectors(basic_by_city[city], ids, territory, basic_rows)
        totals = reconcile(sectors, municipalities[city])
        spec = PREPARED_UFS[uf]['setores']
        sector_path, sector_receipt = helper.download(spec['url'], cache)
        if sector_receipt['sha256_local'] != spec['sha256']: raise ValueError('Edição setorial divergente')
        neighborhood_source = verify_neighborhood_sources({'setores_uf':sector_path, 'dicionario_malha':dictionary}, territory, basic_rows)
        neighborhood_source['recibos'] = {'basico':receipts['basico'], 'setores_uf':sector_receipt, 'dicionario_malha':receipts['dicionario_malha']}
        groups = neighborhood_groups(sectors, territory, municipalities[city])
        reconcile({k:v['indicadores'] for k,v in groups.items()}, municipalities[city])
        details[city] = {'cd_uf':uf, 'cd_mun':city, 'indicadores':municipalities[city], 'setores':sectors,
            'bairros':groups, 'vinculo_bairro':neighborhood_source, 'arquivo_vinculo_bairro':f'{city}.bairros.json',
            'territorios_setores':{code:district_identity(row) for code,row in basic_rows.items()}}
        basics[city] = basic_rows
        reports[city] = {'nome':cfg['nome'], 'setores':len(sectors),'municipio':totals,'sidra_igual_setores':True,
            'bairros_identificados':sum(g['cd_bairro'] is not None for g in groups.values()),
            'setores_sem_bairro':len(groups.get(f'sem_bairro:{city}',{}).get('cd_setores',[])),
            'setores_populacao_zero':sum(s['populacao']['valor']==0 for s in sectors.values()),
            'fonte_bairros':neighborhood_source}
    for uf in PREPARED_UFS:
        mun_ids = json.loads((output / f'municipios/{uf}.inventory.json').read_text())['ids']
        compare_inventory([c for c in municipalities if c.startswith(uf)], mun_ids, f'SIDRA municípios vs geometria {uf}')
    sources = {field: {
        'fonte': 'IBGE · Censo Demográfico 2022', 'referencia': '2022-08-01',
        'unidade': QUERIES[field][2], 'universo': QUERIES[field][3] + (' · todas as espécies' if field == 'domicilios' else ''),
        'consolidado': {'tabela': QUERIES[field][0], 'variavel': QUERIES[field][1], 'recibo': receipts[field]},
        'setorial': {'arquivo': SOURCES['basico'].rsplit('/', 1)[1], 'variavel': 'v0001' if field == 'populacao' else 'v0002',
            'edicao': '20260520', 'definicao': 'Total de pessoas' if field == 'populacao' else SPECIES,
            'recibo': receipts['basico'], 'dicionario': receipts['dicionario_basico']},
    } for field in FIELDS}
    metadata = {'schema_version': 'demografia-1', 'tipo_dados': 'oficiais', 'referencia': '2022-08-01'}
    index = dict(metadata, fontes=sources, brasil=indicators('1', '1'),
        regioes={c: {'nome': n, 'indicadores': indicators('2', c)} for c, n in REGIOES.items()},
        ufs={c: indicators('3', c) for c, *_ in UFS}, arquivos_uf={uf:f'uf/{uf}.json' for uf in PREPARED_UFS})
    # Só escrever após todas as conferências básicas, sem substituir fixtures.
    helper.atomic_json(destination / 'brasil.json', index)
    for uf in PREPARED_UFS:
        payload = dict(metadata, cd_uf=uf, municipios={c:v for c,v in municipalities.items() if c.startswith(uf)},
            arquivos_municipio={c:f'../municipios/{uf}/{c}.json' for c,m in MUNICIPALITIES.items() if m['cd_uf'] == uf})
        helper.atomic_json(destination / f'uf/{uf}.json', payload)
    for city, detail in details.items():
        detail.update(metadata)
        folder = destination / f'municipios/{detail["cd_uf"]}'
        if MUNICIPALITIES[city].get('particionar_por_distrito'):
            from etl_pipeline.district_partitions import write_district_statistics
            write_district_statistics(repo, detail)
            continue
        lookup = neighborhood_lookup(detail['setores'], detail['bairros'], detail['vinculo_bairro'])
        helper.atomic_json(folder / f'{city}.bairros.json', lookup)
        helper.atomic_json(folder / f'{city}.json', detail)
    report = {'status':'approved_demography_only', 'generated_at':datetime.now(timezone.utc).isoformat(),
        'municipios':reports, 'fontes':sources, 'scope':'Consolidados oficiais diretos; detalhe dos municípios configurados'}
    helper.atomic_json(repo / 'data/raw/demography.audit.json', report)
    catalog_path = output / 'catalogo.json'
    catalog = json.loads(catalog_path.read_text())
    catalog.update(estatisticas='demografia-1', demografia='statistics/brasil.json')
    helper.atomic_json(catalog_path, catalog)
    from etl_pipeline.census_themes import prepare_themes
    prepare_themes(repo, details, basics)
    print(json.dumps(reports, ensure_ascii=False))
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    p.add_argument('--national-themes-only', action='store_true', help='Preparar só consolidados temáticos, sem ler malhas ou recorte municipal')
    args = p.parse_args()
    if args.national_themes_only:
        from etl_pipeline.census_themes import prepare_national_themes
        print(json.dumps(prepare_national_themes(args.repo.resolve()), ensure_ascii=False))
    else:
        prepare(args.repo.resolve())
