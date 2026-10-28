# São Paulo capital — Censo 2022 e distritos oficiais

Entrega sobre **7155a8c**, auditada em **28/10/2026**, repositório
`spikeSpy13/mapa-br`. Município `cd_mun="3550308"`, `cd_uf="35"`, referência
estatística **1º/08/2022**. Agudos, Bauru e Florianópolis preservadas.

## Fontes e configuração

São Paulo foi acrescentada à [configuração compartilhada](manifests/prepared_municipalities.json),
com `particionar_por_distrito=true`, auditoria de áreas em **EPSG:31983**
(SIRGAS 2000 / UTM 23S) e política explícita de reparo restrito à exibição.
Os mesmos produtores Python, contratos TypeScript, DataLoader, React Query,
cache, cancelamento e MapLibre servem as quatro cidades. Não há API IBGE no navegador.

Os oito snapshots SIDRA temáticos selecionam
`/n6/3500709,3506003,3550308,4205407/`. Dimensões, variáveis, unidades, ano 2022,
integridade SHA256 e códigos são verificados pelo leitor existente. Os dois
snapshots básicos já abrangiam os municípios SP/SC e não foram substituídos.
Brasil, cinco regiões e 27 UFs continuam vindos de consolidados oficiais diretos,
independentes das cidades preparadas; não são somas do recorte municipal.

| Grupo | Arquivo/edição setorial e consolidado direto |
| --- | --- |
| População/domicílios físicos | básico **20260520**, `v0001`/`v0002`; SIDRA 4714/93 e 4711/617, espécie total |
| Sexo/idade | demografia snapshot **2026-10-27**; SIDRA 9514/93 |
| Cor ou raça | cor_ou_raca snapshot **2026-10-27**; SIDRA 9605/93 |
| Alfabetização 15+ | alfabetizacao snapshot **2026-10-27**; SIDRA 9542/950 |
| Habitação | básico + domicilio1 **20261021** corrigido; SIDRA 4711/617 |
| Água, esgoto e lixo | domicilio2 **20250417**; SIDRA 6803/381, 6805/381 e 6892/381 |
| Renda direta | setor/município/distrito **20260508**, `V06004` |

O [manifesto temático](manifests/census_themes.json) permanece a fonte canônica
por indicador: arquivo, variável(s), definição literal, unidade, universo,
denominador, edição e regra de agregação. As definições são conferidas nos XLSX,
sem assumir equivalência de códigos entre arquivos. A errata de **21/10/2026**
continua respeitada: DPPO é `V00001` de domicilio1; `V00003` é unidade de habitação
em domicílios coletivos com morador. Consulte também [CENSUS_THEMES.md](CENSUS_THEMES.md).

Reutilizados do cache o
[SP_setores_CD2022.zip](https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/setores/shp/UF/SP/SP_setores_CD2022.zip)
(SHA256 `dd0a9a5439382437304aff017b23b9edd00598b946bfc27c8bd2e2084b4dbd2d`),
`BR_distritos_CD2022.zip`, básico e bases temáticas nacionais. A edição territorial
é a malha com atributos CD2022, listada em 2024, compatível com o básico 20260520.
O município integral é a união dos distritos da mesma malha. URLs, recibos,
hashes dos arquivos e partições constam em [saopaulo.audit.json](manifests/saopaulo.audit.json).
SHA local é evidência de integridade, não assinatura do IBGE.

## Inventário e distinção bairro/distrito

| Conferência | Resultado observado |
| --- | --- |
| São Paulo: DBF/malha/básico | **27.301 setores**, conjuntos idênticos; sem duplicatas, faltantes ou extras |
| SP completo: DBF/malha/básico | **103.319 setores**; **645 municípios** |
| Distritos | **96**, associação de **27.301/27.301 setores (100%)** |
| Bairros declarados nessas fontes | **0**; `CD_BAIRRO='.'`, `NM_BAIRRO=''` em todas as linhas |
| População / domicílios físicos | **11.451.999 / 4.996.529**, somas setoriais e distritais = SIDRA municipal direto |
| Contenção no município e distrito integrais | maior área externa **0 m²**; tolerância 1 m², EPSG:31983 |
| CRS integral / exibição | **EPSG:4674 / EPSG:4326** |
| Geometrias setoriais de exibição | **27.301 válidas**, nenhuma vazia, nenhum setor eliminado |

