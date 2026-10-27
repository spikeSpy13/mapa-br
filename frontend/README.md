# Interface territorial

React + Vite + TypeScript estrito. O modo oficial usa malhas locais auditadas
e navegação independente dos indicadores; o modo demonstrativo preserva os
JSONs existentes e sua malha sintética identificada. Validação runtime com Zod. Node >= 22.12 (validado em Node 24).

Prepare primeiro as geometrias oficiais conforme [a seção abaixo](#mapa-oficial-primeira-entrega).

```bash
cd frontend
npm ci
npm run dev
```

Não é necessário gerar novamente os JSONs demonstrativos versionados. O plugin
Vite serve os arquivos de `../data/processed` sob `data/processed/`. No build,
copia essa árvore para dist, preservando as partições: nenhum detalhe municipal
é importado no bundle da aplicação ou buscado na carga inicial.

```bash
npm test
npm run build
npm run test:e2e
```

Os testes de navegador usam Chromium do sistema quando disponível. Se necessário,
instale um navegador de teste com `npx playwright install chromium`, ou indique
seu executável por `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. O Playwright inicia e
encerra seu próprio servidor de preview; execute o build antes. As capturas de
desktop/celular dos testes são gravadas em /tmp, não versionadas.

## Configuração dos dados e publicação

O modo demonstrativo usa as fixtures. Para um recorte estatístico real já gerado pelo pipeline:

```bash
MAPA_BR_DATA_DIR=../data/processed_real npm run dev
MAPA_BR_DATA_DIR=../data/processed_real npm run build
```

O diretório é relativo a frontend/ (também aceita caminho absoluto). O mesmo
endereço público continua sendo data/processed; não é necessário reescrever
os caminhos dos JSONs. Depois de alterar o conjunto, recarregue a página para
descartar o cache da sessão. Não misture arquivos de releases distintas.

`VITE_DATA_URL` pode apontar para outro índice absoluto/relativo, servido com
CORS apropriado. `VITE_BASE_PATH=/observatorio/` configura implantação em
subdiretório; mantenha o mesmo valor em dev, build e preview. Publique dist/
inteiro sob esse prefixo, incluindo a pasta data/. Query params não precisam
de rewrite de rotas; carregam sempre o mesmo index.html.

## Contrato e navegação

- `src/types/contract.ts`: schema de 19 campos obrigatório, aliases textuais
  para IDs e null explícito. O exemplo anterior com propriedades opcionais foi
  alinhado ao motor Python atual, que exige todas as chaves. Não usar Number,
  parseInt ou coerção para IDs. Textos decimais exatos só são exibidos, sem
  conversão em float; cálculos visuais usam as projeções numéricas do contrato.
- `src/services/dataLoader.ts`: cada arquivo carrega seus descendentes com
  `new URL(arquivo, parentFileUrl)`. O detalhe municipal é resolvido contra a
  URL de uf/42.json, nunca contra a raiz. O cache guarda Promises por URL e
  compartilha pendências; abortar um consumidor não cancela outro. O transporte
  é abortado quando o último consumidor sai. Falhas são removidas do cache.
  A interface também impede publicação de respostas de navegações canceladas.
- `src/state/navigation.ts`: união discriminada dos cinco níveis, representada
  nos query params. Trocar UF cria um estado novo, sem município/bairro antigos.
  Links profundos e voltar/avançar funcionam; identificadores inválidos ou fora
  do recorte geram mensagens, sem selecionar arbitrariamente outro município.
- Nível 5: key e seleção sempre usam id_agregacao, inclusive no fallback com
  cd_bairro null. Origem da malha e alertas de sigilo permanecem explícitos.
- Renda sempre significa renda do responsável nesta visualização. Renda
  domiciliar é outro campo. Gini/PIB ausentes em bairros aparecem como “—”.
  A cobertura usa os pesos conhecidos para não exibir 100% quando o JSON
  arredondou uma fração suprimida; denominador sob sigilo continua desconhecido.

## MapLibre offline e geometrias de demonstração

As sete malhas pequenas em `public/geo/demo/` são versionadas: `ufs.geojson`,
`municipios/{35,42}.geojson` e `setores/{cd_uf}/{cd_mun}.geojson` dos quatro
municípios. São retângulos SINTÉTICOS para testar interação; não são limites
geográficos oficiais. As tabelas continuam como navegação acessível por teclado
ou alternativa quando WebGL não está disponível.

Para regenerar, na raiz do repositório:

```bash
python3 etl_pipeline/01_build_uf_base.py --date 2026-10-25
python3 etl_pipeline/build_demo_geometries.py
cd frontend
npm ci
npm run dev
```

As dependências precisam estar instaladas (npm ci requer rede ou cache local).
Depois, a execução e o build da demo não acessam IBGE, CDNs, tiles, fontes ou
sprites remotos. O estilo MapLibre é local, sem mapa-base externo; o worker está
no pacote instalado. A auditoria de renda de 2022 não é executada pelo frontend
nem condiciona a demonstração. As malhas já versionadas permitem iniciar sem
Python e sem regenerar as fixtures.

O mapa carrega UFs inicialmente, municípios somente ao abrir SP/SC e setores
apenas ao abrir o município. Região filtra/ajusta a câmera às UFs correspondentes.
UFs sem detalhe conservam seu resumo e polígono sintético sem fetch municipal.
`promoteId` usa cd_uf, cd_mun ou cd_setor textual. `setFeatureState` atualiza cor,
sigilo, cobertura e seleção. A seleção de bairro usa SEMPRE id_agregacao e
acende todos os seus setores pelo join reverso, inclusive no fallback; não há
dissolve no navegador. Contorno âmbar indica grupo com setores sob sigilo,
contorno rosa indica o grupo selecionado. Tooltip mostra cobertura conhecida
ou desconhecida; valores ausentes não viram zero.

`demoGeometry.ts` recusa códigos numéricos, duplicatas, setores fora do município,
grupos incoerentes e inventários diferentes dos dados tabulares. Geometrias são
permitidas somente para metadata.tipo_dados=simulados. O manifesto conserva
hashes locais dos arquivos tabulares para rastreabilidade; o cliente verifica
os vínculos/IDs, não revalida esses hashes. Não apontar dados reais para geo/demo.
Veja [a política de geometrias oficiais](../etl_pipeline/GEOMETRIES.md).

## Store geográfica compartilhada

`src/store/useGeoStore.ts` usa Zustand com `GeoStoreProvider` (já instalado em
App). `useGeoStore(selector)` compartilha ações e a métrica entre componentes.
`createGeoStore()` permite testes sem React. A navegação permanece um único
campo `navigation` discriminado, sem combinação de nível com IDs descendentes
incompatíveis em campos paralelos.

Ações: irParaPais, selecionarRegiao, selecionarUf, selecionarMunicipio,
selecionarBairro, voltarNivel e setMetrica. As ações validam os valores originais
antes de serializar na URL; não aplicam String(code). Registrar as associações
UF/região do índice permite voltar à região correta mesmo após trocar de UF.
O provider acompanha popstate e inicializa links profundos na montagem. A
métrica persiste ao navegar e voltar; não é gravada nos query params.

Métricas disponíveis: população, renda do responsável, PIB per capita, PIB
em bilhões, cobertura de renda e quantidade de setores sob sigilo. A interface
contém o botão Voltar nível, independente do histórico voltar/avançar do navegador.

Os nomes IndicadoresCanonica, BairroAgregado, RegiaoResumo, UfIndiceItem,
MunicipioResumoItem e MunicipioDetalhe são exportados como aliases dos schemas
Zod, preservando uma única definição. total_bairros e total_setores nos resumos
municipais são inteiros obrigatórios, como gerados pelo Python.

As 25 UFs sem detalhe da demo (incluindo Amazonas) continuam mostrando resumo;
a carga exige dados_disponiveis true e arquivo preenchido. O Vite já serve a
árvore local sem duplicação no desenvolvimento; não é necessário criar symlink.

## Componentes e métricas

- `lib/geoStats.ts` centraliza o catálogo, a disponibilidade por nível,
  formatação pt-BR, quantis interpolados (R-7) e bounding boxes, inclusive de
  coleções de geometrias. Valores ausentes não viram zero ou sigilo; cobertura
  conhecida parcial não arredonda para um falso 100%.
- `MapViewport.tsx` mantém uma instância WebGL com três fontes locais
  (ufs-source, municipios-source, setores-source). Mantém IDs textuais e limpa
  feature-state ao trocar o recorte. Mudança de métrica atualiza cores sem
  refazer fetch; selecionar grupo ajusta a câmera e destaca seus setores.
- PIB continua selecionado na store ao entrar num município, mas a pintura e
  o ranking de bairros usam renda do responsável, com aviso e legenda explícitos.
  O KPI municipal de PIB continua válido; no bairro, PIB segue indisponível.
  Voltar à UF retoma a pintura de PIB. O fallback não imputa renda ausente.
- `AnalyticalSidebar.tsx` apresenta KPIs, ranking, dispersão e auditoria de
  responsáveis, pesos, setores por média/massa e strings decimais exatas.
  Universo suprimido é identificado como parcial, sem inventar totais.
- `App.tsx` usa React Query por aplicação para índice e recorte selecionado,
  delegando a cadeia índice → UF → município ao DataLoader validado. staleTime
  e gcTime são Infinity durante a sessão, retry=1, sem refetch no foco. Os sinais
  cancelam navegações antigas; networkMode=always permite servir localhost
  mesmo quando navigator.onLine=false. Não há symlink nem segundo data loader.

Após atualizar dependências: `npm ci`, `npm run dev`. Para regenerar fixtures e
geometrias, execute os dois geradores Python na raiz; os caminhos Vite existentes
já servem a árvore particionada e funcionam em subdiretórios de publicação.

## Sidecar eleitoral opcional

O [contrato TSE](TSE_SIDECAR.md) usa `types/tseContract.ts`, sem modificar os
schemas socioeconômicos. A opção TSE aparece no município; nenhum arquivo
TSE é solicitado inicialmente. O payload opcional fica na mesma árvore em
`tse/{cd_uf}/{cd_mun}.json`. O middleware e o build preservam essa partição.

Há validação cruzada de votos, proporções, locais, seções, cobertura ponderada,
ponte setor/grupo e proveniência. A camada circle usa pontos, mantendo os
indicadores do Censo nos polígonos. O painel seleciona o agregado do bairro por
id_agregacao e mostra o aviso do recorte eleitoral. Ausência de sidecar retorna
indisponibilidade, não votos zero. Não há ingestão TSE real neste passo; dados
sintéticos eleitorais existem apenas nos testes. O produtor Python futuro deverá
usar Decimal/ROUND_HALF_EVEN e demonstrar contenção na malha compatível.

## Mapa oficial (primeira entrega)

A abertura padrão é o modo oficial. Execute a preparação descrita em
[GEOMETRIES.md](../etl_pipeline/GEOMETRIES.md) uma vez, antes do dev/build.
As malhas locais são ignoradas pelo Git; o build não faz download automático.
Com a árvore preparada, a aplicação funciona sem rede externa.
`?modo=demo` abre a demonstração preservada, explicitamente simulada. O link no
cabeçalho alterna os modos com recarregamento, isolando os respectivos caches.

O estado `CartographyState` em `officialGeometry.ts` declara `kind: cartografia`
e `statistics.status: indisponiveis`. Não é um payload socioeconômico parcial.
Reutiliza DataLoader, cache compartilhado, cancelamento e resolução por arquivo
pai. O catálogo guarda somente caminhos e disponibilidade. Inventários são arquivos
separados, carregados junto à malha do respectivo nível; só UFs são carregadas inicialmente,
municípios após SC e setores após Florianópolis. O caminho setorial é relativo
a `municipios/42.geojson`. `BASE_URL` também se aplica às malhas e fontes.

`OfficialExplorer.tsx` usa a store e o MapViewport existentes. `setor` é um estado
explícito de navegação com cd_uf/cd_mun/cd_setor textuais, URL e histórico. Seleção
realça o contorno e ajusta a câmera; no modo oficial, Voltar nível retorna ao
bairro quando existe vínculo auditado, ou ao município sem esse vínculo. A lista
pesquisável permite navegar por teclado e sem WebGL. Outras UFs mantêm seu
contorno e informam a indisponibilidade municipal. Outros municípios de SC
mantêm o limite municipal e informam a indisponibilidade setorial.

O seletor temático fica desabilitado quando não há indicadores, e o preenchimento
é neutro. Não há fallback para renda, indicadores simulados ou preenchimento de
lacunas. Os setores não são apresentados como bairros. O arquivo de proveniência
local é acessível na interface. Falhas de arquivo, inventário ou vínculo têm
mensagens próprias, sem contornar a validação.

```bash
npm test
npm run build
npm run test:e2e
# Opcional: salvar evidências fora de /tmp/mapa-br-official
MAPA_BR_EVIDENCE_DIR=/caminho/evidencias npm run test:e2e -- official.spec.ts
```

A integração oficial verifica 27 UFs, 295 municípios, 1.004 setores, histórico,
retorno, resposta atrasada, ausência de chamadas aos dados simulados, mensagens
de indisponibilidade, viewport móvel e sequência das requisições na rede.

## População e domicílios oficiais (demografia-1)

Após a cartografia, execute na raiz:

```bash
.venv/bin/python etl_pipeline/prepare_census_demography.py
```

Isso habilita população e domicílios sem alterar as fixtures demonstrativas.
Brasil, cinco regiões e 27 UFs usam consolidados diretos SIDRA; municípios SC
carregam sob demanda; os 1.004 setores de Florianópolis carregam só ao abrir o
município. O painel indica fonte, unidade, edição e referência de 2022.
O contrato parcial e as instruções anteriores de modo sem indicadores passam a
seguir [CENSUS_DEMOGRAPHY.md](../etl_pipeline/CENSUS_DEMOGRAPHY.md), com fontes,
auditoria, limites e comandos completos para Mac. Rode o build após o preparo.

## Prévias, seleção e tooltips (proposta Gemini integrada)

O anexo Gemini foi usado como proposta de interação, adaptada à demografia atual.
Prévia temporária tem contorno verde (âmbar quando há sigilo); seleção persistente
permanece rosa e identificada na lista/painel. Hover e foco não alteram URL, KPIs,
seleção nem escala. A lista e os cartões da demo também destacam o mapa. No sentido mapa → lista,
somente o contêiner da lista rola para revelar a linha, sem mover a página ou o foco. Tab
pré-visualiza, Enter/Espaço abre e Escape limpa a prévia, preservando o foco.
Em toque, um tap abre o território; não há exigência de hover ou segundo tap.
Pontos TSE têm prioridade sobre o polígono, com tooltip próprio também ao tocar.

A troca de território, saída do mapa, movimento da câmera e Escape limpam estados
transitórios. Os tooltips são medidos e limitados ao mapa, com resumo textual
acessível e valores exatamente como divulgados (zero, ausência e sigilo distintos).
Uma instância MapLibre é preservada; movimentos são agrupados por frame e apenas
as feições do grupo anterior/novo recebem o estado de hover. Não há novos caches,
fontes, contratos de dados ou dependências. Grupos da demo realçam todos os seus
setores; não são bairros reais nem geometrias dissolvidas.

No Mac, Node 24 e dados/malhas já preparados conforme
[CENSUS_DEMOGRAPHY.md](../etl_pipeline/CENSUS_DEMOGRAPHY.md), execute em `frontend/`:

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

`interactions.spec.ts` cobre hover bidirecional, seleção independente, Escape,
limpeza na troca de território, toque em lista/polígono, tooltip TSE e estados
zero/ausência/sigilo. As suites anteriores também validam os indicadores oficiais
e a demo. Capturas em `/tmp/mapa-br-interactions`, ou escolha um diretório com
`MAPA_BR_EVIDENCE_DIR=/tmp/minhas-capturas npm run test:e2e`. A verificação de toque
é automatizada no Chromium; Safari/iOS e leitores de tela reais não foram testados.


## Bairros declarados do Censo 2022

A entrega de indicadores existente foi preservada e revalidada. A preparação
`prepare_census_demography.py` agora confere CD_SETOR/CD_BAIRRO/NM_BAIRRO no CSV
básico e no DBF oficial da mesma referência censitária. Em Florianópolis há 87
bairros declarados e 109 setores sem bairro informado, conservados num grupo
explícito. Os 88 grupos particionam os 1.004 setores e reconciliam com o município.

No município, **Bairros de Florianópolis** aparece diretamente abaixo da busca,
com os 87 bairros pelo nome e o grupo sem vínculo ao final. Cada botão identifica
código e quantidade de setores. A lista setorial permanece organizada por bairro.
Pesquise pelo nome (sem exigir acentos) ou pelos códigos textuais de bairro/setor:
o código de um setor também revela o bairro correspondente na lista de bairros.
Selecione o bairro pelo botão ou pelo cabeçalho da lista setorial. A seleção
destaca seus setores, enquadra o mapa e filtra a lista;
o painel mostra os totais do grupo. Cada setor continua com sua própria cor,
valor e tooltip. A legenda usa os mesmos quantis setoriais do município.

Ao abrir um setor, o título e os detalhes mostram o bairro, o código do bairro
e o código setorial. “Voltar nível” e “Voltar ao bairro” retornam ao vínculo
oficial, inclusive em links diretos. Os 109 sem vínculo mantêm seus códigos sob
“Bairro não identificado na fonte”; o grupo não representa um bairro oficial.
A cobertura de 895/1.004 setores (89,14%) fica explícita no painel.

O arquivo leve `statistics/municipios/42/4205407.bairros.json` contém códigos,
nomes, referência territorial, fontes e cobertura. É gerado junto da demografia
e validado pelo DataLoader existente apenas ao abrir o município. Nenhuma
geometria foi modificada, e não há dissolve no navegador. Keyboard/Enter/Espaço,
toque e hover temporário continuam pela infraestrutura existente. Zero,
ausência, sigilo e demonstração são preservados. Fontes, limitações e comandos
para atualizar **mapa-br-spike** no Mac estão em
[CENSUS_DEMOGRAPHY.md](../etl_pipeline/CENSUS_DEMOGRAPHY.md).

## Comparação de bairros oficiais

A lista de bairros agora oferece ranking por população/domicílios, valor absoluto,
participação no total municipal completo e barras com escala comum. O grupo sem
bairro fica separado, com seus valores preservados. A busca existente filtra os
bairros sem alterar a escala ou o denominador. As participações percentuais usam
Decimal/HALF_EVEN no produtor, com duas casas textuais; não são contagens inteiras.

Marque **Comparar** para escolher até três bairros. Os cartões exibem população,
domicílios, participações e quantidade de setores. Use **Remover** ou **Limpar
comparação**. Explorar um bairro/setor do mesmo município preserva a escolha;
selecionar outro município limpa a comparação. Marcar bairros não seleciona
polígonos nem altera a URL. No celular, os cartões ficam empilhados com seus rótulos.

Na raiz, reexecute `.venv/bin/python etl_pipeline/prepare_census_demography.py`;
em `frontend/`, execute `npm test`, `npm run build` e `npm run test:e2e`.
O arquivo demográfico antigo continua abrindo, com percentuais indisponíveis até
o novo preparo. `comparison.spec.ts` cobre ranking, denominadores, limite de três,
navegação, remoção, mudança de município, dados legados, teclado e toque.
Veja a metodologia em [CENSUS_DEMOGRAPHY.md](../etl_pipeline/CENSUS_DEMOGRAPHY.md).


## Temas oficiais do Censo 2022

**Tema do Censo** organiza sexo/idade, cor ou raça, alfabetização 15+, habitação,
água, esgoto, lixo e renda publicada. **Colorir por** aplica a variável ao próprio
setor; painel, tooltip e legenda mostram unidade, universo e referência. O painel
mostra percentuais e denominadores. Bairros somam contagens compatíveis; parcial
é subtotal conhecido, sem percentual/cor/barra, com cobertura explícita. Renda é
somente a média publicada diretamente para setor, bairro ou município, sem peso
V06001. Ranking e cartões reutilizam a comparação existente.

Os temas são JSONs municipais separados, carregados somente ao escolher o tema;
o panorama nacional vem diretamente do SIDRA, independente do recorte. Zero,
X e ausência permanecem distintos. O modo demo não recebe métricas oficiais.

Na raiz, rode `.venv/bin/python etl_pipeline/prepare_census_demography.py` antes
do build. Para só os consolidados nacionais, use `--national-themes-only`.
Fontes, todas as variáveis/edições, resultados, limites e comandos completos
para atualizar e testar no Mac em **mapa-br-spike**:
[CENSUS_THEMES.md](../etl_pipeline/CENSUS_THEMES.md).


## Municípios oficiais configuráveis

Brasil → SP agora oferece 645 municípios e detalhe de Agudos (`3500709`), além
da cobertura de SC/Florianópolis preservada. Os 66 setores de Agudos conservam
população, domicílios e os 25 indicadores temáticos conforme divulgação/sigilo.
Não há bairros identificados nos atributos oficiais de Agudos; o grupo explícito
sem bairro mantém todos os setores. Distrito e subdistrito aparecem nos detalhes
com seus códigos, sem se tornarem bairros. Não há ranking/comparação de bairros
inventados. Florianópolis mantém seus 87 bairros e sua comparação.

A configuração comum fica em `etl_pipeline/manifests/prepared_municipalities.json`.
Loaders, validação, títulos e caminhos usam a cidade selecionada, com inventário
exato e cache por município/tema. Artefatos antigos de vínculo com `setores_sc`
continuam aceitos; novos usam `setores_uf`.

Na raiz, execute o preparador cartográfico e depois o demográfico, conforme os
[comandos completos para o Mac](../etl_pipeline/PREPARED_MUNICIPALITIES.md).
O [relatório de Agudos](../etl_pipeline/manifests/agudos.audit.json) contém a
cobertura de cada indicador e a comprovação da preservação das malhas existentes.


## Bauru — terceira cidade oficial

A mesma configuração agora inclui Bauru (`3506003`): 682 setores e os 25 temas,
com 12 bairros declarados no CD_BAIRRO/NM_BAIRRO do IBGE (638 setores), incluindo
os nomes publicados “Centro” e “Bacia…”. Os 44 setores sem vínculo continuam
acessíveis e integram os totais. Os nomes não são aliases de loteamentos ou de
outros recortes municipais. Navegação, ranking, comparação, temas e carga por
município reutilizam os componentes existentes; Agudos/Florianópolis permanecem.

A consulta complementar à página de mapas da Seplan retornou HTTP 503/timeout.
Nenhum vínculo municipal foi estimado. Fontes, cobertura por indicador, resultado
da investigação e [comandos completos no Mac](../etl_pipeline/BAURU.md) estão
no relatório; [auditoria estruturada](../etl_pipeline/manifests/bauru.audit.json).
