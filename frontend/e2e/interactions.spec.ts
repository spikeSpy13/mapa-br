import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { tseFixture } from '../src/test/tseFixture';
const output = process.env.MAPA_BR_EVIDENCE_DIR || '/tmp/mapa-br-interactions';
mkdirSync(output, { recursive: true });

async function officialPoint(page: Page, file: string, coordinate: [number, number]) {
  const geo = JSON.parse(readFileSync(`public/geo/official/${file}`, 'utf8'));
  const points: number[][] = [];
  function scan(value: unknown) { if (!Array.isArray(value)) return; if (typeof value[0] === 'number') points.push(value); else value.forEach(scan); }
  geo.features.forEach((f: { geometry: { coordinates: unknown } }) => scan(f.geometry.coordinates));
  const mercator = ([x, y]: number[]) => [(x! + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + y! * Math.PI / 360)) / Math.PI) / 2];
  const projected = points.map(mercator);
  const bounds = projected.reduce(([x0, y0, x1, y1], [x, y]) => [Math.min(x0!, x!), Math.min(y0!, y!), Math.max(x1!, x!), Math.max(y1!, y!)], [Infinity, Infinity, -Infinity, -Infinity]);
  const canvas = page.getByTestId('official-map').locator('canvas'), box = (await canvas.boundingBox())!;
  const [x0, y0, x1, y1] = bounds, [x, y] = mercator(coordinate);
  const scale = Math.min((box.width - 70) / (x1! - x0!), (box.height - 70) / (y1! - y0!));
  return { canvas, position: { x: box.width / 2 + (x! - (x0! + x1!) / 2) * scale, y: box.height / 2 + (y! - (y0! + y1!) / 2) * scale } };
}

test('oficial: hover mapa/lista, teclado, Escape e lazy loading preservam KPIs', async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', r => { if (/\/geo\//.test(r.url())) requests.push(new URL(r.url()).pathname); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const map = page.getByTestId('official-map'), wrap = page.locator('.demo-map-wrap');
  await expect(map).toHaveAttribute('data-ready', 'true');
  const originalCanvas = await map.locator('canvas').elementHandle(), count = requests.length;
  const sc = page.locator('button[data-territory-id="42"]');
  const point = await officialPoint(page, 'ufs.geojson', [-50.5, -27.2]);
  const canvasBefore = await point.canvas.screenshot();
  await point.canvas.hover({ position: point.position });
  await expect(wrap).toHaveAttribute('data-preview-id', '42');
  await expect(sc).toHaveClass(/is-hovered/);
  await expect(sc).toBeInViewport();
  await expect(page.getByTestId('map-tooltip')).toContainText('7.610.361');
  await expect(page.getByTestId('official-populacao')).toHaveText('203.080.756');
  expect(await point.canvas.screenshot()).not.toEqual(canvasBefore);
  expect(requests).toHaveLength(count); expect(requests.some(p => /municipios|setores/.test(p))).toBe(false);
  await page.screenshot({ path: `${output}/hover-brasil-sc.png`, fullPage: true });
  await page.locator('.brand').hover();
  await expect(wrap).not.toHaveAttribute('data-preview-id');
  await expect(page.getByTestId('map-tooltip')).toHaveCount(0);
  await sc.focus();
  await expect(wrap).toHaveAttribute('data-preview-id', '42');
  const tip = await page.getByTestId('map-tooltip').boundingBox(), stage = await page.locator('.demo-map-stage').boundingBox();
  expect(tip!.x).toBeGreaterThanOrEqual(stage!.x); expect(tip!.x + tip!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  await sc.press('Escape');
  await expect(wrap).not.toHaveAttribute('data-preview-id'); await expect(sc).toBeFocused();
  await sc.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Santa Catarina');
  await expect(map).toHaveAttribute('data-ready', 'true');
  await expect(wrap).not.toHaveAttribute('data-preview-id');
  expect(await originalCanvas!.evaluate(c => c.isConnected)).toBe(true);
  await expect(map.locator('canvas')).toHaveCount(1); expect(errors).toEqual([]);
});

