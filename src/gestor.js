// ================================================================
// Painel do gestor: só o dono da página no Claude vê (user.isOwner()).
// Relatório da semana, funil completo, imóveis, acesso e ajustes.
// ================================================================
const ETAPAS_FUNIL = [
  ["novo", "Novo"],
  ["conversando", "Conversando"],
  ["visita_marcada", "Visita marcada"],
  ["proposta", "Proposta"],
  ["vendido", "Vendido"],
  ["perdido", "Perdido"],
];
const NOME_ETAPA = Object.fromEntries(ETAPAS_FUNIL);
const ATIVAS = new Set(["novo", "conversando", "visita_marcada", "proposta"]);
const HORA = 3_600_000;
const LINK_ENTRADA = "https://theusmkt.github.io/CO-PILOTO/";
const linkEntrada = () => config.linkEntrada || LINK_ENTRADA;
const gestor = { aba: "relatorio", periodo: "semana", busca: "", editandoImovel: null, fotoNova: undefined, apagando: null };

const ms = (v) => (v ? Date.parse(v) : NaN);
const fmtNum = new Intl.NumberFormat("pt-BR");
const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtDia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const quandoCurto = (v) => (v ? fmtData.format(new Date(v)) : "—");
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const nomeImovelGestor = (id) => nomeImovel(id) || (id ? "(imóvel removido)" : "Não informado");

function duracao(t) {
  if (!Number.isFinite(t)) return "—";
  const min = Math.round(t / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}min` : ""}`;
  return `${(t / DIA).toFixed(1).replace(".", ",")} dias`;
}

function periodo(tipo) {
  const agora = new Date();
  const segunda = new Date(agora);
  segunda.setHours(0, 0, 0, 0);
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
  if (tipo === "passada") {
    const ini = new Date(segunda);
    ini.setDate(ini.getDate() - 7);
    return { ini: ini.getTime(), fim: segunda.getTime(), nome: `${fmtDia.format(ini)} a ${fmtDia.format(new Date(segunda.getTime() - DIA))}` };
  }
  if (tipo === "30") {
    const ini = agora.getTime() - 30 * DIA;
    return { ini, fim: agora.getTime() + 1, nome: `${fmtDia.format(new Date(ini))} a ${fmtDia.format(agora)}` };
  }
  return { ini: segunda.getTime(), fim: agora.getTime() + 1, nome: `${fmtDia.format(segunda)} a ${fmtDia.format(agora)}` };
}

const dentro = (v, p) => {
  const x = ms(v);
  return Number.isFinite(x) && x >= p.ini && x < p.fim;
};
const teveEvento = (c, tipo, p) => (c.historico || []).some((h) => h.tipo === tipo && dentro(h.em, p));

