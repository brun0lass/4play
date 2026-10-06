# 4Play Uniformes: front de produção

Este é o front da **4Play Uniformes**, com a identidade visual da marca (preto, verde-limão `#D9FF22` e Montserrat pesada). Ele roda sobre o **backend do Aeris One** (`aerisone.com.br`), usando a mesma API, as mesmas contas e as mesmas regras do front oficial.

## Telas

| Rota | O que faz | API do Aeris |
| --- | --- | --- |
| `/login` | Entrar com o acesso do Aeris | `POST /auth/login`, `GET /auth/me` |
| **Novo pedido** (botão verde no menu, em toda tela) | Passo a passo: cliente (procura ou cadastra na hora) → produtos, peças e preço (procura ou cadastra produto na hora) → despacho, tecido, entrega, pagamento. Cria o pedido, confirma (ganha número e entra na fila em Atendimento) e grava a ficha | `POST /sales/documents`, `POST /sales/documents/:id/transitions`, `PUT /uniforms/orders/:id`, `POST /parties`, `POST /catalog/products` |
| `/` | **Painel**: pedidos na fila, peças, atrasados, **em atendimento por atendente** (F228), próximos despachos, arte parada com o cliente, carga da equipe e vendas do mês (quem tem `dashboard.read`) | `/uniforms/orders`, `/dashboard/sales` |
| `/producao` | **Pedidos**, em Quadro ou Lista (a escolha fica lembrada). No **Quadro**: uma coluna por etapa (Atendimento → Pronto), **um card por leva** no pedido dividido (F230). **Personalizar quadro** (por pessoa, neste navegador): ocultar etapas, recolher colunas vazias, cards compactos. O pedido (ou a leva) muda de etapa arrastando ou pelo botão do card. Do Atendimento só a atendente manda para a Arte; pular a arte é de quem gerencia. Pede a impressora ao ir para "Imprimindo" e a confirmação de quem gerencia para ir à fábrica sem a arte aprovada | `/uniforms/orders`, `POST /uniforms/orders/:id/stage`, `POST /uniforms/orders/:id/batches/:batchId/stage` |
| `/producao?vista=planilha` | **Planilha**: a FILA DE PRODUÇÃO com as mesmas colunas e a mesma ordem da planilha da 4Play (PEDIDO, CLIENTE, CIDADE, DESIGNER, DATA DE DESPACHO, TIPO TECIDO, PERSONALIZAÇÃO, QTDE., DADOS DO PEDIDO, VALOR FECHADO, SINAL PAGO?, TKT MÉDIO/PEÇA, RESP., IMPRES., ARTE DRIVE, COREL, EXCEL, LOGÍSTICA, OBSERVAÇÕES, STATUS), filtro por mês de despacho, STATUS trocado na própria linha, e **Imprimir** só as colunas escolhidas (A4 paisagem) | `/uniforms/orders`, `/sales/documents/:id` (itens → DADOS DO PEDIDO, 4 por vez) |
| `/pedidos/:id` — bloco **Pagamento e saída** | **Receber sinal/pagamento**, **Cliente retirou** (cobre o que falta e o pedido sai da fila), **Despachar** (sai da fila; o que falta vira conta a receber), **Editar itens** e **Cancelar** (com motivo; se já houve pagamento, vira vale ou devolve). Quem vê cada botão segue o Aeris: sinal e retirada = `sales.deposit` (atendente) e só sem caixa se a empresa estiver como **loja sem caixa**; despachar = `pos.operate` (financeiro/caixa, gerente, admin, dono); cancelar = `sales.cancel` | `/sales/deposit-options`, `/sales/documents/:id/deposit|pickup|dispatch|transitions`, `PATCH /sales/documents/:id` |
| `/pedidos/:id/imprimir` | **Ficha para imprimir/PDF** no modelo "PEDIDO - 3226": cabeçalho, logística marcada, grade por modelo com linhas em branco para o cliente preencher, personalizados, imagens da arte e observações | `/uniforms/orders/:id`, `/sales/documents/:id` |
| `/producao?vista=lista` | **Lista** da fila com busca, filtro por etapa, atrasados e rascunhos, ordenação e paginação | `/uniforms/orders` |
| `/pedidos/:id` | **Ficha**: atendimento, grade (planilha modelo × tamanho), personalizados (com "Colar lista" do Excel ou do WhatsApp), arte, impressoras, imagens, linha do tempo com comentários (e, em cima dela, o **mock da arte** sempre à vista) e "Repetir pedido", **pedidos anteriores do cliente** com as impressoras de cada um (F229) e a aba **Levas**: separar uma leva (quantas peças de cada vão para outra etapa — ou para a mesma, duas costureiras) e mover cada leva. Dividido, o pedido só oferece despachar/retirar com todas as levas prontas. Barra "Alterações não gravadas → Gravar tudo" e aviso ao sair com algo por gravar; "Avançar para <próxima etapa>" em destaque; pular etapa pede confirmação | `/uniforms/orders/:id/*` |
| `/produtos` | **Produtos**: tabela com preço, custo, margem e estoque; cadastrar/editar (categoria, unidade, controlar estoque, estoque inicial e mínimo); arquivar; **Importar planilha** `.xlsx` com colunas `Descrição` e `Preço Venda` (+ `Preço Custo`, `Código` opcionais) — prévia antes de gravar, reenviar atualiza em vez de duplicar | `/catalog/products` (`include=price,stock,cost`), `/product-categories`, `/import/products/preview|apply` |
| `/estoque` | **Estoque** dos itens com controle ligado — com **Cadastrar tecido, papel e tinta** (cria os itens básicos de uma vez, na categoria Matéria-prima): valor em estoque, itens acabando (abaixo do mínimo), negativos; **Entrada** (com custo), **Saída**, **Contagem** e **Histórico** de cada item | `/inventory/balances`, `/inventory/movements`, `/inventory/entries|exits|adjustments` |
| `/clientes` | Clientes ativos, com cidade e WhatsApp, **Pedidos e máquinas** de cada um (F229) e **Novo cliente** (nome e WhatsApp bastam; documento e endereço em "Mais dados") | `/parties`, `/uniforms/customers/:id/orders` |
| `/links` | **Links do cliente** (F232): gerar o link do pedido (cliente cadastrado, ou WhatsApp/e-mail — se o número já é de um cliente, o link fica no nome dele), mostrar o preço ou não, limitar as peças, validade e recado; copiar ou mandar pelo WhatsApp; **Conferir** o que o cliente mandou e "criar o pedido" (cadastro novo + pedido confirmado + grade e nomes, em Atendimento). O Painel avisa quando chega um | `/uniforms/intakes`, `/uniforms/intakes/:id/convert` |
| `/pedido/:token` | **Página do cliente, sem login**: cadastro (se for novo, com CEP), as peças, nome/número/tamanho de cada atleta (com "Colar do Excel") ou só quantidades por tamanho, **para quando** (evento com data → despacho uma semana antes; sem evento → o prazo do link) e o **tecido** (F233), observação. Envia uma vez só | `/uniforms/public/intakes/:token` |
| `/ocorrencias` | **Ocorrências** (F234): o que refazer e os problemas de todos os pedidos, abertas e resolvidas, por setor; resolver com o que foi feito. Na ficha, aba **Ocorrências** e, na aba Grade e nomes, o **Andamento da grade** (cada linha marcada em impressão, corte, costura e embalagem, o que falta em cada passo, "refazer" por linha). O quadro mostra um selo vermelho; o Painel avisa | `/uniforms/orders/:id/progress`, `/uniforms/orders/:id/incidents`, `/uniforms/incidents` |
| `/costureiras` | **Costureiras** (F231): terceirizada (tabela de preço por peça, prazo para pagar) ou CLT; o que está com cada uma e o que ela entregou, com "a pagar dd/mm". Na ficha, aba Levas → **Mandar para costureira** (pela tabela ou preço combinado na hora) e **Entregue** (gerente/dono): da terceirizada nasce a conta a pagar no Financeiro. Designer e operador veem sem preço | `/uniforms/seamstresses`, `/uniforms/orders/:id/sewing`, `/uniforms/sewing/:id/deliver\|cancel` |
| `/financeiro` | **Financeiro**: a receber e a pagar em aberto e vencido; lista de contas (em aberto / vencidas / recebidas-pagas); **Receber/Pagar** (baixa total ou parcial; dinheiro exige caixa aberto no Aeris); **Lançar conta** parcelada, com fornecedor novo na hora (quem tem `finance.write`) | `/finance/ageing`, `/finance/entries`, `/finance/entries/:id/settle`, `/payments/methods`, `/cash/sessions` |
| `/equipe` | **Funcionários**: adicionar pelo e-mail com perfil → senha temporária + convite pronto (WhatsApp ou copiar); status (aguardando 1º acesso, visto há…, desativado); editar perfil, gerar nova senha, desativar. E as impressoras | `/team/members/*`, `/uniforms/members/:id/functions`, `/uniforms/printers` |

