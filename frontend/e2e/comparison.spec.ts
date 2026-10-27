import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const output = process.env.MAPA_BR_EVIDENCE_DIR || '/tmp/mapa-br-comparison';
mkdirSync(output, { recursive: true });
const detail = JSON.parse(readFileSync('public/geo/official/statistics/municipios/42/4205407.json', 'utf8'));

test('ranking, três bairros, denominador completo e seleção persistente na navegação', async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', r => { if (r.url().includes('/geo/')) requests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?level=municipio&cd_uf=42&cd_mun=4205407');
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true');
  const panel = page.getByRole('region', { name: 'Comparação entre bairros', exact: true });
  const ranking = panel.locator('[data-ranking-id]');
  const requestCount = requests.length;
  for (const metric of ['populacao', 'domicilios']) {
    await panel.getByRole('combobox', { name: 'Indicador do ranking' }).selectOption(metric);
    const entries = Object.entries(detail.bairros).filter(([, b]: any) => b.cd_bairro !== null).sort(([, a]: any, [, b]: any) => b.indicadores[metric].valor - a.indicadores[metric].valor || a.nome.localeCompare(b.nome, 'pt-BR'));
    expect(await ranking.evaluateAll(els => els.map(el => el.getAttribute('data-ranking-id')))).toEqual(entries.map(([id]) => id));
    await expect(ranking).toHaveCount(87);
    const max = Math.max(...Object.values(detail.bairros).map((b: any) => b.indicadores[metric].valor));
    const actual = await ranking.evaluateAll(els => els.map(el => ({ id: el.getAttribute('data-ranking-id')!, width: (el.querySelector('.neighborhood-bar i') as HTMLElement).style.width, text: el.querySelector('.neighborhood-rank-value')!.textContent! })));
    for (const row of actual) {
      const b = detail.bairros[row.id];
      expect(parseFloat(row.width)).toBeCloseTo(b.indicadores[metric].valor / max * 100, 4);
      expect(row.text).toContain(b.participacao_municipal[metric].valor.replace('.', ',') + '%');
      expect(row.text).toContain(new Intl.NumberFormat('pt-BR').format(b.indicadores[metric].valor));
    }
  }
  const centroToggle = panel.getByRole('checkbox', { name: 'Comparar Centro', exact: true });
  await centroToggle.focus();
  expect(await centroToggle.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await centroToggle.press('Space');
  for (const name of ['Abraão', 'Agronômica']) await panel.getByRole('checkbox', { name: `Comparar ${name}`, exact: true }).check();
  await expect(panel.getByRole('checkbox', { name: 'Comparar Açores', exact: true })).toBeDisabled();
  await expect(panel.locator('[data-comparison-id]')).toHaveCount(3);
  const centro = panel.getByRole('article', { name: 'Comparação de Centro', exact: true });
  await expect(centro.locator('[data-value="populacao"]')).toHaveText('42.308');
  await expect(centro.locator('[data-share="populacao"]')).toHaveText('7,88%');
  await expect(centro.locator('[data-value="domicilios"]')).toHaveText('23.368');
  await expect(centro.locator('[data-share="domicilios"]')).toHaveText('8,20%');
  await expect(centro.locator('[data-value="setores"]')).toHaveText('97');
  const unknown = panel.getByRole('region', { name: 'Setores sem bairro identificado', exact: true });
  await expect(unknown.locator('[data-share="populacao"]')).toHaveText('3,30%');
  await expect(unknown.locator('[data-share="domicilios"]')).toHaveText('3,09%');
  await expect(unknown.locator('[data-value="populacao"]')).toHaveText('17.748');
  await expect(panel.getByTestId('comparison-denominator')).toContainText('537.211 pessoas e 285.000 domicílios');
  await expect(page).toHaveURL(/level=municipio/);
  expect(requests.length).toBe(requestCount);
  await panel.locator('.neighborhood-ranking').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: `${output}/comparacao-desktop.png`, fullPage: true });
  await panel.screenshot({ path: `${output}/comparacao-painel-desktop.png` });
  await panel.getByRole('button', { name: 'Selecionar bairro Centro', exact: true }).press('Enter');
  await expect(page.getByTestId('official-populacao')).toHaveText('42.308');
  await expect(panel.locator('[data-comparison-id]')).toHaveCount(3);
  await page.locator('[data-territory-id="420540705000001"]').click();
  await expect(page.getByTestId('official-populacao')).toHaveText('430');
  await expect(panel.locator('[data-comparison-id]')).toHaveCount(3);
  await expect(panel.getByTestId('comparison-denominator')).toContainText('537.211 pessoas');
  await page.getByRole('button', { name: 'Voltar ao bairro', exact: true }).click();
  await panel.getByRole('button', { name: 'Remover Centro da comparação', exact: true }).click();
  await expect(panel.locator('[data-comparison-id]')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Limpar comparação', exact: true }).click();
  await expect(panel.locator('[data-comparison-id]')).toHaveCount(0);
  await panel.getByRole('checkbox', { name: 'Comparar Centro', exact: true }).check();
  await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption('42');
  await page.locator('[data-territory-id="4209102"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Joinville');
  await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption('42');
  await page.locator('[data-territory-id="4205407"]').click();
  await expect(panel.getByRole('status')).toContainText('0 de 3 bairros selecionados');
  expect(errors).toEqual([]);
  for (const field of ['populacao','domicilios']) expect(Object.values(detail.bairros).reduce((sum: number, b: any) => sum + b.indicadores[field].valor, 0)).toBe(detail.indicadores[field].valor);
});