`CD_SETOR`, `CD_DIST`, `NM_DIST`, `CD_SUBDIST`, `NM_SUBDIST`, `CD_BAIRRO` e
`NM_BAIRRO` foram conferidos entre básico e DBF. Os tipos de identificação são
textuais; a documentação da malha confirma os campos distritais. O vínculo usa
**atributos publicados**, não prefixos, semelhança de nomes ou locais de votação.
Nomes literais como **Cangaiba**, **Cidade Lider** e **São Miguel** são preservados.
A ausência de bairro nesses arquivos não comprova ausência de bairros em outros
cadastros; nenhum vínculo alternativo foi inventado.

A navegação da capital é **São Paulo → distrito → setor**. A lista busca nome/código
do distrito; busca de código setorial usa o índice oficial sob demanda. Setores
mostram código e distrito/subdistrito publicados, com retorno ao distrito e ao
município. São Paulo não cria códigos de bairro, grupo fictício de distrito como
bairro ou comparação de bairros inexistentes. As navegações e comparações por
bairros de Bauru/Florianópolis e o grupo sem bairro de Agudos continuam disponíveis.

Há **três referências setoriais originais inválidas** por autointerseção de anel:
`355030842000772` (Jaraguá), `355030857000168` (Parque do Carmo) e
`355030858000491` (Pedreira). As referências integrais e os ZIPs originais são
preservados. A configuração autoriza `GEOS make_valid linework` somente para
exibição, exigindo polígono válido, mesmos limites topológicos e diferença de
área absoluta **≤ 0,000001 m²**. As diferenças medidas são respectivamente
`1,4552e-10`, `−3,4925e-10` e `−4,3656e-11 m²`. Não houve simplificação dos setores.
Distritos de exibição usam a simplificação por cobertura já existente, com as
validações de cobertura/adjacência; contenção é conferida contra limites integrais.
Não se afirma validade de todas as geometrias setoriais SP fora das cidades exportadas.

## Indicadores e reconciliação

Os **25 indicadores** têm valor municipal direto. D/X/A são quantidades de setores:
divulgados (inclusive zero), sigilo e ausência; somam **27.301 em cada linha**.
A última coluna informa contagens distritais divulgadas/parciais; soma **96**.
A disponibilidade do denominador/percentual é conferida separadamente: mesmo uma
contagem completa pode ter percentual indisponível por universo incompleto. Renda distrital
é publicação direta, e não soma de médias.

