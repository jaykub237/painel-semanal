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

## Segurança

O token fica em `localStorage`, na chave `painel-semanal-sync` — separada dos dados
(`painel-semanal-v1`). Por isso ele nunca entra no backup exportado nem sobe para o Gist.
O escopo *gist* não dá acesso aos seus repositórios. Para revogar, apague o token em
github.com/settings/personal-access-tokens; o painel continua funcionando offline.

## Conflitos

Antes de gravar, o painel confere se o Gist mudou depois da última sincronização daquele
navegador. Se mudou, ele pergunta antes de sobrescrever — a saída segura é **Puxar** primeiro.
