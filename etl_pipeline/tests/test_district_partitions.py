import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from etl_pipeline.district_partitions import district_groups, write_district_statistics
from etl_pipeline.prepare_official_geometries import display_geometry, write_catalog


def count(n):return {'valor':n,'status':'divulgada'}

def fixture():
    # Associação vem do atributo, deliberadamente não do prefixo distrital do setor.
    ids=['355030805000001','355030805000002']
    return {'cd_uf':'35','cd_mun':'3550308','indicadores':{'populacao':count(10),'domicilios':count(6)},
        'setores':{ids[0]:{'populacao':count(0),'domicilios':count(2)},ids[1]:{'populacao':count(10),'domicilios':count(4)}},
        'territorios_setores':{code:{'cd_distrito':d,'nm_distrito':n,'cd_subdistrito':d+'00','nm_subdistrito':None} for code,d,n in [(ids[0],'355030801','Água Rasa'),(ids[1],'355030802','Alto de Pinheiros')]},'vinculo_bairro':{'metodo':'atributos_oficiais_csv_dbf','campos':['CD_SETOR','CD_BAIRRO','NM_BAIRRO']}}


class DistrictPartitionTests(unittest.TestCase):
    def test_partitions_use_declared_district_keep_zero_and_conserve_totals(self):
        detail=fixture();groups=district_groups(detail)
        self.assertEqual(groups['355030801']['cd_setores'],['355030805000001'])
        self.assertEqual(groups['355030801']['indicadores']['domicilios']['valor'],2)
        for mutation in ('missing','other_city','conflicting_name','total'):
            d=copy.deepcopy(detail)
            if mutation=='missing':d['territorios_setores'].pop('355030805000001')
            elif mutation=='other_city':d['territorios_setores']['355030805000001']['cd_distrito']='350600305'
            elif mutation=='conflicting_name':d['territorios_setores']['355030805000002']['cd_distrito']='355030801'
            else:d['indicadores']['populacao']=count(11)
            with self.assertRaises(ValueError):district_groups(d)

    def test_summary_does_not_embed_sectors_and_index_and_parts_are_disjoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_district_statistics(Path(tmp),fixture())
            root=Path(tmp)/'frontend/public/geo/official/statistics/municipios/35'
            summary=json.loads((root/'3550308.json').read_text());self.assertNotIn('setores',summary)
            self.assertEqual(summary['total_setores'],2)
            index=json.loads((root/'3550308.setores.index.json').read_text())['setores']
            self.assertEqual(index,{'355030805000001':'355030801','355030805000002':'355030802'})
            ids=[]
            for code in summary['distritos']:
                part=json.loads((root/f'3550308/{code}.json').read_text());ids.extend(part['setores'])
                self.assertEqual(part['cd_distrito'],code)
                self.assertTrue(all(v['cd_distrito']==code for v in part['territorios_setores'].values()))
            self.assertEqual(set(ids),set(index));self.assertEqual(len(ids),len(set(ids)))

    def test_display_repair_is_opt_in_preserves_boundary_area_and_original(self):
        from shapely.geometry import Polygon
        coords=[(0,0),(1,0),(1,1),(0,1),(0,0),(-1,0),(-1,-1),(0,-1),(0,0)]
        g=Polygon([(-46.5+x*.001,-23.5+y*.001) for x,y in coords])
        self.assertFalse(g.is_valid)
        with self.assertRaises(ValueError):display_geometry(g,31983)
        fixed,audit=display_geometry(g,31983,'anel_sem_alterar_limites')
        self.assertTrue(fixed.is_valid);self.assertFalse(g.is_valid)
        self.assertTrue(g.boundary.equals(fixed.boundary))
        self.assertLessEqual(abs(audit['diferenca_area_m2']),audit['tolerancia_area_m2'])
        bad=Polygon([(-46.5,-23.5),(-46.49,-23.49),(-46.49,-23.5),(-46.5,-23.49),(-46.5,-23.5)])
        with self.assertRaises(ValueError):display_geometry(bad,31983,'anel_sem_alterar_limites')

    def test_partition_catalog_retains_full_inventory_for_demography_without_monolith(self):
        # O segundo preparador depende do inventário municipal, não do GeoJSON
        # monolítico. Particionar a exibição não pode quebrar essa dependência.
        city='3550308'
        entries={
            'ufs.geojson':('cd_uf',['35']),
            'municipios/35.geojson':('cd_mun',[city]),
            f'setores/35/{city}.geojson':('cd_setor',['355030805000001','355030805000002']),
            f'distritos/35/{city}.geojson':('cd_distrito',['355030801','355030802']),
            f'setores/35/{city}/355030801.geojson':('cd_setor',['355030805000001']),
            f'setores/35/{city}/355030802.geojson':('cd_setor',['355030805000002']),
        }
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for filename,(field,ids) in entries.items():
                target=root/filename;target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text(json.dumps({'features':[{'properties':{field:code}} for code in ids]}))
            report={'files':{f:{'bytes':(root/f).stat().st_size} for f in entries},
                'municipios':{city:{'distritos':{'355030801':{},'355030802':{}}}}}
            with patch('etl_pipeline.prepare_official_geometries.MUNICIPALITIES',{city:{'cd_uf':'35','particionar_por_distrito':True}}), patch('etl_pipeline.prepare_official_geometries.PREPARED_UFS',{'35':{}}):
                write_catalog(root,report)
            self.assertFalse((root/f'setores/35/{city}.geojson').exists())
            ids=json.loads((root/f'setores/35/{city}.inventory.json').read_text())['ids']
            self.assertEqual(ids,['355030805000001','355030805000002'])
            catalog=json.loads((root/'catalogo.json').read_text())
            self.assertNotIn(city,catalog['setores']);self.assertIn(city,catalog['distritos'])
            self.assertIn(f'setores/35/{city}.geojson',report['monoliticos_nao_servidos'])
            self.assertTrue(all((root/f).exists() for f in report['files']))
