// =========================================================================
// FLUXO DE CONVITE (?convite=CODIGO), PRÉ-CADASTRO E TELA DE PENDENTE
// =========================================================================
function normalizarTelefoneConvite(telefone) {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }
  return digitos;
}

function obterCorConvite() {
  const cor = String((state.convite.bolao && state.convite.bolao.cor_tema) || '').trim();
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(cor)) return cor;
  return '#10b981';
}

function conviteEstaAtivo() {
  const valor = state.convite.bolao && state.convite.bolao.convite_ativo;
  return valor === true ||
    String(valor || '').trim().toUpperCase() === 'SIM' ||
    String(valor || '').trim().toUpperCase() === 'TRUE' ||
    String(valor || '').trim() === '1';
}

function ocultarTelasDoPortal() {
  ['loginSection', 'inviteSection', 'pendingSection', 'mainApp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  document.getElementById('appHeader').classList.add('hidden');
  document.getElementById('bottomNav').classList.add('hidden');
}

function exibirTelaConvite() {
  ocultarTelasDoPortal();
  document.getElementById('inviteSection').classList.remove('hidden');
  renderizarFluxoConvite();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exibirTelaPendente() {
  ocultarTelasDoPortal();
  document.getElementById('pendingSection').classList.remove('hidden');
  renderizarTelaPendente();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function iniciarFluxoConvite(codigo) {
  state.convite = {
    codigo: String(codigo || '').trim(),
    bolao: null,
    etapa: 'carregando',
    telefone: '',
    existe: null,
    primeiroNome: '',
    conviteAtivo: false,
    carregando: true,
    erro: '',
    bolaoAnteriorId: String(state.bolaoId || (state.user && state.user.bolao_id) || '')
  };
  exibirTelaConvite();
  return carregarDadosConvite();
}

async function carregarDadosConvite() {
  try {
    const resposta = await apiPost({
      action: 'validarConvite',
      codigo_convite: state.convite.codigo
    });

    if (!resposta || resposta.ok !== true || !resposta.bolao) {
      state.convite.etapa = 'invalido';
      state.convite.erro = (resposta && (resposta.error || resposta.message)) ||
        'Link de convite inválido ou expirado.';
      state.convite.carregando = false;
      renderizarFluxoConvite();
      return;
    }

    state.convite.bolao = resposta.bolao;
    state.convite.conviteAtivo = conviteEstaAtivo();
    state.convite.carregando = false;
    state.convite.etapa = state.user ? 'sessao' : 'telefone';
    renderizarFluxoConvite();
  } catch (err) {
    state.convite.etapa = 'erro';
    state.convite.erro = err.message || 'Não foi possível consultar este convite.';
    state.convite.carregando = false;
    renderizarFluxoConvite();
  }
}

function renderizarCabecalhoConvite() {
  const header = document.getElementById('inviteHeader');
  const bolao = state.convite.bolao;

  if (!bolao) {
    header.innerHTML = `
      <div class="invite-head">
        <div class="invite-head-row">
          <span class="invite-mark">🍀</span>
          <span class="invite-type">CONVITE</span>
        </div>
        <h1>Acesso por convite</h1>
      </div>`;
    return;
  }

  const cor = obterCorConvite();
  const tipo = String(bolao.tipo || 'FREQUENTE').toUpperCase();
  header.innerHTML = `
    <div class="invite-head" style="--invite-accent:${cor}">
      <div class="invite-head-row">
        <span class="invite-mark">🍀</span>
        <div class="toolbar-inline">
          <span class="invite-type">${escapeHtml(tipo === 'COMEMORATIVO' ? 'COMEMORATIVO' : 'FREQUENTE')}</span>
          <button type="button" class="info-btn" onclick="abrirInfoModal('convite_tela')" aria-label="Informações">i</button>
        </div>
      </div>
      <h1>${escapeHtml(bolao.nome || 'Bolão')}</h1>
    </div>`;
}

function renderizarFluxoConvite() {
  renderizarCabecalhoConvite();

  const content = document.getElementById('inviteFlowContent');
  const etapa = state.convite.etapa;
  const bolao = state.convite.bolao;
  const nomeBolao = bolao && bolao.nome ? bolao.nome : 'este bolão';
  const fechadoAviso = bolao && !conviteEstaAtivo()
    ? `<div class="invite-closed">Inscrições pausadas pelo administrador.</div>`
    : '';

  if (etapa === 'carregando') {
    content.innerHTML = `<h2>Verificando convite...</h2>`;
    return;
  }

  if (etapa === 'invalido') {
    content.innerHTML = `
      <h2>Link inválido</h2>
      <div class="alert alert-err">${escapeHtml(state.convite.erro || 'Convite inválido.')}</div>
      <div class="invite-actions">
        <button class="btn-secondary" onclick="voltarDoConvite()">Voltar</button>
      </div>`;
    return;
  }

  if (etapa === 'erro') {
    content.innerHTML = `
      <h2>Erro ao abrir convite</h2>
      <div class="alert alert-err">${escapeHtml(state.convite.erro || 'Erro no servidor.')}</div>
      <div class="invite-actions">
        <button class="btn-primary" onclick="carregarDadosConvite()">Tentar novamente</button>
        <button class="btn-secondary" onclick="voltarDoConvite()">Voltar</button>
      </div>`;
    return;
  }

  if (etapa === 'sessao') {
    const primeiroNome = String((state.user && state.user.nome) || 'participante').trim().split(/\s+/)[0];
    content.innerHTML = `
      ${fechadoAviso}
      <div class="invite-step"><span class="current">1</span> CONFIRMAÇÃO</div>
      <h2>Olá, ${escapeHtml(primeiroNome)}!</h2>
      <div class="invite-account-card">
        <strong>${escapeHtml(state.user && state.user.nome || 'Conta conectada')}</strong>
        <div class="muted">${escapeHtml(state.user && state.user.telefone || '')}</div>
      </div>
      <div id="inviteFeedback" class="invite-feedback"></div>
      <div class="invite-actions">
        <button class="btn-primary" onclick="solicitarEntradaComSessao()">Solicitar entrada</button>
        <button class="btn-secondary" onclick="usarOutroTelefoneNoConvite()">Outro telefone</button>
      </div>
      <div class="invite-actions">
        <button class="btn-secondary" onclick="voltarDoConvite()">Cancelar</button>
      </div>`;
    return;
  }

  if (etapa === 'telefone') {
    content.innerHTML = `
      ${fechadoAviso}
      <div class="invite-step"><span class="current">1</span> TELEFONE <span>2</span> CONTA <span>3</span> PEDIDO</div>
      <label for="inviteTelefone">Telefone com DDD</label>
      <input id="inviteTelefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="12999999999"
        value="${escapeHtml(state.convite.telefone || '')}"
        onkeydown="if(event.key==='Enter') verificarTelefoneDoConvite()" />
      <div id="inviteFeedback" class="invite-feedback"></div>
      <div class="invite-actions">
        <button id="btnVerificarTelefoneConvite" class="btn-primary" onclick="verificarTelefoneDoConvite()">Continuar</button>
        <button class="btn-secondary" onclick="voltarDoConvite()">Voltar</button>
      </div>`;
    return;
  }

  if (etapa === 'senha') {
    content.innerHTML = `
      ${fechadoAviso}
      <div class="invite-step"><span>1</span> TELEFONE <span class="current">2</span> SENHA <span>3</span> PEDIDO</div>
      <h2>Olá, ${escapeHtml(state.convite.primeiroNome || 'participante')}!</h2>
      <label for="inviteSenha">Senha atual</label>
      <input id="inviteSenha" type="password" autocomplete="current-password" placeholder="••••••"
        onkeydown="if(event.key==='Enter') solicitarEntradaContaExistente()" />
      <div id="inviteFeedback" class="invite-feedback"></div>
      <div class="invite-actions">
        <button id="btnSolicitarEntradaExistente" class="btn-primary" onclick="solicitarEntradaContaExistente()">Solicitar entrada</button>
        <button class="btn-secondary" onclick="voltarEtapaTelefoneConvite()">Voltar</button>
      </div>`;
    return;
  }

  if (etapa === 'cadastro') {
    content.innerHTML = `
      <div class="invite-step"><span>1</span> TELEFONE <span class="current">2</span> CADASTRO <span>3</span> PEDIDO</div>
      <h2>Nova conta</h2>
      <label for="inviteNome">Nome completo</label>
      <input id="inviteNome" type="text" autocomplete="name" maxlength="120" placeholder="Seu nome completo" />
      <label for="inviteNomeComprovante">Nome no comprovante (opcional)</label>
      <input id="inviteNomeComprovante" type="text" maxlength="120" placeholder="Como aparece no Pix" />
      <label for="inviteNovaSenha">Senha</label>
      <input id="inviteNovaSenha" type="password" autocomplete="new-password" minlength="4" placeholder="Mínimo 4 caracteres" />
      <label for="inviteConfirmarSenha">Confirmar senha</label>
      <input id="inviteConfirmarSenha" type="password" autocomplete="new-password" minlength="4" placeholder="Repita a senha"
        onkeydown="if(event.key==='Enter') criarContaESolicitarEntrada()" />
      <div id="inviteFeedback" class="invite-feedback"></div>
      <div class="invite-actions">
        <button id="btnCriarContaConvite" class="btn-primary" onclick="criarContaESolicitarEntrada()">Criar e solicitar</button>
        <button class="btn-secondary" onclick="voltarEtapaTelefoneConvite()">Voltar</button>
      </div>`;
    return;
  }

  if (etapa === 'fechado') {
    content.innerHTML = `
      <div class="invite-closed">Inscrições encerradas neste bolão.</div>
      <div class="invite-actions"><button class="btn-secondary" onclick="voltarDoConvite()">Voltar</button></div>`;
    return;
  }

  if (etapa === 'aprovado') {
    content.innerHTML = `
      <div class="invite-step"><span class="current">✓</span> APROVADO</div>
      <h2>${escapeHtml(nomeBolao)}</h2>
      <div class="invite-actions">
        <button class="btn-primary" onclick="entrarNoBolaoAprovado()">Entrar no bolão</button>
        <button class="btn-secondary" onclick="voltarDoConvite()">Voltar</button>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="invite-actions"><button class="btn-secondary" onclick="voltarDoConvite()">Voltar</button></div>`;
}

function mostrarErroConvite(mensagem, tipo) {
  const feedback = document.getElementById('inviteFeedback');
  if (!feedback) return;
  const classe = tipo === 'err' ? 'alert-err' : tipo === 'warn' ? 'alert-warn' : 'alert-ok';
  feedback.innerHTML = `<div class="alert ${classe}">${escapeHtml(mensagem || 'Ocorreu um erro.')}</div>`;
}

async function verificarTelefoneDoConvite() {
  const input = document.getElementById('inviteTelefone');
  const telefone = normalizarTelefoneConvite(input ? input.value : '');
  if (telefone.length !== 10 && telefone.length !== 11) {
    mostrarErroConvite('Informe um telefone válido com DDD (10 ou 11 dígitos).', 'err');
    return;
  }

  const btn = document.getElementById('btnVerificarTelefoneConvite');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verificando...';
  }

  try {
    const resposta = await apiPost({
      action: 'verificarTelefoneConvite',
      codigo_convite: state.convite.codigo,
      telefone
    });

    if (!resposta || resposta.ok !== true) {
      if (resposta && resposta.motivo === 'ENCERRADO') {
        state.convite.etapa = 'fechado';
        renderizarFluxoConvite();
      } else {
        mostrarErroConvite((resposta && (resposta.error || resposta.message)) || 'Telefone inválido.', 'err');
      }
      return;
    }

    state.convite.telefone = telefone;
    state.convite.existe = resposta.existe === true;
    state.convite.primeiroNome = resposta.primeiro_nome || '';

    if (state.convite.existe) {
      state.convite.etapa = 'senha';
    } else if (resposta.convite_ativo === false || !conviteEstaAtivo()) {
      state.convite.etapa = 'fechado';
    } else {
      state.convite.etapa = 'cadastro';
    }
    renderizarFluxoConvite();
  } catch (err) {
    mostrarErroConvite(err.message || 'Falha ao consultar o telefone.', 'err');
  } finally {
    const botaoAtual = document.getElementById('btnVerificarTelefoneConvite');
    if (botaoAtual) {
      botaoAtual.disabled = false;
      botaoAtual.textContent = 'Continuar';
    }
  }
}

async function solicitarEntradaContaExistente() {
  const senhaEl = document.getElementById('inviteSenha');
  const senha = senhaEl ? senhaEl.value : '';
  if (!senha) {
    mostrarErroConvite('Informe sua senha atual.', 'err');
    return;
  }

  const btn = document.getElementById('btnSolicitarEntradaExistente');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Validando...';
  }

  try {
    const resposta = await apiPost({
      action: 'solicitarEntradaConvite',
      codigo_convite: state.convite.codigo,
      telefone: state.convite.telefone,
      senha
    });
    processarRespostaSolicitacaoConvite(resposta);
  } catch (err) {
    mostrarErroConvite(err.message || 'Não foi possível enviar sua solicitação.', 'err');
  } finally {
    const botaoAtual = document.getElementById('btnSolicitarEntradaExistente');
    if (botaoAtual) {
      botaoAtual.disabled = false;
      botaoAtual.textContent = 'Solicitar entrada';
    }
  }
}

async function criarContaESolicitarEntrada() {
  const nome = String(document.getElementById('inviteNome')?.value || '').trim();
  const nomeComprovante = String(document.getElementById('inviteNomeComprovante')?.value || '').trim();
  const senha = String(document.getElementById('inviteNovaSenha')?.value || '');
  const confirmar = String(document.getElementById('inviteConfirmarSenha')?.value || '');

  if (nome.length < 3) {
    mostrarErroConvite('Informe seu nome completo (mínimo 3 caracteres).', 'err');
    return;
  }
  if (senha.length < 4) {
    mostrarErroConvite('Crie uma senha com pelo menos 4 caracteres.', 'err');
    return;
  }
  if (senha !== confirmar) {
    mostrarErroConvite('As senhas digitadas não conferem.', 'err');
    return;
  }

  const btn = document.getElementById('btnCriarContaConvite');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Criando...';
  }

  try {
    const resposta = await apiPost({
      action: 'solicitarEntradaConvite',
      codigo_convite: state.convite.codigo,
      telefone: state.convite.telefone,
      nome,
      nome_comprovante: nomeComprovante,
      senha
    });
    processarRespostaSolicitacaoConvite(resposta);
  } catch (err) {
    mostrarErroConvite(err.message || 'Não foi possível criar sua conta.', 'err');
  } finally {
    const botaoAtual = document.getElementById('btnCriarContaConvite');
    if (botaoAtual) {
      botaoAtual.disabled = false;
      botaoAtual.textContent = 'Criar e solicitar';
    }
  }
}

async function solicitarEntradaComSessao() {
  if (!state.user || !state.user.id_usuario) {
    state.convite.etapa = 'telefone';
    renderizarFluxoConvite();
    return;
  }

  try {
    const resposta = await apiPost({
      action: 'solicitarEntradaConvite',
      codigo_convite: state.convite.codigo,
      telefone: normalizarTelefoneConvite(state.user.telefone),
      sessao_ativa: true,
      session_token: state.sessionToken,
      id_usuario: state.user.id_usuario
    });
    processarRespostaSolicitacaoConvite(resposta);
  } catch (err) {
    mostrarErroConvite(err.message || 'Não foi possível confirmar sua entrada.', 'err');
  }
}

function processarRespostaSolicitacaoConvite(resposta) {
  if (!resposta || resposta.ok !== true) {
    mostrarErroConvite((resposta && (resposta.error || resposta.message)) || 'Não foi possível concluir.', 'err');
    return;
  }

  const bolao = resposta.bolao || state.convite.bolao || {};
  const bolaoId = String(resposta.bolao_id || bolao.bolao_id || '').trim();
  const usuario = resposta.user || state.user;

  if (resposta.session_token) {
    state.sessionToken = String(resposta.session_token);
    localStorage.setItem('bolao_ameba_session_token', state.sessionToken);
  }

  if (!usuario || !usuario.id_usuario) {
    mostrarErroConvite('Faça login novamente para continuar.', 'err');
    return;
  }

  const statusVinculo = String(resposta.status_membro || '').toUpperCase();
  const bolaoAnteriorId = String(state.convite.bolaoAnteriorId || (state.user && state.user.bolao_id) || state.bolaoId || '');

  state.user = {
    ...usuario,
    bolao_id: statusVinculo === 'PENDENTE' ? (bolaoAnteriorId || '') : (bolaoId || usuario.bolao_id || '')
  };
  state.boloes = Array.isArray(resposta.boloes) ? resposta.boloes : state.boloes;

  if (statusVinculo === 'PENDENTE') {
    state.bolaoId = bolaoAnteriorId;
    state.convitePendente = {
      codigo_convite: state.convite.codigo,
      bolao_id: bolaoId,
      bolao_anterior_id: bolaoAnteriorId,
      nome: bolao.nome || 'Bolão',
      cor_tema: bolao.cor_tema || obterCorConvite(),
      tipo: bolao.tipo || 'FREQUENTE',
      status_membro: 'PENDENTE'
    };
    localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));
    localStorage.setItem('bolao_ameba_pending_invite', JSON.stringify(state.convitePendente));
    exibirTelaPendente();
    return;
  }

  state.bolaoId = bolaoId || state.bolaoId || '';
  state.user.bolao_id = state.bolaoId;
  localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));

  if (statusVinculo === 'APROVADO') {
    localStorage.removeItem('bolao_ameba_pending_invite');
    state.convitePendente = null;
    state.convite.bolao = bolao;
    state.convite.etapa = 'aprovado';
    exibirTelaConvite();
    return;
  }

  mostrarErroConvite('Status de vínculo não reconhecido.', 'err');
}

