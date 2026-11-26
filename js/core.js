// =========================================================================
// CORE — CONFIGURAÇÃO, ESTADO, API, CARROSSEL DE BOLÕES E MODAL "i"
// =========================================================================
const GAS_API_URL = (window.BOLAO_CONFIG && window.BOLAO_CONFIG.GAS_API_URL) || '';
const ONESIGNAL_APP_ID = (window.BOLAO_CONFIG && window.BOLAO_CONFIG.ONESIGNAL_APP_ID) || '';

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let state = {
  user: null,
  configPix: { NOME_RECEBEDOR: '', CHAVE_PIX: '', URL_PORTAL: '' },
  usuarios: [],
  rodadas: [],
  participacoes: [],
  resultados: [],
  devedoresAtuais: [],
  rankingHistorico: [],
  pendenciaSelecionada: null,
  arquivoAtual: null,
  sugestaoCadastroAtual: '',
  abaAtual: 'tabPagar',
  ordemConcursosDesc: true,
  filtroMinhasTransferencias: 'todas',
  cameraStream: null,
  bolaoId: '',
  boloes: [],
  sessionToken: '',
  bolaoAdminConfig: null,
  boloesAdmin: [],
  convite: {
    codigo: '',
    bolao: null,
    etapa: 'telefone',
    telefone: '',
    existe: null,
    primeiroNome: '',
    conviteAtivo: false,
    carregando: false,
    erro: '',
    bolaoAnteriorId: ''
  },
  convitePendente: null
};

