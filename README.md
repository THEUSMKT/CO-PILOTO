# Copiloto de Vendas Schay

App de celular que ajuda a Schay, corretora da Imobiliária Innovar (São Leopoldo/RS), a responder clientes do WhatsApp até marcar visita e fechar venda.

- Ela tira um **print da conversa**, escolhe o imóvel e recebe a **resposta pronta** para copiar e colar no WhatsApp.
- O app **guarda o cliente sozinho** e mostra **quem chamar hoje**, com a mensagem de retomada pronta.
- O gestor tem um **painel** dentro do mesmo app (relatório da semana, funil, imóveis, acesso), que só ele vê.
- **Nada é enviado automaticamente ao WhatsApp**: ela sempre copia, cola e envia.

## Como funciona

O app roda **dentro do Claude**, como uma página publicada no claude.ai (Artifact). Por isso:

- **Não tem servidor, chave de API nem Netlify.** O código fica aqui no GitHub; a página publicada fica no Claude.
- **A inteligência artificial usa a conta Claude de quem está usando o app.** Quando a Schay usa, desconta dos limites da conta dela; quando você testa, da sua.
- **Os clientes ficam no banco de dados do próprio Claude**, compartilhado só entre você (dono) e quem você convidar como **Editor**.
- **Acesso:** quem entra é quem você convida pelo botão **Compartilhar** do Claude.

## Passo a passo para colocar em uso

1. **Abra o link do app** (está no fim deste arquivo) e faça o tour de apresentação. Quando o Claude perguntar se o app pode usar a IA, toque em **Permitir**.
2. **Teste com as 3 conversas fictícias**: baixe os prints de [`scripts/conversas-teste/`](scripts/conversas-teste/) e mande cada um pelo botão **Responder um cliente**:
   - `1-lead-frio-quanto-e.png`: lead frio que só pergunta "quanto é?";
   - `2-vou-falar-com-meu-marido.png`: a cliente vai "falar com o marido";
   - `3-sumiu-ha-3-dias.png`: lead que parou de responder há 3 dias.
3. **Cadastre os imóveis reais**: no fim da tela inicial, toque em **Painel do gestor** (só você vê esse botão) → aba **Imóveis**. Edite os 2 de EXEMPLO com os dados reais (ou apague) e adicione os outros, com foto. A IA só usa o que estiver ali.
4. **Ajustes**: na aba **Acesso e ajustes**, coloque o WhatsApp do suporte (aparece no botão "Falar com o suporte" da Schay).
5. **Mande a porta de entrada para a Schay**: na aba **Acesso e ajustes**, toque em **Enviar pelo WhatsApp**. O link abre a página https://theusmkt.github.io/CO-PILOTO/, que leva ela a baixar o Claude, criar a conta (grátis) e te avisar o e-mail.
6. **Libere o acesso**: quando ela mandar o e-mail, toque em **Compartilhar** no topo da página do app no Claude e convide **esse e-mail com o nível Editor**. Não ative o link público (com link público, convidados de fora não conseguem salvar). Depois disso, ela abre o Copiloto pelo botão **Abrir o Copiloto** da porta de entrada.

## Como a Schay usa

A tela inicial tem só 3 botões:

1. **📩 Responder um cliente** → a galeria já abre → escolhe o print → toca no imóvel (ou "Não sei") → aparece a resposta. Toca no botão verde **COPIAR E ABRIR O WHATSAPP**, segura o dedo na caixa de mensagem e toca em **Colar**.
2. **📞 Quem chamar hoje** → **Ver o que mandar** → botão verde → depois **✓ Já chamei**. Ali também ficam **Marcou visita 🏠**, **Comprou 🎉** e **Desistiu**.
3. **❓ Preciso de ajuda** → passo a passo ilustrado, **Falar com o suporte** e como colocar o app na tela do celular.

O app decide sozinho:
- **Etapa** (Novo → Conversando → Visita marcada → Proposta): a IA lê a conversa e o app só avança. "Vendido" e "Perdido" vêm dos botões dela (ou quando o cliente pede para parar).
- **Retomada** de quem sumiu: D+1, D+3, D+7 e D+14 (a última é uma despedida educada). Depois disso, o cliente sai da lista com o motivo "Parou de responder".
- **Pós-visita**: ao marcar a visita, o app agenda "perguntar o que ele achou" para 2h depois.

## Painel do gestor