function calcular(p) {
  const agora = Date.now();
  const recebidos = clientes.filter((c) => dentro(c.primeiroContato || c.criadoEm, p));
  const conversas = clientes.filter((c) => teveEvento(c, "etapa:conversando", p));
  const visitas = clientes.filter((c) => teveEvento(c, "etapa:visita_marcada", p));
  const propostas = clientes.filter((c) => teveEvento(c, "etapa:proposta", p));
  const vendas = clientes.filter((c) => teveEvento(c, "etapa:vendido", p));
  const perdidos = clientes.filter((c) => teveEvento(c, "etapa:perdido", p));
  const tempos = recebidos
    .filter((c) => c.medirResposta && c.primeiraRespostaEm && c.primeiroContato)
    .map((c) => Math.max(0, ms(c.primeiraRespostaEm) - ms(c.primeiroContato)));
  const media = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : NaN;
  const ate5 = tempos.filter((t) => t <= 5 * 60_000).length;
  const ativos = clientes.filter((c) => ATIVAS.has(c.etapa));
  const semRetorno1h = ativos.filter((c) => c.aguardandoDesde && agora - ms(c.aguardandoDesde) > HORA);
  const semRetorno24h = ativos.filter((c) => c.aguardandoDesde && agora - ms(c.aguardandoDesde) > DIA);
  const atrasados = ativos.filter((c) => c.proximoFollowup && agora - ms(c.proximoFollowup) > DIA);
  const semLembrete = ativos.filter((c) => !c.aguardandoDesde && !c.proximoFollowup && (c.etapa === "novo" || c.etapa === "conversando"));
  const fimHoje = inicioDoDia(new Date()).getTime() + DIA;
  const contar = (lista, chave) => {
    const m = new Map();
    for (const c of lista) m.set(chave(c), (m.get(chave(c)) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    recebidos, conversas, visitas, propostas, vendas, perdidos, tempos, media, ate5,
    semRetorno1h, semRetorno24h, atrasados,
    semFollowup: new Set([...semRetorno24h, ...atrasados, ...semLembrete]),
    lembretesHoje: ativos.filter((c) => c.proximoFollowup && ms(c.proximoFollowup) < fimHoje),
    porImovel: contar(recebidos, (c) => nomeImovelGestor(c.imovelId)),
    porTemperatura: ["frio", "morno", "quente"].map((k) => [k, recebidos.filter((c) => c.temperatura === k).length]),
    motivos: contar(perdidos, (c) => c.motivoPerda || "Sem motivo"),
  };
}

function diagnostico(m) {
  const achados = [];
  const n = m.recebidos.length;
  if (!n) return [["info", "Sem dados", "Nenhum lead registrado no período. Confira se os anúncios estão rodando e se a Schay está usando o app para responder."]];
  if (n < 5) achados.push(["info", "Poucos dados", `Só ${n} lead(s) no período: leia os números como tendência, não como regra.`]);
  const frios = m.porTemperatura.find(([k]) => k === "frio")[1];
  if (frios / n > 0.6) achados.push(["anuncio", "Anúncio", `${pct(frios, n)}% dos leads chegaram frios (só curiosidade). Vale revisar público, criativo e se o preço aparece no anúncio.`]);
  if (Number.isFinite(m.media) && m.media > 30 * 60_000) achados.push(["atendimento", "Atendimento", `A 1ª resposta está levando ${duracao(m.media)} em média. O ideal é até 5 minutos: lead frio esfria rápido.`]);
  if (n >= 3 && m.conversas.length / n < 0.3) achados.push(["anuncio", "Anúncio ou atendimento", `Só ${pct(m.conversas.length, n)}% dos leads chegaram a conversar. Se a resposta é rápida, o problema tende a ser o anúncio (lead pouco qualificado).`]);
  if (m.conversas.length >= 3 && m.visitas.length / m.conversas.length < 0.25) achados.push(["atendimento", "Atendimento", `Só ${pct(m.visitas.length, m.conversas.length)}% das conversas viraram visita. Treinar o convite para visita com 2 opções de horário.`]);
  if (m.visitas.length >= 3 && m.propostas.length + m.vendas.length === 0) achados.push(["fechamento", "Fechamento", "Teve visitas, mas nenhuma proposta. Revisar o pós-visita (perguntar a impressão em até 2h e tratar a objeção real)."]);
  if (m.semFollowup.size) achados.push(["atendimento", "Atendimento", `${m.semFollowup.size} lead(s) estão sem retorno ou com lembrete atrasado há mais de 24h.`]);
  if (achados.every(([tipo]) => tipo === "info")) achados.push(["ok", "Tudo certo", "Nenhum gargalo evidente no período. Siga acompanhando semana a semana."]);
  return achados;
}

/** Barras horizontais de uma cor só, com valor na ponta e dica ao passar o dedo ou o mouse. */
function barras(linhas, { total, descreverDica } = {}) {
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return `<div class="barras" role="list">${linhas.map((l, i) => {
    const largura = l.valor ? Math.max(1.5, (l.valor / max) * 100) : 0;
    const porcento = total ? ` <small>(${pct(l.valor, total)}%)</small>` : "";
    const textoDica = descreverDica ? descreverDica(l, i) : `${l.nome}: ${fmtNum.format(l.valor)}`;
    return `<div class="barra-linha" role="listitem" tabindex="0" data-dica="${esc(textoDica)}" data-valor="${esc(fmtNum.format(l.valor))}" aria-label="${esc(textoDica)}">
      <span class="nome">${esc(l.nome)}</span>
      <span class="barra-trilho"><span class="area"><span class="preenchimento" style="width:${largura}%"></span><span class="valor-barra" style="left:${largura}%">${fmtNum.format(l.valor)}${porcento}</span></span></span>
    </div>`;
  }).join("")}</div>`;
}

function abaRelatorio() {
  const p = periodo(gestor.periodo);
  const m = calcular(p);
  const n = m.recebidos.length;
  const funil = [
    { nome: "Leads recebidos", valor: n },
    { nome: "Conversas iniciadas", valor: m.conversas.length },
    { nome: "Visitas marcadas", valor: m.visitas.length },
    { nome: "Propostas", valor: m.propostas.length },
    { nome: "Vendas", valor: m.vendas.length },
  ];
  const indicador = (rotulo, valor, detalhe) => `<div class="indicador"><div class="rotulo-ind">${esc(rotulo)}</div><div class="valor">${esc(valor)}</div>${detalhe ? `<div class="detalhe">${esc(detalhe)}</div>` : ""}</div>`;
  const filtros = [["semana", "Esta semana"], ["passada", "Semana passada"], ["30", "Últimos 30 dias"]]
    .map(([k, nome]) => `<button type="button" data-acao="g-periodo" data-periodo="${k}" aria-pressed="${k === gestor.periodo}">${nome}</button>`).join("");
  return `
    <div class="filtros" role="group" aria-label="Período">${filtros}<span class="periodo">${esc(p.nome)}</span></div>
    <section class="indicadores" aria-label="Números do período">
      ${indicador("Leads recebidos", fmtNum.format(n))}
      ${indicador("Conversas iniciadas", fmtNum.format(m.conversas.length), n ? `${pct(m.conversas.length, n)}% dos leads` : "")}
      ${indicador("Visitas marcadas", fmtNum.format(m.visitas.length))}
      ${indicador("Propostas", fmtNum.format(m.propostas.length))}
      ${indicador("Vendas", fmtNum.format(m.vendas.length))}
      ${indicador("Tempo até a 1ª resposta", duracao(m.media), m.tempos.length ? `média de ${m.tempos.length} lead(s) · ${pct(m.ate5, m.tempos.length)}% em até 5 min` : "sem medição no período")}
      ${indicador("Leads sem retorno/lembrete", fmtNum.format(m.semFollowup.size), "agora, há mais de 24h")}
    </section>
    <section class="cartao">
      <h2>Funil do período</h2>
      <p class="sub">Quantos leads passaram por cada etapa no período. A porcentagem é sobre os leads recebidos.</p>
      ${barras(funil, { total: n, descreverDica: (l, i) => (i === 0 ? `${l.nome} no período` : `${l.nome} · ${pct(l.valor, funil[i - 1].valor)}% da etapa anterior`) })}
      <details><summary>Ver em tabela</summary>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Etapa</th><th class="num">Quantidade</th><th class="num">% dos leads</th><th class="num">% da etapa anterior</th></tr></thead>
          <tbody>${funil.map((l, i) => `<tr><td>${esc(l.nome)}</td><td class="num">${fmtNum.format(l.valor)}</td><td class="num">${pct(l.valor, n)}%</td><td class="num">${i ? `${pct(l.valor, funil[i - 1].valor)}%` : "—"}</td></tr>`).join("")}</tbody>
        </table></div>
      </details>
    </section>
    <section class="cartao">
      <h2>Onde o funil está travando</h2>
      <p class="sub">Leitura automática dos números: anúncio, atendimento ou fechamento.</p>
      <ul class="achados">${diagnostico(m).map(([tipo, rotulo, texto]) => `<li><span class="chip ${tipo}">${{ anuncio: "📣", atendimento: "💬", fechamento: "🤝", ok: "✓", info: "ℹ️" }[tipo] || ""} ${esc(rotulo)}</span><span>${esc(texto)}</span></li>`).join("")}</ul>
    </section>
    <section class="cartao">
      <h2>Como os leads chegam</h2>
      <p class="sub">Leitura da IA na primeira conversa (leads recebidos no período).</p>
      ${barras(m.porTemperatura.map(([k, v]) => ({ nome: { frio: "❄️ Frio", morno: "🙂 Morno", quente: "🔥 Quente" }[k], valor: v })), { total: n })}
    </section>
    <section class="cartao">
      <h2>Leads por imóvel</h2>
      <p class="sub">Qual anúncio ou imóvel mais trouxe leads no período.</p>
      ${m.porImovel.length ? barras(m.porImovel.map(([nome, v]) => ({ nome, valor: v })), { total: n }) : `<p class="sub">Sem leads no período.</p>`}
    </section>
    <section class="cartao">
      <h2>Motivos de desistência</h2>
      ${m.motivos.length ? barras(m.motivos.map(([nome, v]) => ({ nome, valor: v })), { total: m.perdidos.length }) : `<p class="sub">Ninguém desistiu no período.</p>`}
    </section>`;
}

function fichaCliente(c) {
  const atrasado = c.proximoFollowup && ms(c.proximoFollowup) < Date.now();
  const opcoes = ETAPAS_FUNIL.map(([k, nome]) => `<option value="${k}"${k === c.etapa ? " selected" : ""}>${nome}</option>`).join("");
  const apagando = gestor.apagando === c.id;
  return `<article class="ficha">
    <strong>${esc(nomeDoCliente(c))}</strong>
    <div class="marcas">${c.temperatura ? `<span class="temp ${esc(c.temperatura)}">${esc(c.temperatura)}</span>` : ""}<span class="temp">${esc(nomeImovelGestor(c.imovelId))}</span></div>
    ${c.telefone ? `<div class="linha-info">📱 <b>${esc(foneBonito(c.telefone))}</b></div>` : ""}
    <div class="linha-info">1º contato: <b>${esc(quandoCurto(c.primeiroContato || c.criadoEm))}</b></div>
    <div class="linha-info">Última interação: <b>${esc(quandoCurto(c.ultimaInteracao))}</b></div>
    ${ATIVAS.has(c.etapa) ? `<div class="linha-info${atrasado ? " atrasado" : ""}">Próximo lembrete: <b>${esc(quandoCurto(c.proximoFollowup))}</b></div>` : ""}
    ${c.aguardandoDesde ? `<div class="atrasado">⏳ Sem retorno dela ${esc(haQuantoTempo(c.aguardandoDesde))}</div>` : ""}
    ${c.etapa === "perdido" && c.motivoPerda ? `<div class="linha-info">Motivo: <b>${esc(c.motivoPerda)}</b></div>` : ""}
    ${c.resumo ? `<div class="linha-info">${esc(c.resumo)}</div>` : ""}
    ${c.anotacoes ? `<div class="linha-info">📝 ${esc(c.anotacoes)}</div>` : ""}
    <details${apagando ? " open" : ""}><summary>Editar</summary>
      <div class="editar">
        <label class="nome-campo" for="etapa-${esc(c.id)}">Etapa</label>
        <select id="etapa-${esc(c.id)}" class="campo">${opcoes}</select>
        <label class="nome-campo" for="motivo-${esc(c.id)}">Motivo (se perdido)</label>
        <input id="motivo-${esc(c.id)}" class="campo" value="${esc(c.motivoPerda || "")}">
        <label class="nome-campo" for="notas-${esc(c.id)}">Anotações</label>
        <textarea id="notas-${esc(c.id)}" class="campo">${esc(c.anotacoes || "")}</textarea>
        <div class="acoes"><button class="botao forte" type="button" data-acao="g-salvar-cliente" data-id="${esc(c.id)}">Salvar</button>
        <button class="botao perigo${apagando ? " confirmar" : ""}" type="button" data-acao="g-apagar-cliente" data-id="${esc(c.id)}">${apagando ? "Toque de novo para apagar de vez" : "Apagar (pedido do cliente)"}</button></div>
      </div>
    </details>
  </article>`;
}

function abaFunil() {
  const m = calcular(periodo("semana"));
  const filtro = normNome(gestor.busca);
  const lista = clientes
    .filter((c) => !filtro || normNome(`${c.nome} ${c.telefone || ""}`).includes(filtro))
    .sort((a, b) => ms(b.ultimaInteracao || b.criadoEm) - ms(a.ultimaInteracao || a.criadoEm));
  const alerta = (classe, numero, texto) => `<div class="alerta ${classe}"><strong>${fmtNum.format(numero)}</strong><span>${esc(texto)}</span></div>`;
  return `
    <section class="alertas" aria-label="Alertas de hoje">
      ${alerta("", m.lembretesHoje.length, "Lembretes de hoje")}
      ${alerta(m.semRetorno1h.length ? "atencao" : "", m.semRetorno1h.length, "Sem retorno dela há +1h")}
      ${alerta(m.semRetorno24h.length ? "critico" : "", m.semRetorno24h.length, "Sem retorno dela há +24h")}
      ${alerta(m.atrasados.length ? "critico" : "", m.atrasados.length, "Lembretes atrasados há +24h")}
    </section>
    <div><label class="escondido" for="g-busca">Buscar cliente</label>
      <input id="g-busca" class="campo" type="search" placeholder="Buscar por nome ou telefone" value="${esc(gestor.busca)}"></div>
    <section class="quadro" aria-label="Funil por etapa">
      ${ETAPAS_FUNIL.map(([k, nome]) => {
        const daEtapa = lista.filter((c) => c.etapa === k);
        return `<div class="coluna"><h3>${nome}<span>${daEtapa.length}</span></h3>${daEtapa.map(fichaCliente).join("") || `<p class="sub">Nenhum</p>`}</div>`;
      }).join("")}
    </section>`;
}

function formImovel(i) {
  const v = (campo) => esc(i?.[campo] ?? "");
  const foto = gestor.fotoNova !== undefined ? gestor.fotoNova : i?.foto || "";
  const apagando = gestor.apagando === `imovel:${i?.id}`;
  const campo = (id, rotulo, valor, extra = "") => `<div><label class="nome-campo" for="${id}">${rotulo}</label><input id="${id}" class="campo" value="${valor}" ${extra}></div>`;
  return `<section class="cartao" data-editando>
    <h2>${i ? "Editar imóvel" : "Novo imóvel"}</h2>
    <p class="sub">A IA só usa o que estiver aqui. O que faltar, ela sugere “vou confirmar e já te retorno”.</p>
    <div class="form-grade">
      ${campo("im-titulo", "Título", v("titulo"), 'placeholder="Apartamento 2 dormitórios no Centro"')}
      ${campo("im-bairro", "Bairro", v("bairro"))}
      ${campo("im-tipo", "Tipo", v("tipo"), 'placeholder="Apartamento, casa, terreno…"')}
      ${campo("im-preco", "Preço", v("preco"), 'placeholder="R$ 289.000"')}
      ${campo("im-quartos", "Quartos", v("quartos"), 'inputmode="numeric"')}
      ${campo("im-metragem", "Metragem", v("metragem"), 'placeholder="58 m² privativos"')}
      ${campo("im-condicoes", "Condições", v("condicoes"), 'placeholder="Aceita financiamento e FGTS"')}
      ${campo("im-link", "Link do anúncio", v("link"), 'inputmode="url"')}
    </div>
    <div><label class="nome-campo" for="im-diferenciais">Diferenciais (um por linha)</label>
      <textarea id="im-diferenciais" class="campo">${esc((i?.diferenciais || []).join("\n"))}</textarea></div>
    <div class="imovel-gestor">
      ${foto ? `<img id="im-previa" src="${esc(foto)}" alt="Foto do imóvel">` : `<span id="im-previa" class="sem-foto" aria-hidden="true">🏠</span>`}
      <div class="acoes">
        <label class="botao claro" for="im-foto">📷 ${foto ? "Trocar foto" : "Escolher foto"}</label>
        <input id="im-foto" class="escondido" type="file" accept="image/*">
        ${foto ? `<button class="botao claro" type="button" data-acao="g-remover-foto">Remover foto</button>` : ""}
      </div>
    </div>
    <div class="acoes">
      <button class="botao forte" type="button" data-acao="g-salvar-imovel" data-id="${esc(i?.id || "")}">Salvar imóvel</button>
      <button class="botao claro" type="button" data-acao="g-cancelar-imovel">Cancelar</button>
      ${i ? `<button class="botao perigo${apagando ? " confirmar" : ""}" type="button" data-acao="g-apagar-imovel" data-id="${esc(i.id)}">${apagando ? "Toque de novo para apagar" : "Apagar imóvel"}</button>` : ""}
    </div>
  </section>`;
}

function abaImoveis() {
  if (gestor.editandoImovel) {
    return formImovel(gestor.editandoImovel === "novo" ? null : imovelPorId(gestor.editandoImovel));
  }
  const exemplos = imoveis.some((i) => i.exemplo);
  return `
    ${exemplos ? `<div class="aviso-exemplo">⚠️ Ainda há imóveis de EXEMPLO. Edite com os dados reais ou apague antes da Schay usar com clientes.</div>` : ""}
    <section class="cartao">
      <h2>Imóveis que a IA conhece</h2>
      <p class="sub">Aparecem para a Schay no passo “Sobre qual imóvel ele perguntou?”.</p>
      <div class="lista-imoveis-gestor">
        ${imoveis.map((i) => `<div class="imovel-gestor">
          ${typeof i.foto === "string" && i.foto.startsWith("data:image/") ? `<img src="${esc(i.foto)}" alt="">` : `<span class="sem-foto" aria-hidden="true">🏠</span>`}
          <div><strong>${esc(semExemplo(i.titulo))}</strong>${i.exemplo ? ` <span class="etiqueta">EXEMPLO</span>` : ""}
            <p class="sub">${esc([semExemplo(i.bairro), semExemplo(i.preco)].filter(Boolean).join(" · "))}</p>
            <button class="botao claro" type="button" data-acao="g-editar-imovel" data-id="${esc(i.id)}">Editar</button></div>
        </div>`).join("") || `<p class="sub">Nenhum imóvel cadastrado ainda.</p>`}
      </div>
      <div class="acoes"><button class="botao forte" type="button" data-acao="g-novo-imovel">+ Adicionar imóvel</button></div>
    </section>`;
}

function mensagemParaSchay() {
  return `Oi, ${nomeCorretora()}! Preparei o seu Copiloto de Vendas 💛

Toque no link e siga os passos (é rapidinho): ${linkEntrada()}

Quando criar a sua conta no Claude, me mande o e-mail que você usou para eu liberar o seu acesso.`;
}

function abaAcesso() {
  const msg = mensagemParaSchay();
  return `
    <section class="cartao">
      <h2>Como dar acesso à ${esc(nomeCorretora())}</h2>
      <ol class="passos-lista">
        <li>Mande para ela a mensagem abaixo. O link abre a <b>porta de entrada</b>: ela baixa o Claude, cria a conta (grátis) e te avisa o e-mail.</li>
        <li>Quando ela avisar, toque em <b>Compartilhar</b> no topo desta página e convide <b>esse e-mail</b> com o nível <b>Editor</b>. É esse nível que deixa ela salvar os clientes.</li>
        <li>Não ative o link público: com link público, convidados de fora não conseguem salvar.</li>
        <li>Pronto: ela toca em <b>Abrir o Copiloto</b> na porta de entrada. A IA usa os limites da conta Claude dela.</li>
      </ol>
      <p class="sub">Porta de entrada: <a href="${esc(linkEntrada())}" target="_blank" rel="noopener noreferrer">${esc(linkEntrada())}</a></p>
      <div class="caixa-texto" id="g-mensagem">${esc(msg)}</div>
      <div class="acoes">
        <button class="botao forte" type="button" data-acao="g-copiar-mensagem">Copiar mensagem</button>
        <a class="botao whats" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener noreferrer">${ICONE_WHATS} Enviar pelo WhatsApp</a>
      </div>
    </section>
    <section class="cartao" data-editando>
      <h2>Ajustes</h2>
      <div class="form-grade">
        <div><label class="nome-campo" for="cfg-nome">Nome da corretora</label><input id="cfg-nome" class="campo" value="${esc(config.nomeCorretora || "Schay")}"></div>
        <div><label class="nome-campo" for="cfg-suporte">WhatsApp do suporte (com DDD)</label><input id="cfg-suporte" class="campo" inputmode="tel" value="${esc(config.suporteWhatsapp || "")}" placeholder="51 99999-9999"></div>
        <div><label class="nome-campo" for="cfg-link">Link do Copiloto (do Claude)</label><input id="cfg-link" class="campo" inputmode="url" value="${esc(config.link || "")}"></div>
        <div><label class="nome-campo" for="cfg-entrada">Link da porta de entrada</label><input id="cfg-entrada" class="campo" inputmode="url" value="${esc(linkEntrada())}"></div>
      </div>
      <div class="acoes"><button class="botao forte" type="button" data-acao="g-salvar-config">Salvar ajustes</button></div>
    </section>
    <section class="cartao">
      <h2>Exportar</h2>
      <p class="sub">Planilha com todos os clientes (abre no Excel ou no Google Planilhas).</p>
      <div class="acoes"><button class="botao claro" type="button" data-acao="g-csv">Baixar planilha (CSV)</button></div>
    </section>
    <section class="cartao">
      <h2>Privacidade (LGPD)</h2>
      <p class="sub">O app guarda só nome, telefone, imóvel, datas, etapa, um resumo de 1 linha e as anotações. Os prints das conversas não são guardados. Se um cliente pedir para apagar os dados dele, use “Editar → Apagar” na ficha dele, na aba Funil.</p>
    </section>`;
}

TELAS.gestor = function telaGestor() {
  if (!ehDono) return TELAS.inicio();
  const abas = [["relatorio", "Relatório"], ["funil", "Funil"], ["imoveis", "Imóveis"], ["acesso", "Acesso e ajustes"]]
    .map(([k, nome]) => `<button type="button" data-acao="g-aba" data-aba="${k}" aria-pressed="${k === gestor.aba}">${nome}</button>`).join("");
  const estado = !db
    ? `<div class="aviso-exemplo">⚠️ O banco de dados do Claude não respondeu nesta visualização. Os números abaixo são só deste aparelho.</div>`
    : modoLocal ? `<div class="aviso-exemplo">⚠️ Não consegui gravar no banco do Claude. Confira em Compartilhar se a ${esc(nomeCorretora())} tem nível Editor.</div>` : "";
  const corpo = { relatorio: abaRelatorio, funil: abaFunil, imoveis: abaImoveis, acesso: abaAcesso }[gestor.aba]();
  return `<section class="tela">${barra()}
    <div class="gestor">
      <div><h1>Painel do gestor</h1><p class="sub">Só você vê esta área. A ${esc(nomeCorretora())} vê apenas os 3 botões.</p></div>
      <nav class="abas-gestor" aria-label="Seções do painel">${abas}</nav>
      ${estado}
      ${corpo}
    </div></section>`;
};

// ---------------------------------------------------------------- ações do painel
function lerCampo(id) {
  return (document.getElementById(id)?.value || "").trim();
}

async function reduzirFotoImovel(arquivo) {
  const canvas = await desenharReduzido(arquivo, 640);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function csvClientes() {
  const colunas = [
    ["Nome", (c) => c.nome],
    ["Telefone", (c) => foneBonito(c.telefone)],
    ["Imóvel", (c) => nomeImovelGestor(c.imovelId)],
    ["Etapa", (c) => NOME_ETAPA[c.etapa]],
    ["Motivo (perdido)", (c) => c.motivoPerda],
    ["Como chegou", (c) => c.temperatura],
    ["1º contato", (c) => quandoCurto(c.primeiroContato || c.criadoEm)],
    ["1ª resposta dela", (c) => quandoCurto(c.primeiraRespostaEm)],
    ["Última interação", (c) => quandoCurto(c.ultimaInteracao)],
    ["Próximo lembrete", (c) => quandoCurto(c.proximoFollowup)],
    ["Resumo", (c) => c.resumo],
    ["Anotações", (c) => c.anotacoes],
  ];
  const celula = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita fórmula maliciosa na planilha
    return `"${s.replace(/"/g, '""')}"`;
  };
  return `﻿${[colunas.map(([n]) => celula(n)).join(";"), ...clientes.map((c) => colunas.map(([, f]) => celula(f(c))).join(";"))].join("\r\n")}`;
}

Object.assign(ACOES, {
  gestor() {
    gestor.aba = "relatorio";
    ir("gestor");
  },
  "g-aba"(el) {
    gestor.aba = el.dataset.aba;
    gestor.editandoImovel = null;
    gestor.apagando = null;
    desenhar(true);
  },
  "g-periodo"(el) {
    gestor.periodo = el.dataset.periodo;
    desenhar();
  },
  "g-salvar-cliente"(el) {
    const c = acharPorId(el.dataset.id);
    if (!c) return;
    const agora = new Date();
    const etapa = document.getElementById(`etapa-${c.id}`)?.value;
    if (etapa && etapa !== c.etapa) {
      mudarEtapa(c, etapa, agora);
      if (!ATIVAS.has(etapa)) {
        c.proximoFollowup = null;
        c.aguardandoDesde = null;
      }
    }
    c.motivoPerda = lerCampo(`motivo-${c.id}`) || null;
    c.anotacoes = lerCampo(`notas-${c.id}`).slice(0, 1000);
    salvarCliente(c);
    gestor.apagando = null;
    aviso("Salvo ✓");
    desenhar();
  },
  "g-apagar-cliente"(el) {
    const id = el.dataset.id;
    if (gestor.apagando !== id) {
      gestor.apagando = id;
      desenhar();
      return;
    }
    gestor.apagando = null;
    apagarCliente(id).then(() => aviso("Apagado ✓"));
    desenhar();
  },
  "g-novo-imovel"() {
    gestor.editandoImovel = "novo";
    gestor.fotoNova = undefined;
    gestor.apagando = null;
    desenhar(true);
  },
  "g-editar-imovel"(el) {
    gestor.editandoImovel = el.dataset.id;
    gestor.fotoNova = undefined;
    gestor.apagando = null;
    desenhar(true);
  },
  "g-cancelar-imovel"() {
    gestor.editandoImovel = null;
    gestor.fotoNova = undefined;
    gestor.apagando = null;
    desenhar(true);
  },
  "g-remover-foto"() {
    gestor.fotoNova = "";
    const previa = document.getElementById("im-previa");
    if (previa) previa.outerHTML = `<span id="im-previa" class="sem-foto" aria-hidden="true">🏠</span>`;
  },
  "g-salvar-imovel"(el) {
    const titulo = lerCampo("im-titulo");
    if (!titulo) {
      aviso("Escreva pelo menos o título do imóvel.");
      return;
    }
    const existente = el.dataset.id ? imovelPorId(el.dataset.id) : null;
    const id = existente?.id || `${normNome(titulo).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "imovel"}-${Math.random().toString(36).slice(2, 6)}`;
    const quartos = Number(lerCampo("im-quartos"));
    const imovel = {
      titulo,
      bairro: lerCampo("im-bairro"),
      tipo: lerCampo("im-tipo"),
      preco: lerCampo("im-preco"),
      quartos: Number.isFinite(quartos) && quartos > 0 ? quartos : null,
      metragem: lerCampo("im-metragem"),
      diferenciais: lerCampo("im-diferenciais").split("\n").map((d) => d.trim()).filter(Boolean).slice(0, 20),
      condicoes: lerCampo("im-condicoes"),
      link: lerCampo("im-link"),
      foto: gestor.fotoNova !== undefined ? gestor.fotoNova : existente?.foto || "",
      atualizadoEm: iso(new Date()),
    };
    imovel.exemplo = /EXEMPLO/i.test(JSON.stringify({ ...imovel, foto: "" }));
    const local = { ...imovel, id };
    imoveis = [...imoveis.filter((i) => i.id !== id), local].sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), "pt-BR"));
    guardar.gravar(CHAVES.imoveis, imoveis);
    escrever(`imoveis/${id}`, imovel);
    gestor.editandoImovel = null;
    gestor.fotoNova = undefined;
    aviso("Imóvel salvo ✓");
    desenhar(true);
  },
  "g-apagar-imovel"(el) {
    const id = el.dataset.id;
    if (gestor.apagando !== `imovel:${id}`) {
      gestor.apagando = `imovel:${id}`;
      desenhar();
      return;
    }
    imoveis = imoveis.filter((i) => i.id !== id);
    guardar.gravar(CHAVES.imoveis, imoveis);
    apagarDoc(`imoveis/${id}`);
    gestor.apagando = null;
    gestor.editandoImovel = null;
    aviso("Imóvel apagado ✓");
    desenhar(true);
  },
  "g-copiar-mensagem"() {
    aviso(copiarTexto(mensagemParaSchay()) ? "Mensagem copiada ✓" : "Selecione o texto e copie.");
  },
  "g-salvar-config"() {
    config = {
      ...config,
      nomeCorretora: lerCampo("cfg-nome") || "Schay",
      suporteWhatsapp: soNumeros(lerCampo("cfg-suporte")),
      link: lerCampo("cfg-link"),
      linkEntrada: lerCampo("cfg-entrada") || LINK_ENTRADA,
      atualizadoEm: iso(new Date()),
    };
    guardar.gravar(CHAVES.config, config);
    escrever("config/geral", clonar(config));
    aviso("Ajustes salvos ✓");
    desenhar();
  },
  async "g-csv"() {
    const downloads = await window.claude?.use?.("downloads");
    if (!downloads) {
      aviso("Não dá para baixar arquivos nesta visualização.");
      return;
    }
    try {
      const r = await downloads.save({ filename: `clientes-copiloto-${new Date().toISOString().slice(0, 10)}.csv`, data: csvClientes() });
      if (r?.status === "saved") aviso("Planilha baixada ✓");
    } catch (erro) {
      if (erro?.code !== "cancelled") aviso("Não consegui baixar a planilha agora.");
    }
  },
});

