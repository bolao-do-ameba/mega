// =========================================================================
// ABA 6: ADMIN — NOVA RODADA, PENDENTES, GESTÃO UNIFICADA DE BOLÕES
// (CONFIG + PIX + CONVITE + MEMBROS DENTRO DE CADA BOLÃO) E MODAIS DE EDIÇÃO
// =========================================================================
function renderAdminFormRodada() {
  const container = document.getElementById('listaParticipantesAdmin');
  if (!container) return;

  const bolao = obterBolaoAtivoLocal();
  const badgeRodada = document.getElementById('adminRodadaBolaoBadge');
  if (badgeRodada) badgeRodada.textContent = bolao ? bolao.nome : '';

  container.innerHTML = state.usuarios.map(u => `
    <div class="cota-row">
      <div><strong>${escapeHtml(u.nome)}</strong></div>
      <select class="select-cota-admin" data-uid="${u.id_usuario}" data-nome="${escapeHtml(u.nome)}" onchange="recalcularPreviewRodada()">
        <option value="0">0</option>
        <option value="0.5">0,5 (Meia)</option>
        <option value="1">1 (Inteira)</option>
        <option value="1.5">1,5</option>
        <option value="2">2</option>
      </select>
    </div>
  `).join('');
  recalcularPreviewRodada();
}

function recalcularPreviewRodada() {
  const selects = [...document.querySelectorAll('.select-cota-admin')];
  const valorTotal = parseFloat(document.getElementById('rodadaValorTotal')?.value) || 0;
  const totalCotas = selects.reduce((acc, s) => acc + parseFloat(s.value || 0), 0);
  const ehInteiro = totalCotas > 0 && (Math.round(totalCotas * 100) % 100 === 0);

  document.getElementById('prevTotalCotas').textContent = totalCotas.toString().replace('.', ',');
  const statusEl = document.getElementById('prevStatusCotas');
  const btn = document.getElementById('btnCriarRodada');

  if (totalCotas === 0) {
    statusEl.className = 'badge badge-red';
    statusEl.textContent = 'Selecione';
    btn.disabled = true;
  } else if (!ehInteiro) {
    statusEl.className = 'badge badge-amber';
    statusEl.textContent = 'Meia sem par';
    btn.disabled = true;
  } else {
    statusEl.className = 'badge badge-green';
    statusEl.textContent = 'OK ✓';
    btn.disabled = valorTotal <= 0;
  }

  const valorCota = ehInteiro && valorTotal > 0 ? valorTotal / totalCotas : 0;
  document.getElementById('prevValorInteira').textContent = formatBRL(valorCota);
  document.getElementById('prevValorMeia').textContent = formatBRL(valorCota / 2);
}

function limparFormularioRodada() {
  document.getElementById('rodadaDescricao').value = '';
  document.getElementById('rodadaConcurso').value = '';
  document.getElementById('rodadaConcursoFim').value = '';
  document.getElementById('rodadaDataBilhete').value = '';
  document.getElementById('rodadaValorTotal').value = '';
  document.getElementById('rodadaJogosTexto').value = '';
  document.getElementById('previewIntervaloConcursos').innerHTML = '';
  document.getElementById('bilheteOcrFeedback').innerHTML = '';
  const chips = document.getElementById('bilheteOcrResumo');
  if (chips) {
    chips.innerHTML = '';
    chips.classList.add('hidden');
  }
  document.getElementById('detalhesBilheteBruto').classList.add('hidden');
  document.querySelectorAll('.select-cota-admin').forEach(s => { s.value = '0'; });
  atualizarPreviewJogos();
  recalcularPreviewRodada();
}

function cancelarCadastroRodada() {
  const desc = document.getElementById('rodadaDescricao').value.trim();
  const conc = document.getElementById('rodadaConcurso').value.trim();
  const concFim = document.getElementById('rodadaConcursoFim').value.trim();
  const dataBil = document.getElementById('rodadaDataBilhete').value.trim();
  const val = document.getElementById('rodadaValorTotal').value.trim();
  const jogos = document.getElementById('rodadaJogosTexto').value.trim();
  const temCota = [...document.querySelectorAll('.select-cota-admin')].some(s => parseFloat(s.value) > 0);

  if ((desc || conc || concFim || dataBil || val || jogos || temCota) && !confirm('Cancelar e limpar os campos desta rodada?')) {
    return;
  }

  limparFormularioRodada();
  document.getElementById('adminRodadaFeedback').innerHTML = '';
  if (typeof trocarVisaoJogosRodadas === 'function') trocarVisaoJogosRodadas('ambos');
  trocarAba('tabJogosRodadas');
}

