// Imitação do runtime do Claude (window.claude.use) para testar a página no computador.
// NÃO vai para o Claude: só o teste/servir.mjs injeta este arquivo.
// - db: banco em memória, salvo no localStorage do navegador ("claude-falso.db")
// - user: dono por padrão; abra com ?dono=0 para ver como a Schay vê
// - sample: devolve uma resposta de exemplo depois de ~1,5 s (o pedido fica em window.__ultimoPedido)
(() => {
  const CHAVE = "claude-falso.db";
  const params = new URLSearchParams(location.search);
  const ehDono = params.get("dono") !== "0";
  let dados = {};
  try { dados = JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { dados = {}; }
  if (!Object.keys(dados).length && window.__semente) dados = structuredClone(window.__semente);
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* ignorar */ } };
  salvar();

  const ouvintes = new Set();
  const avisar = () => setTimeout(() => ouvintes.forEach((f) => f()), 0);
  const pai = (caminho) => caminho.split("/").slice(0, -1).join("/");
  const snapDoc = (caminho) => {
    const corpo = dados[caminho];
    return { id: caminho.split("/").pop(), exists: !!corpo, data: () => (corpo ? structuredClone(corpo) : undefined), metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const snapColecao = (colecao) => {
    const docs = Object.keys(dados).filter((k) => pai(k) === colecao).sort().map(snapDoc);
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const docRef = (caminho) => ({
    id: caminho.split("/").pop(),
    path: caminho,
    get: async () => snapDoc(caminho),
    set: async (corpo) => { dados[caminho] = structuredClone(corpo); salvar(); avisar(); },
    update: async (corpo) => {
      if (!dados[caminho]) throw { code: "invalid_argument", message: "documento não existe" };
      Object.assign(dados[caminho], structuredClone(corpo)); salvar(); avisar();
    },
    delete: async () => { delete dados[caminho]; salvar(); avisar(); },
    onSnapshot(next) {
      const f = () => next(snapDoc(caminho));
      ouvintes.add(f); setTimeout(f, 30);
      return () => ouvintes.delete(f);
    },
  });
  const colRef = (caminho) => ({
    path: caminho,
    doc: (id) => docRef(`${caminho}/${id || Math.random().toString(36).slice(2, 12)}`),
    add: async (corpo) => { const r = docRef(`${caminho}/${Math.random().toString(36).slice(2, 12)}`); await r.set(corpo); return r; },
    get: async () => snapColecao(caminho),
    onSnapshot(next) {
      const f = () => next(snapColecao(caminho));
      ouvintes.add(f); setTimeout(f, 30);
      return () => ouvintes.delete(f);
    },
  });
  const db = { doc: docRef, collection: colRef };

  const user = {
    isOwner: async () => ehDono,
    canEdit: async () => true,
    can: async () => true,
    id: async () => (ehDono ? "dono" : "schay"),
    me: async () => ({ id: ehDono ? "dono" : "schay", name: ehDono ? "Gestor" : "Schay", isOwner: ehDono, canEdit: true }),
  };

  function respostaFalsa(pedido) {
    const retomar = pedido.includes("O cliente parou de responder") || pedido.includes("pós-visita");
    return {
      cliente: retomar ? { nome: null, telefone: null } : { nome: "Mariana", telefone: "51988887777" },
      imovel_id: "exemplo-apto-centro",
      momento: retomar ? "sumiu" : "primeiro_contato",
      etapa: "novo",
      temperatura: "frio",
      leitura: "Quer saber o preço; ainda não sabemos se é pra morar ou investir.",
      respostas: [
        { tipo: "texto", texto: retomar ? "Oi! Passando pra te contar que o apê tem sacada com churrasqueira 😊 Ainda faz sentido pra você?" : "Oi, Mariana! Obrigada pelo contato 😊 Ele está R$ 289 mil. Pra eu te ajudar melhor: você procura pra morar ou pra investir?" },
        { tipo: "audio", texto: "Oi, Mariana! Aqui é a Schay, da Innovar. Vi que você se interessou pelo apartamento. Me conta: é pra você morar? Assim eu te passo os detalhes que fazem diferença pra você." },
      ],
      proximo_passo: "Descobrir se é pra morar ou investir",
      followup: { precisa: true, dias: 1, hora: "10:00", quando: "amanhã às 10h", mensagem: "Oi, Mariana! Conseguiu ver minha mensagem sobre o apê? Se quiser, te mando mais fotos 😊" },
      por_que: "Responder o preço e já devolver uma pergunta mantém a conversa viva.",
      resumo: "Perguntou o preço do apartamento do anúncio.",
      primeira_mensagem: retomar ? { data: null, hora: null } : { data: "2026-10-20", hora: "14:02" },
      pediu_para_parar: false,
      avaliacao: retomar ? null : {
        nota_atendimento: 5,
        minutos_ate_primeira_resposta: 95,
        onde_travou: "entender_necessidade",
        causa_principal: "atendimento",
        falhas: ["demorou_para_responder", "nao_fez_perguntas", "codigo_que_nao_existe"],
        acertos: ["tom_acolhedor"],
        motivo_esfriou: "demora_ou_falha_atendimento",
        comentario: "Respondeu o preço depois de 1h35 e não perguntou o que o cliente procurava.",
      },
    };
  }

  // sample() em texto: devolve o JSON dentro de um bloco ```json (como um app antigo faria)
  const sample = async (input, opcoes = {}) => {
    window.__ultimoPedido = { input, opcoes: { ...opcoes, images: opcoes.images ? `${[].concat(opcoes.images).length} imagem(ns)` : undefined }, via: "texto" };
    if (window.__falharIA) throw { code: window.__falharIA, message: "falha simulada" };
    await new Promise((r) => setTimeout(r, 800));
    return { text: "Aqui está:\n```json\n" + JSON.stringify(respostaFalsa(String(input))) + "\n```", truncated: false, modelTierApplied: "default" };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 20_000_000, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } });
  // ?semjson=1 imita um app do Claude sem sample.json; ?jsonremovido=1 imita sample.json recusando com capability_removed
  if (params.get("semjson") !== "1") sample.json = async (input, opcoes = {}) => {
    if (params.get("jsonremovido") === "1") throw { code: "capability_removed", message: "json não existe neste app" };
    window.__ultimoPedido = { input, opcoes: { ...opcoes, images: opcoes.images ? `${[].concat(opcoes.images).length} imagem(ns)` : undefined }, via: "json" };
    if (window.__falharIA) throw { code: window.__falharIA, message: "falha simulada" };
    await new Promise((r) => setTimeout(r, 1500));
    return respostaFalsa(String(input));
  };

  const permissions = {
    state: async () => "granted",
    request: async (nomes = []) => Object.fromEntries(nomes.map((n) => [n, "granted"])),
    manage: async () => {},
  };
  const downloads = { save: async ({ filename, data }) => { window.__ultimoDownload = { filename, tamanho: String(data).length }; return { status: "saved" }; } };

  const capacidades = { db, user, sample, permissions, downloads };
  window.claude = { use: (nome) => new Promise((ok) => setTimeout(() => ok(capacidades[nome] ?? null), 50)) };
})();
