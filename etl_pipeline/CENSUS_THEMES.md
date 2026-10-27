# Censo 2022 — temas oficiais (censo-temas-1)

Extensão da entrega demográfica da main `9bb3d20`, conferida em **27/10/2026**.
Referência estatística **1º/08/2022**. Preserva o contrato demo 2.0, as malhas,
o inventário e os indicadores populacao/domicilios físicos. O produtor é uma
extensão de `prepare_census_demography.py`, com o mesmo download/cache do 03,
parser numérico e aritmética Decimal do projeto; não há consultas IBGE no browser.

## Fontes, edições e correções

O [manifesto canônico](manifests/census_themes.json) contém URLs completas, SHA256,
edição, coluna textual de ligação, encoding, variável, definição literal,
unidade, universo, denominador, categorias SIDRA e regra de agregação **por indicador**.
A preparação verifica essas definições nos XLSX, não só códigos de variáveis.
As abas **Dicionário Básico** e **Dicionário não PCT** do dicionário geral rev.
20260520 e o dicionário específico de renda são verificados separadamente.

| Arquivo | Edição fixada | Uso |
| --- | --- | --- |
| `Agregados_por_setores_demografia_BR.zip` | snapshot-2026-10-27 | demografia |
| `Agregados_por_setores_cor_ou_raca_BR.zip` | snapshot-2026-10-27 | cor_ou_raca |
| `Agregados_por_setores_alfabetizacao_BR.zip` | snapshot-2026-10-27 | alfabetizacao |
| `Agregados_por_setores_caracteristicas_domicilio1_BR_20261021.zip` | 20261021 | caracteristicas_domicilio1 |
| `Agregados_por_setores_caracteristicas_domicilio2_BR_20250417.zip` | 20250417 | caracteristicas_domicilio2 |
| `Agregados_por_setores_renda_responsavel_BR_20260508_csv.zip` | 20260508 | renda_setor |
| `Agregados_por_municipios_renda_responsavel_BR_20260508_csv.zip` | 20260508 | renda_municipio |
| `Agregados_por_bairros_renda_responsavel_BR_20260508_csv.zip` | 20260508 | renda_bairro |
| `dicionario_de_dados_renda_responsavel_20260508.xlsx` | 20260508 | dicionario_renda |
| `dicionario_de_dados_agregados_por_setores_censitarios_20260520.xlsx` | 20260520 | dicionario |
| `Agregados_por_setores_basico_BR_20260520.zip` | 20260520 | basico |

