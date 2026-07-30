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
(`rotinas 2/4`); o detalhe fica na visão do dia. Rotinas pesam como uma
atividade comum no percentual.

## Links

Atividades e subetapas aceitam um link opcional — o lugar onde a tarefa se
resolve (um documento, um formulário, um sistema). O botão de corrente na
atividade ou na subetapa abre o campo; sem esquema, o endereço vira `https://`.
Só `http` e `https` são aceitos.

O link aparece como atalho na agenda e na visão do dia, abrindo em nova aba.
Subetapa sem link próprio herda o link da atividade.

## Segurança

O token fica em `localStorage`, na chave `painel-semanal-sync` — separada dos dados
(`painel-semanal-v1`). Por isso ele nunca entra no backup exportado nem sobe para o Gist.
O escopo *gist* não dá acesso aos seus repositórios. Para revogar, apague o token em
github.com/settings/personal-access-tokens; o painel continua funcionando offline.

## Conflitos

Antes de gravar, o painel confere se o Gist mudou depois da última sincronização daquele
navegador. Se mudou, ele pergunta antes de sobrescrever — a saída segura é **Puxar** primeiro.