function renderizarTelaPendente() {
  const target = document.getElementById('pendingContent');
  const pending = state.convitePendente || {};
  const nome = pending.nome || (state.convite.bolao && state.convite.bolao.nome) || 'Bolão';
  const cor = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(pending.cor_tema || '')) ? pending.cor_tema : '#f59e0b';
  const status = String(pending.status_membro || 'PENDENTE').toUpperCase();

  if (status === 'RECUSADO') {
    target.innerHTML = `
      <div class="pending-icon" style="background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.4)">✕</div>
      <h1>Solicitação recusada</h1>
      <div class="pending-bolao-name">${escapeHtml(nome)}</div>
      <div class="invite-actions">
        ${pending.bolao_anterior_id ? `<button class="btn-secondary" onclick="retornarAoBolaoAnterior()">Voltar ao meu bolão</button>` : ''}
        <button class="btn-secondary" onclick="fazerLogout()">Sair</button>
        <button class="btn-primary" onclick="abrirNovamenteConvitePendente()">Abrir convite</button>
      </div>`;
    return;
  }

  target.innerHTML = `
    <div class="pending-icon" style="background:color-mix(in srgb, ${cor} 18%, transparent);border-color:${cor}">⏳</div>
    <div class="card-title-row" style="justify-content:center;">
      <h1 style="margin:0;">Aguardando aprovação</h1>
      <button type="button" class="info-btn" onclick="abrirInfoModal('pendente_tela')" aria-label="Informações">i</button>
    </div>
    <div class="pending-bolao-name">${escapeHtml(nome)}</div>
    <div id="pendingFeedback" class="invite-feedback"></div>
    <div class="invite-actions">
      <button id="btnVerificarAprovacao" class="btn-primary" onclick="verificarAprovacaoPendente(false)">Verificar aprovação</button>
      ${pending.bolao_anterior_id ? `<button class="btn-secondary" onclick="retornarAoBolaoAnterior()">Voltar ao meu bolão</button>` : ''}
      <button class="btn-secondary" onclick="fazerLogout()">Sair</button>
    </div>`;
}