test('setor: prévia de outro território não muda seleção, indicador ou URL', async ({ page }) => {
  await page.goto('/?level=setor&cd_uf=42&cd_mun=4205407&cd_setor=420540705000001');
  const map = page.getByTestId('official-map'), wrap = page.locator('.demo-map-wrap');
  await expect(map).toHaveAttribute('data-ready', 'true');
  const url = page.url(), selected = page.locator('button[data-territory-id="420540705000001"]');
  const other = page.locator('button[data-territory-id="420540705000002"]');
  await other.focus();
  await expect(wrap).toHaveAttribute('data-preview-id', '420540705000002');
  await expect(wrap).toHaveAttribute('data-selected-id', '420540705000001');
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-tooltip')).toContainText('654');
  await expect(page.getByTestId('territory-inspector')).toContainText('PRÉVIA TEMPORÁRIA');
  await expect(page.getByTestId('official-populacao')).toHaveText('430');
  expect(page.url()).toBe(url);
  await page.screenshot({ path: `${output}/selecao-com-previa.png`, fullPage: true });
  await other.press('Escape');
  await expect(page.getByTestId('territory-inspector')).toContainText('TERRITÓRIO SELECIONADO');
  await expect(page.getByTestId('map-tooltip')).toHaveCount(0);
  await selected.focus();
  await expect(page.getByTestId('map-tooltip')).toHaveClass(/is-selected/);
  await page.screenshot({ path: `${output}/tooltip-setor-selecionado.png`, fullPage: true });
  await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption('35');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('São Paulo');
  await expect(wrap).not.toHaveAttribute('data-preview-id');
  await expect(page.getByTestId('map-tooltip')).toHaveCount(0);
});

test('demo: lista destaca grupo e ponto TSE tem prioridade sobre polígono', async ({ page }) => {
  await page.route('**/data/processed/tse/42/4205407.json', r => r.fulfill({ json: tseFixture() }));
  await page.goto('/?modo=demo&level=municipio&cd_uf=42&cd_mun=4205407');
  const map = page.getByTestId('demo-map'), wrap = page.locator('.demo-map-wrap');
  await expect(map).toHaveAttribute('data-ready', 'true');
  const group = page.getByRole('complementary', { name: 'Painel analítico' }).locator('button[data-territory-id="demo:4205407:grupo-01"]');
  await group.focus();
  await expect(wrap).toHaveAttribute('data-preview-id', 'demo:4205407:grupo-01');
  await expect(page.getByTestId('map-tooltip')).toContainText('cobertura');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/hover-demo-grupo.png`, fullPage: true });
  await page.getByRole('checkbox', { name: 'Exibir locais de votação (TSE)' }).check();
  await expect(page.getByRole('region', { name: 'Indicadores eleitorais' })).toBeVisible();
  const canvas = map.locator('canvas'), box = (await canvas.boundingBox())!;
  const position = { x: box.width * .29, y: box.height * .28 };
  await canvas.hover({ position });
  await expect(page.getByTestId('map-tooltip')).toContainText('Escola sintética A');
  await expect(wrap).not.toHaveAttribute('data-preview-id');
  const url = page.url();
  await canvas.click({ position });
  await expect(page.getByTestId('map-tooltip')).toContainText('Aptos:'); expect(page.url()).toBe(url);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/tooltip-tse.png`, fullPage: true });
  await page.keyboard.press('Escape'); await expect(page.getByTestId('map-tooltip')).toHaveCount(0);
});

test.describe('toque', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('tap abre o setor sem depender de hover e sem tooltip residual', async ({ page }) => {
    await page.goto('/?level=municipio&cd_uf=42&cd_mun=4205407');
    const map = page.getByTestId('official-map');
    await expect(map).toHaveAttribute('data-ready', 'true');
    await page.locator('button[data-territory-id="420540705000001"]').tap();
    await expect(page).toHaveURL(/level=setor/);
    await expect(page.getByTestId('official-populacao')).toHaveText('430');
    await expect(map).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.demo-map-wrap')).not.toHaveAttribute('data-preview-id');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${output}/toque-setor.png`, fullPage: true });
    await page.getByRole('button', { name: /Voltar nível/ }).tap();
    await expect(page.getByTestId('official-populacao')).toHaveText('537.211');
    await expect(map).toHaveAttribute('data-ready', 'true');
    const point = await officialPoint(page, 'setores/42/4205407.geojson', [-48.45, -27.6]);
    const box = (await point.canvas.boundingBox())!;
    await page.touchscreen.tap(box.x + point.position.x, box.y + point.position.y);
    await expect(page).toHaveURL(/level=setor/);
    await expect(map).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.demo-map-wrap')).not.toHaveAttribute('data-preview-id');
  });
});


test('tooltips distinguem zero divulgado, ausência e sigilo', async ({ page }) => {
  const index = JSON.parse(readFileSync('public/geo/official/statistics/brasil.json', 'utf8'));
  index.ufs['42'].populacao = { valor: null, status: 'sigilo' };
  index.ufs['35'].populacao = { valor: null, status: 'ausente' };
  index.ufs['43'].populacao = { valor: 0, status: 'divulgada' };
  await page.route('**/geo/official/statistics/brasil.json', r => r.fulfill({ json: index }));
  await page.goto('/');
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true');
  for (const [code, expected] of [['42', 'População: Sob sigilo'], ['35', 'População: Indisponível'], ['43', 'População: 0']]) {
    await page.locator(`button[data-territory-id="${code}"]`).focus();
    await expect(page.getByTestId('map-tooltip')).toContainText(expected!);
  }
  await expect(page.getByTestId('official-populacao')).toHaveText('203.080.756');
});