// =========================================================================
// DICIONÁRIO DE EXPLICAÇÕES DO BOTÃO "i" (MODAL DE INFORMAÇÃO)
// =========================================================================
const INFO_MODAL_CONTENT = {
  login: {
    titulo: 'Acesso ao Portal',
    html: '<p>Entre com seu telefone (com DDD) e senha cadastrados.</p><p style="margin-top:8px;">O cadastro não é aberto nesta tela: para criar uma conta ou entrar em um novo bolão, acesse o <strong>link de convite</strong> enviado pelo administrador.</p>'
  },
  boloes_carrossel: {
    titulo: '🎯 Meus Bolões',
    html: '<p>Arraste os cartões para a <strong>esquerda ou direita</strong> e toque em um bolão para alternar entre suas sessões (ex.: bolão frequente e Mega da Virada).</p><p style="margin-top:8px;">Cada bolão possui seus próprios jogos, rodadas, participantes e chave Pix isolados.</p>'
  },
  resultado: {
    titulo: '🎱 Resultado da Mega-Sena',
    html: '<p>Exibe o último concurso oficial apurado, as 6 dezenas sorteadas, se acumulou e a estimativa do próximo prêmio.</p><p style="margin-top:8px;">Administradores podem buscar um concurso específico ou um intervalo (ex.: <code>3087-3090</code>) pelo botão <strong>Buscar</strong>.</p>'
  },
  push: {
    titulo: '🔔 Notificações Push',
    html: '<p>Receba avisos no celular quando sair resultado novo da Mega-Sena (incluindo alertas de Quadra, Quina e Sena), lembrete diário de cota em aberto e aprovação de convite.</p><ul><li><strong>iPhone (Safari):</strong> Compartilhar → <em>Adicionar à Tela de Início</em> → abra pelo ícone e toque em <strong>🔔 Push</strong>.</li><li><strong>Android (Chrome):</strong> abra no Chrome (fora do WhatsApp), toque em <strong>🔔 Push</strong> e clique em Permitir.</li></ul>'
  },
  pix: {
    titulo: '💸 Chave Pix do Bolão',
    html: '<p>Use o botão <strong>Copiar Pix</strong> para transferir sua cota ao recebedor deste bolão. Após pagar, anexe o comprovante na pendência correspondente logo abaixo.</p>'
  },
  pendencias: {
    titulo: '📌 Pendências em Aberto',
    html: '<p>Lista todas as rodadas em que você ainda possui saldo a pagar neste bolão. Toque em <strong>Anexar</strong> para enviar o comprovante e dar baixa automática.</p>'
  },
  comprovante: {
    titulo: '🧾 Leitor de Comprovante Pix',
    html: '<p>Envie o PDF ou print do comprovante (até 10 MB). A leitura roda localmente no seu aparelho (sem IA) e valida:</p><ul><li>Valor exato da pendência;</li><li>Nome do recebedor ou chave Pix;</li><li>ID único da transação (antifraude);</li><li>Bloqueio automático de agendamentos.</li></ul><p style="margin-top:8px;">Aprovado, o sistema registra a baixa na hora e guarda uma cópia no Google Drive do bolão.</p>'
  },
  jogos: {
    titulo: '🎟️ Jogos por Concurso',
    html: '<p>Agrupa todos os jogos apostados por número de concurso. Bilhetes de <strong>Teimosinha</strong> (vários concursos seguidos) aparecem automaticamente em cada concurso em que valem.</p><p style="margin-top:8px;">Quando o resultado daquele concurso é publicado, os acertos acendem em verde e destacam <strong>Quadra</strong>, <strong>Quina</strong> e <strong>Sena</strong>. Administradores podem tocar em <strong>✏️</strong> para corrigir dezenas ou concursos.</p>'
  },
  rodadas: {
    titulo: '🎱 Rodadas & Rateios',
    html: '<p>Mostra cada rodada lançada, a data do bilhete, o intervalo de concursos, o valor por cota, o status de cada participante e o link <strong>📄</strong> para abrir o comprovante salvo no Drive.</p><p style="margin-top:8px;">Administradores podem editar rodadas, jogos, cotas e pagamentos usando os botões <strong>✏️</strong> e <strong>🗑️</strong>.</p>'
  },
  resumo: {
    titulo: '📊 Resumo Mensal & Situação Atual',
    html: '<p>Consolida quanto cada participante consumiu, quanto ainda deve e o status financeiro — agrupado na <strong>Situação Atual</strong> e separado mês a mês.</p>'
  },
  devedores: {
    titulo: '🚨 Devedores Atuais',
    html: '<p>Ranking em tempo real de quem possui saldo pendente neste bolão, ordenado do maior valor em aberto para o menor.</p>'
  },
  ranking: {
    titulo: '📜 Ranking Histórico',
    html: '<p>Total acumulado de cotas assumidas por cada participante ao longo de todas as rodadas deste bolão.</p>'
  },
  minha_conta: {
    titulo: '💳 Minha Conta',
    html: '<p>Extrato individual com seu total de cotas, valor já pago, saldo devedor e acesso rápido aos seus comprovantes (<strong>📄</strong>) ou ao pagamento de itens em aberto.</p>'
  },
  perfil: {
    titulo: '👤 Perfil & Nome no Comprovante',
    html: '<p>Mantenha o campo <strong>Nome no comprovante</strong> igual ao nome impresso pelo seu banco nos comprovantes Pix para melhorar o reconhecimento automático.</p>'
  },
  tour: {
    titulo: '🧭 Tour Interativo',
    html: '<p>Faz um passeio guiado destacando na tela cada função principal do aplicativo, passo a passo.</p>'
  },
  admin_rodada: {
    titulo: '⚙️ Nova Rodada',
    html: '<p>Cadastre uma rodada definindo descrição, concurso inicial e final (para Teimosinha), data do bilhete, valor total, dezenas e cotas dos participantes.</p><p style="margin-top:8px;">A soma das cotas precisa fechar um <strong>número inteiro</strong> (quem escolhe 0,5 precisa formar par com outro 0,5). Depois de lançada, qualquer dado pode ser editado na aba Rodadas ou Jogos.</p>'
  },
  admin_ocr: {
    titulo: '📷 Leitura OCR de Bilhete Caixa',
    html: '<p>Aponte a câmera ou escolha uma foto do canhoto da Mega-Sena da Caixa. O leitor identifica automaticamente:</p><ul><li>Todos os jogos separados pelas linhas horizontais;</li><li>Concurso único ou intervalo (ex.: <code>CONC 3087 ATÉ 3090</code>);</li><li>Valor total do bilhete (ex.: <code>R$ 72,00</code>);</li><li>Data impressa no bilhete (ex.: <code>17NOV2026</code>).</li></ul><p style="margin-top:8px;">Dica: enquadre o bilhete inteiro com boa luz e confira os números antes de lançar.</p>'
  },
  admin_pendentes: {
    titulo: '👥 Solicitações Pendentes',
    html: '<p>Lista quem acessou o link de convite e aguarda sua aprovação para entrar neste bolão. Enquanto estiver pendente, a pessoa não vê jogos, valores nem chave Pix.</p>'
  },
  admin_convite: {
    titulo: '🔗 Convite deste Bolão',
    html: '<p>Compartilhe o link para convidar novos participantes. Você pode pausar novas solicitações a qualquer momento ou gerar um novo código para invalidar links antigos.</p>'
  },
  admin_membros: {
    titulo: '🧑‍🤝‍🧑 Gerenciar Membros',
    html: '<p>Promova participantes a administradores deste bolão ou remova o vínculo sem apagar a conta global do usuário em outros bolões.</p>'
  },
  admin_pix: {
    titulo: '🎨 Editar Bolão Ativo & Pix',
    html: '<p>Edite nome, tipo, cor do gradiente dos cards, pasta do Drive, <strong>Nome do Recebedor</strong> e <strong>Chave Pix</strong> deste bolão. A cor escolhida colore o degradê da esquerda para a direita nos cards sem alterar a cor dos botões.</p>'
  },
  admin_boloes: {
    titulo: '🛠️ Gerenciar Bolões (Super Admin)',
    html: '<p>Crie novos bolões frequentes ou comemorativos (como Mega da Virada), personalize cor dos cards, recebedor, Pix e pasta do Google Drive, ou arquive bolões encerrados.</p>'
  },
  convite_tela: {
    titulo: '🍀 Acesso por Convite',
    html: '<p>Informe seu telefone com DDD para identificar se você já tem conta no portal ou criar uma nova. Após solicitar, o administrador precisa aprovar sua entrada.</p>'
  },
  pendente_tela: {
    titulo: '⏳ Aguardando Aprovação',
    html: '<p>Por privacidade, jogos, rodadas, participantes e chave Pix só ficam visíveis depois que o administrador aprovar seu pedido. Toque em <strong>Verificar aprovação</strong> para consultar.</p>'
  }
};

