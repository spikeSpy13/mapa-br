import copy
import unittest
from etl_pipeline.prepare_census_demography import measure, parse_sidra, extract_sectors, reconcile
from etl_pipeline.reference_data import UFS, REGIOES


def ind(p=0, d=0): return {'populacao': measure(str(p), 'populacao'), 'domicilios': measure(str(d), 'domicilios')}

class DemographyTests(unittest.TestCase):
    def test_zero_absence_and_secrecy_are_distinct(self):
        self.assertEqual(measure('0', 'populacao'), {'valor': 0, 'status': 'divulgada'})
        self.assertEqual(measure('X', 'populacao'), {'valor': None, 'status': 'sigilo'})
        self.assertEqual(measure('', 'populacao'), {'valor': None, 'status': 'ausente'})
        for invalid in ('-1', 'NaN', 'Infinity', '1.5'):
            with self.assertRaises(ValueError): measure(invalid, 'populacao')

    def test_exact_join_and_reconciliation(self):
        rows = [{'CD_MUN': '4205407', 'CD_SETOR': '420540705000001', 'v0001': '0', 'v0002': '4'},
                {'CD_MUN': '4205407', 'CD_SETOR': '420540705000002', 'v0001': '10', 'v0002': '3'}]
        ids = [r['CD_SETOR'] for r in rows]
        sectors = extract_sectors(rows, ids)
        self.assertEqual(reconcile(sectors, ind(10, 7)), {'populacao': 10, 'domicilios': 7})
        for bad, expected in [(rows + [rows[0]], ids), (rows[:1], ids), (rows, ids[:1])]:
            with self.assertRaises(ValueError): extract_sectors(bad, expected)
        with self.assertRaises(ValueError): reconcile(sectors, ind(11, 7))
        hidden = copy.deepcopy(sectors); hidden[ids[0]]['populacao'] = measure('X', 'populacao')
        with self.assertRaises(ValueError): reconcile(hidden, ind(10, 7))
        self.assertEqual(hidden[ids[0]]['populacao']['status'], 'sigilo')

    def test_sidra_requires_complete_direct_panorama_and_exact_dimensions(self):
        header = {'D2C': 'Variável (Código)', 'D3C': 'Ano (Código)'}
        data = [header] + [dict(NC=level, D1C=code, D2C='93', D2N='População residente', D3C='2022', D3N='2022', MN='Pessoas', V='5')
                          for level, codes in [('1', ['1']), ('2', list(REGIOES)), ('3', [u[0] for u in UFS]), ('6', ['4205407'])] for code in codes]
        result = parse_sidra(data, 'populacao')
        # Brasil is the direct published value, not the sum of 27 fixtures below.
        self.assertEqual(result[('1', '1')]['valor'], 5)
        for bad in (data[:-2], data + [data[-1]], [header]):
            with self.assertRaises(ValueError): parse_sidra(bad, 'populacao')
        for field, value in [('D3C', '2010'), ('D2C', '614'), ('MN', 'Percentual')]:
            bad = copy.deepcopy(data); bad[1][field] = value
            with self.assertRaises(ValueError): parse_sidra(bad, 'populacao')
        households = copy.deepcopy(data)
        for r in households[1:]: r.update(D2C='617', D2N='Domicílios recenseados', MN='Domicílios', D4C='59993', D4N='Total')
        parse_sidra(households, 'domicilios')
        households[1]['D4C'] = '59998'
        with self.assertRaises(ValueError): parse_sidra(households, 'domicilios')