O [portal de erratas do IBGE](https://www.ibge.gov.br/estatisticas/sociais/populacao/22827-censo-demografico-2022.html?=&t=erratas)
foi acessado nesta auditoria. A correção de **21/10/2026** republica
`caracteristicas_domicilio1` e define V00003 como **Unidades de Habitação em
Domicílios Coletivos Com Morador**. Foi usado o ZIP **20261021**. V00003 **não é
DPPO**; DPPO é V00001 desse arquivo. `caracteristicas_domicilio2` usa a revisão
**20250417**, posterior às correções de 17/04/2025. Não copiar mapeamentos entre
arquivos. SHA local é pin de integridade, não assinatura/autenticação do IBGE.

## Indicadores entregues

P = população residente; A15 = pessoas de 15 anos ou mais; PP = domicílios
particulares permanentes (ocupados + vagos + uso ocasional); DPPO = particulares
permanentes ocupados. Percentuais = numerador / denominador * 100, Decimal e
ROUND_HALF_EVEN, duas casas em campo próprio. Unidade das contagens: pessoas
ou domicílios, como consta no manifesto. Categoria indígena de **cor ou raça**
não equivale ao universo indígena ampliado por outros quesitos.

| Indicador | Arquivo setorial | Variável(s) / operação | Denominador | Consolidado direto |
| --- | --- | --- | --- | --- |
| Homens | demografia | `V01007` | P | SIDRA 9514 / 93 |
| Mulheres | demografia | `V01008` | P | SIDRA 9514 / 93 |
| 0–14 anos | demografia | `V01031 + V01032 + V01033` | P | SIDRA 9514 / 93 |
| 15–59 anos | demografia | `V01034 + V01035 + V01036 + V01037 + V01038 + V01039` | P | SIDRA 9514 / 93 |
| 60 anos ou mais | demografia | `V01040 + V01041` | P | SIDRA 9514 / 93 |
| Branca | cor_ou_raca | `V01317` | P | SIDRA 9605 / 93 |
| Preta | cor_ou_raca | `V01318` | P | SIDRA 9605 / 93 |
| Amarela | cor_ou_raca | `V01319` | P | SIDRA 9605 / 93 |
| Parda | cor_ou_raca | `V01320` | P | SIDRA 9605 / 93 |
| Indígena (cor ou raça) | cor_ou_raca | `V01321` | P | SIDRA 9605 / 93 |
| Alfabetizadas · 15 anos ou mais | alfabetizacao | `V00748…V00760 (todas as faixas publicadas)` | A15 = V00644…V00656 | SIDRA 9542 / 950 |
| Não alfabetizadas · 15 anos ou mais | alfabetizacao | `A15 − (V00748…V00760 (todas as faixas publicadas))` | A15 = V00644…V00656 | SIDRA 9542 / 950 |
| Particulares permanentes ocupados | caracteristicas_domicilio1 | `V00001` | PP = V00001 + básico v0008 + v0009 | SIDRA 4711 / 617 |
| Particulares permanentes vagos | basico | `v0009` | PP = V00001 + básico v0008 + v0009 | SIDRA 4711 / 617 |
| Permanentes de uso ocasional | basico | `v0008` | PP = V00001 + básico v0008 + v0009 | SIDRA 4711 / 617 |
| Água · rede geral como forma principal | caracteristicas_domicilio2 | `V00111` | DPPO = V00001 | SIDRA 6803 / 381 |
| Água · poço profundo/artesiano como forma principal | caracteristicas_domicilio2 | `V00112` | DPPO = V00001 | SIDRA 6803 / 381 |
| Esgoto · rede geral ou pluvial | caracteristicas_domicilio2 | `V00309` | DPPO = V00001 | SIDRA 6805 / 381 |
| Esgoto · fossa séptica/filtro ligada à rede | caracteristicas_domicilio2 | `V00310` | DPPO = V00001 | SIDRA 6805 / 381 |
| Esgoto · fossa séptica/filtro não ligada à rede | caracteristicas_domicilio2 | `V00311` | DPPO = V00001 | SIDRA 6805 / 381 |
| Esgoto · fossa rudimentar ou buraco | caracteristicas_domicilio2 | `V00312` | DPPO = V00001 | SIDRA 6805 / 381 |
| Lixo · coletado no domicílio | caracteristicas_domicilio2 | `V00397` | DPPO = V00001 | SIDRA 6892 / 381 |
| Lixo · caçamba de serviço de limpeza | caracteristicas_domicilio2 | `V00398` | DPPO = V00001 | SIDRA 6892 / 381 |
| Lixo · queimado na propriedade | caracteristicas_domicilio2 | `V00399` | DPPO = V00001 | SIDRA 6892 / 381 |
| Renda média dos responsáveis com rendimentos | renda_setor | `V06004` | não publicado; sem percentual | CSV renda municipal/bairro direto |

Água: rede geral e poço profundo/artesiano são **formas principais** de
abastecimento. Poço profundo no consolidado soma as categorias com e sem ligação
à rede; possuir ligação não torna rede geral a forma principal. Esgoto inclui
rede, fossa ligada, fossa não ligada e fossa rudimentar. Lixo inclui coleta no
domicílio, caçamba e queimado. São **categorias selecionadas**, não a distribuição
completa de saneamento; não fazer seus percentuais somarem artificialmente 100%.

## Disponibilidade e cruzamentos

Brasil, cinco regiões e 27 UFs vêm diretamente de oito consultas SIDRA
(9514 sexo/idade, 9605, 9542, 4711, 6803, 6805, 6892), todas com ano 2022,
variáveis, unidades e dimensões validadas. Os mesmos snapshots trazem o município
de Florianópolis diretamente. Esses panoramas não dependem das cidades ou malhas
preparadas; `--national-themes-only` só lê os oito consolidados.

O inventário continua **1.004 setores**, **87 bairros oficiais** (895 setores)
e um grupo **sem bairro** (109 setores). Cruzamentos exatos por strings textuais,
com rejeição de duplicatas, extras, nomes/códigos conflitantes e inventários
divergentes. Cada arquivo temático e de renda setorial contém **964** linhas do
município; os **40** setores omitidos têm população básica zero. Observação não
é regra de imputação: sem linha permanece **ausente**, com motivo explícito.
O básico conserva todas as 1.004 linhas, inclusive vagos/uso ocasional em setores
sem moradores. Nenhum setor foi removido. A nota metodológica
[liv102136](https://biblioteca.ibge.gov.br/visualizacao/livros/liv102136.pdf)
fundamenta a supressão X; não foi encontrada autorização para imputar zero aos
registros temáticos omitidos.

Estado por célula: `divulgada` (inclusive zero), `ausente`, `sigilo` ou `parcial`.
Contagens são inteiros; percentual é string decimal independente; moeda é string
Decimal em BRL/mês, nunca contagem. Denominador tem estado próprio. Zero no
denominador, ausência ou sigilo impedem percentual. Bairro completo soma contagens
e denominadores antes da divisão; não usa média de percentuais. Bairro incompleto
mostra **≥ subtotal (parcial)**, motivo e cobertura divulgados/X/ausentes, sem
percentual, cor ou barra proporcional. Não reconstruir X por diferença de totais.
Município mantém o consolidado direto e o grupo sem bairro participa da auditoria.

A renda **V06004** é publicada diretamente nos CSVs oficiais de setor, município
e bairro da edição 20260508. Os 87 códigos e nomes dos bairros conferem com a
partição existente. Esses valores podem ser exibidos nesses níveis sem calcular
uma média nova: município **R$ 6.173,62**, Centro **R$ 10.816,47**. Universo:
pessoas responsáveis **com rendimentos** em DPPO, rendimento nominal mensal.
Não é renda per capita ou renda domiciliar. A incompatibilidade V06001/V06004
registrada em IBGE_2022_AUDIT.md continua impedindo agregação de médias; nenhum
peso foi inventado. Sem bairro não tem média oficial publicada; Brasil/região/UF
não têm consolidado de renda preparado nesta entrega e mostram a razão.

## Conferências observadas

Florianópolis consolidado: 257.203 homens + 280.008 mulheres = 537.211 pessoas;
idades 82.921 + 362.612 + 91.678 = 537.211. Cor/raça: cinco categorias somam
537.199, **12 abaixo** do total. A nota 9 da
[descrição SIDRA 9605](https://apisidra.ibge.gov.br/desctabapi.aspx?c=9605)
explica: “A categoria Total de cor ou raça inclui os ignorados omitidos na tabela”.
Preservar a diferença, sem redistribuição ou categoria inventada.
Alfabetização: 448.109 alfabetizados e 6.181 não alfabetizados / 454.290 pessoas
15+ = 98,64% e 1,36%. DPPO **219.739**, vagos **27.816**, uso ocasional **36.594**;
PP **284.149**, distinto dos **285.000 domicílios físicos**. Rede de água principal
207.852 / DPPO = 94,59%; esgoto rede 114.611 = 52,16%; coleta no domicílio
202.212 = 92,02%. Esses universos não são intercambiáveis.

Vagos e uso ocasional somam integralmente o consolidado municipal. Outros totais
setoriais são parciais por X/ausências: homens conhecidos 254.997 vs consolidado
257.203; DPPO conhecido 219.705 vs consolidado 219.739. O relatório registra o
subtotal e o consolidado, sem forçar reconciliação nem distribuir diferenças.
`data/raw/census_themes.audit.json` contém inventário por arquivo, códigos
faltantes, reconciliação por indicador e cobertura; gerado localmente, ignorado
pelo Git. Recibos completos no cache registram URL final, timestamp, bytes e hash.

## Interface e carregamento

O seletor **Tema do Censo** escolhe um grupo e **Colorir por** uma de suas
contagens (ou renda direta). O painel mostra todas as categorias do tema, estados,
percentuais, denominadores, fonte/edição e universo. Tooltip/legenda usam a mesma
unidade/definição. A cor continua setorial ao abrir bairro; o painel agrega seus
setores. O ranking usa a contagem escolhida; os cartões de comparação reutilizam
a seleção de até três bairros e acrescentam os indicadores do tema. O percentual
novo é **do universo do bairro**, rotulado assim, diferente da participação no
município de população/domicílios. Parciais ficam no fim e sem barras/cores.

Arquivos estáticos `statistics/temas/{tema}/brasil.json` e
`statistics/temas/{tema}/municipios/42/4205407.json`, separados das geometrias e
lidos pelo DataLoader/React Query existentes, com cancelamento e validação Zod.
A abertura continua só com o resumo original leve. Tema só é solicitado quando
ativado; setor/bairro reaproveitam a partição municipal em cache. Oito partições
municipais compactas de cerca de **200–820 KB** cada, sem outros municípios ou
geometrias. Municípios SC exceto Florianópolis não recebem novos temas fictícios.
Selecionar tema não recria o canvas MapLibre. Os modos oficial e demo, TSE,
seleção persistente, hover, teclado e toque foram preservados.

## Atualizar e testar no Mac

No checkout **mapa-br-spike**, com Node 24 e Python >=3.11:

```bash
cd /caminho/para/mapa-br-spike
git pull --ff-only origin main
python3 -m venv .venv
.venv/bin/python -m pip install -r etl_pipeline/requirements-geometry.txt
# Somente se as geometrias ainda não estiverem preparadas:
.venv/bin/python etl_pipeline/prepare_official_geometries.py --audit-file data/raw/official_geometry.setup.audit.json
.venv/bin/python etl_pipeline/prepare_census_demography.py
cd frontend
npm ci
npm run dev
```

Com geometrias presentes, basta atualizar e rodar o preparo demográfico (reusa o
cache). Para somente os panoramas temáticos, sem ler setores/geometrias:
`.venv/bin/python etl_pipeline/prepare_census_demography.py --national-themes-only`.
As bases preparadas não são versionadas; precisam desse passo no Mac.
Depois do preparo, o navegador funciona sem acesso IBGE. Nada é publicado.

Validações na raiz (pyarrow apenas para a suíte completa já existente):

```bash
.venv/bin/python -m pip install 'pyarrow>=18,<24'
.venv/bin/python -m unittest discover -s etl_pipeline/tests -v
cd frontend
npm test
npm run build
npx playwright install chromium
MAPA_BR_EVIDENCE_DIR=/tmp/mapa-br-temas npm run test:e2e
```

Nesta entrega: **93 testes Python**, **55 frontend**, build e **32 cenários de
navegador** (desktop/toque móvel). Mapeamentos e errata, união setorial,
consolidados independentes, percentuais HALF_EVEN/denominador zero, parcial/X/zero,
moeda, cache, atraso/contrato inválido, todos os 25 indicadores, comparação,
retorno, ausência de consultas externas e canvas único são verificados.
As capturas E2E ficam no diretório indicado por MAPA_BR_EVIDENCE_DIR.
Capturas revisáveis desta entrega: [desktop](../docs/evidence/census-themes/desktop.png)
e [celular](../docs/evidence/census-themes/celular.png).