async function criarNovaRodada() {
  let descricao = document.getElementById('rodadaDescricao').value.trim();
  const concursoIniRaw = document.getElementById('rodadaConcurso').value.trim();
  const concursoFimRaw = document.getElementById('rodadaConcursoFim').value.trim();
  const dataBilhete = document.getElementById('rodadaDataBilhete').value.trim();
  const valorTotal = parseFloat(document.getElementById('rodadaValorTotal').value);
  const jogosTexto = document.getElementById('rodadaJogosTexto').value.trim();
  const { jogosValidos, erros } = parsearJogosTexto(jogosTexto);

  if (jogosTexto && erros.length > 0) {
    showMsg('adminRodadaFeedback', 'Corrija os jogos: ' + erros.join(' | '), 'err');
    return;
  }

  const iniNum = parseInt(concursoIniRaw.replace(/\D/g, ''), 10);
  const fimNum = parseInt((concursoFimRaw || concursoIniRaw).replace(/\D/g, ''), 10);
  const concursos = [];

  if (!isNaN(iniNum) && iniNum > 0) {
    if (!isNaN(fimNum) && fimNum < iniNum) {
      showMsg('adminRodadaFeedback', `Concurso final (${fimNum}) não pode ser menor que o inicial (${iniNum}).`, 'err');
      return;
    }
    const fimFinal = !isNaN(fimNum) ? fimNum : iniNum;
    if ((fimFinal - iniNum + 1) > 50) {
      showMsg('adminRodadaFeedback', 'Intervalo de concursos muito grande (máximo 50).', 'err');
      return;
    }
    for (let c = iniNum; c <= fimFinal; c++) concursos.push(String(c));
  }

  if (!descricao && concursos.length > 0) {
    descricao = concursos.length > 1
      ? `Mega-Sena Conc. ${concursos[0]} a ${concursos[concursos.length - 1]}`
      : `Mega-Sena Conc. ${concursos[0]}`;
  }

  const selects = [...document.querySelectorAll('.select-cota-admin')];
  const participantes = selects
    .map(s => ({ id_usuario: s.dataset.uid, nome_usuario: s.dataset.nome, fracao_cota: parseFloat(s.value) }))
    .filter(p => p.fracao_cota > 0);

  if (!descricao || !valorTotal || participantes.length === 0) {
    showMsg('adminRodadaFeedback', 'Preencha descrição, valor total e participantes.', 'err');
    return;
  }

  const btn = document.getElementById('btnCriarRodada');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const res = await apiPost({
      action: 'criarRodada',
      adminId: state.user.id_usuario,
      descricao,
      valorTotal,
      concurso: concursos[0] || '',
      concurso_inicio: concursos[0] || '',
      concurso_fim: concursos.length ? concursos[concursos.length - 1] : '',
      concursos,
      data_bilhete: dataBilhete,
      jogos: jogosValidos,
      participantes
    });
    showMsg('adminRodadaFeedback', res.message, res.success ? 'ok' : 'err');
    if (res.success) {
      limparFormularioRodada();
      await carregarDashboard();
    }
  } catch (err) {
    showMsg('adminRodadaFeedback', err.message, 'err');
  } finally {
    btn.textContent = 'Lançar Rodada';
    recalcularPreviewRodada();
  }
}

// =========================================================================
// PAINEL ADMINISTRATIVO UNIFICADO (PENDENTES + LISTA ÚNICA DE BOLÕES)
// =========================================================================
async function carregarPainelFase4() {
  if (!usuarioEhAdminNoBolao() || !state.bolaoId) return;
  document.getElementById('btnAbrirModalCriarBolao')?.classList.toggle('hidden', !usuarioEhSuperAdmin());
  await Promise.all([
    carregarSolicitacoesPendentes(),
    carregarBoloesAdmin()
  ]);
}

async function carregarSolicitacoesPendentes() {
  const alvo = document.getElementById('listaSolicitacoesPendentes');
  if (!state.bolaoId || !usuarioEhAdminNoBolao()) return;
  if (alvo) alvo.innerHTML = '<div class="muted">Carregando...</div>';
  try {
    const res = await apiPost({ action: 'listarPendentes', bolao_id: state.bolaoId });
    if (!res.success) throw new Error(res.message || 'Erro ao listar solicitações.');
    renderSolicitacoesPendentes(res.pendentes || []);
  } catch (err) {
    if (alvo) alvo.innerHTML = `<div class="alert alert-err">${escapeHtml(err.message || err)}</div>`;
  }
}

function renderSolicitacoesPendentes(lista) {
  const alvo = document.getElementById('listaSolicitacoesPendentes');
  const badge = document.getElementById('pendentesAdminBadge');
  if (badge) badge.textContent = String(lista.length);
  if (!alvo) return;
  if (!lista.length) {
    alvo.innerHTML = '<div class="muted">Nenhuma solicitação pendente.</div>';
    return;
  }
  alvo.innerHTML = lista.map(item => {
    const vinculo = encodeURIComponent(String(item.id_vinculo || ''));
    return `
      <div class="admin-item">
        <div class="admin-item-top">
          <div>
            <strong>${escapeHtml(item.nome || 'Participante')}</strong>
            <div class="admin-item-meta">${escapeHtml(item.telefone || '—')} • ${escapeHtml(item.data_solicitacao || '—')}</div>
          </div>
          <span class="badge badge-amber">PENDENTE</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn-primary btn-sm" onclick="decidirSolicitacaoAdmin('${vinculo}','APROVADO')">✓ Aprovar</button>
          <button class="btn-danger btn-sm" onclick="decidirSolicitacaoAdmin('${vinculo}','RECUSADO')">✕ Recusar</button>
        </div>
      </div>`;
  }).join('');
}

async function decidirSolicitacaoAdmin(idEncoded, decisao) {
  const idVinculo = decodeURIComponent(String(idEncoded || ''));
  if (decisao === 'RECUSADO' && !confirm('Confirma a recusa desta solicitação?')) return;
  const notificar = confirm('Enviar notificação Push ao participante?');
  try {
    const res = await apiPost({
      action: 'decidirSolicitacao',
      bolao_id: state.bolaoId,
      id_vinculo: idVinculo,
      decisao,
      notificar
    });
    if (!res.success) throw new Error(res.message || 'Erro ao processar.');
    showMsg('feedbackSolicitacoesAdmin', res.message || 'Atualizado.', 'ok');
    await carregarSolicitacoesPendentes();
    await carregarMembrosDoBolao(state.bolaoId, true);
  } catch (err) {
    showMsg('feedbackSolicitacoesAdmin', err.message || String(err), 'err');
  }
}

