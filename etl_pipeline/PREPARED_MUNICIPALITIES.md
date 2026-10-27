# Municípios oficiais configuráveis — Agudos e Florianópolis

Entrega sobre **6a8b59c**, auditada em **27/10/2026**, referência Censo **1º/08/2022**.
Inclui Agudos (`cd_uf="35"`, `cd_mun="3500709"`), preservando Florianópolis.
Repositório `spikeSpy13/mapa-br`. Sem publicação do aplicativo ou mudanças na demo.

## Configuração e arquitetura

A fonte comum Python/TypeScript é
[prepared_municipalities.json](manifests/prepared_municipalities.json):

- `municipios`: código textual → nome, UF textual e EPSG da auditoria de área;
- `ufs`: sigla e ZIP setorial oficial, com URL e SHA256 conferidos;
- `sidra_basico`: dois snapshots de Brasil/regiões/UFs/municípios das UFs preparadas;
- `sidra_temas`: oito snapshots com as mesmas dimensões já aprovadas, incluindo
  todos os municípios configurados. URLs/hashes residem aqui; definições de
  variáveis/dimensões continuam em `census_themes.json`.

`prepared_municipalities.py` verifica consistência da configuração e dos recortes
SIDRA, sem rede no import. `preparedMunicipalities.ts` oferece a mesma configuração
à UI. Os produtores existentes iteram as cidades/UFs; cada tabela nacional é lida
uma vez por execução e só os recortes configurados permanecem em memória.
O DataLoader e o React Query existentes mantêm cache e cancelamento; nenhuma API
ou segundo cache/motor foi introduzido.

Não há contagem fixa de 1.004 setores na validação temática. O schema verifica
identificadores, tipos, estados e proveniência; o loader exige o conjunto exato
de IDs da malha já conferida para o município selecionado. Respostas de outra
cidade/nível são recusadas, mesmo que sejam válidas isoladamente. As chaves de
consulta incluem tema **e município**, e os caminhos usam UF/código da configuração.
Abertura e resumos Brasil/região/UF continuam independentes dos recortes preparados.

## Fontes e conferência cartográfica

Fonte de SP:
[SP_setores_CD2022.zip](https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/setores/shp/UF/SP/SP_setores_CD2022.zip),
malha com atributos Censo 2022, listagem da publicação de 2024; SHA256
`dd0a9a5439382437304aff017b23b9edd00598b946bfc27c8bd2e2084b4dbd2d`.
Dicionário da malha e básico rev. **20260520** são os mesmos já fixados. Limites
municipais são a união dos distritos do mesmo Censo em `BR_distritos_CD2022.zip`,
sem misturar malha administrativa de outro ano.

| Conferência | Resultado |
| --- | --- |
| SP: inventário malha/básico completo | **103.319 setores**, conjuntos idênticos |
| SP: municípios, distritos dissolvidos/SIDRA/básico | **645 municípios**, conjuntos idênticos |
| Agudos: inventário malha/básico | **66 setores**, sem duplicatas/faltantes/extras |
| Agudos: validade geométrica | **66 válidos**, nenhuma geometria reparada |
| CRS original / exibição | SIRGAS 2000 **EPSG:4674** / WGS84 **EPSG:4326** |
| Contenção vs município integral | maior área externa **0 m²**, tolerância 1 m², EPSG:31982 |
| População / domicílios físicos | **37.680 / 15.448**, soma dos 66 setores = SIDRA direto |
| SC preservada | **295 municípios**, Florianópolis **1.004 setores** |

Referências integrais EPSG:4674 ficam em `data/raw/geometries_reference/censo2022/`.
GeoJSONs de exibição ficam em `frontend/public/geo/official/`, com inventários
particionados. Os setores mantêm todos os vértices; simplificação de UFs/municípios
só ocorre sob as validações anteriores de geometria/cobertura/adjacência. Não há
reparo silencioso. Os ZIPs integrais permanecem no cache. A validade geométrica
setorial é conferida para as cidades exportadas; o inventário é comparado para a
UF inteira. Não se afirma uma auditoria geométrica de todos os 103.319 setores SP.
A autointerseção conhecida de São José continua fora dos recortes exportados.

Os SHA256 de **ufs.geojson**, **municipios/42.geojson** e
**setores/42/4205407.geojson** ficaram **idênticos** aos da base desta tarefa.
O [relatório compacto versionado](manifests/agudos.audit.json) registra esses
hashes, fontes, CRS, inventários e a cobertura por indicador. As auditorias
completas ficam em `data/raw/agudos_geometry.audit.json`, `demography.audit.json`
e `census_themes.audit.json` (esta última agora indexada por `municipios`).
SHA local é evidência de integridade, não assinatura IBGE.

## Bairro, distrito e lacunas

