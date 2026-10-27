#!/usr/bin/env python3
"""Prepara cartografia Censo 2022 a partir de arquivos estáticos oficiais.

Não lê indicadores para publicação. Nenhuma operação acontece no import.
O inventário básico completo serve apenas à auditoria de identificadores.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import importlib
import io
import json
from pathlib import Path
import sys
import zipfile

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from etl_pipeline.core_contract import normalize_code, WATER_BODY_DENYLIST
from etl_pipeline.reference_data import UFS
from etl_pipeline.prepared_municipalities import MUNICIPALITIES, PREPARED_UFS
from etl_pipeline.audits.verify_2022_sc import source_rows

BASE = 'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/'
SOURCES = {
    'distritos': BASE + 'malha_com_atributos/distritos/shp/BR/BR_distritos_CD2022.zip',
    'dicionario_malha': BASE + 'malha_com_atributos/Dicionario_de_dados_malha_agregados.xlsx',
    'basico': BASE + 'Agregados_por_Setor_csv/Agregados_por_setores_basico_BR_20260520.zip',
    'dicionario_basico': BASE + 'dicionario_de_dados_agregados_por_setores_censitarios_20260520.xlsx',
}
# Fixados após leitura das listagens e inspeção do dicionário e schema DBF.
PINNED_SHA256 = {
    'distritos': '4247509c713e35c182f1c77a16aab39855a5f6ba067dd4bdaee99ede8026767c',
    'dicionario_malha': '0dffb669ee90e1ffb86a7c8666cc066d5121d44b494013cc1149e50cc75073b1',
    'basico': 'ec04624286233d699ebe69c7b9625744a1cfdfc8352126f30245bdef5e9bdc63',
    'dicionario_basico': '0b8aedece57f6125d785b6aa2234cfd587e92dfb6ce5ca6ace8c67f140831344',
}
for _uf, _spec in PREPARED_UFS.items():
    SOURCES['setores_' + _spec['sigla'].lower()] = _spec['setores']['url']
    PINNED_SHA256['setores_' + _spec['sigla'].lower()] = _spec['setores']['sha256']

UF_META = {code: {'cd_uf': code, 'sigla_uf': sigla, 'nm_uf': name, 'cd_regiao': region} for code, sigla, name, region in UFS}


def checked_code(value, field):
    normalized = normalize_code(value, field)
    if normalized != value:
        raise ValueError(f'Código de origem não canônico: {field}={value!r}')
    return normalized


def compare_inventory(actual, expected, label):
    if len(actual) != len(set(actual)) or len(expected) != len(set(expected)):
        raise ValueError(f'Inventário duplicado em {label}')
    missing, extra = sorted(set(expected) - set(actual)), sorted(set(actual) - set(expected))
    result = {'actual': len(actual), 'expected': len(expected), 'missing': missing, 'extra': extra}
    if missing or extra:
        raise ValueError(f'Inventários incompatíveis em {label}: {json.dumps(result)}')
    return result


def read_shapes(path, code_field, municipalities=None):
    import shapefile
    from pyproj import CRS
    from shapely.geometry import shape
    with zipfile.ZipFile(path) as archive:
        def member(ext):
            names = [n for n in archive.namelist() if n.endswith(ext)]
            if len(names) != 1:
                raise ValueError(f'Esperado um membro {ext}, encontrados {names}')
            return names[0]
        encoding = archive.read(member('.cpg')).decode('ascii').strip()
        crs = CRS.from_wkt(archive.read(member('.prj')).decode('ascii'))
        if crs.to_epsg() != 4674:
            raise ValueError(f'CRS de origem inesperado: {crs}')
        reader = shapefile.Reader(shp=io.BytesIO(archive.read(member('.shp'))),
            shx=io.BytesIO(archive.read(member('.shx'))), dbf=io.BytesIO(archive.read(member('.dbf'))), encoding=encoding)
        fields = {f.name: f.field_type for f in reader.fields[1:]}
        for key in [code_field, 'CD_UF', 'CD_MUN', 'CD_REGIAO']:
            if fields.get(key) != 'C':
                raise ValueError(f'Identificador DBF deve ser textual: {key}/{fields.get(key)}')
        rows, seen, unassigned, inventory = [], set(), [], {}
        for ordinal, record in enumerate(reader.iterRecords()):
            p = record.as_dict()
            # A edição fixada contém uma feição final sem distrito/município,
            # explicitamente vinculada à UF 43. Conservar sua área na UF, sem
            # fabricar um código de distrito ou município nem publicar detalhe.
            if code_field == 'CD_DIST' and p['CD_DIST'] == '' and p['CD_MUN'] == '' and p['CD_UF'] == '43' and ordinal == 10698:
                g = shape(reader.shape(ordinal).__geo_interface__)
                if g.is_empty or not g.is_valid: raise ValueError('Feição sem distrito inválida')
                rows.append((None, p, g))
                unassigned.append({'ordinal_zero_based': ordinal, 'cd_uf': '43', 'cd_mun': None, 'cd_dist': None,
                    'policy': 'incluída somente no limite da UF explicitamente declarado pela origem; sem inventar códigos'})
                continue
            code = checked_code(p[code_field], code_field.lower())
            uf, mun = checked_code(p['CD_UF'], 'cd_uf'), checked_code(p['CD_MUN'], 'cd_mun')
            checked_code(p['CD_REGIAO'], 'cd_regiao')
            if code in seen:
                raise ValueError(f'Identificador duplicado: {code}')
            seen.add(code)
            if mun in WATER_BODY_DENYLIST:
                raise ValueError(f'Corpo de água fora do recorte encontrado: {code}; requer exclusão explícita')
            if uf not in UF_META or not mun.startswith(uf) or not code.startswith(mun) or p['CD_REGIAO'] != UF_META[uf]['cd_regiao']:
                raise ValueError(f'Vínculo territorial incoerente: {code}')
            inventory[code] = mun
            if municipalities is not None and mun not in municipalities: continue
            g = shape(reader.shape(ordinal).__geo_interface__)
            if g.is_empty or g.geom_type not in {'Polygon', 'MultiPolygon'}:
                raise ValueError(f'Geometria vazia/não poligonal: {code}')
            rows.append((code, p, g))
        return rows, {'member': member('.shp'), 'crs_epsg': 4674, 'crs_wkt': crs.to_wkt(), 'encoding': encoding, 'dbf_types': fields, 'unassigned_features': unassigned, 'inventory': inventory}


def collection(items):
    from shapely.geometry import mapping
    return {'type': 'FeatureCollection', 'referencia': 'Censo 2022', 'features': [
        {'type': 'Feature', 'properties': p, 'geometry': mapping(g)} for p, g in items]}


def write_catalog(output, report):
    """Particiona também os inventários; a abertura não recebe IDs descendentes."""
    helper = importlib.import_module('etl_pipeline.03_fetch_ibge_raw')
    entries = [('ufs.geojson', 'cd_uf')] + [(f'municipios/{u}.geojson', 'cd_mun') for u in PREPARED_UFS] + [(f'setores/{m["cd_uf"]}/{c}.geojson', 'cd_setor') for c,m in MUNICIPALITIES.items()]
    for filename, field in entries:
        features = json.loads((output / filename).read_text(encoding='utf-8'))['features']
        ids = [checked_code(f['properties'][field], field) for f in features]
        compare_inventory(ids, ids, filename)
        inventory_file = filename.replace('.geojson', '.inventory.json')
        helper.atomic_json(output / inventory_file, {'ids': sorted(ids)})
        report['files'][inventory_file] = {'sha256_local': helper.sha256_file(output / inventory_file), 'bytes': (output / inventory_file).stat().st_size}
    catalog = {'schema_version': 'cartografia-1', 'referencia': 'Censo 2022', 'estatisticas': 'indisponiveis',
        'ufs': {'arquivo': 'ufs.geojson', 'inventario': 'ufs.inventory.json'},
        'municipios': {u: {'arquivo': f'municipios/{u}.geojson', 'inventario': f'municipios/{u}.inventory.json'} for u in PREPARED_UFS},
        'setores': {c: {'arquivo': f'../setores/{m["cd_uf"]}/{c}.geojson', 'inventario': f'../setores/{m["cd_uf"]}/{c}.inventory.json'} for c,m in MUNICIPALITIES.items()}}
    helper.atomic_json(output / 'catalogo.json', catalog)


def prepare(cache, output, reference, audit_path):
    from shapely import union_all, coverage_is_valid, coverage_simplify, get_num_coordinates, STRtree
    from shapely.ops import transform
    from shapely.validation import explain_validity
    from pyproj import Transformer
    helper = importlib.import_module('etl_pipeline.03_fetch_ibge_raw')
    report = {'status': 'preparing', 'referencia': 'Censo 2022', 'sources': {},
        'source_edition': 'malha_com_atributos CD2022, publicação listada em 2024-11-13; básico rev. 20260520',
        'source_attempts': [
            {'url': 'https://ftp.ibge.gov.br/organizacao_do_territorio/', 'result': 'HTTP 404'},
            {'url': 'https://geoftp.ibge.gov.br/organizacao_do_territorio/', 'result': 'CONNECT 403, domínio bloqueado na configuração inicial'},
            {'url': BASE + 'malha_com_atributos/', 'result': 'HTTP 200; alternativa oficial da mesma referência censitária examinada e selecionada'}],
        'statistics': 'indisponiveis; nenhum indicador extraído da malha ou imputado',
        'bairros': 'join não auditado; sem agrupamento ou atribuição de indicadores', 'exclusions_water_body_denylist': [],
        'transformations': ['dissolve geométrico dos distritos CD2022 por CD_UF e por CD_MUN das UFs configuradas; sem alteração de edição',
            'SIRGAS 2000 EPSG:4674 → WGS84 EPSG:4326, always_xy, sem arredondamento de coordenadas',
            'referência integral separada da versão de exibição; sem make_valid, buffer ou reparo silencioso'],
        'files': {}}
    output.mkdir(parents=True, exist_ok=True); reference.mkdir(parents=True, exist_ok=True)
    try:
        paths = {}
        for name, url in SOURCES.items():
            path, receipt = helper.download(url, cache, timeout=60)
            if receipt['sha256_local'] != PINNED_SHA256[name]:
                raise ValueError(f'Fonte {name} mudou de edição/hash: {receipt["sha256_local"]}')
            paths[name] = path; report['sources'][name] = receipt
        districts, report['district_schema'] = read_shapes(paths['distritos'], 'CD_DIST')
        report['district_schema'].pop('inventory')
        invalid = [[c, explain_validity(g)] for c, _, g in districts if not g.is_valid]
        if invalid:
            raise ValueError(f'Distritos inválidos: {invalid}')
        print(f'Distritos válidos: {len(districts)}', flush=True)
        by_uf, by_mun, mun_names = defaultdict(list), defaultdict(list), {}
        for code, p, g in districts:
            by_uf[p['CD_UF']].append(g)
            if p['CD_UF'] in PREPARED_UFS:
                by_mun[p['CD_MUN']].append(g)
                if p['CD_MUN'] in mun_names and mun_names[p['CD_MUN']] != p['NM_MUN']:
                    raise ValueError('Nomes municipais divergentes')
                mun_names[p['CD_MUN']] = p['NM_MUN']
        compare_inventory(by_uf, UF_META, 'UFs')
        ufs = []
        for code, gs in sorted(by_uf.items()):
            g = union_all(gs)
            if not g.is_valid: raise ValueError(f'Dissolve inválido: UF {code}')
            ufs.append((UF_META[code], g))
            print(f'UF {code}: {get_num_coordinates(g)} vértices', flush=True)
        municipal_items = {uf: [(dict(UF_META[uf], cd_mun=c, nm_mun=mun_names[c]), union_all(gs))
            for c, gs in sorted(by_mun.items()) if c.startswith(uf)] for uf in PREPARED_UFS}
        if any(not g.is_valid for items in municipal_items.values() for _,g in items): raise ValueError('Município dissolvido inválido')
        basic = {uf: {} for uf in PREPARED_UFS}
        for row in source_rows(paths['basico'], encoding='cp1252'):
            code = checked_code(row['CD_SETOR'], 'cd_setor')
            uf = row['CD_UF']
            if uf not in basic: continue
            if code in basic[uf]: raise ValueError(f'Setor básico duplicado: {code}')
            mun = checked_code(row['CD_MUN'], 'cd_mun')
            if not code.startswith(mun) or not mun.startswith(uf): raise ValueError('Município básico incompatível')
            basic[uf][code] = mun
        report['ufs'], report['municipios'] = {}, {}
        sector_items = {}
        for uf, spec in PREPARED_UFS.items():
            selected_cities = {c for c,m in MUNICIPALITIES.items() if m['cd_uf'] == uf}
            sectors, schema = read_shapes(paths['setores_' + spec['sigla'].lower()], 'CD_SETOR', selected_cities)
            source_inventory = schema.pop('inventory')
            if any(not c.startswith(uf) or not m.startswith(uf) for c,m in source_inventory.items()): raise ValueError('Setor fora da UF')
            report['ufs'][uf] = {'sector_schema': schema,
                'inventario_setorial': compare_inventory(list(source_inventory), list(basic[uf]), f'UF {uf} vs básico completo'),
                'inventario_municipal': compare_inventory([p['cd_mun'] for p,_ in municipal_items[uf]], list(set(basic[uf].values())), f'municípios {uf} vs básico')}
            if source_inventory != basic[uf]: raise ValueError('Pertencimento municipal difere entre malha/básico')
            for city in sorted(selected_cities):
                cfg = MUNICIPALITIES[city]
                selected = [(dict(UF_META[uf], cd_mun=p['CD_MUN'], nm_mun=p['NM_MUN'], cd_setor=c), g) for c,p,g in sectors if p['CD_MUN'] == city]
                inventory = compare_inventory([p['cd_setor'] for p,_ in selected], [c for c,m in basic[uf].items() if m == city], f'{cfg["nome"]} vs básico')
                if any(not g.is_valid for _,g in selected): raise ValueError(f'Setor inválido em {cfg["nome"]}; publicação bloqueada')
                if any(p['nm_mun'] != cfg['nome'] for p,_ in selected): raise ValueError('Nome municipal difere da configuração')
                mun_geom = next(g for p,g in municipal_items[uf] if p['cd_mun'] == city)
                projection = Transformer.from_crs(4674, cfg['epsg_area'], always_xy=True)
                outside = [{'cd_setor':p['cd_setor'],'area_m2':transform(projection.transform,g.difference(mun_geom)).area} for p,g in selected]
                spatial = {'method': f'difference vs município integral, EPSG:{cfg["epsg_area"]}', 'tolerance_m2':1,
                    'max_outside_m2':max(r['area_m2'] for r in outside), 'violations':[r for r in outside if r['area_m2'] > 1]}
                if spatial['violations']: raise ValueError(f'Setores fora do município {city}: {spatial}')
                report['municipios'][city] = {'nome':cfg['nome'],'inventario':inventory,'spatial_membership':spatial}
                sector_items[city] = selected
        # Referências integrais são mantidas para novas validações espaciais.
        wgs = Transformer.from_crs(4674, 4326, always_xy=True)
        exports = [('ufs.geojson', ufs)] + [(f'municipios/{uf}.geojson', items) for uf,items in municipal_items.items()] + [(f'setores/{MUNICIPALITIES[city]["cd_uf"]}/{city}.geojson', items) for city,items in sector_items.items()]
        for filename, items in exports:
            for _, g in items:
                if not g.is_valid or g.is_empty: raise ValueError(f'Geometria inválida em {filename}')
            refpath = reference / filename
            helper.atomic_json(refpath, collection(items))
            report['files']['reference/' + filename] = {'sha256_local': helper.sha256_file(refpath), 'bytes': refpath.stat().st_size}
            geometries = [g for _, g in items]
            coverage_valid = bool(coverage_is_valid(geometries))
            # Só aplicar simplificação de cobertura quando a cobertura é válida.
            # Setores mantêm todos os vértices da origem nesta entrega.
            simplified = coverage_simplify(geometries, .005 if filename == 'ufs.geojson' else .0001, simplify_boundary=True) if coverage_valid and not filename.startswith('setores/') else geometries
            if any(g.is_empty or not g.is_valid for g in simplified): raise ValueError('Simplificação invalidou uma entidade')
            if coverage_valid and not coverage_is_valid(simplified): raise ValueError('Simplificação rompeu a cobertura')
            # A matriz de adjacência exige preservar TODOS os limites compartilhados.
            if simplified is not geometries:
                original_edges, display_edges = [g.boundary for g in geometries], [g.boundary for g in simplified]
                pairs = set()
                for edges in (original_edges, display_edges):
                    tree = STRtree(edges)
                    for i, edge in enumerate(edges):
                        pairs.update((i, int(j)) for j in tree.query(edge) if j < i)
                for i, j in pairs:
                    before = original_edges[i].intersection(original_edges[j]).length > 0
                    after = display_edges[i].intersection(display_edges[j]).length > 0
                    if before != after: raise ValueError(f'Adjacência alterada: {filename}/{i}/{j}')
            result = [(p, transform(wgs.transform, g)) for (p, _), g in zip(items, simplified)]
            dest = output / filename
            # Serialização compacta; preserva precisão completa.
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps(collection(result), ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
            report['files'][filename] = {'sha256_local': helper.sha256_file(dest), 'bytes': dest.stat().st_size,
                'entities': len(result), 'source_vertices': sum(int(get_num_coordinates(g)) for g in geometries),
                'display_vertices': sum(int(get_num_coordinates(g)) for g in simplified), 'coverage_valid': coverage_valid,
                'simplification': 'coverage_simplify; adjacência e cobertura verificadas' if simplified is not geometries else 'nenhuma; limites integrais preservados',
                'tolerance_degrees': (.005 if filename == 'ufs.geojson' else .0001) if simplified is not geometries else None, 'ids_preserved': True}
        report['status'] = 'approved_cartography_only'
        report['limitations'] = ['Referência bruta preservada no cache; validade geométrica setorial auditada somente nos municípios exportados, sem reparos. A autointerseção conhecida em São José não pertence a estes recortes.', 'Indicadores e bairros são preparados separadamente pelo preparador demográfico.']
        write_catalog(output, report)
        helper.atomic_json(output / 'proveniencia.json', report)
        print(json.dumps(report['files'], ensure_ascii=False, indent=2), flush=True)
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error)
        raise
    finally:
        helper.atomic_json(audit_path, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path('data/raw/cache'))
    parser.add_argument('--output-dir', type=Path, default=Path('frontend/public/geo/official'))
    parser.add_argument('--reference-dir', type=Path, default=Path('data/raw/geometries_reference/censo2022'))
    parser.add_argument('--audit-file', type=Path, default=Path('etl_pipeline/manifests/official_geometry.audit.json'))
    args = parser.parse_args()
    prepare(args.cache_dir, args.output_dir, args.reference_dir, args.audit_file)

if __name__ == '__main__': main()