// =========================================================================
// MODAL DE CRIAR NOVO BOLÃO
// =========================================================================
function abrirModalCriarBolao() {
  if (!usuarioEhSuperAdmin()) return;
  ['novoBolaoNome', 'novoBolaoAdminTelefone', 'novoBolaoRecebedor', 'novoBolaoPix', 'novoBolaoPasta']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  const corEl = document.getElementById('novoBolaoCor');
  if (corEl) corEl.value = '#10b981';
  const fb = document.getElementById('feedbackCriarBolaoAdmin');
  if (fb) fb.innerHTML = '';
  document.getElementById('criarBolaoModal')?.classList.remove('hidden');
}

function fecharModalCriarBolao() {
  document.getElementById('criarBolaoModal')?.classList.add('hidden');
}

async function criarBolaoAdmin() {
  const payload = {
    action: 'criarBolao',
    nome: document.getElementById('novoBolaoNome').value.trim(),
    tipo: document.getElementById('novoBolaoTipo').value,
    cor_tema: normalizarHexCor6(document.getElementById('novoBolaoCor').value, '#10b981'),
    admin_telefone: document.getElementById('novoBolaoAdminTelefone').value.trim(),
    recebedor_nome: document.getElementById('novoBolaoRecebedor').value.trim(),
    chave_pix: document.getElementById('novoBolaoPix').value.trim(),
    pasta_drive: document.getElementById('novoBolaoPasta').value.trim()
  };

  const btn = document.getElementById('btnConfirmarCriarBolao');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Criando...';
  }

  try {
    const res = await apiPost(payload);
    if (!res.success) throw new Error(res.message || 'Erro ao criar bolão.');

    fecharModalCriarBolao();
    showMsg(
      'feedbackEditarBolaoAdmin',
      `✅ ${escapeHtml(res.message || 'Bolão criado.')} Código: <strong>${escapeHtml((res.bolao && res.bolao.codigo_convite) || '')}</strong>`,
      'ok'
    );
    await atualizarListaBoloesUsuario();
    await carregarBoloesAdmin();
  } catch (err) {
    showMsg('feedbackCriarBolaoAdmin', err.message || String(err), 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Criar bolão';
    }
  }
}

async function atualizarListaBoloesUsuario() {
  const res = await apiPost({ action: 'getMeusBoloes' });
  if (res && res.success && Array.isArray(res.boloes)) {
    state.boloes = res.boloes;
    atualizarIdentidadeBolao();
  }
}

// =========================================================================
// LISTA ÚNICA DE BOLÕES (COM CONFIG, PIX, CONVITE E MEMBROS DENTRO DE CADA UM)
// =========================================================================
function montarLinkConvitePorCodigo(codigo) {
  if (!codigo) return '';
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('convite', codigo);
  return url.toString();
}

async function carregarBoloesAdmin() {
  const alvo = document.getElementById('listaBoloesAdmin');
  if (!usuarioEhAdminNoBolao()) return;
  if (alvo) alvo.innerHTML = '<div class="muted">Carregando...</div>';

  try {
    let lista = [];
    const res = await apiPost({ action: 'listarBoloesAdmin' });

    if (res && res.success && Array.isArray(res.boloes)) {
      lista = res.boloes;
    } else {
      const meusAdmin = (state.boloes || []).filter(b =>
        String(b.status_membro || '').toUpperCase() === 'APROVADO' &&
        String(b.papel || '').toLowerCase() === 'admin_bolao'
      );
      const detalhes = await Promise.all(
        meusAdmin.map(b => apiPost({ action: 'obterConfigAdminBolao', bolao_id: b.bolao_id }).catch(() => null))
      );
      lista = detalhes.filter(d => d && d.success && d.bolao).map(d => d.bolao);
    }

    lista.sort((a, b) => {
      const aAtivo = String(a.bolao_id) === String(state.bolaoId) ? 0 : 1;
      const bAtivo = String(b.bolao_id) === String(state.bolaoId) ? 0 : 1;
      if (aAtivo !== bAtivo) return aAtivo - bAtivo;
      const aSt = String(a.status || 'ATIVO').toUpperCase() === 'ATIVO' ? 0 : 1;
      const bSt = String(b.status || 'ATIVO').toUpperCase() === 'ATIVO' ? 0 : 1;
      if (aSt !== bSt) return aSt - bSt;
      return String(a.nome || '').localeCompare(String(b.nome || ''));
    });

    state.boloesAdmin = lista;
    renderBoloesAdmin();

    if (lista.some(b => String(b.bolao_id) === String(state.bolaoId))) {
      await carregarMembrosDoBolao(state.bolaoId, true);
    } else if (lista.length > 0) {
      await carregarMembrosDoBolao(lista[0].bolao_id, true);
    }
  } catch (err) {
    if (alvo) alvo.innerHTML = `<div class="alert alert-err">${escapeHtml(err.message || err)}</div>`;
  }
}