- **Relatório** (esta semana, semana passada, últimos 30 dias): leads recebidos, conversas iniciadas, visitas, propostas, vendas, tempo médio até a 1ª resposta, leads sem retorno, gráfico do funil, **onde está travando** (anúncio, atendimento ou fechamento), como os leads chegam (frio/morno/quente), leads por imóvel e motivos de desistência.
- **Funil**: quadro por etapa, com lembretes de hoje e leads sem retorno dela há +1h / +24h. Dá para mudar a etapa, anotar e apagar um cliente (pedido de exclusão, LGPD).
- **Imóveis**: cadastro com foto.
- **Acesso e ajustes**: como convidar a Schay, mensagem pronta, WhatsApp do suporte e **planilha CSV** com todos os clientes.

Como os números são medidos:
- *Lead recebido*: hora da 1ª mensagem do cliente lida no print (quando é de hoje); senão, a hora em que ela mandou o print ao app.
- *Tempo até a 1ª resposta*: do 1º contato até ela tocar em "Copiar" pela primeira vez. É uma aproximação.
- *Conversas, visitas, propostas e vendas*: quantos clientes chegaram a cada etapa dentro do período.

## Porta de entrada (GitHub Pages)

A pasta `entrada/` é uma página pública e simples, para quem ainda não tem o Claude: botão para baixar o app (Play Store ou App Store, detectado sozinho), criar a conta, avisar o gestor e abrir o Copiloto. Ela é publicada no GitHub Pages a cada envio para a `main` (`.github/workflows/pages.yml`), em **https://theusmkt.github.io/CO-PILOTO/**. Não tem dado de cliente nenhum.

## Mudar o app

| Quero mudar… | Arquivo |
| --- | --- |
| As regras de venda que a IA segue (tom, objeções, retomada, honestidade) | `playbook.md` |
| Telas e textos da Schay | `src/app.js` |
| Painel do gestor | `src/gestor.js` |
| Como o pedido à IA é montado | `src/cerebro.js` |
| Cores e visual | `src/estilo.css` |

Depois de mudar, rode `node scripts/montar.mjs` (gera `dist/copiloto.html`) e republique a página no Claude no mesmo link. O jeito mais simples: abra o Claude Code neste repositório e peça **"republique o Copiloto"**. Os clientes, imóveis e ajustes ficam guardados: republicar não apaga nada.

Os imóveis e o WhatsApp do suporte **não** ficam no código: são editados direto no painel do gestor. O arquivo `imoveis-exemplo.json` é só o modelo usado no primeiro carregamento.

### Testar no computador

Precisa de Node 20 ou mais novo:

```bash
npm run testar-local
# → http://localhost:8899         (como o dono vê)
# → http://localhost:8899/?dono=0 (como a Schay vê)
```

Esse teste usa um "Claude de mentira" (`teste/claude-falso.js`): banco em memória e uma resposta de IA fixa, só para conferir as telas. A IA de verdade só responde dentro do Claude.

## Estrutura

```
playbook.md              regras de venda da IA (vão embutidas na página)
imoveis-exemplo.json     2 imóveis de EXEMPLO usados no primeiro carregamento
src/pagina.html          estrutura da página
src/estilo.css           visual (azul escuro, azul claro, branco e dourado)
src/cerebro.js           monta o pedido à IA e confere a resposta
src/app.js               telas da Schay, banco de dados e regras de cada cliente
src/gestor.js            painel do gestor
scripts/montar.mjs       junta tudo em dist/copiloto.html
dist/copiloto.html       a página publicada no Claude
scripts/conversas-teste/ 3 prints fictícios de WhatsApp para testar
teste/                   teste local com o "Claude de mentira"
```

## Privacidade (LGPD)

- Os **prints não são guardados**: são reduzidos no próprio celular (~1500 px), vão para a IA e são descartados.
- Do cliente, o app guarda só: nome, telefone, imóvel, datas, etapa, 1 linha de resumo e as anotações dela.
- O banco só pode ser lido e alterado por você e por quem você convidar como Editor.
- Pedido de exclusão: painel → **Funil → Editar → Apagar**.

## Limitações

- A Schay precisa estar com a conta do Claude aberta no navegador do celular. Se sair da conta, o app pede para entrar de novo.
- A IA usa os limites da conta Claude dela. No plano gratuito, o limite tende a acabar rápido; se acontecer, o app avisa e pede para tentar mais tarde.
- Os lembretes aparecem quando ela abre o app (a bolinha vermelha mostra quantos). Não há notificação no celular.
- Quem é convidado como Editor também consegue publicar versões novas da página no Claude. Combine com a Schay de não mexer nisso.
- O banco do Claude guarda até 25 mil registros por app: sobra para uma corretora.

## Link do app

**https://claude.ai/artifact/N2VPvcJKnhKsRw9SNZM36w**

Só abre para você e para quem você convidar pelo botão **Compartilhar** da página.