| Indicador | Consolidado municipal direto | D | X | A | Distritos contagem D/P |
| --- | ---: | ---: | ---: | ---: | ---: |
| Homens | 5.386.695 | 26.678 | 211 | 412 | 12 / 84 |
| Mulheres | 6.065.304 | 26.678 | 211 | 412 | 12 / 84 |
| 0–14 anos | 1.953.306 | 25.174 | 1.715 | 412 | 3 / 93 |
| 15–59 anos | 7.475.633 | 25.862 | 1.027 | 412 | 4 / 92 |
| 60 anos ou mais | 2.023.060 | 25.872 | 1.017 | 412 | 4 / 92 |
| Branca | 6.214.422 | 26.668 | 221 | 412 | 12 / 84 |
| Preta | 1.160.073 | 25.680 | 1.209 | 412 | 2 / 94 |
| Amarela | 238.603 | 22.697 | 4.192 | 412 | 0 / 96 |
| Parda | 3.820.326 | 26.618 | 271 | 412 | 7 / 89 |
| Indígena (cor ou raça) | 17.727 | 21.702 | 5.187 | 412 | 0 / 96 |
| Alfabetizadas · 15 anos ou mais | 9.253.336 | 20.733 | 6.156 | 412 | 0 / 96 |
| Não alfabetizadas · 15 anos ou mais | 245.357 | 20.225 | 6.664 | 412 | 0 / 96 |
| Particulares permanentes ocupados | 4.307.665 | 26.679 | 210 | 412 | 12 / 84 |
| Particulares permanentes vagos | 589.020 | 27.301 | 0 | 0 | 96 / 0 |
| Permanentes de uso ocasional | 86.806 | 27.301 | 0 | 0 | 96 / 0 |
| Água · rede geral como forma principal | 4.271.130 | 26.634 | 255 | 412 | 12 / 84 |
| Água · poço profundo/artesiano como forma principal | 10.638 | 25.589 | 1.300 | 412 | 0 / 96 |
| Esgoto · rede geral ou pluvial | 4.074.717 | 26.526 | 363 | 412 | 12 / 84 |
| Esgoto · fossa séptica/filtro ligada à rede | 27.318 | 23.155 | 3.734 | 412 | 0 / 96 |
| Esgoto · fossa séptica/filtro não ligada à rede | 36.914 | 24.644 | 2.245 | 412 | 0 / 96 |
| Esgoto · fossa rudimentar ou buraco | 25.113 | 25.286 | 1.603 | 412 | 0 / 96 |
| Lixo · coletado no domicílio | 3.948.357 | 26.548 | 341 | 412 | 10 / 86 |
| Lixo · caçamba de serviço de limpeza | 347.214 | 22.112 | 4.777 | 412 | 0 / 96 |
| Lixo · queimado na propriedade | 840 | 26.404 | 485 | 412 | 7 / 89 |
| Renda média dos responsáveis com rendimentos | R$ 4.961,95 | 26.672 | 212 | 417 | 96 / 0 |

As 96 partições distritais são disjuntas e cobrem exatamente o inventário. Os
**412 setores sem moradores** permanecem na cartografia e no básico, conservando
**2.371 domicílios físicos**. As tabelas temáticas possuem 26.889 linhas e omitem
esses 412 códigos: ausência de linha permanece **ausente**, sem imputar zero/sigilo.
Vagos e uso ocasional usam o básico completo e reconciliam **589.020** e **86.806**
com SIDRA. Os outros subtotais setoriais incompletos não foram alterados para
igualar os consolidados; a auditoria registra conhecido, cobertura e total direto.

