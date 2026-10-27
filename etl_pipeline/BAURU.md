# Bauru — Censo 2022, setores e bairros declarados

Entrega sobre **65b1e75**, conferida em **27/10/2026**, repositório
`spikeSpy13/mapa-br`. Referência estatística **1º/08/2022**.
Bauru: `cd_uf="35"`, `cd_mun="3506003"`. Agudos e Florianópolis preservadas.

## Implementação e fontes

A inclusão usa a [configuração compartilhada](manifests/prepared_municipalities.json)
e os mesmos produtores, contratos, loaders, componentes, cache e cancelamento.
Não foram necessários algoritmos ou caminhos especiais de Bauru no código de
produção. Os códigos continuam textuais; quantidades são observadas nas fontes,
não declaradas na configuração.

Os oito snapshots SIDRA temáticos agora selecionam
`/n6/3500709,3506003,4205407/`, com dimensões/categorias/variáveis e hashes conferidos
pelo leitor existente. Os dois snapshots básicos **não mudaram**: já cobriam os
645 municípios SP e 295 SC. Os resumos Brasil/região/UF vêm diretamente dos
consolidados, sem somar cidades preparadas. A abertura continua sem carregar
estatísticas municipais, setores ou os oito temas. Cada tema e município tem sua
partição e chave de cache, com inventário associado à seleção.

| Tema | Fontes existentes reutilizadas |
| --- | --- |
| População e domicílios físicos | básico rev. 20260520; SIDRA 4714/93 e 4711/617, espécie total |
| Sexo e idade | demografia; SIDRA 9514/93, faixas compatíveis publicadas |
| Cor ou raça | cor_ou_raca; SIDRA 9605/93, quesito cor ou raça |
| Alfabetização 15+ | alfabetizacao; SIDRA 9542/950, universo 15+ |
| Habitação | básico + domicilio1 **20261021** corrigido; SIDRA 4711/617 |
| Água/esgoto/lixo | domicilio2 **20250417**; SIDRA 6803/381, 6805/381, 6892/381 |
| Renda | CSVs de setor/município/bairro **20260508**, V06004 publicada diretamente |

Dicionários, variáveis literais, unidade, universo, denominador e agregação
permanecem em [census_themes.json](manifests/census_themes.json) e
[CENSUS_THEMES.md](CENSUS_THEMES.md). A errata V00003 de 21/10/2026 continua
respeitada: DPPO é **V00001** em domicilio1, não V00003. Não há média de médias,
peso V06001 ou substituição do universo de saneamento pelo total físico.

## Inventário cartográfico

Reutilizado do cache o
[SP_setores_CD2022.zip](https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/setores/shp/UF/SP/SP_setores_CD2022.zip),
SHA256 `dd0a9a5439382437304aff017b23b9edd00598b946bfc27c8bd2e2084b4dbd2d`.
O limite municipal integral é a união dos distritos do mesmo Censo em
`BR_distritos_CD2022.zip`, sem misturar uma malha de outro ano.

| Conferência | Resultado |
| --- | --- |
| Inventário Bauru: DBF/malha/básico | **682 setores**, conjuntos idênticos; sem duplicatas/faltantes/extras |
| Inventário SP completo | **103.319 setores**, malha = básico; 645 municípios |
| Validade geométrica em Bauru | **682 válidos**, sem reparos ou supressão de setores |
| Referência integral / exibição | SIRGAS 2000 **EPSG:4674** / WGS84 **EPSG:4326** |
| Contenção no município integral | maior área externa **0 m²**; tolerância 1 m², EPSG:31982 |
| População | **379.146**, soma dos 682 setores = consolidado SIDRA direto |
| Domicílios físicos | **171.564**, soma dos 682 setores = consolidado SIDRA direto |
| Distritos declarados | Bauru `350600305`: **676** setores; Tibiriçá `350600310`: **6** |

Os subdistritos são `35060030500` e `35060031000`, com nome não informado na
fonte. São identificações próprias nos detalhes, não bairros. Referências
integrais ficam em `data/raw/geometries_reference/censo2022/`; exibição e
inventários em `frontend/public/geo/official/`. Setores não são simplificados.
Todos os GeoJSONs anteriores de Agudos/Florianópolis, municípios SP/SC e UFs
mantiveram seus SHA256. Indicadores e vínculos das duas cidades anteriores
permaneceram idênticos; apenas os recibos SIDRA temáticos mudaram para o recorte
com três municípios. Não se afirma validade geométrica dos setores SP não exportados.

## Associação oficial setor–bairro

`CD_SETOR`, `CD_BAIRRO` e `NM_BAIRRO` foram comparados exatamente entre **todas
as 682 linhas** do básico 20260520 e do DBF SP_setores_CD2022. Campos DBF textuais,
nomes/códigos coincidentes e definições na aba Setor do dicionário da malha fixado.
O vínculo é atributivo oficial, sem inferência por prefixo/nome nem novo dissolve.

