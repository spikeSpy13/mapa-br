import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const output=process.env.MAPA_BR_EVIDENCE_DIR || '/tmp/mapa-br-census-themes';mkdirSync(output,{recursive:true});
const profile=JSON.parse(readFileSync('../etl_pipeline/manifests/census_themes.json','utf8'));
const labels:Record<string,string>={sexo_idade:'Sexo e idade',cor_raca:'Cor ou raça',alfabetizacao:'Alfabetização · 15 anos ou mais',habitacao:'Habitação',agua:'Abastecimento de água',esgoto:'Esgotamento sanitário',lixo:'Destino do lixo',renda:'Renda publicada'};
const payload=(theme:string,municipal=false)=>JSON.parse(readFileSync(`public/geo/official/statistics/temas/${theme}/${municipal?'municipios/42/4205407.json':'brasil.json'}`,'utf8'));
const panel=(p:Page,t:string)=>p.getByRole('region',{name:`Censo 2022 · ${labels[t]}`,exact:true});
const formatted=(c:any)=>c.status==='sigilo'?'Sob sigilo':c.status==='ausente'?'Indisponível':c.status==='parcial'?`≥ ${new Intl.NumberFormat('pt-BR').format(c.valor)} (parcial)`:typeof c.valor==='string'?`R$ ${c.valor.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${c.valor.split('.')[1]}`:new Intl.NumberFormat('pt-BR').format(c.valor);

test('panoramas nacionais por tema são diretos e independem do município',async({page})=>{
 const blocked:string[]=[],requests:string[]=[];
 await page.route(/\/(municipios|setores)\//,r=>{blocked.push(r.request().url());return r.fulfill({status:404,body:''});});
 page.on('request',r=>{if(r.url().includes('/temas/'))requests.push(r.url());});
 await page.goto('/');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');expect(requests).toEqual([]);
 for(const theme of ['sexo_idade','cor_raca','alfabetizacao','habitacao','agua','esgoto','lixo']){
  await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption(theme);
  const d=payload(theme),first=d.metricas[0];
  await expect(panel(page,theme).locator(`[data-census-id="${first}"] [data-census-value]`)).toHaveText(formatted(d.brasil[first]));
 }
 expect(blocked).toEqual([]);
 await page.getByRole('button',{name:'Sul',exact:true}).click();const d=payload('lixo');
 await expect(panel(page,'lixo').locator('[data-census-id="lixo_coleta_domicilio"] [data-census-value]')).toHaveText(formatted(d.regioes['4'].lixo_coleta_domicilio));
 await page.getByRole('combobox',{name:'Selecionar UF'}).selectOption('31');
 await expect(panel(page,'lixo').locator('[data-census-id="lixo_coleta_domicilio"] [data-census-value]')).toHaveText(formatted(d.ufs['31'].lixo_coleta_domicilio));
 expect(blocked).toEqual([]);await panel(page,'lixo').getByText('Definições, universos e fontes do tema',{exact:true}).click();await expect(panel(page,'lixo')).toContainText('SIDRA · tabela 6892');await page.screenshot({path:`${output}/temas-uf-consolidado.png`,fullPage:true});
});

test('25 indicadores usam o próprio setor, sem recriar mapa nem buscar IBGE',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[],external:string[]=[],requests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(/^https?:$/.test(u.protocol)&&u.host!=='127.0.0.1:4173')external.push(r.url());if(u.pathname.includes('/temas/'))requests.push(u.pathname);});
 await page.goto('/?level=setor&cd_uf=42&cd_mun=4205407&cd_setor=420540705000001');
 const map=page.getByTestId('official-map');await expect(map).toHaveAttribute('data-ready','true');const original=await map.locator('canvas').elementHandle();
 for(const theme of Object.keys(labels)){
  await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption(theme);const d=payload(theme,true),r=d.setores['420540705000001'];
  for(const key of d.metricas){
   await page.getByRole('combobox',{name:'Colorir por'}).selectOption(`censo_${key}`);
   await expect(panel(page,theme).locator(`[data-census-id="${key}"] [data-census-value]`)).toHaveText(formatted(r[key]));
   await expect(page.getByTestId('official-legend')).toContainText(profile.metricas[key].rotulo);
   await expect(page.getByTestId('official-legend')).toContainText(profile.metricas[key].universo);
  }
  if(theme==='cor_raca'){
   await expect(panel(page,theme).locator('[data-census-id="raca_branca"] [data-census-percent]')).toContainText('98,37%');
   await expect(panel(page,theme).locator('[data-census-id="raca_preta"] [data-census-value]')).toHaveText('Sob sigilo');
   await expect(panel(page,theme).locator('[data-census-id="raca_indigena"] [data-census-value]')).toHaveText('0');
   await panel(page,theme).screenshot({path:`${output}/setor-cor-raca-sigilo.png`});
  }
  if(theme==='esgoto'){
   await page.getByRole('combobox',{name:'Colorir por'}).selectOption('censo_esgoto_rede');await page.locator('[data-territory-id="420540705000001"]').focus();
   await expect(page.getByTestId('map-tooltip')).toContainText('217');await expect(page.getByTestId('map-tooltip')).toContainText(/domicílios particulares permanentes ocupados/i);await page.keyboard.press('Escape');
   await page.screenshot({path:`${output}/setor-saneamento-desktop.png`,fullPage:true});
  }
 }
 await expect(panel(page,'renda').locator('[data-census-value]')).toHaveText('R$ 17.796,13');
 expect(await original!.evaluate(el=>el.isConnected)).toBe(true);await expect(map.locator('canvas')).toHaveCount(1);
 expect(new Set(requests).size).toBe(8);expect(requests).toHaveLength(8);expect(external).toEqual([]);expect(errors).toEqual([]);
 await page.getByRole('combobox',{name:'Colorir por'}).selectOption('populacao');await expect(page.getByTestId('official-populacao')).toHaveText('430');
});

