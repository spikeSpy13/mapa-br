import config from '../../../etl_pipeline/manifests/prepared_municipalities.json';

export const PREPARATION_CONFIG = config;
export const PREPARED_MUNICIPALITIES: Record<string, { cd_uf: string; nome: string; epsg_area: number }> = config.municipios;
export const preparedMunicipality = (code: string | undefined) => code ? PREPARED_MUNICIPALITIES[code] : undefined;
export const preparedMunicipalityNames = Object.values(PREPARED_MUNICIPALITIES).map(m => m.nome).join(' e ');