Cobertura: **638/682 setores (93,55%)**, em **12 códigos de bairro declarados pelo
IBGE**. Cobrem **96,82% das pessoas** e **97,56% dos domicílios** — cobertura por
setores é uma medida diferente. Os percentuais derivados usam Decimal/HALF_EVEN.
Os **44 sem bairro** conservam **12.055 pessoas** e **4.181 domicílios**, inclusive
nos totais municipais e denominadores de comparação.

Os nomes abaixo são **literais da publicação IBGE**. Onze incluem a palavra
“Bacia”; não foram renomeados ou substituídos por nomes de loteamentos. O uso do
campo CD_BAIRRO não comprova equivalência com bairros usuais, loteamentos,
limites hidrográficos de outra publicação ou setores municipais de planejamento.

| CD_BAIRRO textual | NM_BAIRRO da fonte | Setores |
| --- | --- | ---: |
| `3506003001` | Centro | 18 |
| `3506003002` | Bacia do Córrego Água da Ressaca | 73 |
| `3506003003` | Bacia do Córrego Água da Forquilha | 28 |
| `3506003004` | Bacia do Córrego Água do Sobrado | 64 |
| `3506003005` | Bacia do Córrego Água da Grama | 107 |
| `3506003006` | Bacia do Córrego Água do Castelo | 80 |
| `3506003007` | Bacia do Córrego do Pau d'Alho | 34 |
| `3506003008` | Bacia do Córrego Barreirinho | 32 |
| `3506003009` | Bacia do Córrego Vargem Limpa | 33 |
| `3506003010` | Bacia do Ribeirão Vargem Limpa | 48 |
| `3506003011` | Bacia do Córrego Água Comprida | 69 |
| `3506003012` | Bacia do Córrego das Flores/Avenida Nações Unidas | 52 |

O carregamento e a UI existentes habilitam busca pelos nomes/códigos, seleção e
encaixe dos setores de cada grupo, bairro → setor → bairro, ranking e comparação
até três bairros. O grupo **Bairro não identificado na fonte** permanece fora do
ranking oficial, com acesso a todos os 44 setores. O total municipal inclui esse
grupo. Agudos mantém sua associação ausente; Florianópolis mantém seus 87 bairros.

## Investigação municipal: Seplan