function abrirInfoModal(chave) {
  const item = INFO_MODAL_CONTENT[chave];
  if (!item) return;
  document.getElementById('infoModalTitle').textContent = item.titulo;
  document.getElementById('infoModalBody').innerHTML = item.html;
  document.getElementById('infoModal').classList.remove('hidden');
}

function fecharInfoModal() {
  const modal = document.getElementById('infoModal');
  if (modal) modal.classList.add('hidden');
}

// =========================================================================
// ONESIGNAL v16 — INICIALIZAÇÃO E PUSH
// =========================================================================
window.OneSignalDeferred = window.OneSignalDeferred || [];

if (ONESIGNAL_APP_ID && !ONESIGNAL_APP_ID.includes('COLE_AQUI')) {
  window.OneSignalDeferred.push(async function(OneSignal) {
    const basePath = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : window.location.pathname.replace(/\/[^/]*$/, '/');

    const initConfig = { appId: ONESIGNAL_APP_ID };
    if (basePath !== '/') {
      initConfig.serviceWorkerPath = basePath.replace(/^\//, '') + 'OneSignalSDKWorker.js';
      initConfig.serviceWorkerParam = { scope: basePath };
    }

    await OneSignal.init(initConfig);

    if (state.user && state.user.id_usuario) {
      await OneSignal.login('mega_' + state.user.id_usuario);
    }
  });
}

async function ativarNotificacoesPush() {
  if (!ONESIGNAL_APP_ID || ONESIGNAL_APP_ID.includes('COLE_AQUI')) {
    alert('Configure o ONESIGNAL_APP_ID no arquivo config.js.');
    return;
  }

  const btn = document.getElementById('btnPush');
  btn.disabled = true;
  btn.textContent = 'Ativando...';

  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.Notifications.requestPermission();
      if (Notification.permission !== 'granted') {
        alert('Permissão não concedida. No iPhone, adicione o site à Tela de Início pelo Safari antes de ativar.');
        return;
      }

      const externalId = 'mega_' + state.user.id_usuario;
      await OneSignal.login(externalId);

      const res = await apiPost({
        action: 'salvarPushSubscription',
        id_usuario: state.user.id_usuario,
        subscriptionJson: 'ONESIGNAL:' + externalId
      });

      btn.textContent = '🔔 Ativo';
      alert(res.message || 'Notificações Push ativadas!');
    } catch (err) {
      alert('Erro ao ativar Push: ' + (err.message || err));
    } finally {
      btn.disabled = false;
      if (btn.textContent === 'Ativando...') btn.textContent = '🔔 Push';
    }
  });
}

// =========================================================================
// COMUNICAÇÃO COM GOOGLE APPS SCRIPT
// =========================================================================
async function apiPost(payload) {
  if (!GAS_API_URL || GAS_API_URL.includes('COLE_AQUI')) {
    throw new Error('Configure a variável GAS_API_URL no arquivo config.js.');
  }

  const acoesPublicas = new Set([
    'login',
    'validarConvite',
    'verificarTelefoneConvite',
    'solicitarEntradaConvite'
  ]);
  const requisicao = { ...(payload || {}) };

  if (state.sessionToken && !['login', 'validarConvite', 'verificarTelefoneConvite'].includes(requisicao.action)) {
    requisicao.session_token = state.sessionToken;
  }
  if (state.user && !acoesPublicas.has(requisicao.action)) {
    if (!requisicao.id_usuario) requisicao.id_usuario = state.user.id_usuario;
    if (!requisicao.bolao_id && state.bolaoId) requisicao.bolao_id = state.bolaoId;
  }

  const resp = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(requisicao)
  });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Resposta inesperada do servidor GAS.');
  }
}

// =========================================================================
// UTILITÁRIOS COMPARTILHADOS
// =========================================================================
function formatBRL(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizarHexCor6(cor, fallback = '#10b981') {
  const s = String(cor || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return fallback;
}

function showMsg(elId, msg, tipo = 'ok') {
  const el = document.getElementById(elId);
  if (!el) return;
  const cls = tipo === 'err' ? 'alert-err' : tipo === 'warn' ? 'alert-warn' : 'alert-ok';
  el.innerHTML = `<div class="alert ${cls}">${msg}</div>`;
}

function extrairChaveMes(dataStr) {
  const raw = String(dataStr || '').trim();
  if (!raw) return { key: '0000-00', label: 'Sem data' };

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const mBR = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mBR) {
    const mes = parseInt(mBR[2], 10);
    const ano = mBR[3];
    if (mes >= 1 && mes <= 12) {
      return { key: `${ano}-${String(mes).padStart(2, '0')}`, label: `${meses[mes - 1]} / ${ano}` };
    }
  }

  const mISO = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mISO) {
    const ano = mISO[1];
    const mes = parseInt(mISO[2], 10);
    if (mes >= 1 && mes <= 12) {
      return { key: `${ano}-${String(mes).padStart(2, '0')}`, label: `${meses[mes - 1]} / ${ano}` };
    }
  }

  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const mes = d.getMonth() + 1;
    const ano = d.getFullYear();
    return { key: `${ano}-${String(mes).padStart(2, '0')}`, label: `${meses[mes - 1]} / ${ano}` };
  }

  return { key: '0000-00', label: 'Sem data' };
}

