import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const output=process.env.MAPA_BR_EVIDENCE_DIR||'/tmp/mapa-br-saopaulo/capturas';mkdirSync(output,{recursive:true});
const cityIndex=JSON.parse(readFileSync('public/geo/official/statistics/municipios/35/3550308.json','utf8'));
const payload=(theme:string,city='3550308',district?:string)=>JSON.parse(readFileSync(`public/geo/official/statistics/temas/${theme}/municipios/${city.slice(0,2)}/${city}${district?'/'+district:''}.json`,'utf8'));
const panel=(p:Page)=>p.locator('.census-theme-panel');
const value=(p:Page,key:string)=>panel(p).locator(`[data-census-id="${key}"] [data-census-value]`);
const fmt=(c:any)=>c.status==='sigilo'?'Sob sigilo':c.status==='ausente'?'Indisponível':c.status==='parcial'?`≥ ${new Intl.NumberFormat('pt-BR').format(c.valor)} (parcial)`:typeof c.valor==='string'?`R$ ${c.valor.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${c.valor.split('.')[1]}`:new Intl.NumberFormat('pt-BR').format(c.valor);
const start='/?level=municipio&cd_uf=35&cd_mun=3550308';
const themes=['sexo_idade','cor_raca','alfabetizacao','habitacao','agua','esgoto','lixo','renda'];
const performanceReport:Record<string,unknown>={context:'Chromium headless/Linux, localhost, sem throttling, medições observadas; não são SLA de rede',viewport:'1440x1000'};
async function measurement(page:Page,label:string,begin:number){
 const entries=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>{const r=e as PerformanceResourceTiming;return {path:new URL(r.name).pathname,bytes:r.decodedBodySize,duration_ms:r.duration};}));
 performanceReport[label]={elapsed_wall_ms:Date.now()-begin,resources:entries,decoded_bytes:entries.reduce((s,r)=>s+r.bytes,0)};
 writeFileSync(`${output}/desempenho-saopaulo.json`,JSON.stringify(performanceReport,null,2));
}
async function city(page:Page,code:string){
 const uf=code.slice(0,2),select=page.getByRole('combobox',{name:'Selecionar UF'});
 if(await select.inputValue()===uf)await page.getByRole('navigation',{name:'Navegação territorial'}).getByRole('button',{name:uf==='35'?'São Paulo':'Santa Catarina',exact:true}).first().click();
 else await select.selectOption(uf);
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-layer','cd_mun');await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill(code);await page.locator(`[data-territory-id="${code}"]`).click();
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-layer',code==='3550308'?'cd_distrito':'cd_setor');
}

test('capital abre resumo/96 distritos sem baixar os 27.301 setores nem temas',async({page})=>{
 const paths:string[]=[];page.on('request',r=>paths.push(new URL(r.url()).pathname));const begin=Date.now();await page.goto(start);
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','96');
 await expect(page.getByTestId('official-populacao')).toHaveText('11.451.999');await expect(page.getByTestId('official-domicilios')).toHaveText('4.996.529');await expect(page.getByTestId('district-coverage')).toContainText('27.301 setores');
 await expect(page.getByRole('region',{name:'Lista de territórios'}).locator('[data-territory-id]')).toHaveCount(96);expect(paths.some(p=>/\/setores\/|\/temas\/|setores.index/.test(p))).toBe(false);expect(paths.some(p=>p.endsWith('/municipios/35.geojson'))).toBe(false);
 await expect(page.getByTestId('official-neighborhood-source')).toHaveCount(0);await expect(page.getByRole('checkbox',{name:/Comparar/})).toHaveCount(0);
 await measurement(page,'municipio_abertura_fria',begin);await page.screenshot({path:`${output}/saopaulo-desktop.png`});
});

