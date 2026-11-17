// ================================================================
// Cérebro: monta o pedido para o Claude e confere a resposta.
// O texto das regras vem do playbook.md (embutido na página pelo scripts/montar.mjs).
// A IA roda pela conta Claude de quem está usando o app (capability "sample").
// ================================================================
const MODELO = "claude-sonnet-5-5";
const PLAYBOOK = (() => {
  try {
    return JSON.parse(document.getElementById("playbook").textContent);
  } catch {
    return "";
  }
})();

const FORMATO_JSON = `{
  "cliente": { "nome": "nome como aparece, ou null", "telefone": "só números com DDD, ou null" },
  "imovel_id": "id do imóvel da lista, ou null",
  "momento": "primeiro_contato | conversando | sumiu | pos_visita",
  "etapa": "novo | conversando | visita_marcada | proposta | vendido | perdido",
  "temperatura": "frio | morno | quente",
  "leitura": "1 frase: o que o cliente quer de verdade",
  "respostas": [
    { "texto": "melhor resposta, pronta para colar no WhatsApp", "tipo": "texto" },
    { "texto": "outra opção (texto) ou roteiro de áudio de até 20 segundos", "tipo": "texto | audio" }
  ],
  "proximo_passo": "objetivo agora, até 10 palavras",
  "followup": { "precisa": true, "dias": 1, "hora": "10:00", "quando": "amanhã às 10h", "mensagem": "mensagem pronta se ele não responder" },
  "por_que": "1 frase ensinando a técnica",
  "resumo": "1 frase para lembrar quem é esse cliente",
  "hora_primeira_mensagem_hoje": "HH:MM ou null",
  "pediu_para_parar": false
}`;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Lista de imóveis para o prompt (sem a foto, que é pesada e não ajuda a IA). */
function catalogoParaIA(lista) {
  return lista.map(({ foto, atualizadoEm, ...resto }) => resto);
}

function descreverCliente(c) {
  const linhas = ["## O que o app já sabe deste cliente"];
  if (c.nome) linhas.push(`- Nome: ${c.nome}`);
  if (c.resumo) linhas.push(`- Resumo: ${c.resumo}`);
  if (c.etapa) linhas.push(`- Etapa: ${c.etapa}`);
  if (c.temperatura) linhas.push(`- Como estava: ${c.temperatura}`);
  if (Number.isFinite(c.diasSemContato)) linhas.push(`- Dias sem conversar: ${c.diasSemContato}`);
  if (Number.isFinite(c.tentativas)) linhas.push(`- Mensagens de retomada já enviadas sem resposta: ${c.tentativas}`);
  if (c.visitaEm) linhas.push(`- Visita marcada para: ${c.visitaEm}`);
  if (c.mensagemPlanejada) linhas.push(`- Mensagem de retomada sugerida antes: "${c.mensagemPlanejada}"`);
  return linhas.join("\n");
}

/** O pedido inteiro, em texto: regras + imóveis + situação + conversa + formato da resposta. */
function montarPedido(entrada, listaImoveis) {
  const catalogo = catalogoParaIA(listaImoveis);
  const temExemplo = catalogo.some((i) => i.exemplo);
  const imovel = entrada.imovelId ? listaImoveis.find((i) => i.id === entrada.imovelId) : null;
  const partes = [
    "Você vai ajudar uma corretora de imóveis seguindo as regras abaixo.",
    "",
    "<regras>",
    PLAYBOOK,
    "</regras>",
    "",
    "## Imóveis disponíveis",
    !catalogo.length
      ? ""
      : temExemplo
        ? 'Imóveis com "exemplo": true são de demonstração (a imobiliária ainda vai trocar pelos reais). Para eles, use os valores que aparecem depois de "ex.:" como se fossem os dados do imóvel, e nunca cite o texto "EXEMPLO - SUBSTITUIR" para o cliente.'
        : "Use apenas estes dados. O que não estiver aqui, a Schay precisa confirmar.",
    catalogo.length ? "```json\n" + JSON.stringify(catalogo, null, 1) + "\n```" : "Nenhum imóvel cadastrado ainda: não cite dados de imóvel; sugira confirmar.",
    "",
    "## Situação",
    `- Agora: ${DATA_HORA.format(new Date())} (horário de Brasília)`,
    `- Imóvel indicado pela Schay: ${imovel ? `${imovel.id} (${imovel.titulo})` : "não informado"}`,
  ];
  if (entrada.cliente) partes.push("", descreverCliente(entrada.cliente));

  if (entrada.modo === "retomar") {
    const posVisita = entrada.cliente?.motivo === "pos_visita";
    partes.push(
      "",
      "## O que fazer",
      posVisita
        ? "A Schay quer saber o que o cliente achou da visita. Escreva a mensagem de pós-visita (momento = pos_visita): perguntar a impressão, abrir espaço para a objeção real e propor o próximo passo."
        : "O cliente parou de responder. Escreva a mensagem de retomada certa para o número de tentativas já feitas (0 = D+1, 1 = D+3, 2 = D+7, 3 ou mais = D+14 despedida). momento = sumiu.",
      "Não há print desta vez. Use só o que o app sabe do cliente e os dados do imóvel; não invente fatos sobre a conversa.",
    );
  } else {
    if (entrada.texto?.trim()) partes.push("", "## Conversa colada pela Schay (texto)", entrada.texto.trim().slice(0, 20000));
    if (entrada.imagens?.length) partes.push("", `## Conversa: ${entrada.imagens.length} print(s) do WhatsApp nas imagens anexadas, em ordem.`);
    partes.push("", "## O que fazer", "Leia a conversa e sugira a próxima mensagem da Schay para este cliente.");
  }
  partes.push(
    "",
    "## Formato da resposta",
    "Responda SOMENTE com um objeto JSON neste formato, sem nenhum texto antes ou depois:",
    FORMATO_JSON,
  );
  return partes.join("\n");
}