async function verificarAprovacaoPendente(silencioso) {
  if (!state.user || !state.user.id_usuario || !state.convitePendente) return;

  const btn = document.getElementById('btnVerificarAprovacao');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Consultando...';
  }

  try {
    const resposta = await apiPost({
      action: 'getMeusBoloes',
      id_usuario: state.user.id_usuario
    });

    if (!resposta || resposta.success !== true || !Array.isArray(resposta.boloes)) {
      const feedback = document.getElementById('pendingFeedback');
      if (feedback && !silencioso) {
        feedback.innerHTML = `<div class="alert alert-warn">${escapeHtml((resposta && resposta.message) || 'Erro ao consultar.')}</div>`;
      }
      return;
    }

    const vinculo = resposta.boloes.find(item =>
      String(item.bolao_id || '') === String(state.convitePendente.bolao_id || '')
    );
    if (!vinculo) return;

    const status = String(vinculo.status_membro || 'PENDENTE').toUpperCase();
    state.convitePendente.status_membro = status;
    state.convitePendente.nome = vinculo.nome || state.convitePendente.nome;
    state.convitePendente.cor_tema = vinculo.cor_tema || state.convitePendente.cor_tema;
    localStorage.setItem('bolao_ameba_pending_invite', JSON.stringify(state.convitePendente));

    if (status === 'APROVADO') {
      state.bolaoId = String(vinculo.bolao_id || state.convitePendente.bolao_id || '');
      state.user.bolao_id = state.bolaoId;
      state.boloes = resposta.boloes;
      localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));
      localStorage.removeItem('bolao_ameba_pending_invite');
      state.convitePendente = null;
      entrarNoApp();
      return;
    }

    renderizarTelaPendente();
    const feedback = document.getElementById('pendingFeedback');
    if (status !== 'RECUSADO' && feedback && !silencioso) {
      feedback.innerHTML = '<div class="alert alert-warn">Ainda pendente.</div>';
    }
  } catch (err) {
    const feedback = document.getElementById('pendingFeedback');
    if (feedback && !silencioso) {
      feedback.innerHTML = `<div class="alert alert-err">${escapeHtml(err.message || 'Erro ao consultar.')}</div>`;
    }
  } finally {
    const botaoAtual = document.getElementById('btnVerificarAprovacao');
    if (botaoAtual) {
      botaoAtual.disabled = false;
      botaoAtual.textContent = 'Verificar aprovação';
    }
  }
}