test('distrito → setor → distrito preserva tipos, valores, teclado, tema e uma instância',async({page})=>{
 const paths:string[]=[];page.on('request',r=>paths.push(new URL(r.url()).pathname));await page.goto(start);await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');const canvas=await page.getByTestId('official-map').locator('canvas').elementHandle();
 await page.getByRole('searchbox',{name:'Buscar nome ou código'}).fill('agua rasa');await page.locator('[data-territory-id="355030801"]').focus();const begin=Date.now();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Água Rasa');await expect(page).toHaveURL(/level=distrito/);await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','174');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 await expect(page.getByTestId('official-populacao')).toHaveText('85.788');await measurement(page,'apos_selecionar_distrito',begin);
 expect(paths.some(p=>p.includes('setores.index'))).toBe(false);expect(paths.filter(p=>p.includes('/setores/35/3550308/')).every(p=>p.includes('355030801'))).toBe(true);
 await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('R$ 6.566,57');await panel(page).getByText('Definições, universos e fontes do tema',{exact:true}).click();await expect(panel(page)).toContainText('Agregados_por_distritos_renda_responsavel_BR_20260508_csv.zip');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${output}/saopaulo-distrito-desktop.png`});
 await page.locator('[data-territory-id="355030801000001"]').press('Enter');await expect(page.getByTestId('official-populacao')).toHaveText('682');await expect(page.getByTestId('official-domicilios')).toHaveText('329');await expect(page.getByTestId('sector-neighborhood')).not.toContainText('Bairro:');await expect(page.getByTestId('sector-neighborhood')).toContainText('Distrito: Água Rasa · 355030801');
 await page.getByRole('button',{name:'Voltar ao distrito',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Água Rasa');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('R$ 6.566,57');await page.getByRole('button',{name:'Voltar ao município',exact:true}).click();await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','96');expect(await canvas!.evaluate(e=>e.isConnected)).toBe(true);
});

test('25 indicadores setoriais são locais, particionados e coerentes',async({page})=>{
 const external:string[]=[],errors:string[]=[],paths:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(/^https?:$/.test(u.protocol)&&u.host!=='127.0.0.1:4173')external.push(r.url());if(u.pathname.includes('/temas/'))paths.push(u.pathname);});
 await page.goto('/?level=setor&cd_uf=35&cd_mun=3550308&cd_distrito=355030801&cd_setor=355030801000001');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 for(const theme of themes){await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption(theme);const d=payload(theme,'3550308','355030801');for(const key of d.metricas){await page.getByRole('combobox',{name:'Colorir por'}).selectOption(`censo_${key}`);await expect(value(page,key)).toHaveText(fmt(d.setores['355030801000001'][key]));await expect(page.getByTestId('official-legend')).toContainText('2022');}}
 expect(paths).toHaveLength(8);expect(paths.every(p=>p.endsWith('/municipios/35/3550308/355030801.json'))).toBe(true);expect(external).toEqual([]);expect(errors).toEqual([]);
});

test('maior partição, Grajaú, mantém todos os setores e carrega apenas o tema escolhido',async({page})=>{
 const paths:string[]=[];page.on('request',r=>paths.push(new URL(r.url()).pathname));const begin=Date.now();
 await page.goto('/?level=distrito&cd_uf=35&cd_mun=3550308&cd_distrito=355030830');
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','1107');
 await expect(page.getByRole('region',{name:'Lista de territórios'}).locator('[data-territory-id]')).toHaveCount(1107);
 await expect(page.getByTestId('official-populacao')).toHaveText(fmt(cityIndex.distritos['355030830'].indicadores.populacao));
 await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('sexo_idade');
 await expect(value(page,'homens')).toHaveText(fmt(payload('sexo_idade','3550308','355030830').distritos['355030830'].homens));
 expect(paths.filter(p=>p.includes('/setores/35/3550308/')).every(p=>p.includes('355030830'))).toBe(true);
 expect(paths.filter(p=>p.includes('/temas/'))).toEqual(['/geo/official/statistics/temas/sexo_idade/municipios/35/3550308/355030830.json']);
 await measurement(page,'maior_distrito_abertura_fria_e_tema',begin);
});

test('busca por código usa índice oficial sob demanda e acessa os três setores corrigidos',async({page})=>{
 const paths:string[]=[],errors:string[]=[];page.on('request',r=>paths.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));await page.goto(start);await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 const search=page.getByRole('searchbox',{name:'Buscar nome ou código'});await search.fill('355030842000772');const found=page.getByRole('button',{name:/Abrir setor 355030842000772/});await expect(found).toBeVisible();expect(paths.some(p=>p.includes('setores.index'))).toBe(true);expect(paths.some(p=>p.includes('/setores/35/3550308/'))).toBe(false);
 await found.press('Enter');await expect(page.getByTestId('sector-neighborhood')).toContainText('Distrito: Jaraguá');await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');
 for(const id of ['355030857000168','355030858000491']){await page.goto(`/?level=setor&cd_uf=35&cd_mun=3550308&cd_setor=${id}`);await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');await expect(page.getByTestId('sector-neighborhood')).toContainText(id);await expect(page.getByRole('alert')).toHaveCount(0);}
 expect(errors).toEqual([]);
});

test('distrito parcial e renda setorial com ponto permanecem explícitos',async({page})=>{
 const d=payload('sexo_idade'),id=Object.keys(d.distritos).find(c=>d.distritos[c].homens.status==='parcial')!;expect(id).toBeTruthy();
 await page.goto(`/?level=distrito&cd_uf=35&cd_mun=3550308&cd_distrito=${id}`);await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('sexo_idade');await expect(value(page,'homens')).toHaveText(fmt(d.distritos[id].homens));await expect(panel(page).locator('[data-census-id="homens"] [data-census-percent]')).toContainText('Indisponível');
 await page.goto('/?level=setor&cd_uf=35&cd_mun=3550308&cd_setor=355030843000901');await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('Indisponível');await expect(panel(page)).toContainText("Marcador '.' na fonte de renda");
 await page.getByRole('button',{name:'Voltar ao distrito',exact:true}).click();await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText(fmt(payload('renda').distritos['355030843'].renda_responsavel_com_rendimentos));
});

test('São Paulo → Agudos → Bauru → Florianópolis → São Paulo conserva cache e histórico',async({page})=>{
 const paths:string[]=[];page.on('request',r=>paths.push(new URL(r.url()).pathname));await page.goto(start);await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await expect(value(page,'agua_rede')).toHaveText(fmt(payload('agua').municipio.agua_rede));
 const canvas=await page.getByTestId('official-map').locator('canvas').elementHandle();
 for(const [code,features] of [['3500709','66'],['3506003','682'],['4205407','1004'],['3550308','96']]){await city(page,code!);await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count',features!);await expect(value(page,'agua_rede')).toHaveText(fmt(payload('agua',code!).municipio.agua_rede));}
 await page.goBack();await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','645');await page.goBack();await expect(page.getByRole('heading',{level:1})).toHaveText('Florianópolis');await expect(value(page,'agua_rede')).toHaveText('207.852');await page.goForward();await page.goForward();await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','96');
 expect(paths.filter(p=>p.endsWith('/temas/agua/municipios/35/3550308.json'))).toHaveLength(1);expect(paths.some(p=>p.includes('/setores/35/3550308/'))).toBe(false);expect(await canvas!.evaluate(e=>e.isConnected)).toBe(true);
});

test('resposta atrasada ou de outro distrito é rejeitada sem alterar a malha',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const route='**/temas/agua/municipios/35/3550308/355030801.json';await page.route(route,async r=>{await gate;await r.fulfill({json:payload('agua','3550308','355030801')}).catch(()=>{});});
 await page.goto('/?level=distrito&cd_uf=35&cd_mun=3550308&cd_distrito=355030801');const pending=page.waitForRequest(route);await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('agua');await pending;
 await page.getByRole('button',{name:'Voltar ao município',exact:true}).click();await page.locator('[data-territory-id="355030802"]').click();await expect(value(page,'agua_rede')).toHaveText(fmt(payload('agua','3550308','355030802').distritos['355030802'].agua_rede));release();await expect(page.getByRole('heading',{level:1})).toHaveText('Alto de Pinheiros');
 await page.unroute(route);await page.route(route,r=>r.fulfill({json:payload('agua','3550308','355030802')}));await page.getByRole('button',{name:'Voltar ao município',exact:true}).click();await page.locator('[data-territory-id="355030801"]').click();await expect(panel(page).getByRole('alert')).toContainText('falhou na validação');await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','174');await expect(page.getByTestId('official-populacao')).toHaveText('85.788');
});

test.describe('capital móvel',()=>{
 test.use({hasTouch:true,viewport:{width:390,height:844}});
 test('toque e retorno mantêm distrito próprio e largura acessível',async({page})=>{
  const begin=Date.now();await page.goto(start);await expect(page.getByTestId('official-map')).toHaveAttribute('data-ready','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await measurement(page,'municipio_movel_abertura_fria',begin);
  await page.locator('.demo-map-wrap').scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/saopaulo-celular-mapa.png`});
  await page.locator('[data-territory-id="355030801"]').tap();await page.getByRole('combobox',{name:'Tema do Censo'}).selectOption('renda');await expect(value(page,'renda_responsavel_com_rendimentos')).toHaveText('R$ 6.566,57');await page.locator('[data-territory-id="355030801000001"]').tap();await expect(page.getByTestId('sector-neighborhood')).toContainText('Distrito: Água Rasa');await expect(page.getByTestId('sector-neighborhood')).not.toContainText('Bairro:');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{const p=document.querySelector('.census-theme-panel')!;window.scrollBy(0,p.getBoundingClientRect().top-20);});await page.screenshot({path:`${output}/saopaulo-celular.png`});
  await page.getByRole('button',{name:'Voltar ao distrito',exact:true}).tap();await expect(page.getByRole('heading',{level:1})).toHaveText('Água Rasa');await page.getByRole('button',{name:'Voltar ao município',exact:true}).tap();await expect(page.getByTestId('official-map')).toHaveAttribute('data-feature-count','96');
 });
});