Todos os **66** registros de Agudos têm `CD_BAIRRO='.'` e `NM_BAIRRO=''` no básico
e no DBF, cujos identificadores são textuais. O join exato CSV/DBF confirma essa
associação ausente. Cobertura comprovada de bairro **0/66 (0%)**, com **zero bairros
identificados nessas fontes**. Isso não afirma que Agudos não tenha bairros em
outros cadastros municipais; não foi inventada uma correspondência alternativa.

| Distrito declarado | Código | Setores |
| --- | --- | ---: |
| Agudos | `350070905` | 63 |
| Domélia | `350070910` | 3 |

Subdistritos `35007090500` e `35007091000` têm nome vazio na fonte, preservado como
nome não informado. Distrito/subdistrito são conferidos entre CSV e DBF e constam
em `territorios_setores`, com códigos textuais próprios. Aparecem nos detalhes
setoriais e **não são bairros**. Não há associação por prefixo/nome/local de votação.

A UI mantém todos os setores em `sem_bairro:3500709`, com o rótulo **Bairro não
identificado na fonte**, seus indicadores e busca por código. A volta do setor
diz **Voltar ao grupo sem bairro**; o próximo retorno leva a Agudos. Sem vínculo
oficial, não há opções inventadas de ranking/comparação. Florianópolis conserva
87 bairros/895 setores associados e 109 sem bairro, com comparação e navegação.

## Indicadores e cobertura em Agudos

Fontes temáticas e mapeamentos são os já auditados em
[CENSUS_THEMES.md](CENSUS_THEMES.md): demografia, cor/raça, alfabetização,
`caracteristicas_domicilio1` **corrigido em 21/10/2026**, domicilio2 rev. 20250417,
básico 20260520 e renda do responsável 20260508. Dicionários, edições, unidade,
universo, denominador e regra de agregação continuam por indicador no manifesto.
Os consolidados são SIDRA **direto**, não somas de cidades/setores disponíveis.

Há **63 linhas** de Agudos em cada tabela temática e de renda setorial. Os três
setores omitidos têm população básica zero e conservam seus **5 domicílios físicos**
no básico: mantidos como **ausentes** nos temas sem linha, sem
imputar zero ou sigilo. Vagos/uso ocasional vêm do básico completo, com 66 linhas.
Zero divulgado, X/sigilo, ausência e subtotal parcial permanecem distintos.
Percentuais usam Decimal/ROUND_HALF_EVEN e os mesmos universos; parciais não
recebem percentual/cor/barra. A renda direta não é somada nem ponderada por V06001.

