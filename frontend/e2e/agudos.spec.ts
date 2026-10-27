import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const output=process.env.MAPA_BR_EVIDENCE_DIR||'/tmp/mapa-br-agudos/capturas';mkdirSync(output,{recursive:true});
const payload=(theme:string,city='3500709')=>JSON.parse(readFileSync(`public/geo/official/statistics/temas/${theme}/municipios/${city.slice(0,2)}/${city}.json`,'utf8'));
const panel=(page:Page)=>page.locator('.census-theme-panel');
const value=(page:Page,key:string)=>panel(page).locator(`[data-census-id="${key}"] [data-census-value]`);
const themeNames={sexo_idade:'Sexo e idade',cor_raca:'Cor ou raça',alfabetizacao:'Alfabetização · 15 anos ou mais',habitacao:'Habitação',agua:'Abastecimento de água',esgoto:'Esgotamento sanitário',lixo:'Destino do lixo',renda:'Renda publicada'};
const display=(c:any)=>c.status==='sigilo'?'Sob sigilo':c.status==='ausente'?'Indisponível':typeof c.valor==='string'?`R$ ${c.valor.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${c.valor.split('.')[1]}`:new Intl.NumberFormat('pt-BR').format(c.valor);
async function openCity(page:Page,uf:string,name:string){
 await page.getByRole('combobox',{name:'Selecionar UF'}).selectOption(uf);
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-layer','cd_mun');
 await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill(name);
 await page.locator('[data-territory-id]').filter({hasText:name}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText(name);
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-layer','cd_setor');
}

test('Brasil → SP → Agudos: inventário completo, consolidados e ausência de bairro',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
 await page.goto('/');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 expect(requests.some(p=>p.includes('/35/3500709'))).toBe(false);
 await page.getByRole('combobox',{name:'Selecionar UF'}).selectOption('35');
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','645');
 expect(requests.some(p=>p.includes('/35/3500709'))).toBe(false);
 await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill('3500709');await page.locator('[data-territory-id="3500709"]').click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Agudos');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','66');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 await expect(page.getByTestId('official-populacao')).toHaveText('37.680');await expect(page.getByTestId('official-domicilios')).toHaveText('15.448');
 await expect(page.getByTestId('neighborhood-coverage')).toContainText('0 de 66 setores');
 await expect(page.getByText('Nenhum bairro oficial identificado nas fontes deste município.',{exact:false})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:/Comparar/})).toHaveCount(0);
 expect(requests.some(p=>p.includes('/temas/'))).toBe(false);
 await page.screenshot({path:`${output}/agudos-municipio-desktop.png`});
 await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('sexo_idade');
 await expect(value(page,'homens')).toHaveText('18.461');await expect(value(page,'idade_60_mais')).toHaveText('6.430');
 await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('habitacao');
 await expect(value(page,'dppo')).toHaveText('12.936');await expect(panel(page).locator('[data-census-id="dppo"] [data-census-percent]')).toContainText('denominador: 15.401');
 await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill('350070905000001');const row=page.locator('[data-territory-id="350070905000001"]');await row.focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/level=setor.*350070905000001/);await expect(page.getByTestId('sector-neighborhood')).toContainText('Distrito: Agudos · 350070905');
 await page.getByRole('button',{name:'Voltar ao grupo sem bairro',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Bairro não identificado na fonte');
 await page.getByRole('button',{name:'Ver todos os setores de Agudos',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Agudos');
});

test('Agudos: os 25 indicadores usam o próprio setor, fonte, cores e um canvas',async({page})=>{
 const errors:string[]=[],external:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const u=new URL(r.url());if(/^https?:$/.test(u.protocol)&&u.host!=='127.0.0.1:4173')external.push(r.url());if(u.pathname.includes('/temas/'))requests.push(u.pathname);});
 await page.goto('/?level=setor&cd_uf=35&cd_mun=3500709&cd_setor=350070905000001');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 const canvas=await page.getByTestId('official-map').locator('canvas').elementHandle();
 for(const theme of Object.keys(themeNames)){
  await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption(theme);const d=payload(theme);
  for(const key of d.metricas){
   await page.getByRole('combobox',{name:'Colorir por'}).selectOption(`censo_${key}`);
   await expect(value(page,key)).toHaveText(display(d.setores['350070905000001'][key]));
   await expect(page.getByTestId('official-legend')).toContainText('2022');
  }
 }
 expect(requests).toHaveLength(8);expect(requests.every(p=>p.endsWith('/municipios/35/3500709.json'))).toBe(true);
 expect(await canvas!.evaluate(e=>e.isConnected)).toBe(true);expect(errors).toEqual([]);expect(external).toEqual([]);
 await page.getByTestId('official-map').locator('canvas').screenshot({path:`${output}/agudos-setor-renda-mapa.png`});
 await page.screenshot({path:`${output}/agudos-setor-desktop.png`});
});