// Busca no funil e foto do imóvel
document.addEventListener("input", (e) => {
  if (e.target.id !== "g-busca") return;
  gestor.busca = e.target.value;
  const pos = e.target.selectionStart;
  desenhar();
  const campo = document.getElementById("g-busca");
  campo?.focus();
  campo?.setSelectionRange(pos, pos);
});

document.addEventListener("change", async (e) => {
  if (e.target.id !== "im-foto" || !e.target.files?.[0]) return;
  try {
    gestor.fotoNova = await reduzirFotoImovel(e.target.files[0]);
    const previa = document.getElementById("im-previa");
    if (previa) previa.outerHTML = `<img id="im-previa" src="${gestor.fotoNova}" alt="Foto do imóvel">`;
  } catch {
    aviso("Não consegui abrir essa foto.");
  }
});

// Dica das barras (passar o dedo ou o mouse, ou foco pelo teclado)
const dicaGrafico = document.getElementById("dica-grafico");
function mostrarDica(alvo, x, y) {
  dicaGrafico.replaceChildren();
  const forte = document.createElement("strong");
  forte.textContent = alvo.dataset.valor;
  const texto = document.createElement("span");
  texto.textContent = alvo.dataset.dica;
  dicaGrafico.append(forte, texto);
  dicaGrafico.hidden = false;
  const r = dicaGrafico.getBoundingClientRect();
  dicaGrafico.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 12))}px`;
  dicaGrafico.style.top = `${Math.max(8, y - r.height - 12)}px`;
}
document.addEventListener("pointermove", (e) => {
  const alvo = e.target.closest?.(".barra-linha");
  if (alvo) mostrarDica(alvo, e.clientX, e.clientY);
  else dicaGrafico.hidden = true;
});
document.addEventListener("focusin", (e) => {
  const alvo = e.target.closest?.(".barra-linha");
  if (!alvo) return;
  const r = alvo.getBoundingClientRect();
  mostrarDica(alvo, r.left + 120, r.top + 4);
});
document.addEventListener("focusout", () => { dicaGrafico.hidden = true; });

iniciar();
