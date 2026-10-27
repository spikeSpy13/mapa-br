import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const output = process.env.MAPA_BR_EVIDENCE_DIR || '/tmp/mapa-br-official';
mkdirSync(output, { recursive: true });
test.setTimeout(120000);
test.use({ actionTimeout: 30000 });
test('oficial: Brasil → SC → Florianópolis, setores, histórico e rede progressiva', async ({ page }) => {
  const network: { path: string; method: string }[] = [], errors: string[] = [], external: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('request', r => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(url.href);
    if (url.pathname.includes('/geo/') || url.pathname.includes('/data/processed/')) network.push({ path: url.pathname, method: r.method() });
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const map = page.getByTestId('official-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(map).toHaveAttribute('data-feature-count', '27');
  expect(network.map(r => r.path)).toEqual(['/geo/official/catalogo.json', '/geo/official/ufs.geojson', '/geo/official/ufs.inventory.json', '/geo/official/statistics/brasil.json']);
  await expect(page.getByRole('combobox', { name: 'Colorir por' })).toBeEnabled();
  await expect(page.getByTestId('official-populacao')).toHaveText('203.080.756');
  await expect(page.getByTestId('official-domicilios')).toHaveText('90.704.582');
  await page.screenshot({ path: `${output}/01-brasil-oficial.png`, fullPage: true });
  await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption('42');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Santa Catarina');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(map).toHaveAttribute('data-feature-count', '295');
  expect(network.map(r => r.path)).toEqual(['/geo/official/catalogo.json', '/geo/official/ufs.geojson', '/geo/official/ufs.inventory.json', '/geo/official/statistics/brasil.json', '/geo/official/municipios/42.geojson', '/geo/official/municipios/42.inventory.json', '/geo/official/statistics/uf/42.json']);
  await page.screenshot({ path: `${output}/02-santa-catarina-municipios.png`, fullPage: true });
  await page.getByRole('searchbox', { name: 'Buscar nome ou código' }).fill('Florianópolis');
  await page.getByRole('button', { name: /Florianópolis 4205407/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Florianópolis');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(map).toHaveAttribute('data-feature-count', '1004');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const expected = ['/geo/official/catalogo.json', '/geo/official/ufs.geojson', '/geo/official/ufs.inventory.json', '/geo/official/statistics/brasil.json', '/geo/official/municipios/42.geojson', '/geo/official/municipios/42.inventory.json', '/geo/official/statistics/uf/42.json', '/geo/official/setores/42/4205407.geojson', '/geo/official/setores/42/4205407.inventory.json', '/geo/official/statistics/municipios/42/4205407.json', '/geo/official/statistics/municipios/42/4205407.bairros.json'];
  expect(network.map(r => r.path)).toEqual(expected);
  await page.screenshot({ path: `${output}/03-florianopolis-setores.png`, fullPage: true });
  const sector = page.locator('button[data-territory-id]').first();
  const parentName = (await sector.innerText()).split(' — Setor')[0]!.trim();
  await sector.click();
  await expect(page).toHaveURL(/level=setor/);
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Setor ');
  await page.screenshot({ path: `${output}/04-setor-selecionado.png`, fullPage: true });
  await page.getByRole('button', { name: /Voltar nível/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(parentName);
  await page.getByRole('button', { name: 'Ver todos os setores de Florianópolis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Florianópolis');
  await page.getByRole('button', { name: /Voltar nível/ }).click();
  await expect(map).toHaveAttribute('data-layer', 'cd_mun');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Florianópolis');
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Santa Catarina');
  expect(network.map(r => r.path)).toEqual(expected);
  expect(external).toEqual([]); expect(errors).toEqual([]);
  expect(network.some(r => /demo|processed/.test(r.path))).toBe(false);
  await expect(page.getByTestId('official-populacao')).toHaveText('7.610.361');
  writeFileSync(`${output}/rede-navegacao-oficial.json`, JSON.stringify({ requests: network, external, errors, checks: ['27 UFs', '295 municípios', '1004 setores', 'seleção, retorno e histórico', 'cache sem novas requisições', 'sem estatísticas ou rede externa'] }, null, 2));
});

test('resposta geométrica atrasada não sobrescreve uma nova seleção', async ({ page }) => {
  let release: (() => Promise<void>) | undefined;
  const content = readFileSync(resolve('public/geo/official/municipios/42.geojson'), 'utf-8');
  await page.route('**/geo/official/municipios/42.geojson', route => new Promise<void>(resolve => {
    release = async () => { await route.fulfill({ contentType: 'application/json', body: content }); resolve(); };
  }));
  await page.goto('/');
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption('42');
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption('35');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('São Paulo');
  await release!();
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count', '645');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('São Paulo');
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-layer', 'cd_mun');
});

test('geometria ausente, inventário inválido e navegação móvel têm diagnóstico explícito', async ({ page }) => {
  await page.route('**/geo/official/setores/42/4205407.geojson', route => route.fulfill({ status: 404 }));
  await page.goto('/?level=municipio&cd_uf=42&cd_mun=4205407');
  await expect(page.getByRole('alert')).toContainText('Arquivo de geometria oficial indisponível localmente');
  await page.unrouteAll();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?level=municipio&cd_uf=42&cd_mun=4205407');
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${output}/05-oficial-celular.png`, fullPage: true });
  await page.goto('/?level=setor&cd_uf=42&cd_mun=4205407&cd_setor=420540705999999');
  await expect(page.getByRole('alert')).toContainText('Setor fora do inventário');
});

// Projeção Web Mercator do mesmo fitBounds usado pelo MapViewport (padding 35).
async function clickCoordinate(page: import('@playwright/test').Page, file: string, coordinate: [number, number]) {
  const geo = JSON.parse(readFileSync(resolve(`public/geo/official/${file}`), 'utf-8'));
  const points: [number, number][] = [];
  function scan(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') points.push(value as [number, number]); else value.forEach(scan);
  }
  geo.features.forEach((f: { geometry: { coordinates: unknown } }) => scan(f.geometry.coordinates));
  const merc = ([lon, lat]: [number, number]) => [(lon + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2];
  const projected = points.map(merc), xs = projected.map(p => p[0]!), ys = projected.map(p => p[1]!);
  const extrema = (values: number[]) => values.reduce(([lo, hi], v) => [Math.min(lo!, v), Math.max(hi!, v)], [Infinity, -Infinity]);
  const [x0, x1] = extrema(xs), [y0, y1] = extrema(ys);
  const canvas = page.getByTestId('official-map').locator('canvas');
  const box = (await canvas.boundingBox())!;
  const scale = Math.min((box.width - 70) / (x1! - x0!), (box.height - 70) / (y1! - y0!));
  const [x, y] = merc(coordinate);
  await canvas.click({ position: { x: box.width / 2 + (x! - (x0! + x1!) / 2) * scale, y: box.height / 2 + (y! - (y0! + y1!) / 2) * scale } });
}

test('clique nos contornos reais abre SC, Florianópolis e um setor', async ({ page }) => {
  await page.goto('/');
  const map = page.getByTestId('official-map');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await clickCoordinate(page, 'ufs.geojson', [-50.5, -27.2]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Santa Catarina');
  await expect(map).toHaveAttribute('data-layer', 'cd_mun');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await clickCoordinate(page, 'municipios/42.geojson', [-48.45, -27.6]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Florianópolis');
  await expect(map).toHaveAttribute('data-layer', 'cd_setor');
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await clickCoordinate(page, 'setores/42/4205407.geojson', [-48.45, -27.6]);
  await expect(page).toHaveURL(/level=setor/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/— Setor 4205407/);
});

test('demografia oficial: regiões, municípios, setores, legenda e retorno sem dados simulados', async ({ page }) => {
  const requests: string[] = [], external: string[] = [];
  page.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) { requests.push(u.pathname); if (!['localhost', '127.0.0.1'].includes(u.hostname)) external.push(u.href); } });
  await page.goto('/');
  await expect(page.getByTestId('official-populacao')).toHaveText('203.080.756');
  await expect(page.getByTestId('official-domicilios')).toHaveText('90.704.582');
  expect(requests.some(p => /setores|statistics\/municipios|statistics\/uf/.test(p))).toBe(false);
  const index = JSON.parse(readFileSync('public/geo/official/statistics/brasil.json', 'utf8'));
  const format = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
  for (const [id, r] of Object.entries(index.regioes) as [string, { nome: string; indicadores: { populacao: { valor: number }; domicilios: { valor: number } } }][]) {
    await page.getByRole('button', { name: r.nome, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.nome);
    await expect(page.getByTestId('official-populacao')).toHaveText(format(r.indicadores.populacao.valor));
    await expect(page.getByTestId('official-domicilios')).toHaveText(format(r.indicadores.domicilios.valor));
    expect(id).toMatch(/^[1-5]$/);
  }
  for (const [code, indicators] of Object.entries(index.ufs) as [string, { populacao: { valor: number }; domicilios: { valor: number } }][]) {
    await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption(code);
    await expect(page.getByTestId('official-populacao')).toHaveText(format(indicators.populacao.valor));
    await expect(page.getByTestId('official-domicilios')).toHaveText(format(indicators.domicilios.valor));
  }
  await page.getByRole('combobox', { name: 'Selecionar UF' }).selectOption('42');
  await expect(page.getByTestId('official-populacao')).toHaveText('7.610.361');
  await page.getByRole('searchbox', { name: 'Buscar nome ou código' }).fill('Florianópolis');
  await page.getByRole('button', { name: /Florianópolis 4205407/ }).click();
  await expect(page.getByTestId('official-populacao')).toHaveText('537.211');
  await expect(page.getByTestId('official-domicilios')).toHaveText('285.000');
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: `${output}/06-florianopolis-populacao.png`, fullPage: true });
  const detail = JSON.parse(readFileSync('public/geo/official/statistics/municipios/42/4205407.json', 'utf8'));
  const sectorRows = page.getByRole('region', { name: 'Lista de territórios' }).locator('button[data-territory-id]');
  // Every displayed sector must use its own indicator, including zero.
  for (const metric of ['populacao', 'domicilios']) {
    const before = requests.length;
    await page.getByRole('combobox', { name: 'Colorir por' }).selectOption(metric);
    await expect(page.getByTestId('official-legend')).toContainText(metric === 'populacao' ? 'População' : 'Domicílios');
    const texts = await sectorRows.allTextContents();
    expect(texts).toHaveLength(1004);
    for (const text of texts) {
      const code = text.match(/Setor ([0-9]{15})/)![1]!;
      expect(text).toContain(format(detail.setores[code][metric].valor));
    }
    expect(requests.length).toBe(before);
  }
  await page.screenshot({ path: `${output}/07-florianopolis-domicilios.png`, fullPage: true });
  await page.getByRole('button', { name: /Centro — Setor 420540705000001 / }).click();
  await expect(page.getByTestId('official-populacao')).toHaveText('430');
  await expect(page.getByTestId('official-domicilios')).toHaveText('266');
  await expect(page.getByTestId('official-sources')).toContainText('v0001');
  await expect(page.getByTestId('official-sources')).toContainText('20260520');
  await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: `${output}/08-setor-indicadores.png`, fullPage: true });
  await page.getByRole('button', { name: /Voltar nível/ }).click();
  await expect(page.getByTestId('official-populacao')).toHaveText('42.308');
  await page.getByRole('button', { name: 'Ver todos os setores de Florianópolis' }).click();
  await expect(page.getByTestId('official-populacao')).toHaveText('537.211');
  await expect(page.getByRole('combobox', { name: 'Colorir por' })).toHaveValue('domicilios');
  expect(external).toEqual([]); expect(requests.some(p => /demo|processed/.test(p))).toBe(false);
});
