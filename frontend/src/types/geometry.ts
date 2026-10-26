import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
/** Geometria navegável, independente da disponibilidade de indicadores. */
export interface MapGeometry {
  collection: FeatureCollection<Polygon | MultiPolygon>;
  field: string;
  /** Seleção de um bairro sem substituir a identidade/indicador de cada setor. */
  selectedFeatureIds?: ReadonlySet<string>;
  rowByFeature: Map<string, string>;
}