function obterConcursosDaRodadaLocal(rodada) {
  if (Array.isArray(rodada.concursos) && rodada.concursos.length > 0) {
    return rodada.concursos.map(c => String(c).replace(/\D/g, '')).filter(Boolean);
  }
  const ini = parseInt(String(rodada.concurso_inicio || rodada.concurso || '').replace(/\D/g, ''), 10);
  const fim = parseInt(String(rodada.concurso_fim || rodada.concurso || '').replace(/\D/g, ''), 10);
  if (!isNaN(ini) && ini > 0) {
    const fimVal = !isNaN(fim) && fim >= ini && (fim - ini) < 50 ? fim : ini;
    const lista = [];
    for (let c = ini; c <= fimVal; c++) lista.push(String(c));
    return lista;
  }
  return [];
}

function obterDisplayConcursoRodada(rodada) {
  if (rodada.concurso_display) return String(rodada.concurso_display);
  const lista = obterConcursosDaRodadaLocal(rodada);
  if (lista.length === 0) return '';
  if (lista.length === 1) return lista[0];
  return `${lista[0]} a ${lista[lista.length - 1]}`;
}

function parsearJogosTexto(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const jogosValidos = [];
  const erros = [];

  linhas.forEach((linha, idx) => {
    const nums = (linha.match(/\d+/g) || [])
      .map(n => parseInt(n, 10))
      .filter(n => n >= 1 && n <= 60);
    const unicos = [...new Set(nums)].sort((a, b) => a - b);

    if (unicos.length >= 6 && unicos.length <= 20) {
      jogosValidos.push(unicos.map(n => String(n).padStart(2, '0')));
    } else {
      erros.push(`Linha ${idx + 1}: ${unicos.length} dezena(s) válida(s) (precisa entre 6 e 20).`);
    }
  });

  return { jogosValidos, erros };
}

function atualizarPreviewJogos() {
  const txt = document.getElementById('rodadaJogosTexto').value;
  const infoEl = document.getElementById('previewJogosInfo');
  if (!infoEl) return;
  if (!txt.trim()) {
    infoEl.innerHTML = '0 jogos';
    return;
  }
  const { jogosValidos, erros } = parsearJogosTexto(txt);
  let html = `<span style="color:#34d399;"><strong>${jogosValidos.length}</strong> jogo(s) válido(s)</span>`;
  if (erros.length > 0) {
    html += `<br/><span style="color:#fbbf24;">⚠️ ${erros.join(' | ')}</span>`;
  }
  infoEl.innerHTML = html;
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao preparar arquivo para envio ao Drive.'));
    reader.readAsDataURL(file);
  });
}