const limitar = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Confere e arruma o JSON devolvido, para o app nunca quebrar por um campo estranho. */
function normalizarResultado(bruto, idsImoveis) {
  const respostas = (Array.isArray(bruto?.respostas) ? bruto.respostas : [])
    .map((r) => ({ texto: limitar(r?.texto, 1200), tipo: r?.tipo === "audio" ? "audio" : "texto" }))
    .filter((r) => r.texto)
    .slice(0, 2);
  if (!respostas.length) {
    const erro = new Error("sem respostas");
    erro.code = "invalid_json";
    throw erro;
  }
  if (respostas[0].tipo === "audio") {
    const i = respostas.findIndex((r) => r.tipo === "texto");
    if (i > 0) respostas.unshift(...respostas.splice(i, 1));
    else respostas[0].tipo = "texto";
  }
  const umDe = (v, ok, padrao) => (ok.includes(v) ? v : padrao);
  const telefone = typeof bruto?.cliente?.telefone === "string" ? bruto.cliente.telefone.replace(/\D/g, "") : "";
  const dias = Number.isFinite(bruto?.followup?.dias) ? Math.min(30, Math.max(0, Math.round(bruto.followup.dias))) : 1;
  return {
    cliente: {
      nome: limitar(bruto?.cliente?.nome, 60) || null,
      telefone: telefone.length >= 10 && telefone.length <= 13 ? telefone : null,
    },
    imovel_id: idsImoveis.has(bruto?.imovel_id) ? bruto.imovel_id : null,
    momento: umDe(bruto?.momento, ["primeiro_contato", "conversando", "sumiu", "pos_visita"], "conversando"),
    etapa: umDe(bruto?.etapa, ["novo", "conversando", "visita_marcada", "proposta", "vendido", "perdido"], "conversando"),
    temperatura: umDe(bruto?.temperatura, ["frio", "morno", "quente"], "morno"),
    leitura: limitar(bruto?.leitura, 300),
    respostas,
    proximo_passo: limitar(bruto?.proximo_passo, 160),
    followup: {
      precisa: bruto?.followup?.precisa !== false && bruto?.pediu_para_parar !== true,
      dias,
      hora: HORA_VALIDA.test(bruto?.followup?.hora) ? bruto.followup.hora : "10:00",
      quando: limitar(bruto?.followup?.quando, 80),
      mensagem: limitar(bruto?.followup?.mensagem, 1200),
    },
    por_que: limitar(bruto?.por_que, 300),
    resumo: limitar(bruto?.resumo, 240),
    hora_primeira_mensagem_hoje: HORA_VALIDA.test(bruto?.hora_primeira_mensagem_hoje) ? bruto.hora_primeira_mensagem_hoje : null,
    pediu_para_parar: bruto?.pediu_para_parar === true,
  };
}

/** Pergunta ao Claude. Rejeita com {code} (os códigos do capability "sample", mais "sem_ia"). */
async function pensar(entrada, listaImoveis) {
  const sample = await window.claude?.use?.("sample");
  if (!sample) throw { code: "sem_ia" };
  const opcoes = { model: MODELO, modelTier: "default" };
  if (entrada.imagens?.length) opcoes.images = entrada.imagens.map((i) => i.blob);
  const bruto = await sample.json(montarPedido(entrada, listaImoveis), opcoes);
  return normalizarResultado(bruto, new Set(listaImoveis.map((i) => i.id)));
}