function renderBoloesAdmin() {
  const alvo = document.getElementById('listaBoloesAdmin');
  if (!alvo) return;
  if (!state.boloesAdmin.length) {
    alvo.innerHTML = '<div class="muted">Nenhum bolão disponível para edição.</div>';
    return;
  }

  const isSuper = usuarioEhSuperAdmin();

  alvo.innerHTML = state.boloesAdmin.map((b, idx) => {
    const idEnc = encodeURIComponent(String(b.bolao_id || ''));
    const cor = normalizarHexCor6(b.cor_tema, '#10b981');
    const isAtual = String(b.bolao_id) === String(state.bolaoId);
    const iniciarAberto = isAtual || (idx === 0 && !state.boloesAdmin.some(x => String(x.bolao_id) === String(state.bolaoId)));
    const statusUpper = String(b.status || 'ATIVO').toUpperCase();
    const linkConvite = montarLinkConvitePorCodigo(b.codigo_convite);

    const badgeAtual = isAtual ? `<span class="badge badge-blue">ATUAL</span>` : '';
    const badgeStatus = `<span class="badge ${statusUpper === 'ATIVO' ? 'badge-green' : 'badge-amber'}">${escapeHtml(statusUpper)}</span>`;

    return `
      <details id="accordionBolao_${idEnc}" class="bolao-config-accordion" style="--card-accent:${escapeHtml(cor)}" ${iniciarAberto ? 'open' : ''} ontoggle="aoAlternarAcordeaoBolao(this, '${idEnc}')">
        <summary>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="concurso-chevron">▸</span>
            <strong>🍀 ${escapeHtml(b.nome)}</strong>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${badgeAtual}
            ${badgeStatus}
          </div>
        </summary>

        <div class="bolao-config-body">
          <div class="admin-form-grid">
            <div><label>Nome</label><input id="editBolaoNome_${idEnc}" value="${escapeHtml(b.nome)}" /></div>
            <div>
              <label>Tipo</label>
              <select id="editBolaoTipo_${idEnc}">
                <option value="FREQUENTE" ${String(b.tipo).toUpperCase() === 'FREQUENTE' ? 'selected' : ''}>Frequente</option>
                <option value="COMEMORATIVO" ${String(b.tipo).toUpperCase() === 'COMEMORATIVO' ? 'selected' : ''}>Comemorativo</option>
              </select>
            </div>
            <div>
              <label>Cor do Card</label>
              <input id="editBolaoCor_${idEnc}" type="color" value="${escapeHtml(cor)}" oninput="atualizarPreviewCorCardBolao('${idEnc}', this.value)" />
            </div>
            <div><label>Recebedor</label><input id="editBolaoRecebedor_${idEnc}" value="${escapeHtml(b.recebedor_nome || '')}" /></div>
            <div><label>Chave Pix</label><input id="editBolaoPix_${idEnc}" value="${escapeHtml(b.chave_pix || '')}" /></div>
            <div><label>Pasta Drive</label><input id="editBolaoPasta_${idEnc}" value="${escapeHtml(b.pasta_drive || '')}" /></div>
          </div>

          <div class="admin-item-actions">
            <button type="button" class="btn-primary btn-sm" onclick="salvarEdicaoBolaoAdmin('${idEnc}')">Salvar</button>
            ${!isAtual ? `<button type="button" class="btn-secondary btn-sm" onclick="trocarBolaoAtivo('${idEnc}', true)">Selecionar</button>` : ''}
            ${isSuper && statusUpper === 'ATIVO' ? `<button type="button" class="btn-danger btn-sm" onclick="arquivarBolaoAdmin('${idEnc}')">Arquivar</button>` : ''}
          </div>
          <div id="feedbackBolaoItem_${idEnc}"></div>

          <!-- CONVITE DESTE BOLÃO -->
          <div class="bolao-subbox">
            <div class="bolao-subbox-title">
              <span>🔗 Convite</span>
              <strong id="codigoConvite_${idEnc}" class="admin-code" style="font-size:0.8rem;">${escapeHtml(b.codigo_convite || '—')}</strong>
            </div>
            <div id="linkConvite_${idEnc}" class="admin-code" style="font-size:0.78rem;">${escapeHtml(linkConvite || 'Link indisponível')}</div>
            <div class="admin-item-actions">
              <button type="button" class="btn-primary btn-sm" onclick="copiarLinkConviteBolao('${idEnc}')">📋 Copiar</button>
              <button type="button" class="btn-secondary btn-sm" onclick="compartilharConviteBolaoWhatsApp('${idEnc}')">WhatsApp</button>
              <button type="button" class="btn-warning btn-sm" onclick="regenerarCodigoConviteBolao('${idEnc}')">Novo código</button>
            </div>
            <label class="admin-inline" style="margin-top:10px;">
              <input id="conviteAtivo_${idEnc}" type="checkbox" ${b.convite_ativo ? 'checked' : ''} onchange="alterarStatusConviteBolao('${idEnc}', this.checked)" />
              <span style="color:var(--text); font-size:0.84rem;">Aceitar novos participantes</span>
            </label>
            <div id="feedbackConvite_${idEnc}"></div>
          </div>

          <!-- MEMBROS DESTE BOLÃO -->
          <div class="bolao-subbox">
            <div class="bolao-subbox-title">
              <span>🧑‍🤝‍🧑 Membros <span id="qtdMembros_${idEnc}" class="badge badge-blue">...</span></span>
              <button type="button" class="btn-secondary icon-action-btn" onclick="carregarMembrosDoBolao(decodeURIComponent('${idEnc}'), true)">↻</button>
            </div>
            <div id="membrosBolaoLista_${idEnc}"><div class="muted">Carregando membros...</div></div>
            <div id="feedbackMembros_${idEnc}"></div>
          </div>

          <div class="admin-item-meta" style="margin-top:10px;">ID: ${escapeHtml(b.bolao_id)}</div>
        </div>
      </details>
    `;
  }).join('');
}