test('Agudos → Florianópolis → Agudos mantém cache isolado, histórico e comparação',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/temas/'))requests.push(new URL(r.url()).pathname);});
 await page.goto('/?level=municipio&cd_uf=35&cd_mun=3500709');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await expect(value(page,'agua_rede')).toHaveText('12.302');
 await openCity(page,'42','Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','1004');
 await page.getByRole('checkbox',{name:'Comparar Centro',exact:true}).check();await expect(page.locator('[data-comparison-id]')).toHaveCount(1);
 await openCity(page,'35','Agudos');await expect(value(page,'agua_rede')).toHaveText('12.302');await expect(page.locator('[data-comparison-id]')).toHaveCount(0);
 await page.goBack();await expect(page.getByRole('heading',{level:1})).toHaveText('São Paulo');await page.goBack();await expect(page.getByRole('heading',{level:1})).toHaveText('Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');
 await page.goForward();await page.goForward();await expect(page.getByRole('heading',{level:1})).toHaveText('Agudos');await expect(value(page,'agua_rede')).toHaveText('12.302');
 expect(requests.filter(p=>p.endsWith('/agua/municipios/35/3500709.json'))).toHaveLength(1);expect(requests.filter(p=>p.endsWith('/agua/municipios/42/4205407.json'))).toHaveLength(1);
});

test('resposta atrasada de Agudos não substitui dados de Florianópolis',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 await page.route('**/temas/agua/municipios/35/3500709.json',async route=>{await gate;await route.fulfill({json:payload('agua')}).catch(()=>{});});
 await page.goto('/?level=municipio&cd_uf=35&cd_mun=3500709');const pending=page.waitForRequest('**/temas/agua/municipios/35/3500709.json');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await pending;
 await openCity(page,'42','Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');release();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');await expect(page.getByTestId('official-populacao')).toHaveText('537.211');
});

test('resposta temática de outra cidade é rejeitada preservando Agudos',async({page})=>{
 await page.route('**/temas/agua/municipios/35/3500709.json',r=>r.fulfill({json:payload('agua','4205407')}));
 await page.goto('/?level=municipio&cd_uf=35&cd_mun=3500709');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');
 await expect(panel(page).getByRole('alert')).toContainText('falhou na validação');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','66');await expect(page.getByTestId('official-populacao')).toHaveText('37.680');
});

test.describe('Agudos por toque',()=>{
 test.use({hasTouch:true,viewport:{width:390,height:844}});
 test('setor de Domélia preserva distrito, tema, retorno e largura móvel',async({page})=>{
  await page.goto('/?level=municipio&cd_uf=35&cd_mun=3500709');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','66');
  await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill('350070910000001');await page.locator('[data-territory-id="350070910000001"]').tap();
  await expect(page.getByTestId('sector-neighborhood')).toContainText('Distrito: Domélia · 350070910');await expect(page.getByTestId('sector-neighborhood')).toContainText('Bairro não identificado na fonte');
  await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText(display(payload('renda').setores['350070910000001'].renda_responsavel_com_rendimentos));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{const p=document.querySelector('.census-theme-panel')!;window.scrollBy(0,p.getBoundingClientRect().top-20);});await page.screenshot({path:`${output}/agudos-celular.png`});
  await page.getByRole('button',{name:'Voltar ao grupo sem bairro',exact:true}).tap();await expect(page.getByRole('heading',{level:1})).toHaveText('Bairro não identificado na fonte');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('Indisponível');
  await page.getByRole('button',{name:'Ver todos os setores de Agudos',exact:true}).tap();await expect(page.getByRole('heading',{level:1})).toHaveText('Agudos');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('R$ 2.719,19');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});
