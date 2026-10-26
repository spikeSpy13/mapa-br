# Censo 2022: população e domicílios oficiais

A entrega `demografia-1` acrescenta dois indicadores à cartografia existente.
Não modifica o contrato demonstrativo 2.0 nem preenche os seus campos de renda,
responsáveis, PIB ou Gini. A demo (`?modo=demo`) mantém seus próprios dados.

## Fontes e universos conferidos

- **Panorama consolidado direto:** SIDRA **4714 / variável 93**, população
  residente, unidade pessoas; **4711 / variável 617 / espécie 59993 (Total)**,
  domicílios recenseados, unidade domicílios. Ano explícito **2022**, dados do
  Universo. Brasil, cinco grandes regiões e 27 UFs são lidos diretamente dessas
  tabelas. Não são somas do recorte municipal preparado. As mesmas consultas
  trazem os 295 consolidados municipais de SC, servidos em outra partição.
- A descrição oficial da tabela 4711 registra atualização em **22/12/2023**,
  revisões incorporadas até 07/07/2023 e correção de Abel Figueiredo/PA e São Pedro
  da Água Branca/MA. A consulta explicita todas as espécies, incluindo particulares
  ocupados/vagos/de uso ocasional, improvisados e coletivos com/sem moradores.
  [Descrição 4711](https://apisidra.ibge.gov.br/desctabapi.aspx?c=4711).
- **Setores:** `Agregados_por_setores_basico_BR_20260520.zip`, CSV único em
  cp1252, `;`, códigos textuais. No `Dicionário Básico` do XLSX da mesma edição,
  `V0001` = “Total de pessoas”; `V0002` = “Total de Domicílios
  (DPPO + DPPV + DPPUO + DPIO + DCCM + DCSM)”. Os nomes físicos no CSV são
  `v0001`/`v0002` minúsculos. O script verifica essas linhas do XLSX e os hashes
  previamente fixados pelo preparador cartográfico.
- Referência estatística: **1º de agosto de 2022**. A edição `20260520` é revisão
  do arquivo, não outro ano censitário. O snapshot SIDRA foi consultado em
  **26/10/2026**, com URLs, unidades, códigos, ano, timestamp e SHA256 registrados.
  Os hashes fixados recusam mudanças silenciosas; SHA local não é assinatura IBGE.
  Mudança legítima da fonte exige nova auditoria antes de atualizar os pins.

A evidência compacta revisável está em
[manifests/census_demography.audit.json](manifests/census_demography.audit.json).
Os recibos integrais/cache ficam em `data/raw/cache`; cada nova preparação escreve
`data/raw/demography.audit.json`. Não consultar APIs IBGE no navegador: o transporte
é inteiramente local após a preparação. Links de fonte são referências para consulta
voluntária, não dependências de carregamento.

## Conferências e limites

Florianópolis: **1.004** setores, **537.211** pessoas e **285.000** domicílios.
O join compara conjuntos exatos com o inventário cartográfico auditado; recusa
setores duplicados, extras ou faltantes. As somas dos dois indicadores coincidem
exatamente com os consolidados municipais SIDRA. Não houve ajuste de registros.
Brasil: **203.080.756** pessoas e **90.704.582** domicílios, valores consolidados
diretos, independentes dos setores disponíveis. SC: **7.610.361** pessoas e
**3.475.161** domicílios. A revisão básica posterior e o consolidado conferem no
município preparado; isso não afirma reconciliação de toda a malha nacional.

O contrato parcial tem somente `populacao` e `domicilios`, cada um com
`{valor, status}`: divulgada (inteiro >=0), ausente (null) ou sigilo (null).
Zero divulgado não é ausência. Reutiliza normalização e validação do motor Python,
parser numérico do adaptador e transporte/cache/cancelamento `DataLoader`.
O produtor bloqueia a aprovação municipal se algum valor não divulgado impedir
a reconciliação completa. O frontend distingue os estados sem imputação.

Arquivos ignorados pelo Git em `frontend/public/geo/official/statistics/`:

- `brasil.json`: ~11 KB, fontes + Brasil/regiões/UFs, sem municípios ou setores;
- `uf/42.json`: consolidados municipais SC (~56 KB), somente após selecionar SC;
- `municipios/42/4205407.json`: setores e vínculos de bairro, somente ao selecionar Florianópolis.

A geometria continua separada, com inventários e caminhos próprios. A preparação
anexa o caminho demográfico ao catálogo cartográfico local **somente após** todas
as validações. Como nos outros produtores, troca atômica é por arquivo, não por lote;
prepare sem servir simultaneamente e recarregue o navegador ao trocar a release.
Executar o preparador de geometrias novamente recria o catálogo: execute depois o
de demografia para reanexar os indicadores. O build copia a árvore pública inteira.

Painel e coloração usam o indicador do próprio polígono. Quantis R-7, formatação,
paleta e seleção vêm dos componentes existentes. Cinza é falta de divulgação;
a distinção ausência/sigilo aparece nos valores. A seleção de um setor exibe seus
números, arquivo, variável, unidade, edição, fonte e referência. A escolha temática
persiste no retorno. Outras UFs têm resumo consolidado; sem malhas municipais,
conservam o contorno estadual. Municípios SC têm totais consolidados, mas só
Florianópolis tem detalhe setorial e agrupamento declarado de bairros. Renda, PIB,
Gini e TSE estão fora.
A autointerseção cartográfica conhecida em São José, fora do recorte setorial,
continua registrada e não foi reparada.

## Execução no Mac

Na raiz da sua cópia de `mapa-br`, com **Python >=3.11 e Node 24** instalados
(se usa nvm: `cd frontend && nvm install && nvm use && cd ..`):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r etl_pipeline/requirements-geometry.txt
.venv/bin/python etl_pipeline/prepare_official_geometries.py --audit-file data/raw/official_geometry.setup.audit.json
.venv/bin/python etl_pipeline/prepare_census_demography.py
cd frontend
npm ci
npm run dev
```

Use o checkout existente. Nenhum comando clona, remove ou modifica outra cópia.
O primeiro preparo cartográfico precisa de HTTPS ao IBGE e alguns minutos;
reaproveita recibos/cache verificados. Para preparar só os novos indicadores,
com a cartografia já presente, basta o comando `prepare_census_demography.py`.
Depois de instalar/preparar, abertura e build funcionam sem rede IBGE.
Não instalar `requirements.txt` junto com as dependências cartográficas:
`geobr` opcional conflita com o Shapely fixado pela cartografia.

Validação completa (primeiro bloco na raiz, segundo em `frontend/`):

```bash
.venv/bin/python -m pip install 'pyarrow>=18,<24'
.venv/bin/python -m unittest discover -s etl_pipeline/tests -v
cd frontend
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes unitários não dependem de download ou dos arquivos oficiais preparados.
Os E2E exigem preparo + build e verificam a demo, 27 UFs, cinco regiões, o join
setorial, fontes, legendas, seleção/retorno e ausência de requisições externas ou
simuladas no modo oficial. Capturas: `/tmp/mapa-br-official`, ou defina
`MAPA_BR_EVIDENCE_DIR` ao executar `npm run test:e2e`. Nada publica o aplicativo.

## Vínculo setor–bairro conferido

A primeira entrega foi revalidada antes desta extensão: panorama direto SIDRA,
reconciliação municipal, 1.004 setores, carga progressiva e demo preservada.
Não foi criado outro motor ou cache; a extensão usa os mesmos JSONs e loaders.

A fonte explícita de pertencimento é `CD_BAIRRO`/`NM_BAIRRO`, associada por
`CD_SETOR` textual. O preparador confere **todas as 1.004 linhas de Florianópolis**
entre o CSV básico rev. **20260520** e o DBF de **SC_setores_CD2022.zip**. O
`Dicionario_de_dados_malha_agregados.xlsx`, aba **Setor**, define:

| Campo | Definição da publicação |
| --- | --- |
| CD_SETOR | Geocódigo de Setor Censitário |
| CD_BAIRRO | Código do Bairro |
| NM_BAIRRO | Nome do Bairro |

ZIPs e dicionário usam os hashes fixados da cartografia. Tipos DBF dos quatro
campos CD_SETOR/CD_MUN/CD_BAIRRO/NM_BAIRRO precisam ser textuais. Duplicatas,
extras, faltantes e qualquer divergência código/nome entre CSV e DBF bloqueiam
a geração. Os nomes não determinam a associação; o prefixo municipal é apenas
uma validação de integridade sobre um código de bairro já declarado na fonte.
Não houve join por prefixo setorial nem inferência espacial ou por nomes.

Resultado: **87 bairros declarados, 895 setores vinculados**. Os demais **109
setores** têm CD_BAIRRO `.` e nome vazio em ambos os arquivos. Permanecem como
`sem_bairro:4205407`, cd_bairro=null, “Setores sem bairro identificado” — isso
não cria um bairro oficial. O grupo conserva **17.748 pessoas e 8.817 domicílios**.
Há **40 setores com população zero**, com **10 domicílios** no total; nenhum foi
removido. Renda não é lida nem condiciona a seleção ou agregação de registros.

A partição cobre exatamente os 1.004 setores, uma vez cada. Os totais dos grupos
reconciliam com **537.211 pessoas e 285.000 domicílios**. Centro, por exemplo,
contém 97 setores, 42.308 pessoas e 23.368 domicílios. Esses são **totais derivados
dos setores pelo vínculo declarado**, não uma tabela consolidada de bairros.
As somas são inteiras, sem campos de renda fictícios. Sigilo em qualquer parcela
implica total sob sigilo; ausência sem sigilo implica total ausente, nunca soma
parcial disfarçada de total. O panorama SIDRA continua independente da partição.

O detalhe municipal estende `demografia-1` com campos opcionais `bairros` e
`vinculo_bairro`. Dados legados sem ambos continuam aceitos; grupos sem a
proveniência, com setores duplicados/ausentes ou totais inconsistentes falham
na validação. `sectorJoin.ts` compartilha o índice setor→grupo com a demo,
aceitando apenas os dois campos necessários (IDs e lista de setores).

Em Florianópolis, abra **Bairros declarados e setores sem bairro** no painel.
Selecionar um grupo mantém a mesma malha setorial, realça todos os setores do
grupo e soma seus indicadores. A legenda usa quantis dos 88 grupos (87 bairros
+ um grupo sem bairro), contando cada grupo uma vez. Os limites setoriais não
foram dissolvidos nem certificados como uma nova malha poligonal de bairros.
No município/setor continua a coloração por valores individuais dos setores.
É possível voltar ao município ou abrir um setor do grupo. Hover, teclado,
seleção e fonte/período continuam pela infraestrutura visual já existente.

## Atualizar a cópia Mac mapa-br-spike

As mudanças desta sessão estão locais: `git pull` sozinho não as transfere.
O patch completo entregue é relativo ao HEAD original
`b06ed291fa7d8aaac2c5adf2eb2e6d8d247c075f`; inclui a integração prévia de indicadores
e interações e esta extensão de bairros. Salve-o como
`~/Downloads/mapa-br-spike.patch`. A cópia do André não deve ser usada.
No diretório pai de **mapa-br-spike**, com Python >=3.11 e Node 24:

```bash
cd mapa-br-spike
git remote get-url origin
git apply --check ~/Downloads/mapa-br-spike.patch
git apply ~/Downloads/mapa-br-spike.patch
python3 -m venv .venv
.venv/bin/python -m pip install -r etl_pipeline/requirements-geometry.txt
.venv/bin/python etl_pipeline/prepare_official_geometries.py --audit-file data/raw/official_geometry.setup.audit.json
.venv/bin/python etl_pipeline/prepare_census_demography.py
cd frontend
npm ci
npm run build
npm run dev
```

Confirme que o remoto é spikeSpy13/mapa-br. Se a verificação do patch falhar,
pare antes de aplicá-lo; não force, resete ou sobrescreva alterações existentes.
Para cópias já no estado do início desta tarefa, use o patch incremental entregue.
Os dados pesados ficam fora do Git/patch e são preparados pelos dois comandos
Python, aproveitando o cache. O script demográfico deve rodar **após** o
cartográfico, que recria o catálogo. Build/dev consomem só os arquivos locais.
Para testes, ainda em frontend/: `npm test`, `npx playwright install chromium`,
`npm run test:e2e` (build já realizado). Para a suíte Python completa, instale
`'pyarrow>=18,<24'` na .venv antes do unittest documentado acima. Nada publica.


Os testes também removem, via respostas HTTP 404 simuladas no navegador, os
arquivos de geometria/estatísticas municipais. Os resumos Brasil/regiões/UFs
continuam disponíveis a partir do índice nacional. Quando só estatísticas
municipais faltam, preserva-se a malha e os municípios ficam sem valores; quando
falta a malha municipal, preserva-se o contorno da UF. Outros erros e contratos
inválidos não são convertidos em ausência. Isso não relaxa as validações da fonte.