function atualizarPreviewCorCardBolao(idEnc, novaCor) {
  const cor = normalizarHexCor6(novaCor, '#10b981');
  const detailsEl = document.getElementById('accordionBolao_' + idEnc);
  if (detailsEl) detailsEl.style.setProperty('--card-accent', cor);
}

function aoAlternarAcordeaoBolao(detailsEl, idEnc) {
  if (!detailsEl || !detailsEl.open) return;
  const bolaoId = decodeURIComponent(String(idEnc || ''));
  if (!state.membrosPorBolao[bolaoId]) {
    carregarMembrosDoBolao(bolaoId, false);
  }
}

async function salvarEdicaoBolaoAdmin(idEncoded) {
  const id = decodeURIComponent(String(idEncoded || ''));
  const recebedor = document.getElementById('editBolaoRecebedor_' + idEncoded).value.trim();
  const chavePix = document.getElementById('editBolaoPix_' + idEncoded).value.trim();
  const pastaDrive = document.getElementById('editBolaoPasta_' + idEncoded).value.trim();
  const corTema = normalizarHexCor6(document.getElementById('editBolaoCor_' + idEncoded).value, '#10b981');

  try {
    const res = await apiPost({
      action: 'atualizarBolao',
      bolao_id: id,
      nome: document.getElementById('editBolaoNome_' + idEncoded).value.trim(),
      tipo: document.getElementById('editBolaoTipo_' + idEncoded).value,
      cor_tema: corTema,
      recebedor_nome: recebedor,
      chave_pix: chavePix,
      pasta_drive: pastaDrive
    });
    if (!res.success) throw new Error(res.message || 'Erro ao salvar.');

    if (id === state.bolaoId) {
      localStorage.removeItem('bolao_ameba_pix_override');
      state.configPix.NOME_RECEBEDOR = recebedor;
      state.configPix.CHAVE_PIX = chavePix;
      aplicarConfigPixNaInterface();
    }

    await atualizarListaBoloesUsuario();
    await carregarBoloesAdmin();
    showMsg('feedbackBolaoItem_' + idEncoded, `✅ ${res.message || 'Bolão atualizado.'}`, 'ok');
  } catch (err) {
    showMsg('feedbackBolaoItem_' + idEncoded, err.message || String(err), 'err');
  }
}

async function arquivarBolaoAdmin(idEncoded) {
  const id = decodeURIComponent(String(idEncoded || ''));
  if (!confirm('Arquivar este bolão? O convite será pausado.')) return;
  try {
    const res = await apiPost({ action: 'arquivarBolao', bolao_id: id });
    if (!res.success) throw new Error(res.message || 'Erro ao arquivar.');
    showMsg('feedbackEditarBolaoAdmin', res.message || 'Bolão arquivado.', 'ok');
    await atualizarListaBoloesUsuario();
    if (id === state.bolaoId) {
      const proximo = state.boloes.find(b => String(b.status_membro).toUpperCase() === 'APROVADO' && b.bolao_id !== id);
      if (proximo) {
        await trocarBolaoAtivo(encodeURIComponent(proximo.bolao_id), true);
        return;
      }
    }
    await carregarBoloesAdmin();
  } catch (err) {
    showMsg('feedbackEditarBolaoAdmin', err.message || String(err), 'err');
  }
}

// --- CONVITES POR BOLÃO ---
function obterBolaoAdminPorEncoded(idEnc) {
  const id = decodeURIComponent(String(idEnc || ''));
  return (state.boloesAdmin || []).find(b => String(b.bolao_id) === id) || null;
}

async function copiarLinkConviteBolao(idEnc) {
  const b = obterBolaoAdminPorEncoded(idEnc);
  const link = montarLinkConvitePorCodigo(b && b.codigo_convite);
  if (!link) return showMsg('feedbackConvite_' + idEnc, 'Código indisponível.', 'err');
  try {
    await navigator.clipboard.writeText(link);
    showMsg('feedbackConvite_' + idEnc, 'Link copiado.', 'ok');
  } catch (_) {
    window.prompt('Copie o link:', link);
  }
}

