"""Configuração compartilhada com o frontend; sem I/O de rede no import."""
import json
from pathlib import Path
from etl_pipeline.core_contract import normalize_code

CONFIG_PATH = Path(__file__).parent / 'manifests/prepared_municipalities.json'


def validate_configuration(config):
    if config['schema_version'] != 'municipios-preparados-1' or config['referencia'] != 'Censo 2022':
        raise ValueError('Configuração municipal incompatível')
    if not config['municipios']: raise ValueError('Nenhum município configurado')
    for code, city in config['municipios'].items():
        if normalize_code(code, 'cd_mun') != code or normalize_code(city['cd_uf'], 'cd_uf') != city['cd_uf'] or not code.startswith(city['cd_uf']):
            raise ValueError('Município/UF não canônico na configuração')
        if 'particionar_por_distrito' in city and not isinstance(city['particionar_por_distrito'],bool): raise ValueError('Particionamento deve ser booleano')
        if city.get('reparo_exibicao') not in (None,'anel_sem_alterar_limites'): raise ValueError('Política geométrica desconhecida')
        if city['cd_uf'] not in config['ufs'] or not city['nome'].strip() or not isinstance(city['epsg_area'], int):
            raise ValueError('Metadados municipais incompletos')
    if set(config['ufs']) != {c['cd_uf'] for c in config['municipios'].values()}:
        raise ValueError('UF sem município configurado')
    # A seleção territorial das consultas precisa acompanhar a configuração.
    codes = ','.join(sorted(config['municipios']))
    states = ','.join(sorted(config['ufs']))
    for spec in config['sidra_temas'].values():
        if f'/n6/{codes}/' not in spec['url']: raise ValueError('Consulta temática não acompanha os municípios configurados')
    for spec in config['sidra_basico'].values():
        if f'/n6/in%20n3%20{states}/' not in spec['url']: raise ValueError('Consulta básica não acompanha as UFs configuradas')
    return config


CONFIG = validate_configuration(json.loads(CONFIG_PATH.read_text(encoding='utf-8')))
MUNICIPALITIES = CONFIG['municipios']
PREPARED_UFS = CONFIG['ufs']
