# Painel Semanal

Registro de progresso semanal — página única, sem dependências, sem servidor.
Os dados ficam no `localStorage` do navegador e sincronizam com um Gist privado do GitHub.

## Publicar

O arquivo é `index.html`. Com o repositório no GitHub:
**Settings → Pages → Source: Deploy from a branch → `main` / `root`**.

A página fica em `https://<usuario>.github.io/<repositorio>/`.

## Ligar a sincronização

1. Em <https://github.com/settings/personal-access-tokens>, crie um **fine-grained token**
   com uma única permissão de conta: **Gists → Read and write**. Nenhum acesso a repositório
   é necessário.
2. Abra o painel pela URL do Pages → aba **Ajustes** → **Sincronização**.
3. Cole o token, clique em **Salvar**, depois em **Enviar para o GitHub**.
   O primeiro envio cria um Gist privado e preenche o campo do Gist com o ID.
4. Em outro dispositivo: abra a mesma URL, cole o token, cole o ID do Gist
   (ou a URL completa dele) e clique em **Puxar do GitHub**.

Com **Sincronizar automaticamente** ligado, o painel envia sozinho 8 segundos depois de
cada alteração e puxa a versão remota ao abrir, quando ela é mais recente.

## Identidade e realização

Cada subcategoria tem um **ícone** escolhido pelo próprio nome — "Saúde financeira"
vira carteira, "Tese" vira livro, "Casa e bichos" vira casa. O ícone acompanha o
nome quando ele muda, e pode ser trocado à mão em **Ajustes → Categorias**, onde
um seletor com busca lista os 28 desenhos disponíveis. A opção "Automático" devolve
o comportamento pelo nome.

Sinais de conclusão, mantidos discretos de propósito:

- **Frente fechada**: o cartão em 100% troca a faixa e o percentual para o verde e
  ganha a linha "Frente fechada nesta semana".
- **Meta da semana**: ao cruzar a meta, o anel do topo passa a verde, a legenda vira
  "meta" e há um pulso único no instante da virada.
- **Sequência**: a partir de duas semanas fechadas na meta, aparece uma pastilha com
  a contagem. A semana em curso só entra na conta depois de bater a meta — ela nunca
  zera a sequência enquanto está sendo construída.
- **Ao concluir**: a caixa dá um salto curto (340 ms), em atividades e subetapas.

Tudo isso respeita `prefers-reduced-motion`.

## Lembrete de abertura

Em **Ajustes → Preferências** dá para escrever um recado que aparece num aviso ao
abrir o painel — o foco da semana, a tarefa que não pode escapar. A frequência é
**toda vez**, **uma vez por dia** (padrão) ou **desligado**, e o próprio aviso tem
um botão de editar, para atualizar o recado sem ir aos Ajustes. Sem mensagem
escrita, nada aparece.

## Ordem das áreas

As áreas se reordenam arrastando pela alça, em **Ajustes → Categorias** — a mesma
listra de destino do resto do painel indica onde a área vai cair. As setas de subir
e descer continuam ali para quem preferir. Subcategorias seguem só com as setas.

## Rotinas

O que se repete toda semana vive em **Ajustes → Rotinas**, em duas naturezas:

- **Frequência** — meta de quantidade na semana (treinar 4×). Fica no cartão da
  subcategoria, com contador.
- **Diária** — acontece em dias determinados, com horário e período opcionais.
  Aparece na agenda e na visão do dia, e pode ser dividida em **etapas** que se
  repetem todo dia (café da manhã, lanche).

O período com data de fim serve para o que é temporário — um tratamento de dez
dias. Terminado o período, a rotina some da agenda, sai do cálculo da semana e
não aparece no relatório exportado, sem precisar excluir nada.

Na grade da semana as rotinas aparecem compactadas numa pastilha por dia
(`rotinas 2/4`); o detalhe fica na visão do dia.

Cada rotina tem **peso de 1 a 3**, escolhido no editor. Peso 1 vale como uma
atividade comum; 2 e 3 pesam mais no percentual e marcam a rotina como
prioridade na visão do dia — mesma régua das atividades, onde a subetapa
herda a prioridade da atividade a que pertence.

## Etiquetas

Atividades e subetapas aceitam etiquetas livres. Escreva `#casa` no meio do texto
ao criar — a etiqueta sai do texto e vira marcador —, ou use **Etiquetas** no menu
do item para editá-las separadas por vírgula.

Clicar num marcador `#tag` filtra a semana por ele; clicar de novo limpa. O campo
de busca também entende `#tag`, e sem `#` procura em texto e etiquetas ao mesmo
tempo.

## Linha da atividade

Caixa, nome, marcadores e menu ficam na mesma linha; o nome é a coluna elástica e
cresce em altura quando é longo, sem empurrar nada para outra linha. Só num cartão
muito estreito os marcadores descem — e mesmo aí a caixa continua ao lado do nome.

Aparece como marcador apenas o que carrega informação: peso acima de 1, dia-alvo
definido, tempo anotado, etiquetas, link. O resto vive no menu `⋯`, que mostra o
valor atual ao lado de cada opção. Os marcadores também são atalhos — clicar no de
peso alterna 1 › 2 › 3, no de dia avança o dia-alvo.

