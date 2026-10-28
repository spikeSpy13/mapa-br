"""Partições distritais do produtor existente; recebe tabelas já auditadas."""
from pathlib import Path
from etl_pipeline.core_contract import normalize_code


def district_groups(detail):
    from etl_pipeline.prepare_census_demography import reconcile, FIELDS
    groups = {}
    territories = detail['territorios_setores']
    if set(territories) != set(detail['setores']): raise ValueError('Inventário distrital incompleto')
    for code, t in territories.items():
        district = normalize_code(t['cd_distrito'], 'cd_dist')
        if district != t['cd_distrito'] or not district.startswith(detail['cd_mun']): raise ValueError('Distrito incompatível')
        group = groups.setdefault(district, {'nome':t['nm_distrito'], 'cd_setores':[], 'indicadores':{}})
        if group['nome'] != t['nm_distrito']: raise ValueError('Nomes distritais conflitantes')
        group['cd_setores'].append(code)
    for group in groups.values():
        group['cd_setores'].sort()
        for field in FIELDS:
            values = [detail['setores'][c][field] for c in group['cd_setores']]
            if any(v['status'] != 'divulgada' for v in values): raise ValueError('Básico distrital indisponível; sem imputação')
            group['indicadores'][field] = {'valor':sum(v['valor'] for v in values),'status':'divulgada'}
    reconcile({k:g['indicadores'] for k,g in groups.items()}, detail['indicadores'])
    return dict(sorted(groups.items()))


def write_district_statistics(repo, detail):
    from etl_pipeline.prepare_census_demography import helper
    city, uf = detail['cd_mun'], detail['cd_uf']
    groups = district_groups(detail)
    folder = Path(repo) / f'frontend/public/geo/official/statistics/municipios/{uf}'
    source = {**detail['vinculo_bairro'], 'campos':['CD_SETOR','CD_DIST','NM_DIST','CD_SUBDIST','NM_SUBDIST']}
    common = {'tipo_dados':'oficiais','referencia':'2022-08-01','cd_uf':uf,'cd_mun':city,'fonte_distritos':source}
    entries, index = {}, {}
    for code,g in groups.items():
        entries[code] = {'nome':g['nome'],'indicadores':g['indicadores'],'total_setores':len(g['cd_setores']),
            'arquivo_setores':f'setores/{uf}/{city}/{code}.geojson','inventario_setores':f'setores/{uf}/{city}/{code}.inventory.json',
            'arquivo_estatisticas':f'{city}/{code}.json'}
        index.update({c:code for c in g['cd_setores']})
        part = {**common,'schema_version':'demografia-distrito-1','cd_distrito':code,'indicadores':g['indicadores'],
            'setores':{c:detail['setores'][c] for c in g['cd_setores']},'territorios_setores':{c:detail['territorios_setores'][c] for c in g['cd_setores']}}
        helper.atomic_json(folder / f'{city}/{code}.json',part,compact=True)
    summary = {**common,'schema_version':'demografia-distritos-1','indicadores':detail['indicadores'],
        'distritos':entries,'total_setores':len(index),'arquivo_indice_setores':f'{city}.setores.index.json'}
    helper.atomic_json(folder / f'{city}.json',summary,compact=True)
    helper.atomic_json(folder / f'{city}.setores.index.json',{'schema_version':'indice-setores-distritos-1','referencia':'2022-08-01','cd_mun':city,'setores':index},compact=True)
    return groups