test('bairro parcial, comparação, renda direta e grupo sem vínculo são explícitos',async({page})=>{
 const d=payload('sexo_idade',true),id=Object.keys(d.bairros).find(k=>k.startsWith('bairro:')&&d.bairros[k].homens.status==='parcial')!;
 await page.goto(`/?level=bairro&cd_uf=42&cd_mun=4205407&id_agregacao=${encodeURIComponent(id)}`);await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('sexo_idade');
 await expect(panel(page,'sexo_idade').locator('[data-census-id="homens"] [data-census-value]')).toHaveText(formatted(d.bairros[id].homens));
 await expect(panel(page,'sexo_idade').locator('[data-census-id="homens"] [data-census-percent]')).toContainText('Indisponível');
 const comparison=page.getByRole('region',{name:'Comparação entre bairros',exact:true});
 await comparison.getByRole('checkbox',{name:'Comparar Centro',exact:true}).check();await comparison.getByRole('checkbox',{name:'Comparar Abraão',exact:true}).check();
 await expect(comparison.getByRole('article',{name:'Comparação de Centro',exact:true}).locator('[data-census-id="homens"] [data-census-value]')).toHaveText(formatted(d.bairros['bairro:4205407001'].homens));
 await comparison.getByRole('button',{name:'Selecionar bairro Centro',exact:true}).click();await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');
 await expect(panel(page,'renda').locator('[data-census-value]')).toHaveText('R$ 10.816,47');await panel(page,'renda').getByText('Definições, universos e fontes do tema',{exact:true}).click();
 await expect(panel(page,'renda')).toContainText('Média publicada diretamente no nível da fonte');await expect(comparison.locator('[data-comparison-id]')).toHaveCount(2);
 await panel(page,'renda').screenshot({path:`${output}/bairro-renda-direta.png`});
 await comparison.getByRole('button',{name:'Abrir setores sem bairro identificado',exact:true}).click();
 await expect(panel(page,'renda').locator('[data-census-value]')).toHaveText('Indisponível');await expect(panel(page,'renda')).toContainText('Sem média publicada para o grupo sem bairro');await expect(page.getByTestId('official-populacao')).toHaveText('17.748');
});

test('sem moradores: setor preservado, vagos divulgados e temática ausente',async({page})=>{
 await page.goto('/?level=setor&cd_uf=42&cd_mun=4205407&cd_setor=420540705000483');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('habitacao');
 await expect(page.getByTestId('official-populacao')).toHaveText('0');await expect(page.getByTestId('official-domicilios')).toHaveText('7');
 await expect(panel(page,'habitacao').locator('[data-census-id="dppo"] [data-census-value]')).toHaveText('Indisponível');await expect(panel(page,'habitacao').locator('[data-census-id="vagos"] [data-census-value]')).toHaveText('4');
 await expect(panel(page,'habitacao').locator('[data-census-id="uso_ocasional"] [data-census-value]')).toHaveText('2');
 await expect(panel(page,'habitacao')).toContainText('Sem linha temática na fonte; população básica zero');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','1004');
});

test('resposta temática atrasada e contrato inválido preservam a seleção e a malha',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 await page.route('**/temas/agua/brasil.json',async r=>{await gate;await r.fulfill({json:payload('agua')}).catch(()=>{});});
 await page.goto('/');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');const pending=page.waitForRequest('**/temas/agua/brasil.json');
 await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await pending;await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('esgoto');
 await expect(panel(page,'esgoto').locator('[data-census-id="esgoto_rede"] [data-census-value]')).toHaveText(formatted(payload('esgoto').brasil.esgoto_rede));release();
 await expect(page.getByRole('combobox',{name:'Tema do Censo'})).toHaveValue('esgoto');const invalid=payload('lixo');invalid.referencia='2010-08-01';await page.route('**/temas/lixo/brasil.json',r=>r.fulfill({json:invalid}));
 await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('lixo');await expect(panel(page,'lixo').getByRole('alert')).toContainText('falhou na validação');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
});

test.describe('tema móvel',()=>{
 test.use({hasTouch:true,viewport:{width:390,height:844}});
 test('toque mantém tema, identificação e rótulos sem overflow',async({page})=>{
  await page.goto('/?level=municipio&cd_uf=42&cd_mun=4205407');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('esgoto');
  await expect(panel(page,'esgoto').locator('[data-census-id="esgoto_rede"] [data-census-value]')).toHaveText('114.611');await page.locator('[data-territory-id="420540705000001"]').tap();
  await expect(panel(page,'esgoto').locator('[data-census-id="esgoto_rede"] [data-census-value]')).toHaveText('217');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel(page,'esgoto').screenshot({path:`${output}/saneamento-celular.png`});
  await page.getByRole('button',{name:'Voltar ao bairro',exact:true}).tap();await expect(page.getByRole('heading',{level:1})).toHaveText('Centro');await expect(page.getByRole('combobox',{name:'Tema do Censo'})).toHaveValue('esgoto');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');
  await expect(panel(page,'renda').locator('[data-census-value]')).toHaveText('R$ 10.816,47');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});
