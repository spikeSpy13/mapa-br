#!/usr/bin/env python3
"""Censo 2022 demografia-1: consolidados SIDRA + básico setorial auditado.

Somente população e domicílios físicos. Sem campos de renda ou imputação.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
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
from etl_pipeline.audits.verify_2022_sc import source_rows
from etl_pipeline.prepare_official_geometries import SOURCES, PINNED_SHA256, compare_inventory

helper = importlib.import_module('etl_pipeline.03_fetch_ibge_raw')
FIELDS = ('populacao', 'domicilios')
# Snapshot SIDRA consultado em 2026-10-26. Mudanças exigem nova revisão explícita.
SIDRA_SHA256 = {'populacao': 'e92434191508a96a3b841831649e02a4c82383db3b5e1845d5afb3417a11b6a4', 'domicilios': '1a779ab7e194867a82ecabc66f79f4df23e95f55f61f1018ac9d6c7d24c1ccea'}
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
            if not code.startswith('42'): raise ValueError('Município fora de SC')
        elif code not in expected[level]: raise ValueError('Código SIDRA inesperado')
        key = (level, code)
        if key in result: raise ValueError('SIDRA duplicado')
        result[key] = measure(r['V'], field)
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


def extract_sectors(rows, ids, territory=None):
    sectors = {}
    for row in rows:
        if row['CD_MUN'] != '4205407': continue
        code = normalize_code(row['CD_SETOR'], 'cd_setor')
        if code != row['CD_SETOR'] or not code.startswith('4205407') or code in sectors:
            raise ValueError('Setor duplicado, não canônico ou fora do município')
        if territory is not None: territory[code] = neighborhood_identity(row)
        sectors[code] = {f: measure(row[column], f) for f, column in zip(FIELDS, ('v0001', 'v0002'))}
    compare_inventory(list(sectors), ids, 'demografia vs geometria Florianópolis')
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
    seen = set()
    for record in records:
        if record['CD_MUN'] != '4205407': continue
        code = normalize_code(record['CD_SETOR'], 'cd_setor')
        if code != record['CD_SETOR'] or code in seen or code not in territory:
            raise ValueError('Inventário DBF duplicado/extra no vínculo de bairros')
        seen.add(code)
        if territory[code] != neighborhood_identity(record):
            raise ValueError(f'Vínculo CSV/DBF divergente: {code}')
    compare_inventory(list(seen), list(territory), 'CSV básico vs DBF: vínculo bairro')


def neighborhood_groups(sectors, territory):
    compare_inventory(list(territory), list(sectors), 'vínculo bairros vs setores')
    groups = {}
    for code, (bairro, name) in territory.items():
        key = f'bairro:{bairro}' if bairro is not None else 'sem_bairro:4205407'
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
    return groups


def verify_neighborhood_sources(paths, territory):
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
        for expected in [['CD_SETOR', 'Geocódigo de Setor Censitário'], ['CD_BAIRRO', 'Código do Bairro'], ['NM_BAIRRO', 'Nome do Bairro']]:
            if expected not in rows: raise ValueError('Dicionário de vínculo bairro mudou')
    with zipfile.ZipFile(paths['setores_sc']) as z:
        def member(ext):
            names = [n for n in z.namelist() if n.endswith(ext)]
            if len(names) != 1: raise ValueError('Membros DBF/CPG ambíguos')
            return names[0]
        encoding = z.read(member('.cpg')).decode('ascii').strip()
        reader = shapefile.Reader(dbf=io.BytesIO(z.read(member('.dbf'))), encoding=encoding)
        types = {f.name: f.field_type for f in reader.fields[1:]}
        if any(types.get(f) != 'C' for f in ['CD_SETOR', 'CD_MUN', 'CD_BAIRRO', 'NM_BAIRRO']):
            raise ValueError('Identificadores/nomes DBF não textuais')
        verify_neighborhood_links(territory, (r.as_dict() for r in reader.iterRecords()))
        return {'metodo': 'atributos_oficiais_csv_dbf', 'campos': ['CD_SETOR', 'CD_BAIRRO', 'NM_BAIRRO'], 'membro_dbf': member('.dbf')}


def prepare(repo: Path):
    cache = repo / 'data/raw/cache'
    output = repo / 'frontend/public/geo/official'
    destination = output / 'statistics'
    receipts, parsed = {}, {}
    for field, (table, variable, _, _, category) in QUERIES.items():
        url = f'https://apisidra.ibge.gov.br/values/t/{table}/n1/1/n2/all/n3/all/n6/in%20n3%2042/v/{variable}/p/2022{category}?formato=json'
        path, receipts[field] = helper.download(url, cache)
        if receipts[field]['sha256_local'] != SIDRA_SHA256[field]:
            raise ValueError(f'Snapshot SIDRA {field} mudou; revisar a nova edição antes de usar')
        parsed[field] = parse_sidra(json.loads(path.read_text()), field)
    if parsed['populacao'].keys() != parsed['domicilios'].keys():
        raise ValueError('Inventários SIDRA divergentes')
    def indicators(level, code): return {f: parsed[f][(level, code)] for f in FIELDS}
    municipalities = {code: indicators('6', code) for level, code in parsed['populacao'] if level == '6'}
    ids = json.loads((output / 'setores/42/4205407.inventory.json').read_text())['ids']
    for kind in ('basico', 'dicionario_basico'):
        path, receipts[kind] = helper.download(SOURCES[kind], cache)
        if receipts[kind]['sha256_local'] != PINNED_SHA256[kind]:
            raise ValueError(f'Edição/hash {kind} divergente')
        if kind == 'dicionario_basico': verify_dictionary(path)
        else: basic = path
    territory = {}
    sectors = extract_sectors(source_rows(basic, encoding='cp1252'), ids, territory)
    totals = reconcile(sectors, municipalities['4205407'])
    paths = {}
    for kind in ('setores_sc', 'dicionario_malha'):
        paths[kind], receipts[kind] = helper.download(SOURCES[kind], cache)
        if receipts[kind]['sha256_local'] != PINNED_SHA256[kind]: raise ValueError(f'Edição/hash {kind} divergente')
    neighborhood_source = verify_neighborhood_sources(paths, territory)
    neighborhood_source['recibos'] = {k: receipts[k] for k in ('basico', 'setores_sc', 'dicionario_malha')}
    groups = neighborhood_groups(sectors, territory)
    reconcile({k: v['indicadores'] for k, v in groups.items()}, municipalities['4205407'])
    # A UF cartográfica e os consolidados municipais devem ter inventários iguais.
    mun_ids = json.loads((output / 'municipios/42.inventory.json').read_text())['ids']
    compare_inventory(list(municipalities), mun_ids, 'SIDRA municípios vs geometria SC')
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
        ufs={c: indicators('3', c) for c, *_ in UFS}, arquivos_uf={'42': 'uf/42.json'})
    uf = dict(metadata, cd_uf='42', municipios=municipalities, arquivos_municipio={'4205407': '../municipios/42/4205407.json'})
    detail = dict(metadata, cd_uf='42', cd_mun='4205407', indicadores=municipalities['4205407'], setores=sectors, bairros=groups, vinculo_bairro=neighborhood_source)
    report = {'status': 'approved_demography_only', 'generated_at': datetime.now(timezone.utc).isoformat(),
        'consolidados_diretos': {'brasil': index['brasil'], 'sc': index['ufs']['42']},
        'reconciliation': {'setores': len(sectors), 'municipio': totals, 'sidra_igual_setores': True},
        'bairros': {'status': 'approved_declared_membership', 'fonte': neighborhood_source,
            'bairros_identificados': sum(g['cd_bairro'] is not None for g in groups.values()),
            'setores_sem_bairro': len(groups.get('sem_bairro:4205407', {}).get('cd_setores', [])),
            'totais_sem_bairro': groups.get('sem_bairro:4205407', {}).get('indicadores'),
            'setores_populacao_zero': sum(s['populacao']['valor'] == 0 for s in sectors.values()),
            'domicilios_em_setores_populacao_zero': sum(s['domicilios']['valor'] for s in sectors.values() if s['populacao']['valor'] == 0),
            'particao_integral': True, 'totais_reconciliados': totals},
        'fontes': sources, 'scope': 'Brasil/regiões/UFs consolidados diretos; municípios SC consolidados; setores somente Florianópolis',
        'limitations': ['Sem renda, responsáveis, PIB, Gini ou TSE. Bairros somente pelo vínculo declarado; sem limites próprios/dissolve.', 'SHA256 local não é assinatura IBGE.']}
    # Só escrever após todas as conferências: falhas não substituem uma entrega aprovada.
    helper.atomic_json(destination / 'brasil.json', index)
    helper.atomic_json(destination / 'uf/42.json', uf)
    helper.atomic_json(destination / 'municipios/42/4205407.json', detail)
    helper.atomic_json(repo / 'data/raw/demography.audit.json', report)
    catalog_path = output / 'catalogo.json'
    catalog = json.loads(catalog_path.read_text())
    catalog.update(estatisticas='demografia-1', demografia='statistics/brasil.json')
    helper.atomic_json(catalog_path, catalog)
    print(json.dumps(report['reconciliation'], ensure_ascii=False))
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    prepare(p.parse_args().repo.resolve())
