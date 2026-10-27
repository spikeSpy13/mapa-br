import copy
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from etl_pipeline.census_themes import aggregate, cell, combine, money, national_rows, subtract, table_rows, verify_dictionary, PROFILE_PATH
from etl_pipeline.census_themes import prepare_national_themes
from etl_pipeline.reference_data import REGIOES, UFS


def count(n): return {'valor':n,'status':'divulgada'}
MISSING={'valor':None,'status':'ausente'}
SECRET={'valor':None,'status':'sigilo'}

class CensusThemeTests(unittest.TestCase):
    def test_national_preparation_never_requires_geometries_or_municipal_tables(self):
        profile=json.loads(PROFILE_PATH.read_text()); national={}; receipts={}
        for query, spec in profile['consultas'].items():
            column='D5C' if query=='idade' else 'D4C'
            national[query]={(level,code,cat):count(0) for level,codes in [('1',['1']),('2',list(REGIOES)),('3',[u[0] for u in UFS]),('6',['4205407'])] for code in codes for cat in spec['dimensoes'][column]}
            receipts['sidra_'+query]={'url':spec['url'],'sha256_local':spec['sha256']}
        with tempfile.TemporaryDirectory() as tmp, patch('etl_pipeline.census_themes.read_national',return_value=(national,receipts)), patch('etl_pipeline.census_themes.table_rows',side_effect=AssertionError('Arquivo municipal não pode ser lido')):
            report=prepare_national_themes(Path(tmp))
            files=list(Path(tmp).glob('frontend/public/geo/official/statistics/temas/*/brasil.json'))
            self.assertEqual(len(files),8)
            self.assertEqual(report['ufs'],27)
            self.assertFalse((Path(tmp)/'frontend/public/geo/official/setores').exists())
            self.assertFalse(list(Path(tmp).glob('**/municipios/**/*.json')))
    def test_partial_totals_do_not_impute_missing_or_reconstruct_secret_counts(self):
        disclosed=cell(count(3),count(10))
        self.assertEqual(disclosed['percentual'],'30.00')
        rows=[disclosed,cell(MISSING,count(0),'Sem linha temática'),cell(SECRET,count(2))]
        result=aggregate(rows)
        self.assertEqual(result['valor'],3)
        self.assertEqual(result['status'],'parcial')
        self.assertIsNone(result['percentual'])
        self.assertEqual(result['denominador'],12)
        self.assertEqual(result['cobertura'],{'divulgados':1,'esperados':3,'sigilo':1,'ausentes':1})
        self.assertEqual(subtract(count(5),SECRET),SECRET)
        self.assertEqual(combine([count(0),SECRET]),SECRET)
        self.assertEqual(aggregate([cell(SECRET),cell(MISSING)])['status'],'sigilo')
        complete=aggregate([cell(count(1),count(2)),cell(count(2),count(8))])
        self.assertEqual(complete['percentual'],'30.00')  # razão das somas, não média de 50% e 25%
        self.assertEqual(cell(count(0),count(0))['percentual'],None)
        self.assertEqual(cell(count(0),count(3))['percentual'],'0.00')
        with self.assertRaises(ValueError): subtract(count(1),count(2))

    def test_mapping_is_dictionary_specific_and_corrected_domicile_release_is_fixed(self):
        profile=json.loads(PROFILE_PATH.read_text())
        self.assertIn('20261021.zip',profile['arquivos']['caracteristicas_domicilio1']['url'])
        self.assertEqual(profile['metricas']['dppo']['variaveis'],['V00001'])
        self.assertNotEqual(profile['metricas']['dppo']['variaveis'],[profile['errata']['variavel']])
        m=profile['metricas']['homens']
        rows=[['Pessoas','Demografia','V01007',m['definicoes']['V01007']]]
        verify_dictionary(rows,{'homens':m})
        rows[0][-1]='Significado de outra edição'
        with self.assertRaises(ValueError): verify_dictionary(rows,{'homens':m})
        self.assertEqual(profile['metricas']['idade_0_14']['variaveis'],['V01031','V01032','V01033'])
        self.assertEqual(profile['metricas']['idade_60_mais']['variaveis'],['V01040','V01041'])
        self.assertEqual(profile['metricas']['agua_rede']['denominador'],'dppo')
        self.assertEqual(profile['metricas']['raca_indigena']['variaveis'],['V01321'])

    def test_join_preserves_text_codes_and_detects_duplicates_extras_and_missing_rows(self):
        spec={'codigo':'CD_setor','encoding':'utf-8-sig'}
        ids={'420540705000001','420540705000002'}
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'source.zip'
            def write(lines):
                with zipfile.ZipFile(p,'w') as z:z.writestr('table.csv','CD_setor;V01007\n'+lines)
            write('420540705000001;0\n')
            result=table_rows(p,spec,'cd_setor',ids)
            self.assertEqual(set(ids)-result.keys(),{'420540705000002'})
            self.assertEqual(result['420540705000001']['V01007'],'0')
            for text in ['420540705000001;0\n420540705000001;1\n','420540705999999;1\n','420540705000001;1;extra\n']:
                write(text)
                with self.assertRaises(ValueError):table_rows(p,spec,'cd_setor',ids)

    def test_national_direct_tables_validate_dimensions_and_complete_territories(self):
        spec={'variavel':'93','rotulo_variavel':'População residente','unidade':'Pessoas','tabela':'9605','dimensoes':{'D4C':{'95251':'Total'}}}
        rows=[{}]+[{'NC':level,'D1C':code,'D2C':'93','D2N':'População residente','D3C':'2022','D3N':'2022','MN':'Pessoas','D4C':'95251','D4N':'Total','V':'7'} for level,codes in [('1',['1']),('2',list(REGIOES)),('3',[u[0] for u in UFS]),('6',['4205407'])] for code in codes]
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'sidra.json'
            p.write_text(json.dumps(rows));result=national_rows(p,spec)
            self.assertEqual(result[('1','1','95251')]['valor'],7)
            for change in ['dup','missing','category','year','variable']:
                bad=copy.deepcopy(rows)
                if change=='dup':bad.append(bad[-1])
                elif change=='missing':bad.pop()
                elif change=='category':bad[1]['D4N']='Outra categoria'
                elif change=='year':bad[1]['D3C']='2010'
                else:bad[1]['D2C']='1000093'
                p.write_text(json.dumps(bad))
                with self.assertRaises(ValueError):national_rows(p,spec)
            spec['dimensoes']['D4C']['2779']='Branca'
            p.write_text(json.dumps(rows))
            # Uma categoria inteira ausente também deve falhar, mesmo que todos
            # os territórios restantes tenham a categoria Total.
            with self.assertRaises(ValueError):national_rows(p,spec)

    def test_income_is_decimal_published_value_not_weighted_or_summed(self):
        self.assertEqual(money('10816,47',',')['valor'],'10816.47')
        self.assertEqual(money('2.345','.')['valor'],'2.34')
        self.assertEqual(money('X','.')['status'],'sigilo')
        self.assertIsNone(money('0','.')['percentual'])
        self.assertEqual(money('0','.')['valor'],'0.00')