function compartilharConviteBolaoWhatsApp(idEnc) {
  const b = obterBolaoAdminPorEncoded(idEnc);
  const link = montarLinkConvitePorCodigo(b && b.codigo_convite);
  if (!link) return showMsg('feedbackConvite_' + idEnc, 'Código indisponível.', 'err');
  const texto = `Convite para ${(b && b.nome) || 'o bolão'}: ${link}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
}

async function atualizarConvitePorBolao(idEnc, payload, mensagemOk) {
  const bolaoId = decodeURIComponent(String(idEnc || ''));
  try {
    const res = await apiPost({ action: 'atualizarConviteBolao', bolao_id: bolaoId, ...payload });
    if (!res.success) throw new Error(res.message || 'Erro ao atualizar convite.');

    const b = obterBolaoAdminPorEncoded(idEnc);
    if (b && res.bolao) {
      b.codigo_convite = res.bolao.codigo_convite;
      b.convite_ativo = Boolean(res.bolao.convite_ativo);
    }
    const codEl = document.getElementById('codigoConvite_' + idEnc);
    const linkEl = document.getElementById('linkConvite_' + idEnc);
    const chkEl = document.getElementById('conviteAtivo_' + idEnc);
    if (codEl && b) codEl.textContent = b.codigo_convite || '—';
    if (linkEl && b) linkEl.textContent = montarLinkConvitePorCodigo(b.codigo_convite) || 'Indisponível';
    if (chkEl && b) chkEl.checked = Boolean(b.convite_ativo);

    showMsg('feedbackConvite_' + idEnc, mensagemOk || res.message || 'Atualizado.', 'ok');
  } catch (err) {
    showMsg('feedbackConvite_' + idEnc, err.message || String(err), 'err');
  }
}

async function alterarStatusConviteBolao(idEnc, ativo) {
  await atualizarConvitePorBolao(idEnc, { convite_ativo: Boolean(ativo) }, ativo ? 'Convite ativo.' : 'Convite pausado.');
}

async function regenerarCodigoConviteBolao(idEnc) {
  if (!confirm('Gerar um novo código? O link antigo deixará de funcionar.')) return;
  await atualizarConvitePorBolao(idEnc, { regenerar_codigo: true }, 'Novo código gerado.');
}

// --- MEMBROS DENTRO DE CADA BOLÃO ---
async function carregarMembrosDoBolao(bolaoId, forcar) {
  const id = String(bolaoId || '').trim();
  if (!id) return;
  const idEnc = encodeURIComponent(id);
  const listaEl = document.getElementById('membrosBolaoLista_' + idEnc);
  if (!forcar && state.membrosPorBolao[id] && listaEl) {
    renderMembrosDoBolao(id, state.membrosPorBolao[id]);
    return;
  }
  if (listaEl) listaEl.innerHTML = '<div class="muted">Carregando...</div>';
  try {
    const res = await apiPost({ action: 'listarMembrosBolao', bolao_id: id });
    if (!res.success) throw new Error(res.message || 'Erro ao listar membros.');
    state.membrosPorBolao[id] = res.membros || [];
    renderMembrosDoBolao(id, state.membrosPorBolao[id]);
  } catch (err) {
    if (listaEl) listaEl.innerHTML = `<div class="alert alert-err">${escapeHtml(err.message || err)}</div>`;
  }
}

function renderMembrosDoBolao(bolaoId, lista) {
  const idEnc = encodeURIComponent(String(bolaoId || ''));
  const alvo = document.getElementById('membrosBolaoLista_' + idEnc);
  const qtdBadge = document.getElementById('qtdMembros_' + idEnc);
  if (qtdBadge) qtdBadge.textContent = String(lista.length);
  if (!alvo) return;

  if (!lista.length) {
    alvo.innerHTML = '<div class="muted">Nenhum membro vinculado a este bolão.</div>';
    return;
  }

  alvo.innerHTML = lista.map(m => {
    const uidEnc = encodeURIComponent(String(m.id_usuario || ''));
    const status = String(m.status_membro || '').toUpperCase();
    const aprovado = status === 'APROVADO';
    const papel = String(m.papel || 'participante').toLowerCase();
    const podeEditar = aprovado && status !== 'REMOVIDO';

    return `
      <div class="member-mini-item">
        <div class="admin-item-top">
          <div>
            <strong>${escapeHtml(m.nome || 'Participante')}</strong>
            <div class="admin-item-meta">${escapeHtml(m.telefone || '—')}</div>
          </div>
          <span class="badge ${aprovado ? 'badge-green' : (status === 'PENDENTE' ? 'badge-amber' : 'badge-red')}">${escapeHtml(status)}</span>
        </div>
        ${podeEditar ? `
          <div class="toolbar-inline" style="margin-top:8px;">
            <select style="flex:1; min-width:140px; padding:7px 9px; font-size:0.84rem;" onchange="alterarPapelMembroNoBolao('${idEnc}','${uidEnc}',this.value)">
              <option value="participante" ${papel === 'participante' ? 'selected' : ''}>Participante</option>
              <option value="admin_bolao" ${papel === 'admin_bolao' ? 'selected' : ''}>Administrador</option>
            </select>
            <button type="button" class="btn-danger btn-sm" onclick="removerMembroNoBolao('${idEnc}','${uidEnc}')">Remover</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function alterarPapelMembroNoBolao(bolaoIdEnc, uidEnc, papel) {
  await executarGerenciamentoMembroNoBolao(bolaoIdEnc, uidEnc, 'papel', papel);
}

async function removerMembroNoBolao(bolaoIdEnc, uidEnc) {
  if (!confirm('Remover esta pessoa deste bolão?')) return;
  await executarGerenciamentoMembroNoBolao(bolaoIdEnc, uidEnc, 'remover');
}

async function executarGerenciamentoMembroNoBolao(bolaoIdEnc, uidEnc, acao, papel) {
  const bolaoId = decodeURIComponent(String(bolaoIdEnc || ''));
  try {
    const res = await apiPost({
      action: 'gerenciarMembroBolao',
      bolao_id: bolaoId,
      id_usuario_alvo: decodeURIComponent(String(uidEnc || '')),
      acao,
      papel
    });
    if (!res.success) throw new Error(res.message || 'Erro ao atualizar membro.');
    showMsg('feedbackMembros_' + bolaoIdEnc, res.message || 'Membro atualizado.', 'ok');
    await carregarMembrosDoBolao(bolaoId, true);
    if (bolaoId === state.bolaoId) await carregarDashboard();
  } catch (err) {
    showMsg('feedbackMembros_' + bolaoIdEnc, err.message || String(err), 'err');
    await carregarMembrosDoBolao(bolaoId, true);
  }
}

// =========================================================================
// MODAIS DE EDIÇÃO ADMIN — RODADAS, JOGOS E PAGAMENTOS
// =========================================================================
function abrirModalEditarRodada(idRodada) {
  if (!usuarioEhAdminNoBolao()) return;
  const r = state.rodadas.find(item => String(item.id_rodada) === String(idRodada));
  if (!r) return;

  const concursos = obterConcursosDaRodadaLocal(r);
  document.getElementById('editRodadaId').value = r.id_rodada;
  document.getElementById('editRodadaDescricao').value = r.descricao || '';
  document.getElementById('editRodadaConcurso').value = concursos[0] || r.concurso || '';
  document.getElementById('editRodadaConcursoFim').value = concursos.length ? concursos[concursos.length - 1] : (r.concurso_fim || '');
  document.getElementById('editRodadaDataBilhete').value = r.data_bilhete || '';
  document.getElementById('editRodadaValorTotal').value = Number(r.valor_total || 0).toFixed(2);
  document.getElementById('editRodadaStatus').value = String(r.status || 'ABERTA').toUpperCase();

  const jogosLinhas = Array.isArray(r.jogos) ? r.jogos.map(j => j.join(' ')).join('\n') : '';
  document.getElementById('editRodadaJogosTexto').value = jogosLinhas;
  document.getElementById('editRodadaFeedback').innerHTML = '';

  const partsDaRodada = state.participacoes.filter(p => String(p.id_rodada) === String(r.id_rodada));
  const mapaCotas = {};
  partsDaRodada.forEach(p => { mapaCotas[String(p.id_usuario)] = String(p.fracao_cota); });

  const usuariosCombinados = [...state.usuarios];
  const idsPresentes = new Set(usuariosCombinados.map(u => String(u.id_usuario)));
  partsDaRodada.forEach(p => {
    const uid = String(p.id_usuario);
    if (!idsPresentes.has(uid)) {
      idsPresentes.add(uid);
      usuariosCombinados.push({ id_usuario: uid, nome: p.nome_usuario || uid });
    }
  });

  const listaEl = document.getElementById('editRodadaParticipantesList');
  listaEl.innerHTML = usuariosCombinados.map(u => {
    const valAtual = mapaCotas[String(u.id_usuario)] || '0';
    const opcoes = ['0', '0.5', '1', '1.5', '2', '3'];
    if (!opcoes.includes(valAtual)) opcoes.push(valAtual);
    return `
      <div class="cota-row">
        <div><strong>${escapeHtml(u.nome)}</strong></div>
        <select class="select-cota-edit" data-uid="${escapeHtml(u.id_usuario)}" data-nome="${escapeHtml(u.nome)}" onchange="recalcularPreviewEdicaoRodada()">
          ${opcoes.map(op => `<option value="${op}" ${valAtual === op ? 'selected' : ''}>${op.replace('.', ',')}</option>`).join('')}
        </select>
      </div>
    `;
  }).join('');

  atualizarPreviewJogosEdicao();
  recalcularPreviewEdicaoRodada();
  document.getElementById('editRodadaModal').classList.remove('hidden');
}

function fecharModalEditarRodada() {
  const modal = document.getElementById('editRodadaModal');
  if (modal) modal.classList.add('hidden');
}

function atualizarPreviewJogosEdicao() {
  const txt = document.getElementById('editRodadaJogosTexto')?.value || '';
  const infoEl = document.getElementById('editRodadaJogosInfo');
  if (!infoEl) return;
  if (!txt.trim()) {
    infoEl.innerHTML = '0 jogos';
    return;
  }
  const { jogosValidos, erros } = parsearJogosTexto(txt);
  let html = `<span style="color:#34d399;"><strong>${jogosValidos.length}</strong> jogo(s) válido(s)</span>`;
  if (erros.length > 0) html += `<br/><span style="color:#fbbf24;">⚠️ ${erros.join(' | ')}</span>`;
  infoEl.innerHTML = html;
}

function recalcularPreviewEdicaoRodada() {
  const selects = [...document.querySelectorAll('.select-cota-edit')];
  const valorTotal = parseFloat(document.getElementById('editRodadaValorTotal')?.value) || 0;
  const totalCotas = selects.reduce((acc, s) => acc + parseFloat(s.value || 0), 0);
  const ehInteiro = totalCotas > 0 && (Math.round(totalCotas * 100) % 100 === 0);

  document.getElementById('editPrevTotalCotas').textContent = totalCotas.toString().replace('.', ',');
  const statusEl = document.getElementById('editPrevStatusCotas');
  const btn = document.getElementById('btnSalvarEdicaoRodada');

  if (totalCotas === 0) {
    statusEl.className = 'badge badge-red';
    statusEl.textContent = 'Selecione';
    btn.disabled = true;
  } else if (!ehInteiro) {
    statusEl.className = 'badge badge-amber';
    statusEl.textContent = 'Meia sem par';
    btn.disabled = true;
  } else {
    statusEl.className = 'badge badge-green';
    statusEl.textContent = 'OK ✓';
    btn.disabled = valorTotal <= 0;
  }

  const valorCota = ehInteiro && valorTotal > 0 ? valorTotal / totalCotas : 0;
  document.getElementById('editPrevValorInteira').textContent = formatBRL(valorCota);
  document.getElementById('editPrevValorMeia').textContent = formatBRL(valorCota / 2);
}

async function salvarEdicaoRodada() {
  const idRodada = document.getElementById('editRodadaId').value;
  const descricao = document.getElementById('editRodadaDescricao').value.trim();
  const concIniRaw = document.getElementById('editRodadaConcurso').value.trim();
  const concFimRaw = document.getElementById('editRodadaConcursoFim').value.trim();
  const dataBilhete = document.getElementById('editRodadaDataBilhete').value.trim();
  const valorTotal = parseFloat(document.getElementById('editRodadaValorTotal').value);
  const status = document.getElementById('editRodadaStatus').value;
  const jogosTexto = document.getElementById('editRodadaJogosTexto').value.trim();

  const { jogosValidos, erros } = parsearJogosTexto(jogosTexto);
  if (jogosTexto && erros.length > 0) {
    showMsg('editRodadaFeedback', 'Corrija os jogos: ' + erros.join(' | '), 'err');
    return;
  }

  const iniNum = parseInt(concIniRaw.replace(/\D/g, ''), 10);
  const fimNum = parseInt((concFimRaw || concIniRaw).replace(/\D/g, ''), 10);
  const concursos = [];
  if (!isNaN(iniNum) && iniNum > 0) {
    if (!isNaN(fimNum) && fimNum < iniNum) {
      showMsg('editRodadaFeedback', 'Concurso final menor que o inicial.', 'err');
      return;
    }
    const fimFinal = !isNaN(fimNum) ? fimNum : iniNum;
    if ((fimFinal - iniNum + 1) > 50) {
      showMsg('editRodadaFeedback', 'Intervalo de concursos muito grande (máximo 50).', 'err');
      return;
    }
    for (let c = iniNum; c <= fimFinal; c++) concursos.push(String(c));
  }

  const participantes = [...document.querySelectorAll('.select-cota-edit')]
    .map(s => ({ id_usuario: s.dataset.uid, nome_usuario: s.dataset.nome, fracao_cota: parseFloat(s.value) }))
    .filter(p => p.fracao_cota > 0);

  const btn = document.getElementById('btnSalvarEdicaoRodada');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const res = await apiPost({
      action: 'editarRodada',
      id_rodada: idRodada,
      descricao,
      valorTotal,
      status,
      concurso: concursos[0] || '',
      concurso_inicio: concursos[0] || '',
      concurso_fim: concursos.length ? concursos[concursos.length - 1] : '',
      concursos,
      data_bilhete: dataBilhete,
      jogos: jogosValidos,
      participantes
    });
    if (!res.success) throw new Error(res.message || 'Erro ao salvar rodada.');
    fecharModalEditarRodada();
    await carregarDashboard();
  } catch (err) {
    showMsg('editRodadaFeedback', err.message || String(err), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

async function excluirRodadaAdmin(idRodada) {
  if (!idRodada) return;
  if (!confirm('Excluir esta rodada, seus jogos e todas as participações vinculadas? Esta ação não pode ser desfeita.')) return;
  try {
    const res = await apiPost({ action: 'excluirRodada', id_rodada: idRodada });
    if (!res.success) throw new Error(res.message || 'Erro ao excluir rodada.');
    fecharModalEditarRodada();
    await carregarDashboard();
  } catch (err) {
    alert(err.message || String(err));
  }
}

function abrirModalEditarPagamento(idParticipacao) {
  if (!usuarioEhAdminNoBolao()) return;
  const p = state.participacoes.find(item => String(item.id_participacao) === String(idParticipacao));
  if (!p) return;
  const r = state.rodadas.find(item => String(item.id_rodada) === String(p.id_rodada));

  document.getElementById('editPagId').value = p.id_participacao;
  document.getElementById('editPagResumo').innerHTML =
    `<strong>${escapeHtml(p.nome_usuario)}</strong> • ${escapeHtml(r ? r.descricao : p.id_rodada)}`;
  document.getElementById('editPagFracao').value = Number(p.fracao_cota || 0);
  document.getElementById('editPagDevido').value = Number(p.valor_devido || 0).toFixed(2);
  document.getElementById('editPagPago').value = Number(p.valor_pago || 0).toFixed(2);
  document.getElementById('editPagStatus').value = 'AUTO';
  document.getElementById('editPagData').value = p.data_pagamento || '';
  document.getElementById('editPagEstornarDocs').checked = false;
  document.getElementById('editPagFeedback').innerHTML = '';

  document.getElementById('editPagamentoModal').classList.remove('hidden');
}

function fecharModalEditarPagamento() {
  const modal = document.getElementById('editPagamentoModal');
  if (modal) modal.classList.add('hidden');
}

async function salvarEdicaoPagamento() {
  const idPart = document.getElementById('editPagId').value;
  const btn = document.getElementById('btnSalvarEdicaoPag');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const res = await apiPost({
      action: 'editarParticipacao',
      id_participacao: idPart,
      fracao_cota: parseFloat(document.getElementById('editPagFracao').value) || 0,
      valor_devido: parseFloat(document.getElementById('editPagDevido').value) || 0,
      valor_pago: parseFloat(document.getElementById('editPagPago').value) || 0,
      status: document.getElementById('editPagStatus').value,
      data_pagamento: document.getElementById('editPagData').value.trim(),
      estornar_comprovantes: document.getElementById('editPagEstornarDocs').checked
    });
    if (!res.success) throw new Error(res.message || 'Erro ao salvar pagamento.');
    fecharModalEditarPagamento();
    await carregarDashboard();
  } catch (err) {
    showMsg('editPagFeedback', err.message || String(err), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}