Homens + mulheres = **11.451.999**; idades 0–14/15–59/60+ também somam o total.
As cinco categorias de cor/raça somam **11.451.151**, diferença de **848 pessoas**
com categoria ignorada incluída apenas no total, conforme nota 9 da
[descrição SIDRA 9605](https://apisidra.ibge.gov.br/desctabapi.aspx?c=9605).
Alfabetização usa **9.498.693 pessoas de 15+**. Habitação usa **4.983.491 particulares
permanentes**, distintos dos **4.996.529 domicílios físicos**. Saneamento usa
**4.307.665 DPPO** como universo municipal, sem trocar pelo total físico.
São categorias selecionadas; não se força soma dos percentuais a 100%.

Nos distritos, contagens compatíveis são somadas; percentual é a soma dos
numeradores dividida pela soma dos denominadores, **Decimal/ROUND_HALF_EVEN**,
duas casas em campo separado. **2.304 agregações** (24 contagens × 96 distritos)
foram conferidas independentemente contra as células setoriais, incluindo estado,
subtotal, cobertura, denominador e percentual. Incompletude produz **≥ subtotal
(parcial)**, sem percentual/cor; denominador zero também impede percentual.
Zeros divulgados, ausência e X continuam distintos.

Renda municipal direta: **R$ 4.961,95**. O novo arquivo oficial
`Agregados_por_distritos_renda_responsavel_BR_20260508_csv.zip`, SHA256
`424b7628d2cc2026c3e63afda04b1a876952ec1a97baa0ab5bc9f8114e56f307`,
publica **96 códigos/nomes** que coincidem com os distritos do básico/DBF.
`V06004` é rendimento nominal mensal médio de **responsáveis com rendimentos em
DPPO**, BRL/mês; não é renda per capita. A publicação direta permite renda em cada
distrito (Água Rasa **R$ 6.566,57**), sem peso V06001 ou média de médias setoriais.
Cinco linhas setoriais trazem `V06004='.'`: sem média numérica publicada,
classificadas **ausentes com motivo explícito**, sem inferir zero, sigilo ou
universo. Seus códigos estão na auditoria. Brasil/região/UF continuam sem renda
compatível preparada. A antiga restrição de agregação de renda permanece válida.

## Partições e carregamento

Caminhos relativos a `frontend/public/geo/official/`:

- `distritos/35/3550308.geojson` e inventário: 96 distritos, **788.646 bytes**.
- `setores/35/3550308/{CD_DIST}.geojson` e inventário: somente o distrito selecionado.
- `statistics/municipios/35/3550308.json`: resumo municipal/96 distritos, **34.774 bytes**.
- `statistics/municipios/35/3550308.setores.index.json`: **819.135 bytes**, só ao buscar
  setor pelo código ou resolver link setorial sem distrito; associação textual oficial.
- `statistics/municipios/35/3550308/{CD_DIST}.json`: básico dos setores do distrito.
- `statistics/temas/{tema}/municipios/35/3550308.json`: resumo temático municipal/distrital.
- `statistics/temas/{tema}/municipios/35/3550308/{CD_DIST}.json`: tema dos setores
  do distrito, solicitado apenas ao escolher o tema nesse nível.

O resumo não embute os 27.301 setores. Links diretos da capital/distrito/setor
não carregam `municipios/35.geojson`. Não há malha setorial monolítica servida:
o experimento de **45.547.436 bytes** ficou fora do diretório público. O inventário
municipal completo `setores/35/3550308.inventory.json` (**627.941 bytes**) é mantido
para conferência do preparador demográfico; o navegador não o solicita nesses
fluxos. Todos os setores continuam acessíveis por distrito/índice. Uma única instância MapLibre
é conservada ao navegar e trocar municípios; cache e cancelamento incluem cidade,
distrito e tema, recusando resposta atrasada ou com IDs de outro distrito.

| Artefato preparado | Quantidade | Total | Menor / mediana / maior, bytes |
| --- | ---: | ---: | --- |
| Geometria setorial por distrito | 96 | 47.010.502 bytes | 50.153 / 355.296,5 / 3.285.375 |
| Básico por distrito | 96 | 6.769.205 bytes | 12.276 / 63.229 / 264.629 |
| Temas por distrito | 768 (8 × 96) | 107.215.907 bytes | 18.697 / 114.521,5 / 796.076 |

Os resumos temáticos têm **27.241–139.209 bytes cada** e só chegam ao escolher o
tema. A maior malha setorial é Grajaú, **1.107 setores**, 3.285.375 bytes.
A soma de partições inclui metadados repetidos, e não representa a carga inicial.

Medições observadas em **Chromium headless/Linux, localhost, sem throttling**,
viewport desktop 1440×1000 e toque 390×844; não são SLA ou teste de rede móvel:

| Operação | Tempo observado | Recursos decodificados observados |
| --- | ---: | ---: |
| Link direto municipal, contexto frio, desktop | 1.388 ms | 4.546.758 bytes, incluindo JS/CSS/mapa base |
| Abrir Água Rasa a partir do município | 627 ms | +243.967 bytes, três arquivos distritais |
| Link direto municipal, contexto frio, celular | 1.313 ms | 4.546.758 bytes |
| Link direto Grajaú frio + seleção de sexo/idade, 1.107 setores | 3.082 ms | 8.914.606 bytes, incluindo assets e só esse tema |

A primeira carga contém 96 distritos, resumo, base de UFs e assets; **nenhum tema,
setor ou índice de 27.301 códigos**. Limite remanescente: abrir a visão da UF SP
carrega a malha já existente dos 645 municípios (**27.545.599 bytes**); links
diretos da capital evitam esse arquivo. Rede/dispositivo reais podem custar mais.
Preparo com cache no ambiente desta entrega: cartografia **221,77 s**, pico RSS
**1.362.952 KiB**; demografia/temas **100,43 s**, pico RSS **581.500 KiB**.
Os detalhes de recursos, tempos, hashes e limites constam na auditoria versionada.

## Validação e evidências

Verificados **101 testes Python**, **59 frontend**, build TypeScript/Vite e
**54 cenários de navegador** (4,6 min), após a execução sequencial final de
cartografia → demografia → build, com saída ETL sem erros.
Os nove cenários novos cobrem carga progressiva, pesquisa por nome/código,
distrito → setor → distrito, 25 indicadores, três geometrias corrigidas, parcialidade,
renda ausente, troca **São Paulo → Agudos → Bauru → Florianópolis → São Paulo**,
histórico, cache, resposta atrasada/incorreta, teclado, uma instância MapLibre,
toque, largura acessível e a maior partição (Grajaú, 1.107 setores) carregando
apenas o tema escolhido. Não houve requisições externas do navegador nesses fluxos.

A auditoria independente também conferiu a conservação das **seis geometrias**
anteriores (SHA256 idêntico) e **27 arquivos estatísticos** das três cidades
anteriores (JSON canônico idêntico excluindo somente recibos `fontes`, atualizados
para o recorte SIDRA de quatro municípios). Inventários, bairros, setores e
indicadores anteriores foram preservados.

Capturas: [município desktop](../docs/evidence/saopaulo/desktop.png),
[distrito desktop](../docs/evidence/saopaulo/distrito.png),
[setor no celular](../docs/evidence/saopaulo/celular.png),
[mapa no celular](../docs/evidence/saopaulo/celular-mapa.png) e
[medições de recursos](../docs/evidence/saopaulo/desempenho.json).

## Atualizar e preparar no Mac

Na cópia **mapa-br-spike**, com **Python >=3.11 e Node 24**:

```bash
cd ~/mapa-br-spike &&
git switch main &&
git pull --ff-only origin main &&
python3 -m venv .venv &&
.venv/bin/python -m pip install -r etl_pipeline/requirements-geometry.txt &&
.venv/bin/python etl_pipeline/prepare_official_geometries.py --audit-file data/raw/saopaulo_geometry.audit.json &&
.venv/bin/python etl_pipeline/prepare_census_demography.py &&
cd frontend &&
npm ci &&
npm run dev
```

Abra `http://localhost:5173/?level=municipio&cd_uf=35&cd_mun=3550308`.
Os preparadores atualizam as quatro cidades configuradas, reutilizando cache.
As saídas de geometrias/estatísticas são locais e ignoradas pelo Git: o pull
precisa ser seguido do preparo. Nada publica o aplicativo ou altera outra cópia.
O arquivo de auditoria cartográfica local registra fontes e geometria integral;
o relatório versionado desta entrega registra a conferência efetivamente feita.

Para repetir os testes, a partir da raiz do projeto:

```bash
cd ~/mapa-br-spike &&
.venv/bin/python -m pip install 'pyarrow>=18,<24' &&
.venv/bin/python -m unittest discover -s etl_pipeline/tests -v &&
cd frontend &&
npm test &&
npm run build &&
npx playwright install chromium &&
MAPA_BR_EVIDENCE_DIR=/tmp/mapa-br-saopaulo/capturas npm run test:e2e
```