## Tempo dedicado

Cada atividade e subetapa aceita o tempo gasto, pelo menu ou pelo marcador de
relógio. O campo entende `45`, `90m`, `1h30`, `1:30` e `1,5h`, e há botões de
+15, +30 e +1h para somar sem digitar. O tempo da atividade inclui o das suas
subetapas.

A partir do tempo o painel sugere um peso — até 30 min peso 1, até 2h peso 2,
acima disso peso 3, com as duas faixas ajustáveis em **Ajustes → Preferências**.
Quando a sugestão diverge do peso escolhido, aparece um marcador `› peso N` que
aplica a mudança num clique. Nem toda tarefa longa é importante: o `×` ao lado
do marcador (ou a opção no menu) desliga a sugestão só naquela atividade, e ela
sai também da conta "peso × relógio" do histórico. O histórico traz o mesmo confronto em lista, com o
total da semana e o tempo por frente.

O tempo é o registro daquela semana: não é levado pelo "puxar semana anterior".

## Transferir para outra atividade

**Arrastando**: pegue a alça da atividade ou da subetapa e solte **no miolo** da
atividade de destino — a linha acende inteira com o aviso "virar subetapa". Soltar
perto da **borda de cima ou de baixo** continua reordenando, como antes.

**Pelo menu**: **Transferir para outra atividade** abre a lista de destinos da
semana, agrupada por área e subcategoria, com um campo de busca no topo que filtra
por nome de atividade ou de frente. Enter escolhe o primeiro resultado.

- Uma **subetapa** muda de dono, levando dia, horário, link, etiquetas e tempo.
- Uma **atividade** vira subetapa do destino. Se ela tiver subetapas próprias,
  o painel avisa antes: elas passam a ficar no mesmo nível, dentro do destino,
  porque a estrutura só tem dois níveis.

Nos dois casos o aviso traz **Desfazer**, que devolve a semana ao estado anterior.
Uma atividade que fica sem etapas volta a "pendente" se estava concluída, e o
destino recalcula o próprio estado a partir das etapas que passou a ter.

## Lixeira e adiamento

Excluir uma atividade ou subetapa mostra um aviso com **Desfazer** por alguns
segundos. Passado isso, o item continua recuperável em **Ajustes → Lixeira**,
que guarda os últimos 60 itens por até 60 dias e devolve cada um à semana de
onde saiu. Se a subcategoria de origem tiver sido excluída, o painel pede que
ela seja recriada antes.

**Adiar** move o item para a semana seguinte, e o adiamento tem preço nos dois
sentidos:

- Na **semana de origem** o item deixa uma dívida: ele sai da lista, mas o peso
  dele continua no denominador. Sem isso, adiar aumentaria o percentual da semana
  em que a tarefa não saiu. A dívida aparece no rodapé do cartão, com o valor
  descontado e um **trazer de volta** que desfaz o adiamento.
- Na **semana de destino** o item chega marcado como "veio adiada" e, ao ser
  concluído, rende um bônus de 15% sobre o próprio peso.

Ambos são ajustáveis em **Ajustes → Preferências** — o desconto pode ser
desligado e o bônus vai de 0 a 50%. Percentuais são limitados a 100%.

Adiar uma subetapa leva junto uma casca da atividade-mãe na semana de destino, ou
anexa à que já existir lá, e a dívida é a fração do peso que aquela etapa
representava. Uma atividade que fica sem nenhuma etapa volta a "pendente":
manter "concluída" inflaria o percentual da semana.

## Links

Atividades e subetapas aceitam um link opcional — o lugar onde a tarefa se
resolve (um documento, um formulário, um sistema). O botão de corrente na
atividade ou na subetapa abre o campo; sem esquema, o endereço vira `https://`.
Só `http` e `https` são aceitos.

O link aparece como atalho na agenda e na visão do dia, abrindo em nova aba.
Subetapa sem link próprio herda o link da atividade.

## Histórico

A aba abre com **Como foi a semana**, a leitura da semana aberta: percentual com a
variação sobre a semana anterior e sobre a média das quatro anteriores, contagem
de atividades e subetapas, distribuição do planejado e do concluído por dia,
pontualidade (dia planejado × dia da conclusão), esforço por frente com peso,
aderência de cada rotina, etiquetas e a retrospectiva registrada.

Abaixo vem **Ao longo do tempo**, com a evolução entre semanas que já existia.

A pontualidade só conta atividades com dia-alvo e com carimbo de conclusão —
atividades marcadas antes dessa versão não têm o carimbo e ficam de fora.

## Segurança

O token fica em `localStorage`, na chave `painel-semanal-sync` — separada dos dados
(`painel-semanal-v1`). Por isso ele nunca entra no backup exportado nem sobe para o Gist.
O escopo *gist* não dá acesso aos seus repositórios. Para revogar, apague o token em
github.com/settings/personal-access-tokens; o painel continua funcionando offline.

## Conflitos

Antes de gravar, o painel confere se o Gist mudou depois da última sincronização daquele
navegador. Se mudou, ele pergunta antes de sobrescrever — a saída segura é **Puxar** primeiro.