function normalizarTexto(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function calcularSimilaridade(a, b) {
  const n1 = normalizarTexto(a);
  const n2 = normalizarTexto(b);
  if (!n1 || !n2) return 0;
  if (n1 === n2) return 1;

  const stopwords = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
  const t1 = n1.split(' ').filter(t => t.length > 1 && !stopwords.has(t));
  const t2 = n2.split(' ').filter(t => t.length > 1 && !stopwords.has(t));
  const set2 = new Set(t2);
  const inter = t1.filter(t => set2.has(t)).length;
  const uniao = new Set([...t1, ...t2]).size;
  const jaccard = uniao > 0 ? inter / uniao : 0;

  const maxLen = Math.max(n1.length, n2.length);
  const levSim = maxLen > 0 ? 1 - (levenshtein(n1, n2) / maxLen) : 0;
  const contido = (n1.includes(n2) || n2.includes(n1)) ? 0.2 : 0;

  return Math.min(1, Number((jaccard * 0.55 + levSim * 0.35 + contido).toFixed(2)));
}

function aplicarConfigPixNaInterface() {
  try {
    const overrideRaw = localStorage.getItem('bolao_ameba_pix_override');
    if (overrideRaw) {
      const ov = JSON.parse(overrideRaw);
      if (ov && ov.NOME_RECEBEDOR) state.configPix.NOME_RECEBEDOR = ov.NOME_RECEBEDOR;
      if (ov && ov.CHAVE_PIX) state.configPix.CHAVE_PIX = ov.CHAVE_PIX;
    }
  } catch (_) {}

  const recEl = document.getElementById('pixRecebedor');
  const chaveEl = document.getElementById('pixChave');
  if (recEl) recEl.textContent = state.configPix.NOME_RECEBEDOR || '-';
  if (chaveEl) chaveEl.textContent = state.configPix.CHAVE_PIX || '-';

  const bolao = obterBolaoAtivoLocal();
  const inpNomeBolao = document.getElementById('cfgBolaoNome');
  const inpTipoBolao = document.getElementById('cfgBolaoTipo');
  const inpCorBolao = document.getElementById('cfgBolaoCor');
  const inpPastaBolao = document.getElementById('cfgBolaoPasta');
  const inpNome = document.getElementById('cfgNomeRecebedor');
  const inpChave = document.getElementById('cfgChavePix');

  if (bolao) {
    if (inpNomeBolao) inpNomeBolao.value = bolao.nome || '';
    if (inpTipoBolao) inpTipoBolao.value = String(bolao.tipo || 'FREQUENTE').toUpperCase();
    if (inpCorBolao) inpCorBolao.value = normalizarHexCor6(bolao.cor_tema, '#10b981');
    if (inpPastaBolao && state.bolaoAdminConfig && state.bolaoAdminConfig.bolao_id === bolao.bolao_id) {
      inpPastaBolao.value = state.bolaoAdminConfig.pasta_drive || '';
    }
  }
  if (inpNome) inpNome.value = state.configPix.NOME_RECEBEDOR || '';
  if (inpChave) inpChave.value = state.configPix.CHAVE_PIX || '';
}

// =========================================================================
// CARROSSEL DE BOLÕES (ARRASTE LATERAL + COR APENAS NO GRADIENTE DOS CARDS)
// =========================================================================
function obterBolaoAtivoLocal() {
  return (state.boloes || []).find(b => String(b.bolao_id || '') === String(state.bolaoId || '')) || null;
}

function usuarioEhAdminNoBolao() {
  const bolao = obterBolaoAtivoLocal();
  return Boolean(state.user && (
    state.user.super_admin === true ||
    String(state.user.super_admin || '').toUpperCase() === 'SIM' ||
    String(bolao && bolao.papel || '').toLowerCase() === 'admin_bolao'
  ));
}

function atualizarIdentidadeBolao() {
  const bolao = obterBolaoAtivoLocal();
  const corValida = normalizarHexCor6(bolao && bolao.cor_tema, '#10b981');
  // Aplica a cor apenas como gradiente/borda nos cards sem mudar os botões (--primary permanece fixo)
  document.documentElement.style.setProperty('--bolao-accent', corValida);
  renderizarCarrosselBoloes();
}

function renderizarCarrosselBoloes() {
  const section = document.getElementById('boloesCarouselSection');
  const track = document.getElementById('boloesCarouselTrack');
  const dotsWrap = document.getElementById('boloesCarouselDots');
  const counterEl = document.getElementById('boloesCarouselCounter');
  if (!section || !track || !dotsWrap) return;

  const visiveis = (state.boloes || []).filter(b =>
    ['APROVADO', 'PENDENTE'].includes(String(b.status_membro || '').toUpperCase())
  );

  if (visiveis.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  const idxAtivo = Math.max(0, visiveis.findIndex(b => String(b.bolao_id) === String(state.bolaoId)));
  if (counterEl) {
    counterEl.textContent = visiveis.length > 1 ? `${idxAtivo + 1}/${visiveis.length}` : 'Ativo';
  }

  track.innerHTML = visiveis.map(b => {
    const idEnc = encodeURIComponent(String(b.bolao_id || ''));
    const statusMembro = String(b.status_membro || '').toUpperCase();
    const statusBolao = String(b.status || 'ATIVO').toUpperCase();
    const isAtivo = String(b.bolao_id) === String(state.bolaoId);
    const isPendente = statusMembro === 'PENDENTE';
    const cor = normalizarHexCor6(b.cor_tema, '#10b981');

    let badgeHtml = `<span class="badge badge-green">ATIVO</span>`;
    if (isPendente) badgeHtml = `<span class="badge badge-amber">PENDENTE</span>`;
    else if (statusBolao !== 'ATIVO') badgeHtml = `<span class="badge badge-blue">${escapeHtml(statusBolao)}</span>`;
    else if (isAtivo) badgeHtml = `<span class="badge badge-green">SELECIONADO</span>`;

    const tipoLabel = String(b.tipo || 'FREQUENTE').toUpperCase() === 'COMEMORATIVO' ? 'Comemorativo' : 'Frequente';
    const papelLabel = isPendente
      ? 'Aguardando aprovação'
      : (String(b.papel || '').toLowerCase() === 'admin_bolao' ? 'Admin' : 'Membro');

    const onclickFn = isPendente
      ? `abrirPendenteDoCarrossel('${idEnc}')`
      : `trocarBolaoAtivo('${idEnc}')`;

    return `
      <button type="button"
        class="bolao-slide-card ${isAtivo ? 'active' : ''} ${isPendente ? 'pending' : ''}"
        style="--card-accent:${cor}"
        data-bolao-id="${escapeHtml(b.bolao_id)}"
        onclick="${onclickFn}">
        <div class="bolao-slide-top">
          <span class="bolao-slide-name">🍀 ${escapeHtml(b.nome)}</span>
          ${badgeHtml}
        </div>
        <div class="bolao-slide-meta">
          <span>${tipoLabel}</span>
          <span>${papelLabel}</span>
        </div>
      </button>
    `;
  }).join('');

  if (visiveis.length > 1) {
    dotsWrap.classList.remove('hidden');
    dotsWrap.innerHTML = visiveis.map((b, i) => `
      <button type="button"
        class="carousel-dot ${i === idxAtivo ? 'active' : ''}"
        aria-label="Ir para ${escapeHtml(b.nome)}"
        onclick="rolarCarrosselParaIndice(${i})"></button>
    `).join('');
  } else {
    dotsWrap.classList.add('hidden');
    dotsWrap.innerHTML = '';
  }

  const cardAtivo = track.querySelector('.bolao-slide-card.active');
  if (cardAtivo) {
    setTimeout(() => {
      cardAtivo.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 40);
  }
}

function rolarCarrosselParaIndice(idx) {
  const track = document.getElementById('boloesCarouselTrack');
  if (!track) return;
  const cards = track.querySelectorAll('.bolao-slide-card');
  if (cards[idx]) {
    cards[idx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

function sincronizarDotsCarrossel() {
  const track = document.getElementById('boloesCarouselTrack');
  const dots = document.querySelectorAll('#boloesCarouselDots .carousel-dot');
  const counterEl = document.getElementById('boloesCarouselCounter');
  if (!track || dots.length === 0) return;

  const cards = [...track.querySelectorAll('.bolao-slide-card')];
  const center = track.scrollLeft + (track.clientWidth / 2);
  let maisProximo = 0;
  let menorDist = Infinity;

  cards.forEach((c, idx) => {
    const cCenter = c.offsetLeft + (c.offsetWidth / 2);
    const dist = Math.abs(cCenter - center);
    if (dist < menorDist) {
      menorDist = dist;
      maisProximo = idx;
    }
  });

  dots.forEach((d, idx) => d.classList.toggle('active', idx === maisProximo));
  if (counterEl && cards.length > 1) {
    counterEl.textContent = `${maisProximo + 1}/${cards.length}`;
  }
}

function abrirPendenteDoCarrossel(bolaoIdEnc) {
  const id = decodeURIComponent(String(bolaoIdEnc || ''));
  const b = (state.boloes || []).find(item => String(item.bolao_id) === id);
  if (!b) return;
  state.convitePendente = {
    bolao_id: b.bolao_id,
    bolao_anterior_id: state.bolaoId || '',
    nome: b.nome || 'Bolão',
    cor_tema: b.cor_tema || '#f59e0b',
    tipo: b.tipo || 'FREQUENTE',
    status_membro: 'PENDENTE'
  };
  if (typeof exibirTelaPendente === 'function') exibirTelaPendente();
}

async function trocarBolaoAtivo(bolaoIdEnc) {
  const novoId = decodeURIComponent(String(bolaoIdEnc || '')).trim();
  if (!novoId || novoId === String(state.bolaoId || '')) return;

  const alvo = (state.boloes || []).find(b =>
    String(b.bolao_id || '') === novoId &&
    String(b.status_membro || '').toUpperCase() === 'APROVADO'
  );
  if (!alvo) return;

  state.bolaoId = novoId;
  state.user.bolao_id = novoId;
  state.user.perfil = (state.user.super_admin || String(alvo.papel || '').toLowerCase() === 'admin_bolao') ? 'admin' : 'user';
  localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));

  atualizarBadgesEPermissoes();
  atualizarIdentidadeBolao();
  trocarAba('tabPagar');
  await carregarDashboard();
}

function atualizarBadgesEPermissoes() {
  const roleBadge = document.getElementById('userRoleBadge');
  const isAdmin = usuarioEhAdminNoBolao();
  const ehSuper = state.user && (
    state.user.super_admin === true ||
    String(state.user.super_admin || '').toUpperCase() === 'SIM'
  );

  if (roleBadge) {
    roleBadge.textContent = ehSuper ? 'SUPER ADMIN' : (isAdmin ? 'ADMIN' : 'MEMBRO');
    roleBadge.className = isAdmin ? 'badge badge-amber' : 'badge badge-green';
  }
  document.getElementById('tabAdminBtn').classList.toggle('hidden', !isAdmin);
  document.getElementById('adminBuscaResultadoWrap').classList.toggle('hidden', !isAdmin);
  document.getElementById('tourAdminGuideCard').classList.toggle('hidden', !isAdmin);
  document.getElementById('cardGerenciarBoloes').classList.toggle('hidden', !ehSuper);
}

// =========================================================================
// AUTENTICAÇÃO, SESSÃO E NAVEGAÇÃO
// =========================================================================
window.addEventListener('DOMContentLoaded', async () => {
  const track = document.getElementById('boloesCarouselTrack');
  if (track) {
    track.addEventListener('scroll', sincronizarDotsCarrossel, { passive: true });
  }

  let usuarioSalvo = null;
  let pendenciaSalva = null;

  try {
    const saved = localStorage.getItem('bolao_ameba_user');
    if (saved) usuarioSalvo = JSON.parse(saved);
  } catch (_) {
    localStorage.removeItem('bolao_ameba_user');
  }

  try {
    const savedPending = localStorage.getItem('bolao_ameba_pending_invite');
    if (savedPending) pendenciaSalva = JSON.parse(savedPending);
  } catch (_) {
    localStorage.removeItem('bolao_ameba_pending_invite');
  }

  try {
    state.sessionToken = String(localStorage.getItem('bolao_ameba_session_token') || '');
  } catch (_) {
    state.sessionToken = '';
  }

  if (usuarioSalvo && !state.sessionToken) {
    localStorage.removeItem('bolao_ameba_user');
    usuarioSalvo = null;
  }

  state.user = usuarioSalvo;
  if (usuarioSalvo) {
    state.bolaoId = String(usuarioSalvo.bolao_id || '');
  }

  const params = new URLSearchParams(window.location.search || '');
  const codigoConvite = String(params.get('convite') || '').trim();

  if (codigoConvite && typeof iniciarFluxoConvite === 'function') {
    await iniciarFluxoConvite(codigoConvite);
    return;
  }

  if (usuarioSalvo && pendenciaSalva && pendenciaSalva.bolao_id) {
    state.convitePendente = pendenciaSalva;
    state.bolaoId = String(pendenciaSalva.bolao_anterior_id || state.bolaoId || pendenciaSalva.bolao_id || '');
    if (typeof exibirTelaPendente === 'function') exibirTelaPendente();
    if (typeof verificarAprovacaoPendente === 'function') await verificarAprovacaoPendente(true);
    return;
  }

  if (usuarioSalvo) {
    try {
      const meusBoloes = await apiPost({ action: 'getMeusBoloes', id_usuario: usuarioSalvo.id_usuario });
      if (!meusBoloes || meusBoloes.success !== true || !Array.isArray(meusBoloes.boloes)) {
        throw new Error((meusBoloes && meusBoloes.message) || 'Não foi possível restaurar seus bolões.');
      }
      state.boloes = meusBoloes.boloes;
      state.user = { ...state.user, ...(meusBoloes.user || {}) };
      const aprovados = state.boloes.filter(b => String(b.status_membro || '').toUpperCase() === 'APROVADO');
      const salvoValido = aprovados.some(b => String(b.bolao_id || '') === String(state.bolaoId || ''));
      if (!salvoValido) {
        const primeiroAtivo = aprovados.find(b => String(b.status || '').toUpperCase() === 'ATIVO');
        state.bolaoId = String((primeiroAtivo || aprovados[0] || {}).bolao_id || '');
      }
      state.user.bolao_id = state.bolaoId;
      localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));
      entrarNoApp();
    } catch (err) {
      localStorage.removeItem('bolao_ameba_user');
      localStorage.removeItem('bolao_ameba_session_token');
      state.user = null;
      state.sessionToken = '';
      state.bolaoId = '';
      document.getElementById('loginSection').classList.remove('hidden');
      showMsg('loginFeedback', escapeHtml(err.message || 'Sua sessão expirou. Entre novamente.'), 'warn');
    }
    return;
  }

  document.getElementById('loginSection').classList.remove('hidden');
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    fecharInfoModal();
    if (typeof fecharModalEditarRodada === 'function') fecharModalEditarRodada();
    if (typeof fecharModalEditarPagamento === 'function') fecharModalEditarPagamento();
    if (typeof fecharCameraAoVivo === 'function') fecharCameraAoVivo();
  }
});

async function fazerLogin() {
  const telefone = document.getElementById('loginTelefone').value.trim();
  const senha = document.getElementById('loginSenha').value.trim();
  if (!telefone || !senha) {
    showMsg('loginFeedback', 'Informe telefone e senha.', 'err');
    return;
  }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  document.getElementById('loginFeedback').innerHTML = '';

  try {
    const res = await apiPost({ action: 'login', telefone, senha });
    if (!res.success) {
      showMsg('loginFeedback', res.message || 'Falha no login.', 'err');
    } else {
      state.sessionToken = String(res.session_token || '');
      if (!state.sessionToken) throw new Error('Token de sessão ausente. Atualize o GAS.');
      localStorage.setItem('bolao_ameba_session_token', state.sessionToken);
      state.bolaoId = String(res.bolao_id || (res.bolaoAtual && res.bolaoAtual.bolao_id) || '');
      state.boloes = Array.isArray(res.boloes) ? res.boloes : [];
      state.user = {
        ...res.user,
        bolao_id: state.bolaoId || (res.user && res.user.bolao_id) || ''
      };
      state.configPix = res.configPix || state.configPix;
      localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));
      entrarNoApp();
    }
  } catch (err) {
    showMsg('loginFeedback', err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function fazerLogout() {
  if (typeof encerrarTour === 'function') encerrarTour();
  if (typeof fecharCameraAoVivo === 'function') fecharCameraAoVivo();
  if (typeof fecharModalEditarRodada === 'function') fecharModalEditarRodada();
  if (typeof fecharModalEditarPagamento === 'function') fecharModalEditarPagamento();
  fecharInfoModal();

  localStorage.removeItem('bolao_ameba_user');
  localStorage.removeItem('bolao_ameba_pending_invite');
  localStorage.removeItem('bolao_ameba_session_token');
  state.user = null;
  state.sessionToken = '';
  state.bolaoId = '';
  state.boloes = [];
  state.convitePendente = null;

  document.getElementById('appHeader').classList.add('hidden');
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('bottomNav').classList.add('hidden');
  document.getElementById('inviteSection').classList.add('hidden');
  document.getElementById('pendingSection').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
}

function entrarNoApp() {
  if (!state.user || !state.sessionToken) {
    fazerLogout();
    return;
  }

  const aprovados = (state.boloes || []).filter(b => String(b.status_membro || '').toUpperCase() === 'APROVADO');
  const bolaoSelecionadoValido = aprovados.some(b => String(b.bolao_id || '') === String(state.bolaoId || ''));
  if (!bolaoSelecionadoValido && aprovados.length) {
    const primeiroAtivo = aprovados.find(b => String(b.status || '').toUpperCase() === 'ATIVO');
    state.bolaoId = String((primeiroAtivo || aprovados[0]).bolao_id || '');
  }

  if (!state.bolaoId && state.boloes.length && state.boloes.some(b => String(b.status_membro || '').toUpperCase() === 'PENDENTE')) {
    const pend = state.boloes.find(b => String(b.status_membro || '').toUpperCase() === 'PENDENTE');
    state.convitePendente = state.convitePendente || {
      bolao_id: pend.bolao_id,
      nome: pend.nome,
      cor_tema: pend.cor_tema,
      status_membro: 'PENDENTE',
      bolao_anterior_id: ''
    };
    if (typeof exibirTelaPendente === 'function') exibirTelaPendente();
    return;
  }

  const bolao = obterBolaoAtivoLocal();
  state.user.bolao_id = state.bolaoId;
  state.user.perfil = (state.user.super_admin || String(bolao && bolao.papel || '').toLowerCase() === 'admin_bolao') ? 'admin' : 'user';
  localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));

  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('inviteSection').classList.add('hidden');
  document.getElementById('pendingSection').classList.add('hidden');
  document.getElementById('appHeader').classList.remove('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('bottomNav').classList.remove('hidden');

  document.getElementById('userNameTop').textContent = state.user.nome;
  atualizarBadgesEPermissoes();
  atualizarIdentidadeBolao();

  if (ONESIGNAL_APP_ID && !ONESIGNAL_APP_ID.includes('COLE_AQUI')) {
    window.OneSignalDeferred.push(async function(OneSignal) {
      try { await OneSignal.login('mega_' + state.user.id_usuario); } catch (_) {}
    });
  }

  trocarAba('tabPagar');
  carregarDashboard();
}

function trocarAba(tabId, btnEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.remove('hidden');

  const activeBtn = btnEl || document.querySelector(`.bottom-nav-btn[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const bannerMega = document.getElementById('cardUltimoResultado');
  if (bannerMega) {
    bannerMega.classList.toggle('hidden', tabId === 'tabTour');
  }

  state.abaAtual = tabId;
  if (!window.tourState || !window.tourState.ativo) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function carregarDashboard() {
  try {
    const res = await apiPost({ action: 'getDashboard' });
    if (!res.success) {
      if (res.code === 'UNAUTHORIZED') {
        const mensagem = res.message || 'Sua sessão expirou. Entre novamente.';
        fazerLogout();
        showMsg('loginFeedback', escapeHtml(mensagem), 'warn');
      }
      return;
    }

    state.usuarios = res.usuarios || [];
    state.rodadas = res.rodadas || [];
    state.participacoes = res.participacoes || [];
    state.resultados = res.resultados || [];
    state.devedoresAtuais = res.devedoresAtuais || [];
    state.rankingHistorico = res.rankingHistorico || [];
    state.configPix = res.configPix || state.configPix;
    if (Array.isArray(res.boloes) && res.boloes.length > 0) {
      state.boloes = res.boloes;
    }

    const eu = state.usuarios.find(u => u.id_usuario === state.user.id_usuario);
    if (eu) {
      state.user.nome_comprovante = eu.nome_comprovante || eu.nome;
      localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));
    }

    atualizarBadgesEPermissoes();
    atualizarIdentidadeBolao();
    aplicarConfigPixNaInterface();

    if (typeof renderUltimoResultado === 'function') renderUltimoResultado();
    if (typeof renderMinhasPendencias === 'function') renderMinhasPendencias();
    if (typeof renderJogosPorConcurso === 'function') renderJogosPorConcurso();
    if (typeof renderRodadas === 'function') renderRodadas();
    if (typeof popularFiltroMesesResumo === 'function') popularFiltroMesesResumo();
    if (typeof renderResumoMensal === 'function') renderResumoMensal();
    if (typeof renderRankings === 'function') renderRankings();
    if (typeof renderMinhasTransferencias === 'function') renderMinhasTransferencias();
    if (typeof renderCadastroUsuarios === 'function') renderCadastroUsuarios();

    if (usuarioEhAdminNoBolao()) {
      if (typeof renderAdminFormRodada === 'function') renderAdminFormRodada();
      if (typeof carregarPainelFase4 === 'function') carregarPainelFase4();
    }
  } catch (err) {
    alert('Erro ao carregar dados: ' + err.message);
  }
}
