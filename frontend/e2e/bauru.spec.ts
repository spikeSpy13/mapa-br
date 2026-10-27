import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const output=process.env.MAPA_BR_EVIDENCE_DIR||'/tmp/mapa-br-bauru/capturas';mkdirSync(output,{recursive:true});
const payload=(theme:string,city='3506003')=>JSON.parse(readFileSync(`public/geo/official/statistics/temas/${theme}/municipios/${city.slice(0,2)}/${city}.json`,'utf8'));
const basic=()=>JSON.parse(readFileSync('public/geo/official/statistics/municipios/35/3506003.json','utf8'));
const panel=(p:Page)=>p.locator('.census-theme-panel');
const value=(p:Page,key:string)=>panel(p).locator(`[data-census-id="${key}"] [data-census-value]`);
const format=(c:any)=>c.status==='sigilo'?'Sob sigilo':c.status==='ausente'?'Indisponível':c.status==='parcial'?`≥ ${new Intl.NumberFormat('pt-BR').format(c.valor)} (parcial)`:typeof c.valor==='string'?`R$ ${c.valor.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${c.valor.split('.')[1]}`:new Intl.NumberFormat('pt-BR').format(c.valor);
const themes=['sexo_idade','cor_raca','alfabetizacao','habitacao','agua','esgoto','lixo','renda'];
const grama='Bacia do Córrego Água da Grama';
async function city(page:Page,uf:string,name:string){
 const select=page.getByRole('combobox',{name:'Selecionar UF'});
 if(await select.inputValue()===uf) await page.getByRole('navigation',{name:'Navegação territorial'}).getByRole('button',{name:uf==='35'?'São Paulo':'Santa Catarina',exact:true}).click();
 else await select.selectOption(uf);
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-layer','cd_mun');
 await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill(name);await page.locator('[data-territory-id]').filter({hasText:name}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText(name);await expect(page.getByTestId('official-map')).toHaveAttribute('data-layer','cd_setor');
}

test('Brasil → SP → Bauru mantém abertura leve e inventário completo',async({page})=>{
 const requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 expect(requests.some(p=>/3506003|\/temas\//.test(p))).toBe(false);
 await page.getByRole('combobox',{name:'Selecionar UF'}).selectOption('35');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','645');
 expect(requests.some(p=>p.includes('3506003'))).toBe(false);
 await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill('3506003');await page.locator('[data-territory-id="3506003"]').click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Bauru');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','682');
 await expect(page.getByTestId('official-populacao')).toHaveText('379.146');await expect(page.getByTestId('official-domicilios')).toHaveText('171.564');
 await expect(page.getByTestId('neighborhood-coverage')).toContainText('638 de 682 setores');await expect(page.getByTestId('neighborhood-coverage')).toContainText('12 bairros');
 await expect(page.getByRole('region',{name:'Lista de territórios'}).locator('[data-territory-id]')).toHaveCount(682);
 await expect(page.getByRole('region',{name:'Bairros de Bauru'}).getByRole('button')).toHaveCount(12);
 expect(requests.some(p=>p.includes('/temas/'))).toBe(false);expect(errors).toEqual([]);await page.screenshot({path:`${output}/bauru-desktop.png`});
});

test('nomes oficiais, comparação, bairro → setor → bairro e grupo sem vínculo',async({page})=>{
 await page.goto('/?level=municipio&cd_uf=35&cd_mun=3506003');const data=basic();
 const search=page.getByRole('searchbox',{name:'Buscar nome ou código'});await search.fill('agua da grama');
 await expect(page.getByRole('region',{name:'Lista de territórios'}).locator('[data-territory-id]')).toHaveCount(107);
 await page.getByRole('button',{name:`Selecionar bairro ${grama}`,exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText(grama);
 await expect(page.getByTestId('official-populacao')).toHaveText(format(data.bairros['bairro:3506003005'].indicadores.populacao));
 const comparison=page.getByRole('region',{name:'Comparação entre bairros',exact:true});
 await comparison.getByRole('checkbox',{name:`Comparar ${grama}`,exact:true}).check();await comparison.getByRole('checkbox',{name:'Comparar Centro',exact:true}).check();await expect(comparison.locator('[data-comparison-id]')).toHaveCount(2);
 await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText(format(payload('renda').bairros['bairro:3506003005'].renda_responsavel_com_rendimentos));
 await expect(panel(page)).toContainText('Valor publicado diretamente');await comparison.locator('.comparison-cards').screenshot({path:`${output}/bauru-bairro-comparacao.png`});
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${output}/bauru-bairro-desktop.png`});
 await page.locator('[data-territory-id="350600305000002"]').focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{level:1})).toHaveText(`${grama} — Setor 350600305000002`);await expect(page.getByTestId('official-populacao')).toHaveText('575');
 await expect(page.getByTestId('sector-neighborhood')).toContainText('3506003005');await expect(page.getByTestId('sector-neighborhood')).toContainText('Distrito: Bauru · 350600305');
 await expect(comparison.locator('[data-comparison-id]')).toHaveCount(2);await page.getByRole('button',{name:'Voltar ao bairro',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText(grama);
 await comparison.getByRole('button',{name:'Abrir setores sem bairro identificado',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Bairro não identificado na fonte');
 await expect(page.getByRole('region',{name:'Lista de territórios'}).locator('[data-territory-id]')).toHaveCount(44);await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('Indisponível');
 await expect(page.getByTestId('official-populacao')).toHaveText(format(data.bairros['sem_bairro:3506003'].indicadores.populacao));
 await page.getByRole('button',{name:'Ver todos os setores de Bauru',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Bauru');
});

test('Bauru: 25 indicadores próprios do setor, temas lazy e canvas preservado',async({page})=>{
 const errors:string[]=[],external:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const u=new URL(r.url());if(/^https?:$/.test(u.protocol)&&u.host!=='127.0.0.1:4173')external.push(r.url());if(u.pathname.includes('/temas/'))requests.push(u.pathname);});
 await page.goto('/?level=setor&cd_uf=35&cd_mun=3506003&cd_setor=350600305000002');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');const original=await page.getByTestId('official-map').locator('canvas').elementHandle();
 for(const theme of themes){
  await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption(theme);const d=payload(theme);
  for(const key of d.metricas){await page.getByRole('combobox',{name:'Colorir por'}).selectOption(`censo_${key}`);await expect(value(page,key)).toHaveText(format(d.setores['350600305000002'][key]));await expect(page.getByTestId('official-legend')).toContainText('2022');}
  if(theme==='esgoto')await page.screenshot({path:`${output}/bauru-setor-desktop.png`});
 }
 expect(await original!.evaluate(e=>e.isConnected)).toBe(true);expect(requests).toHaveLength(8);expect(requests.every(p=>p.endsWith('/municipios/35/3506003.json'))).toBe(true);expect(external).toEqual([]);expect(errors).toEqual([]);
});

test('Agudos → Bauru → Florianópolis → Bauru isola cache, seleção e histórico',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/temas/'))requests.push(new URL(r.url()).pathname);});
 await page.goto('/?level=municipio&cd_uf=35&cd_mun=3500709');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await expect(value(page,'agua_rede')).toHaveText('12.302');
 await city(page,'35','Bauru');await expect(value(page,'agua_rede')).toHaveText(format(payload('agua').municipio.agua_rede));await page.getByRole('checkbox',{name:'Comparar Centro',exact:true}).check();
 await city(page,'42','Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','1004');await expect(page.locator('[data-comparison-id]')).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Comparar Centro',exact:true}).check();await city(page,'35','Bauru');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','682');await expect(value(page,'agua_rede')).toHaveText(format(payload('agua').municipio.agua_rede));await expect(page.locator('[data-comparison-id]')).toHaveCount(0);
 await page.goBack();await expect(page.getByRole('heading',{level:1})).toHaveText('São Paulo');await page.goBack();await expect(page.getByRole('heading',{level:1})).toHaveText('Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');await page.goForward();await page.goForward();await expect(page.getByRole('heading',{level:1})).toHaveText('Bauru');
 for(const code of ['3500709','3506003','4205407'])expect(requests.filter(p=>p.endsWith(`/agua/municipios/${code.slice(0,2)}/${code}.json`))).toHaveLength(1);
});

test('resposta atrasada e resposta de Agudos no caminho de Bauru não contaminam dados',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const route='**/temas/agua/municipios/35/3506003.json';await page.route(route,async r=>{await gate;await r.fulfill({json:payload('agua')}).catch(()=>{});});
 await page.goto('/?level=municipio&cd_uf=35&cd_mun=3506003');const pending=page.waitForRequest(route);await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await pending;
 await city(page,'42','Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');release();await expect(page.getByRole('heading',{level:1})).toHaveText('Florianópolis');
 await page.unroute(route);await page.route(route,r=>r.fulfill({json:payload('agua','3500709')}));await city(page,'35','Bauru');
 await expect(panel(page).getByRole('alert')).toContainText('falhou na validação');await expect(page.getByTestId('official-populacao')).toHaveText('379.146');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','682');
});

test('setor sem moradores conserva domicílio físico e ausência temática',async({page})=>{
 await page.goto('/?level=setor&cd_uf=35&cd_mun=3506003&cd_setor=350600305000453');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('habitacao');
 await expect(page.getByTestId('official-populacao')).toHaveText('0');await expect(page.getByTestId('official-domicilios')).toHaveText('1');await expect(value(page,'dppo')).toHaveText('Indisponível');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','682');
 await expect(panel(page)).toContainText('Sem linha temática na fonte');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('Indisponível');
});

test.describe('Bauru móvel',()=>{
 test.use({hasTouch:true,viewport:{width:390,height:844}});
 test('nome longo do bairro, seleção por toque e retorno mantêm identificação',async({page})=>{
  await page.goto('/?level=municipio&cd_uf=35&cd_mun=3506003');await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill('agua da grama');await page.getByRole('button',{name:`Selecionar bairro ${grama}`,exact:true}).tap();
  await expect(page.getByRole('heading',{level:1})).toHaveText(grama);await page.locator('[data-territory-id="350600305000002"]').tap();await expect(page.getByTestId('sector-neighborhood')).toContainText(grama);
  await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await expect(value(page,'agua_rede')).toHaveText(format(payload('agua').setores['350600305000002'].agua_rede));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{const p=document.querySelector('.census-theme-panel')!;window.scrollBy(0,p.getBoundingClientRect().top-20);});await page.screenshot({path:`${output}/bauru-celular.png`});
  await page.getByRole('button',{name:'Voltar ao bairro',exact:true}).tap();await expect(page.getByRole('heading',{level:1})).toHaveText(grama);await page.getByRole('button',{name:'Ver todos os setores de Bauru',exact:true}).tap();await expect(page.getByRole('heading',{level:1})).toHaveText('Bauru');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});