Consultada primeiro a página indicada pelo usuário:
[Mapas digitais — Secretaria de Planejamento](https://www2.bauru.sp.gov.br/seplan/mapas_digitais.aspx).
Nesta sessão ela retornou **HTTP 503**; nova consulta e os endereços oficiais
`https://www2.bauru.sp.gov.br/seplan/` e
`https://www.bauru.sp.gov.br/seplan/mapas_digitais.aspx` também retornaram **503**.
Corpo da resposta, 91 bytes, enviado por `server: envoy`:

```text
upstream connect error or disconnect/reset before headers. reset reason: connection timeout
```

**Limite da investigação:** nenhum mapa/arquivo municipal foi obtido. Não foi
possível verificar se os materiais publicados distinguem bairros, loteamentos,
distritos ou setores de planejamento, suas datas/CRS ou compatibilidade com 2022.
Não se conclui que o portal esteja indisponível fora deste ambiente. Os URLs,
timestamps, headers, status, corpo e hash da resposta constam em
[bauru.audit.json](manifests/bauru.audit.json), seção `investigacao_municipal`.

Não existe correspondência municipal nova nesta entrega, nem códigos IBGE
inventados. Sem geometrias municipais, as interseções/ambiguidades **não foram
avaliadas**; não se afirma que sejam inexistentes. Não houve atribuição por
centroide ou rateio de população/domicílios por área. O vínculo IBGE dos 638
setores está confirmado independentemente desse bloqueio; os 44 restantes
aguardam evidência oficial compatível para qualquer associação adicional.

## Indicadores e disponibilidade

São **25 indicadores** com consolidado municipal direto disponível. Cada tema
setorial/renda tem **667 linhas** de Bauru. Os **15 setores sem linha** têm
população básica zero e conservam seus **dois domicílios físicos** no básico;
permanecem **ausentes** nos temas que os omitem, sem imputação. Vagos e uso
ocasional vêm das 682 linhas do básico. X continua sigilo, zero divulgado é zero.

D/X/A são quantidades de setores: divulgada (inclui zero), sigilo, ausência.
D + X + A = **682 por indicador**. O relatório registra também zeros divulgados,
subtotal conhecido, cobertura e comparação com o consolidado por indicador.

| Indicador | Consolidado municipal | D | X | A |
| --- | ---: | ---: | ---: | ---: |
| Homens | 183.320 | 644 | 23 | 15 |
| Mulheres | 195.826 | 644 | 23 | 15 |
| 0–14 anos | 65.931 | 622 | 45 | 15 |
| 15–59 anos | 244.980 | 625 | 42 | 15 |
| 60 anos ou mais | 68.235 | 628 | 39 | 15 |
| Branca | 242.551 | 644 | 23 | 15 |
| Preta | 26.645 | 628 | 39 | 15 |
| Amarela | 5.260 | 546 | 121 | 15 |
| Parda | 104.160 | 644 | 23 | 15 |
| Indígena (cor ou raça) | 515 | 513 | 154 | 15 |
| Alfabetizadas · 15 anos ou mais | 306.642 | 553 | 114 | 15 |
| Não alfabetizadas · 15 anos ou mais | 6.573 | 545 | 122 | 15 |
| Particulares permanentes ocupados | 140.033 | 644 | 23 | 15 |
| Particulares permanentes vagos | 22.156 | 682 | 0 | 0 |
| Permanentes de uso ocasional | 8.966 | 682 | 0 | 0 |
| Água · rede geral como forma principal | 134.388 | 636 | 31 | 15 |
| Água · poço profundo/artesiano como forma principal | 5.053 | 553 | 114 | 15 |
| Esgoto · rede geral ou pluvial | 135.731 | 639 | 28 | 15 |
| Esgoto · fossa séptica/filtro ligada à rede | 201 | 577 | 90 | 15 |
| Esgoto · fossa séptica/filtro não ligada à rede | 1.704 | 579 | 88 | 15 |
| Esgoto · fossa rudimentar ou buraco | 2.157 | 604 | 63 | 15 |
| Lixo · coletado no domicílio | 131.984 | 639 | 28 | 15 |
| Lixo · caçamba de serviço de limpeza | 7.224 | 562 | 105 | 15 |
| Lixo · queimado na propriedade | 515 | 609 | 58 | 15 |
| Renda média dos responsáveis com rendimentos | R$ 3.913,81 | 644 | 23 | 15 |

Sexo (183.320 + 195.826) e faixas etárias (65.931 + 244.980 + 68.235) somam
379.146 nos consolidados. As cinco categorias de cor/raça somam 379.131; o total
inclui a diferença de 15 pessoas com cor/raça ignorada, conforme nota 9 da
[descrição SIDRA 9605](https://apisidra.ibge.gov.br/desctabapi.aspx?c=9605).
Não houve redistribuição ou criação de categoria/registro para fechar o total.

Vagos **22.156** e uso ocasional **8.966** reconciliam integralmente com SIDRA.
Os demais subtotais setoriais são incompletos por X/ausências e aparecem como
parciais, sem reconstruir valores suprimidos ou forçar igualdade. Bairros somam
contagens e denominadores compatíveis; percentuais só existem com base completa.
Saneamento mantém categorias selecionadas, sem forçar soma a 100%.

Renda municipal: **R$ 3.913,81**, publicada diretamente. Os **12 códigos e nomes**
dos CSVs de renda por bairro coincidem com a associação básica/DBF, permitindo
exibir V06004 diretamente nesses bairros. O grupo sem bairro não tem média
publicada e permanece indisponível; não se agregam médias setoriais.

## Preparar no Mac

Na raiz de **mapa-br-spike**, com **Python >=3.11 e Node 24**:

```bash
git pull --ff-only origin main
python3 -m venv .venv
.venv/bin/python -m pip install -r etl_pipeline/requirements-geometry.txt
.venv/bin/python etl_pipeline/prepare_official_geometries.py --audit-file data/raw/bauru_geometry.audit.json
.venv/bin/python etl_pipeline/prepare_census_demography.py
cd frontend
npm ci
npm run dev
```

Os preparadores atualizam as três cidades configuradas, com cache e sem alterar
outra cópia do projeto. Nada publica o aplicativo. SP_setores e os arquivos
nacionais já baixados são reutilizados; só os oito snapshots temáticos mudaram.
Geometrias/indicadores preparados são locais e ignorados pelo Git: o pull precisa
ser seguido do preparo. Recarregue o navegador após preparar uma nova release.

Novos caminhos: `setores/35/3506003.geojson` e inventário;
`statistics/municipios/35/3506003.json`, `3506003.bairros.json` e
`statistics/temas/{tema}/municipios/35/3506003.json`. As oito partições temáticas
têm cerca de 130–500 KB cada; malha setorial cerca de 1,6 MB, somente ao abrir Bauru.

Validação na raiz e depois no frontend:

```bash
.venv/bin/python -m pip install 'pyarrow>=18,<24'
.venv/bin/python -m unittest discover -s etl_pipeline/tests -v
cd frontend
npm test
npm run build
npx playwright install chromium
MAPA_BR_EVIDENCE_DIR=/tmp/mapa-br-bauru npm run test:e2e
```

**Resultado verificado:** 97 testes Python, 56 frontend, build e 45 cenários de
navegador aprovados (incluindo os sete novos fluxos de Bauru).

Os novos cenários cobrem Agudos → Bauru → Florianópolis → Bauru, mesma UF,
histórico, cache por cidade/tema, resposta atrasada/da cidade errada, 25 indicadores
setoriais, comparação, sigilo/ausência, setor zero com domicílio, teclado e toque.
Capturas: [município](../docs/evidence/bauru/desktop.png),
[bairro](../docs/evidence/bauru/bairro.png),
[comparação](../docs/evidence/bauru/comparacao.png),
[setor](../docs/evidence/bauru/setor.png) e
[celular](../docs/evidence/bauru/celular.png).