class NeighborhoodTests(unittest.TestCase):
    def test_only_declared_codes_are_used_and_missing_is_not_a_neighborhood(self):
        from etl_pipeline.prepare_census_demography import neighborhood_identity, neighborhood_groups
        self.assertEqual(neighborhood_identity({'CD_MUN': '4205407', 'CD_BAIRRO': '.', 'NM_BAIRRO': ''}), (None, None))
        for code, name in [('.', 'Centro'), ('4209102001', 'Outro'), ('0000000000', 'Dummy'), ('4205407001', '')]:
            with self.assertRaises(ValueError): neighborhood_identity({'CD_MUN': '4205407', 'CD_BAIRRO': code, 'NM_BAIRRO': name})
        sectors = {'420540705000001': ind(0, 7), '420540705000002': ind(10, 3)}
        links = {'420540705000001': ('4205407001', 'Centro'), '420540705000002': (None, None)}
        groups = neighborhood_groups(sectors, links)
        self.assertEqual(groups['bairro:4205407001']['indicadores'], ind(0, 7))
        self.assertIsNone(groups['sem_bairro:4205407']['cd_bairro'])
        self.assertEqual(reconcile({k: g['indicadores'] for k, g in groups.items()}, ind(10, 10)), {'populacao': 10, 'domicilios': 10})
        with self.assertRaises(ValueError): neighborhood_groups(sectors, dict(list(links.items())[:1]))

    def test_dbf_requires_exact_codes_and_membership_not_name_or_prefix_guessing(self):
        from etl_pipeline.prepare_census_demography import verify_neighborhood_links
        row = {'CD_MUN': '4205407', 'CD_SETOR': '420540705000001', 'CD_BAIRRO': '4205407001', 'NM_BAIRRO': 'Centro'}
        links = {row['CD_SETOR']: ('4205407001', 'Centro')}
        verify_neighborhood_links(links, [row])
        for records in ([], [row, row], [dict(row, CD_BAIRRO='4205407002')], [dict(row, NM_BAIRRO='Outro')], [dict(row, CD_SETOR='420540705000002')]):
            with self.assertRaises(ValueError): verify_neighborhood_links(links, records)

    def test_group_counts_do_not_publish_a_partial_sum_as_a_total(self):
        from etl_pipeline.prepare_census_demography import neighborhood_groups
        sectors = {'420540705000001': ind(0, 7), '420540705000002': {'populacao': measure('X', 'populacao'), 'domicilios': measure('', 'domicilios')}}
        groups = neighborhood_groups(sectors, {c: ('4205407001', 'Centro') for c in sectors})
        self.assertEqual(groups['bairro:4205407001']['indicadores']['populacao'], {'valor': None, 'status': 'sigilo'})
        self.assertEqual(groups['bairro:4205407001']['indicadores']['domicilios'], {'valor': None, 'status': 'ausente'})

class NeighborhoodLookupTests(unittest.TestCase):
    def test_light_lookup_keeps_every_sector_and_source_names_without_repetition(self):
        from etl_pipeline.prepare_census_demography import neighborhood_groups, neighborhood_lookup
        sectors = {'420540705000001': ind(0, 7), '420540705000002': ind(10, 3)}
        groups = neighborhood_groups(sectors, {'420540705000001': ('4205407001', 'Centro'), '420540705000002': (None, None)})
        lookup = neighborhood_lookup(sectors, groups, {'evidencia': 'teste'})
        self.assertEqual(lookup['bairros'], {'4205407001': 'Centro'})
        self.assertEqual(lookup['setores'], {'420540705000001': '4205407001', '420540705000002': None})
        self.assertEqual(lookup['cobertura'], {'total_setores': 2, 'com_bairro': 1, 'sem_bairro': 1, 'bairros': 1})
        self.assertEqual(lookup['fonte'], {'evidencia': 'teste'})
        self.assertEqual(lookup['referencia_territorial'], 'Censo 2022')
        duplicate = copy.deepcopy(groups)
        duplicate['sem_bairro:4205407']['cd_setores'].append('420540705000001')
        with self.assertRaises(ValueError): neighborhood_lookup(sectors, duplicate, {})
        with self.assertRaises(ValueError): neighborhood_lookup(sectors, {}, {})

class MunicipalShareTests(unittest.TestCase):
    def test_decimal_half_even_two_places_and_missing_denominator(self):
        from etl_pipeline.prepare_census_demography import municipal_share
        for n, d, expected in [(1, 32, '3.12'), (3, 32, '9.38'), (1, 20000, '0.00'), (3, 20000, '0.02'), (0, 10, '0.00'), (10, 10, '100.00')]:
            self.assertEqual(municipal_share(measure(str(n), 'populacao'), measure(str(d), 'populacao')), {'valor': expected, 'status': 'divulgada'})
        for n, d, status in [('0', '0', 'ausente'), ('X', '10', 'sigilo'), ('', '10', 'ausente'), ('1', '', 'ausente'), ('1', 'X', 'sigilo'), ('X', '0', 'ausente')]:
            self.assertEqual(municipal_share(measure(n, 'populacao'), measure(d, 'populacao')), {'valor': None, 'status': status})
        with self.assertRaises(ValueError): municipal_share(measure('11', 'populacao'), measure('10', 'populacao'))

    def test_complete_municipal_denominator_keeps_unknown_group_and_counts(self):
        from etl_pipeline.prepare_census_demography import neighborhood_groups
        sectors = {'420540705000001': ind(3, 4), '420540705000002': ind(1, 6)}
        groups = neighborhood_groups(sectors, {'420540705000001': ('4205407001', 'Centro'), '420540705000002': (None, None)}, ind(4, 10))
        self.assertEqual(groups['bairro:4205407001']['participacao_municipal'], {'populacao': {'valor': '75.00', 'status': 'divulgada'}, 'domicilios': {'valor': '40.00', 'status': 'divulgada'}})
        self.assertEqual(groups['sem_bairro:4205407']['participacao_municipal']['populacao']['valor'], '25.00')
        for field, expected in [('populacao', 4), ('domicilios', 10)]:
            self.assertEqual(sum(g['indicadores'][field]['valor'] for g in groups.values()), expected)