## Perfis

O Aeris não envia e-mail: o acesso é criado pelo e-mail e ele devolve uma senha temporária. No primeiro login a pessoa cai em **Crie sua senha** (mínimo 12 caracteres, regra do Aeris).

| Perfil na 4Play | Papel no Aeris | Função na produção | Vê |
| --- | --- | --- | --- |
| Atendente | `salesperson` | atendimento | Início, Pedidos, Clientes, Produtos, Novo pedido. Vê valores e recebe o sinal |
| Designer | `salesperson` | arte | Início e Pedidos. Ficha abre na aba Arte. **Sem valores** |
| Operador de produção | `salesperson` | producao | Início, Pedidos e Estoque (só ver). Ficha abre na aba Grade. **Sem valores** |
| Financeiro | `cashier` | — | Financeiro (receber/pagar, baixas), Clientes. Não vê a produção nem lança contas novas |
| Gerente | `manager` | (gerencia tudo) | Tudo, menos cadastrar a equipe |
| Administrador | `admin` | (gerencia tudo) | Tudo |

Atendente, Designer e Operador se combinam na mesma pessoa. O que cada um vê é decidido em `src/lib/access.ts` pelo papel **e** pela função na produção; telas fora da função mostram "Esta tela não é da sua função" mesmo digitando o endereço. **A API também recorta (F220 do Aeris):** quem está só na arte e/ou na fábrica recebe valor, pago e preço nulos na fila e perde da sessão vendas, preços e PDV. Na loja sem caixa, a atendente também despacha. `salesperson` não cadastra produto (`catalog.write`): no Novo pedido, produto novo só gerente/dono.