function voltarEtapaTelefoneConvite() {
  state.convite.etapa = 'telefone';
  state.convite.existe = null;
  state.convite.primeiroNome = '';
  renderizarFluxoConvite();
}

function usarOutroTelefoneNoConvite() {
  state.convite.telefone = '';
  state.convite.etapa = 'telefone';
  state.convite.existe = null;
  state.convite.primeiroNome = '';
  renderizarFluxoConvite();
}

function voltarDoConvite() {
  ocultarTelasDoPortal();
  if (state.user) entrarNoApp();
  else document.getElementById('loginSection').classList.remove('hidden');
}

function retornarAoBolaoAnterior() {
  const anterior = String((state.convitePendente && state.convitePendente.bolao_anterior_id) || '').trim();
  if (!anterior || !state.user) return;
  state.bolaoId = anterior;
  state.user.bolao_id = anterior;
  localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));
  entrarNoApp();
}

function abrirNovamenteConvitePendente() {
  const codigo = state.convitePendente && state.convitePendente.codigo_convite;
  if (!codigo) {
    fazerLogout();
    return;
  }
  window.location.href = `${window.location.pathname}?convite=${encodeURIComponent(codigo)}`;
}

function entrarNoBolaoAprovado() {
  if (!state.user || !state.user.id_usuario) {
    voltarDoConvite();
    return;
  }
  localStorage.removeItem('bolao_ameba_pending_invite');
  state.convitePendente = null;
  entrarNoApp();
}
