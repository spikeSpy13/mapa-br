import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from etl_pipeline.prepared_municipalities import CONFIG, validate_configuration
from etl_pipeline.census_themes import table_rows
from etl_pipeline.prepare_census_demography import extract_sectors, neighborhood_groups, neighborhood_lookup, district_identity, verify_neighborhood_links


class PreparedMunicipalityTests(unittest.TestCase):
    def test_configuration_is_shared_and_snapshots_match_territorial_selection(self):
        validate_configuration(copy.deepcopy(CONFIG))
        for mutation in ('numeric','wrong_uf','missing_uf','stale_query'):
            c=copy.deepcopy(CONFIG)
            if mutation=='numeric': c['municipios'][3500709]=c['municipios'].pop('3500709')
            elif mutation=='wrong_uf': c['municipios']['3500709']['cd_uf']='42'
            elif mutation=='missing_uf': del c['ufs']['35']
            else: c['sidra_temas']['sexo']['url']=c['sidra_temas']['sexo']['url'].replace(','.join(sorted(c['municipios'])),','.join(sorted(c['municipios'])[:-1]))
            with self.assertRaises((ValueError,TypeError)):validate_configuration(c)

    def test_sidra_absolute_zero_is_source_specific(self):
        from etl_pipeline.prepare_census_demography import sidra_measure, measure
        self.assertEqual(sidra_measure('-', 'contagem'),{'valor':0,'status':'divulgada'})
        self.assertEqual(sidra_measure('X', 'contagem'),{'valor':None,'status':'sigilo'})
        self.assertEqual(sidra_measure('...', 'contagem'),{'valor':None,'status':'ausente'})
        self.assertEqual(measure('-', 'contagem'),{'valor':None,'status':'ausente'})

    def test_sector_reader_filters_all_configured_cities_in_a_single_pass(self):
        codes={'350070905000001','350600305000002','355030805000001','420540705000001'}
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'table.zip'
            def write(text):
                with zipfile.ZipFile(path,'w') as archive: archive.writestr('table.csv','CD_SETOR;V00001\n'+text)
            write('350070905000001;0\n420540705000001;X\n350600305000002;5\n355030805000001;3\n355220505000001;7\n')
            rows=table_rows(path,{'codigo':'CD_SETOR','encoding':'utf-8'},'cd_setor',codes,CONFIG['municipios'])
            self.assertEqual(set(rows),codes)
            self.assertEqual(rows['350070905000001']['V00001'],'0')
            self.assertEqual(rows['350600305000002']['V00001'],'5')
            for bad in ('350070905000001;0\n350070905000001;1\n','350070905999999;3\n'):
                write(bad)
                with self.assertRaises(ValueError):table_rows(path,{'codigo':'CD_SETOR','encoding':'utf-8'},'cd_setor',codes,CONFIG['municipios'])

    def test_agudos_inventory_unknown_group_and_district_are_independent_from_florianopolis(self):
        a={'CD_MUN':'3500709','CD_SETOR':'350070905000001','v0001':'0','v0002':'4','CD_BAIRRO':'.','NM_BAIRRO':'','CD_DIST':'350070905','NM_DIST':'Agudos','CD_SUBDIST':'35007090500','NM_SUBDIST':''}
        f={**a,'CD_MUN':'4205407','CD_SETOR':'420540705000001'}
        links={};sectors=extract_sectors([a,f],[a['CD_SETOR']],links)
        self.assertEqual(list(sectors),[a['CD_SETOR']])
        groups=neighborhood_groups(sectors,links)
        self.assertEqual(list(groups),['sem_bairro:3500709'])
        lookup=neighborhood_lookup(sectors,groups,{})
        self.assertEqual(lookup['cd_mun'],'3500709')
        self.assertEqual(lookup['cobertura']['com_bairro'],0)
        self.assertEqual(groups['sem_bairro:3500709']['indicadores']['domicilios']['valor'],4)
        verify_neighborhood_links(links,[a,f])
        self.assertEqual(district_identity(a)['cd_distrito'],'350070905')
        self.assertIsNone(district_identity(a)['nm_subdistrito'])
        with self.assertRaises(ValueError):district_identity({**a,'CD_DIST':'420540705'})
        with self.assertRaises(ValueError):extract_sectors([a],[a['CD_SETOR'],'420540705000001'])