A conta precisa ter a chave **`uniformes`** ligada no Aeris. Sem ela, a API responde `feature_not_enabled` e o front mostra um aviso.

## Rodar

```bash
npm install
npm run dev          # http://localhost:5174
```

O dev server encaminha `/api` para `https://aerisone.com.br`. Para apontar para outro Aeris (um local, por exemplo), crie um `.env` com `AERIS_API_TARGET=http://127.0.0.1:3000`.

## Como fala com o Aeris

- **Mesma origem.** O Aeris autentica por cookie de sessão (`SameSite=Lax`, `Secure`) e não libera CORS para outros domínios. Por isso o navegador só chama `/api` do próprio front, e quem repassa para o Aeris é o proxy (Vite no dev, nginx em produção).
- **Contratos do próprio Aeris.** `src/contracts/aeris/` é uma cópia dos schemas Zod de `aerisone/packages/contracts`. Cada resposta é validada com eles, então se o backend mudar de formato o erro aparece na hora. Depois de atualizar o clone do Aeris, rode:

  ```bash
  npm run sync:contracts        # usa ../aerisone (ou AERIS_REPO=/caminho)
  ```

  Não edite `src/contracts/aeris/` à mão.
- As regras de negócio continuam no servidor: quem pode mover cada etapa, a arte aprovada, a impressora obrigatória e as versões concorrentes. A tela só antecipa essas regras para não deixar a pessoa tentar o impossível.

## Produção

```bash
docker build -t 4play-front .
docker run -p 8080:8080 4play-front
```

O nginx (`deploy/nginx.conf.template`) serve o build e encaminha `/api/` para `AERIS_API_URL` (padrão `https://api.aerisone.com.br`). O domínio da 4Play precisa estar em **HTTPS**, senão o navegador descarta o cookie `Secure` da sessão. O nginx repassa `X-Forwarded-For` para que o limite de tentativas de login do Aeris veja o IP de cada pessoa, e não o do proxy.

## Estrutura

```
src/
  api/          chamadas ao Aeris (auth, uniforms, store)
  auth/         sessão (React Query) e AuthProvider
  components/   Shell, Logo, UI base, quadro (OrderCard, StageMover) e ficha/
  contracts/    cópia dos contratos Zod do Aeris (npm run sync:contracts)
  lib/          http, formatação BR, vocabulário da produção, queries
  pages/        Login, Painel, Produção, Pedidos, Pedido, Clientes, Equipe, TrocarSenha
```

## Marca

Os arquivos da marca ficam em `public/brand/` e podem ser trocados sem mexer em código (mesmo nome, fundo transparente):

| Arquivo | O que é |
| --- | --- |
| `4play.svg` | Logo da 4Play em vetor (nítida em qualquer tamanho). Feita para fundo escuro |
| `aeris-one.png` | Logo horizontal do Aeris One, em branco (montada a partir do arquivo oficial do Aeris) |
| `aeris-mark.png` | Só a marca "A1", em branco |

A composição 4Play × Aeris One está em `src/components/CoBrand.tsx` (login, menu lateral e tela de criar senha) e o fundo com os raios em `src/components/Lightning.tsx`.