test('artefato legado conserva contagens sem fabricar percentuais', async ({ page }) => {
  const legacy = structuredClone(detail);
  for (const b of Object.values(legacy.bairros) as any[]) delete b.participacao_municipal;
  await page.route('**/statistics/municipios/42/4205407.json', r => r.fulfill({ json: legacy }));
  await page.goto('/?level=municipio&cd_uf=42&cd_mun=4205407');
  const panel = page.getByRole('region', { name: 'Comparação entre bairros', exact: true });
  await panel.getByRole('checkbox', { name: 'Comparar Centro', exact: true }).check();
  const card = panel.getByRole('article', { name: 'Comparação de Centro', exact: true });
  await expect(card.locator('[data-value="populacao"]')).toHaveText('42.308');
  await expect(card.locator('[data-share="populacao"]')).toHaveText('Indisponível');
  await expect(panel.getByText('Percentuais não disponíveis no arquivo municipal carregado.')).toBeVisible();
});

test.describe('comparação móvel', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('toque, rótulos e remoção nos cartões sem transbordar a tela', async ({ page }) => {
    await page.goto('/?level=municipio&cd_uf=42&cd_mun=4205407');
    await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true');
    const panel = page.getByRole('region', { name: 'Comparação entre bairros', exact: true });
    for (const name of ['Centro','Abraão','Agronômica']) await panel.getByRole('checkbox', { name: `Comparar ${name}`, exact: true }).tap();
    await expect(panel.locator('[data-comparison-id]')).toHaveCount(3);
    for (const card of await panel.locator('[data-comparison-id]').all()) {
      await expect(card.getByText('Participação na população municipal', { exact: true })).toBeVisible();
      await expect(card.getByText('Participação nos domicílios municipais', { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.locator('.neighborhood-ranking').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${output}/comparacao-celular.png`, fullPage: true });
    await panel.getByTestId('comparison-cards').screenshot({ path: `${output}/comparacao-cartoes-celular.png` });
    await panel.getByRole('button', { name: 'Remover Centro da comparação', exact: true }).tap();
    await expect(panel.locator('[data-comparison-id]')).toHaveCount(2);
    await panel.getByRole('button', { name: 'Limpar comparação', exact: true }).tap();
    await expect(panel.locator('[data-comparison-id]')).toHaveCount(0);
  });
});