**Convenção SIDRA conferida:** a [ajuda oficial, Valores especiais](https://apisidra.ibge.gov.br/home/ajuda)
define `-` como “Zero absoluto, não resultante de um cálculo ou arredondamento”.
A categoria 100+ de Agudos tem esse símbolo. O parser específico SIDRA conserva
o zero divulgado, permitindo somar as faixas publicadas 60+ = **6.430**.
Essa regra **não** reinterpreta CSVs nem ausência de linha.

Tabela: D = setores divulgados (inclusive zero), X = sigilo, A = ausência;
D + X + A = **66 em cada indicador**. São indicadores temáticos; população e
domicílios físicos estão divulgados nos 66 setores e reconciliados com o município.

| Indicador | Consolidado municipal direto | D | X | A |
| --- | ---: | ---: | ---: | ---: |
| Homens | 18.461 | 59 | 4 | 3 |
| Mulheres | 19.219 | 59 | 4 | 3 |
| 0–14 anos | 7.419 | 55 | 8 | 3 |
| 15–59 anos | 23.831 | 55 | 8 | 3 |
| 60 anos ou mais | 6.430 | 57 | 6 | 3 |
| Branca | 22.272 | 59 | 4 | 3 |
| Preta | 2.422 | 56 | 7 | 3 |
| Amarela | 159 | 43 | 20 | 3 |
| Parda | 12.773 | 59 | 4 | 3 |
| Indígena (cor ou raça) | 52 | 46 | 17 | 3 |
| Alfabetizadas · 15 anos ou mais | 29.107 | 51 | 12 | 3 |
| Não alfabetizadas · 15 anos ou mais | 1.154 | 51 | 12 | 3 |
| Particulares permanentes ocupados | 12.936 | 59 | 4 | 3 |
| Particulares permanentes vagos | 1.638 | 66 | 0 | 0 |
| Permanentes de uso ocasional | 827 | 66 | 0 | 0 |
| Água · rede geral como forma principal | 12.302 | 56 | 7 | 3 |
| Água · poço profundo/artesiano como forma principal | 499 | 50 | 13 | 3 |
| Esgoto · rede geral ou pluvial | 12.171 | 58 | 5 | 3 |
| Esgoto · fossa séptica/filtro ligada à rede | 25 | 55 | 8 | 3 |
| Esgoto · fossa séptica/filtro não ligada à rede | 576 | 52 | 11 | 3 |
| Esgoto · fossa rudimentar ou buraco | 94 | 55 | 8 | 3 |
| Lixo · coletado no domicílio | 12.484 | 58 | 5 | 3 |
| Lixo · caçamba de serviço de limpeza | 183 | 51 | 12 | 3 |
| Lixo · queimado na propriedade | 251 | 51 | 12 | 3 |
| Renda média dos responsáveis com rendimentos | R$ 2.719,19 | 59 | 4 | 3 |

Alfabetização: universo 15+ **30.261**, alfabetizados **29.107 (96,19%)** e não
alfabetizados **1.154 (3,81%)**. Habitação: PP **15.401**, distinto dos **15.448**
domicílios físicos; saneamento usa **12.936 DPPO**, nunca o total físico.
Cor/raça: as categorias somam 37.678; os **2 ignorados** estão incluídos no total,
conforme nota 9 da descrição SIDRA 9605, sem redistribuição ou categoria inventada.
Vagos/uso ocasional reconciliam integralmente com o consolidado. Outros subtotais
setoriais incompletos ficam explícitos, sem reconstruir X por diferença.

Renda: **R$ 2.719,19** municipal, publicada diretamente; 59 setores com média
publicada, quatro sob sigilo e três sem linha. O grupo sem bairro não tem média
oficial própria publicada e fica indisponível, com motivo, sem média das médias.

## Caminhos e preparação no Mac

Os catálogos agora incluem `municipios/35.geojson` e `setores/35/3500709.geojson`,
seus inventários e as entradas SC/Florianópolis anteriores. Dados básicos:
`statistics/uf/35.json`, `statistics/municipios/35/3500709.json` e
`statistics/municipios/35/3500709.bairros.json`. Temas:
`statistics/temas/{tema}/municipios/35/3500709.json`. Geometrias e indicadores
continuam separados e carregados progressivamente por município/tema.

No checkout **mapa-br-spike**, com **Python >=3.11 e Node 24**:

```bash
cd /caminho/para/mapa-br-spike
git pull --ff-only origin main
python3 -m venv .venv
.venv/bin/python -m pip install -r etl_pipeline/requirements-geometry.txt
.venv/bin/python etl_pipeline/prepare_official_geometries.py --audit-file data/raw/agudos_geometry.audit.json
.venv/bin/python etl_pipeline/prepare_census_demography.py
cd frontend
npm ci
npm run dev
```

Os preparadores atualizam **todas as cidades configuradas**, conservando as entradas
anteriores, reutilizando cache/recibos. O ZIP SP tem cerca de 87 MB; o primeiro
preparo precisa de HTTPS ao IBGE. Dados brutos, geometrias e JSONs preparados são
locais/ignorados pelo Git; não basta o pull para obter os novos arquivos. Depois
do preparo, o browser e o build não dependem do IBGE. Nada publica o aplicativo.

Só os consolidados temáticos, sem ler malhas/setores:

```bash
.venv/bin/python etl_pipeline/prepare_census_demography.py --national-themes-only
```

Validações (raiz, depois frontend):

```bash
.venv/bin/python -m pip install 'pyarrow>=18,<24'
.venv/bin/python -m unittest discover -s etl_pipeline/tests -v
cd frontend
npm test
npm run build
npx playwright install chromium
MAPA_BR_EVIDENCE_DIR=/tmp/mapa-br-agudos npm run test:e2e
```

**Resultado verificado:** 97 testes Python, 56 frontend, build e 38 cenários de
navegador aprovados.

As verificações incluem inventários conjuntos (não só contagem), duas cidades
numa leitura, estados/zero específico SIDRA, cache isolado, rejeição de outro
município, links diretos, 25 indicadores por setor, Agudos → Florianópolis → Agudos,
troca de UF/histórico, comparação, teclado, toque e ausência de rede externa.
Capturas: [desktop](../docs/evidence/agudos/desktop.png),
[setor](../docs/evidence/agudos/setor.png) e [celular](../docs/evidence/agudos/celular.png).

## Acrescentar outra cidade

1. Acrescentar a entrada textual em `municipios`, com UF, nome oficial e projeção
   adequada de auditoria de área. Não declarar contagens esperadas à mão.
2. Se a UF for nova, conferir a listagem e o ZIP setorial CD2022 oficial, tipos
   DBF/CRS/dicionário e fixar URL/hash em `ufs`. Reaproveitar o ZIP quando a UF já existir.
3. Atualizar os recortes e hashes dos dois snapshots básicos e dos oito temáticos
   na **mesma configuração**, após conferir as respostas/dimensões da edição.
   O básico traz os municípios das UFs configuradas; os temáticos incluem a lista
   ordenada das cidades. A validação recusa seletores que não acompanhem a configuração.
4. Executar cartografia → demografia → testes/build. Conferir novos inventários,
   nomes, bairros, disponibilidade e totais nos relatórios. Um hash novo não
   autoriza assumir a mesma definição: investigar mudanças legítimas antes de fixá-lo.

Não são necessários novos loaders, schemas de cidade, motores ou componentes.
