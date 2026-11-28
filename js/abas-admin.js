// =========================================================================
// ADMIN & CADASTRO DE JOGOS v4 — MULTI-SELEÇÃO DE DEZENAS (01 A 60),
// VALOR BR (VÍRGULA/PONTO), AUTO-CARGA DE PARTICIPANTES E GESTÃO DE BOLÕES
// =========================================================================

// Converte entrada monetária com vírgula ou ponto ("72,00", "R$ 1.250,50", "72.00") em Number
function parseNumeroBR(valor) {
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  const limpo = String(valor || '').trim().replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!limpo) return 0;
  if (limpo.includes(',')) {
    const num = parseFloat(limpo.replace(/\./g, '').replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

function obterCotaPadraoUsuario_(u) {
  if (!u) return 1;
  const raw = u.cota_padrao;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const num = parseNumeroBR(raw);
    if (!isNaN(num) && num >= 0) return num;
  }
  return 1;
}


// =========================================================================
// ABERTURA / FECHAMENTO DO PAINEL "CADASTRAR JOGOS" (EM JOGOS & CONCURSOS)
// =========================================================================
async function abrirCadastroJogos() {
  if (!usuarioEhAdminNoBolao()) return;

  const card = document.getElementById('cardAdminRodada');
  if (!card) return;

  const estavaOculto = card.classList.contains('hidden');
  if (!Array.isArray(state.jogosBuilderNovo) || state.jogosBuilderNovo.length === 0) {
    state.jogosBuilderNovo = [[]];
  }

  card.classList.remove('hidden');
  renderAdminFormRodada(estavaOculto);
  renderJogosBuilder('novo');

  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 40);

  if (!Array.isArray(state.usuarios) || state.usuarios.length === 0) {
    await recarregarParticipantesCadastro();
  }
}

function fecharCadastroJogos() {
  if (typeof fecharSeletorDezena === 'function') fecharSeletorDezena();
  document.getElementById('cardAdminRodada')?.classList.add('hidden');
}

async function recarregarParticipantesCadastro() {
  const container = document.getElementById('listaParticipantesAdmin');
  if (container) {
    container.innerHTML = '<div class="muted">Carregando participantes do bolão...</div>';
  }
  try {
    if (state.bolaoId) {
      const resMembros = await apiPost({ action: 'listarMembrosBolao', bolao_id: state.bolaoId });
      if (resMembros && resMembros.success && Array.isArray(resMembros.membros)) {
        const aprovados = resMembros.membros
          .filter(m => String(m.status_membro || '').toUpperCase() === 'APROVADO')
          .map(m => ({
            id_usuario: m.id_usuario,
            nome: m.nome || 'Participante',
            papel_bolao: m.papel || 'participante',
            cota_padrao: obterCotaPadraoUsuario_(m)
          }));
        if (aprovados.length > 0) {
          state.usuarios = aprovados;
        }
      }
    }

    if ((!Array.isArray(state.usuarios) || state.usuarios.length === 0) && state.user) {
      state.usuarios = [{
        id_usuario: state.user.id_usuario,
        nome: state.user.nome || 'Administrador',
        papel_bolao: 'admin_bolao',
        cota_padrao: 1
      }];
    }
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="alert alert-err">Erro ao carregar participantes: ${escapeHtml(err.message || err)}</div>`;
    }
  }
  renderAdminFormRodada(true);
}

function aplicarCotasPadraoRodada() {
  renderAdminFormRodada(true);
}

function definirCotaTodosAdmin(valor) {
  const v = String(valor || '0');
  document.querySelectorAll('.select-cota-admin').forEach(s => {
    s.value = v;
  });
  recalcularPreviewRodada();
}

// =========================================================================
// CONSTRUTOR DE JOGOS + MODAL DE MULTI-SELEÇÃO (01 A 60 — 6 A 20 DEZENAS)
// =========================================================================
function obterListaJogosBuilder(modo) {
  if (modo === 'editar') {
    if (!Array.isArray(state.jogosBuilderEditar)) state.jogosBuilderEditar = [];
    return state.jogosBuilderEditar;
  }
  if (!Array.isArray(state.jogosBuilderNovo)) {
    state.jogosBuilderNovo = [[]];
  }
  return state.jogosBuilderNovo;
}

function normalizarDezenasJogo(arr) {
  const nums = [...new Set(
    (Array.isArray(arr) ? arr : [])
      .map(v => parseInt(String(v || '').replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 60)
  )].sort((a, b) => a - b).slice(0, 20);
  return nums.map(n => String(n).padStart(2, '0'));
}

function definirListaJogosBuilder(modo, lista) {
  const normalizada = Array.isArray(lista)
    ? lista.map(j => normalizarDezenasJogo(j))
    : [];

  if (modo === 'editar') {
    state.jogosBuilderEditar = normalizada;
  } else {
    state.jogosBuilderNovo = normalizada.length > 0 ? normalizada : [[]];
  }
}

function importarJogosNoBuilder(modo, jogosArrays, substituir = false) {
  const novos = (Array.isArray(jogosArrays) ? jogosArrays : [])
    .map(j => normalizarDezenasJogo(j))
    .filter(j => j.length > 0);

  if (substituir) {
    definirListaJogosBuilder(modo, novos);
  } else {
    const atuais = obterListaJogosBuilder(modo)
      .map(j => normalizarDezenasJogo(j))
      .filter(j => j.length > 0);
    definirListaJogosBuilder(modo, [...atuais, ...novos]);
  }
  renderJogosBuilder(modo);
}

function adicionarJogoBuilder(modo) {
  const lista = obterListaJogosBuilder(modo);
  lista.push([]);
  const novoIdx = lista.length - 1;
  renderJogosBuilder(modo);
  abrirSeletorDezena(modo, novoIdx, '');
}

function removerJogoBuilder(modo, jogoIdx) {
  const lista = obterListaJogosBuilder(modo);
  if (jogoIdx < 0 || jogoIdx >= lista.length) return;

  if (modo === 'novo' && lista.length === 1) {
    lista[0] = [];
  } else {
    lista.splice(jogoIdx, 1);
  }
  renderJogosBuilder(modo);
}

function limparJogoBuilder(modo, jogoIdx) {
  const lista = obterListaJogosBuilder(modo);
  if (!lista[jogoIdx]) return;
  lista[jogoIdx] = [];
  renderJogosBuilder(modo);
}

function renderJogosBuilder(modo) {
  const containerId = modo === 'editar' ? 'editJogosBuilderList' : 'jogosBuilderList';
  const container = document.getElementById(containerId);
  if (!container) return;

  const lista = obterListaJogosBuilder(modo);

  if (lista.length === 0) {
    container.innerHTML = `<div class="muted">Nenhum jogo adicionado. Toque em <strong>＋ Jogo</strong> para escolher dezenas.</div>`;
    sincronizarJogosBuilderParaTexto(modo);
    return;
  }

  container.innerHTML = lista.map((jogoRaw, jIdx) => {
    const jogo = normalizarDezenasJogo(jogoRaw);
    lista[jIdx] = jogo;
    const qtd = jogo.length;
    const statusBadge = qtd >= 6
      ? `<span class="badge badge-green">${qtd} dez.</span>`
      : (qtd > 0 ? `<span class="badge badge-amber">${qtd}/6 dez.</span>` : `<span class="badge badge-blue">Vazio</span>`);

    let corpoHtml;
    if (qtd === 0) {
      corpoHtml = `
        <button type="button" class="dezena-slot-empty-cta" onclick="abrirSeletorDezena('${modo}', ${jIdx}, '')">
          ＋ Toque para escolher as dezenas (01 a 60)
        </button>
      `;
    } else {
      const botoesDezenas = jogo.map(num => `
        <button type="button"
          class="dezena-slot-btn filled"
          onclick="abrirSeletorDezena('${modo}', ${jIdx}, '${escapeHtml(num)}')"
          title="Toque para editar as dezenas deste jogo">
          ${escapeHtml(num)}
        </button>
      `).join('');

      const btnMais = qtd < 20
        ? `<button type="button" class="dezena-slot-btn" onclick="abrirSeletorDezena('${modo}', ${jIdx}, '')" title="Adicionar ou editar dezenas">＋</button>`
        : '';

      corpoHtml = `<div class="dezena-slots-flex">${botoesDezenas}${btnMais}</div>`;
    }

    return `
      <div class="jogo-builder-card">
        <div class="jogo-builder-head">
          <div class="toolbar-inline" style="gap:6px;">
            <span class="jogo-builder-title">Jogo #${jIdx + 1}</span>
            ${statusBadge}
          </div>
          <div class="toolbar-inline" style="gap:6px;">
            <button type="button" class="btn-secondary icon-action-btn" onclick="abrirSeletorDezena('${modo}', ${jIdx}, '')">✏️ Dezenas</button>
            <button type="button" class="btn-secondary icon-action-btn" title="Limpar dezenas" onclick="limparJogoBuilder('${modo}', ${jIdx})">Limpar</button>
            <button type="button" class="btn-danger icon-action-btn" title="Remover jogo" onclick="removerJogoBuilder('${modo}', ${jIdx})">🗑️</button>
          </div>
        </div>
        ${corpoHtml}
      </div>
    `;
  }).join('');

  sincronizarJogosBuilderParaTexto(modo);
}

function extrairJogosDoBuilder(modo) {
  const lista = obterListaJogosBuilder(modo);
  const jogosValidos = [];
  const erros = [];

  lista.forEach((jogoRaw, idx) => {
    const nums = normalizarDezenasJogo(jogoRaw);
    if (nums.length === 0) return;

    if (nums.length < 6) {
      erros.push(`Jogo #${idx + 1}: tem ${nums.length} dezena(s) (mínimo 6).`);
    } else if (nums.length > 20) {
      erros.push(`Jogo #${idx + 1}: máximo de 20 dezenas.`);
    } else {
      jogosValidos.push(nums);
    }
  });

  return { jogosValidos, erros };
}

function sincronizarJogosBuilderParaTexto(modo) {
  const { jogosValidos, erros } = extrairJogosDoBuilder(modo);
  const taId = modo === 'editar' ? 'editRodadaJogosTexto' : 'rodadaJogosTexto';
  const infoId = modo === 'editar' ? 'editRodadaJogosInfo' : 'previewJogosInfo';

  const ta = document.getElementById(taId);
  if (ta) {
    ta.value = jogosValidos.map(j => j.join(' ')).join('\n');
  }

  const infoEl = document.getElementById(infoId);
  if (infoEl) {
    if (jogosValidos.length === 0 && erros.length === 0) {
      infoEl.innerHTML = 'Toque em um jogo acima para selecionar de 6 a 20 dezenas (01 a 60) ou use Foto / Câmera / Arquivo.';
    } else {
      let html = `<span style="color:#34d399;"><strong>${jogosValidos.length}</strong> jogo(s) completo(s)</span>`;
      if (erros.length > 0) {
        html += `<br/><span style="color:#fbbf24;">⚠️ ${erros.join(' | ')}</span>`;
      }
      infoEl.innerHTML = html;
    }
  }

  if (modo === 'editar') recalcularPreviewEdicaoRodada();
  else recalcularPreviewRodada();
}

// =========================================================================
// MODAL DE MULTI-SELEÇÃO DO JOGO INTEIRO (01 A 60)
// =========================================================================
function abrirSeletorDezena(modo, jogoIdx, focoValor = '') {
  const lista = obterListaJogosBuilder(modo);
  if (jogoIdx < 0 || jogoIdx >= lista.length) return;

  const selecionadas = normalizarDezenasJogo(lista[jogoIdx]);
  state.dezenaPickerAlvo = {
    modo,
    jogoIdx,
    selecionadas,
    focoValor: focoValor ? String(focoValor).padStart(2, '0') : ''
  };

  renderModalSeletorDezenas();
  document.getElementById('dezenaPickerModal')?.classList.remove('hidden');
}

function renderModalSeletorDezenas() {
  const alvo = state.dezenaPickerAlvo;
  if (!alvo) return;

  const ehResultado = alvo.modo === 'resultado';
  const maxDez = ehResultado ? 6 : 20;
  const selecionadas = normalizarDezenasJogo(alvo.selecionadas).slice(0, maxDez);
  alvo.selecionadas = selecionadas;
  const setSel = new Set(selecionadas);
  const qtd = selecionadas.length;

  const titleEl = document.getElementById('dezenaPickerTitle');
  const subEl = document.getElementById('dezenaPickerSub');
  const barEl = document.getElementById('dezenaPickerSelectedBar');
  const gridEl = document.getElementById('dezenaPickerGrid');
  const avisoEl = document.getElementById('dezenaPickerAviso');
  const btnOk = document.getElementById('btnConfirmarDezenasModal');

  if (titleEl) {
    titleEl.textContent = ehResultado
      ? `Resultado Oficial • Dezenas (${qtd}/6)`
      : `Jogo #${alvo.jogoIdx + 1} • Dezenas (${qtd})`;
  }
  if (subEl) {
    subEl.textContent = ehResultado
      ? 'Marque exatamente as 6 dezenas sorteadas (01 a 60)'
      : 'Toque nos números para marcar ou desmarcar (de 6 até 20 dezenas)';
  }

  if (barEl) {
    if (qtd === 0) {
      barEl.innerHTML = '<span class="muted" style="font-size:0.8rem;">Nenhuma dezena selecionada ainda</span>';
    } else {
      barEl.innerHTML = selecionadas.map(n => `
        <button type="button" class="dezena-selected-pill" onclick="alternarDezenaModal('${n}')" title="Toque para remover ${n}">
          ${n}
        </button>
      `).join('');
    }
  }

  if (gridEl) {
    let botoes = '';
    for (let n = 1; n <= 60; n++) {
      const numStr = String(n).padStart(2, '0');
      const isSelected = setSel.has(numStr);
      const isFocus = alvo.focoValor && alvo.focoValor === numStr;
      botoes += `
        <button type="button"
          class="dezena-cal-btn ${isSelected ? 'selected' : ''} ${isFocus ? 'active-focus' : ''}"
          onclick="alternarDezenaModal('${numStr}')">
          ${numStr}
        </button>
      `;
    }
    gridEl.innerHTML = botoes;
  }

  if (avisoEl) {
    if (ehResultado) {
      if (qtd < 6) {
        avisoEl.innerHTML = `<span style="color:#fbbf24;">Falta(m) <strong>${6 - qtd}</strong> dezena(s) para completar as 6 dezenas sorteadas.</span>`;
      } else {
        avisoEl.innerHTML = `<span style="color:#34d399;">✓ 6 dezenas selecionadas. Toque em <strong>Confirmar</strong>.</span>`;
      }
    } else if (qtd === 0) {
      avisoEl.innerHTML = 'Escolha 6 dezenas (jogo simples) ou mais dezenas (até 20).';
    } else if (qtd < 6) {
      avisoEl.innerHTML = `<span style="color:#fbbf24;">Falta(m) <strong>${6 - qtd}</strong> dezena(s) para completar um jogo mínimo de 6.</span>`;
    } else {
      avisoEl.innerHTML = `<span style="color:#34d399;">✓ Jogo de <strong>${qtd} dezenas</strong> pronto. Toque em <strong>Confirmar</strong>.</span>`;
    }
  }

  if (btnOk) {
    btnOk.disabled = ehResultado ? (qtd !== 6) : (qtd > 0 && qtd < 6);
    btnOk.textContent = qtd >= 6 ? `Confirmar (${qtd})` : 'Confirmar';
  }
}

function alternarDezenaModal(numStr) {
  const alvo = state.dezenaPickerAlvo;
  if (!alvo) return;
  const ehResultado = alvo.modo === 'resultado';
  const maxDez = ehResultado ? 6 : 20;
  const n = String(numStr).padStart(2, '0');
  const idx = alvo.selecionadas.indexOf(n);

  if (idx >= 0) {
    alvo.selecionadas.splice(idx, 1);
  } else {
    if (alvo.selecionadas.length >= maxDez) {
      const avisoEl = document.getElementById('dezenaPickerAviso');
      if (avisoEl) {
        avisoEl.innerHTML = ehResultado
          ? '<span style="color:#f87171;">Um resultado da Mega-Sena tem exatamente 6 dezenas. Desmarque uma para trocar.</span>'
          : '<span style="color:#f87171;">Limite máximo de 20 dezenas por jogo atingido.</span>';
      }
      return;
    }
    alvo.selecionadas.push(n);
  }

  alvo.focoValor = '';
  renderModalSeletorDezenas();
}

function confirmarDezenasSelecionadas() {
  const alvo = state.dezenaPickerAlvo;
  if (!alvo) return;

  const selecionadas = normalizarDezenasJogo(alvo.selecionadas);

  if (alvo.modo === 'resultado') {
    if (selecionadas.length !== 6) return;
    const inp = document.getElementById('editResDezenasTexto');
    if (inp) inp.value = selecionadas.join(' ');
    fecharSeletorDezena();
    sincronizarPreviewDezenasResultado();
    return;
  }

  if (selecionadas.length > 0 && selecionadas.length < 6) return;

  const lista = obterListaJogosBuilder(alvo.modo);
  lista[alvo.jogoIdx] = selecionadas;

  fecharSeletorDezena();
  renderJogosBuilder(alvo.modo);
}

function limparDezenaSelecionada() {
  const alvo = state.dezenaPickerAlvo;
  if (!alvo) return;
  alvo.selecionadas = [];
  alvo.focoValor = '';
  renderModalSeletorDezenas();
}

function fecharSeletorDezena() {
  document.getElementById('dezenaPickerModal')?.classList.add('hidden');
  state.dezenaPickerAlvo = null;
}

// =========================================================================
// FORMULÁRIO DE NOVO CONCURSO / CADASTRO DE JOGOS
// =========================================================================
function renderAdminFormRodada(forcarPadrao = false) {
  const container = document.getElementById('listaParticipantesAdmin');
  if (!container) return;

  const bolao = obterBolaoAtivoLocal();
  const badgeRodada = document.getElementById('adminRodadaBolaoBadge');
  if (badgeRodada) badgeRodada.textContent = bolao ? bolao.nome : '';

  const mapaSelecionadas = {};
  if (!forcarPadrao) {
    container.querySelectorAll('.select-cota-admin').forEach(s => {
      mapaSelecionadas[s.dataset.uid] = s.value;
    });
  }
  const temSelecaoAnterior = Object.keys(mapaSelecionadas).length > 0;

  if (!Array.isArray(state.usuarios) || state.usuarios.length === 0) {
    container.innerHTML = `
      <div class="alert alert-warn" style="margin-top:0;">
        Nenhum participante carregado para este bolão ainda.
        <button type="button" class="btn-secondary btn-sm" style="margin-left:8px;" onclick="recarregarParticipantesCadastro()">↻ Carregar participantes</button>
      </div>
    `;
    recalcularPreviewRodada();
    return;
  }

  container.innerHTML = state.usuarios.map(u => {
    const cotaPadrao = obterCotaPadraoUsuario_(u);
    const val = (!forcarPadrao && temSelecaoAnterior && mapaSelecionadas[u.id_usuario] !== undefined)
      ? mapaSelecionadas[u.id_usuario]
      : String(cotaPadrao);

    const opcoes = ['0', '0.5', '1', '1.5', '2', '2.5', '3'];
    if (!opcoes.includes(val)) opcoes.push(val);

    const labelPadrao = String(cotaPadrao).replace('.', ',');
    return `
      <div class="cota-row">
        <div>
          <strong>${escapeHtml(u.nome)}</strong>
          <div class="muted" style="font-size:0.74rem;">Cota padrão: ${labelPadrao}</div>
        </div>
        <select class="select-cota-admin" data-uid="${u.id_usuario}" data-nome="${escapeHtml(u.nome)}" onchange="recalcularPreviewRodada()">
          ${opcoes.map(op => {
            const lbl = op === '0.5' ? '0,5 (Meia)' : (op === '1' ? '1 (Inteira)' : op.replace('.', ','));
            return `<option value="${op}" ${val === op ? 'selected' : ''}>${lbl}</option>`;
          }).join('')}
        </select>
      </div>
    `;
  }).join('');

  recalcularPreviewRodada();
}

function recalcularPreviewRodada() {
  const selects = [...document.querySelectorAll('.select-cota-admin')];
  const valorTotal = parseNumeroBR(document.getElementById('rodadaValorTotal')?.value);
  const totalCotas = selects.reduce((acc, s) => acc + parseFloat(s.value || 0), 0);
  const ehInteiro = totalCotas > 0 && (Math.round(totalCotas * 100) % 100 === 0);

  const totalEl = document.getElementById('prevTotalCotas');
  const statusEl = document.getElementById('prevStatusCotas');
  const btn = document.getElementById('btnCriarRodada');
  const hintEl = document.getElementById('prevSalvarHint');
  if (!totalEl || !statusEl || !btn) return;

  totalEl.textContent = totalCotas.toString().replace('.', ',');

  let motivoBloqueio = '';
  if (totalCotas === 0) {
    statusEl.className = 'badge badge-red';
    statusEl.textContent = 'Sem cotas';
    motivoBloqueio = 'Configure a cota padrão dos membros em Admin → Bolões → Membros ou abra "Cotas desta rodada" abaixo.';
    btn.disabled = true;
  } else if (!ehInteiro) {
    statusEl.className = 'badge badge-amber';
    statusEl.textContent = 'Meia sem par';
    motivoBloqueio = 'A soma das cotas está fracionada. Ajuste em "Cotas desta rodada" (ou em Admin → Membros) para fechar um número inteiro.';
    btn.disabled = true;
  } else if (valorTotal <= 0) {
    statusEl.className = 'badge badge-amber';
    statusEl.textContent = 'Sem valor';
    motivoBloqueio = 'Informe o Valor Total gasto na rodada (ex.: 72,00) para liberar o botão Salvar Rodada.';
    btn.disabled = true;
  } else {
    statusEl.className = 'badge badge-green';
    statusEl.textContent = 'OK ✓';
    btn.disabled = false;
  }

  if (hintEl) {
    hintEl.innerHTML = motivoBloqueio
      ? `<span style="color:#fbbf24;">💡 ${motivoBloqueio}</span>`
      : '';
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

  const fotosWrap = document.getElementById('bilheteOcrFotosWrap');
  if (fotosWrap) {
    fotosWrap.innerHTML = '';
    fotosWrap.classList.add('hidden');
  }
  const chips = document.getElementById('bilheteOcrResumo');
  if (chips) {
    chips.innerHTML = '';
    chips.classList.add('hidden');
  }
  document.getElementById('detalhesBilheteBruto')?.classList.add('hidden');

  state.ocrFotosLidas = 0;
  state.ocrValorAcumulado = 0;
  state.ocrLogsAcumulados = [];
  state.jogosBuilderNovo = [[]];

  renderAdminFormRodada(true);
  renderJogosBuilder('novo');
  recalcularPreviewRodada();
}

function cancelarCadastroRodada() {
  const desc = document.getElementById('rodadaDescricao').value.trim();
  const conc = document.getElementById('rodadaConcurso').value.trim();
  const concFim = document.getElementById('rodadaConcursoFim').value.trim();
  const dataBil = document.getElementById('rodadaDataBilhete').value.trim();
  const val = document.getElementById('rodadaValorTotal').value.trim();
  const temDezena = obterListaJogosBuilder('novo').some(j => j.length > 0);

  if ((desc || conc || concFim || dataBil || val || temDezena || state.ocrFotosLidas > 0) && !confirm('Cancelar e limpar os campos desta rodada?')) {
    return;
  }

  limparFormularioRodada();
  document.getElementById('adminRodadaFeedback').innerHTML = '';
  fecharCadastroJogos();
}

async function criarNovaRodada() {
  let descricao = document.getElementById('rodadaDescricao').value.trim();
  const concursoIniRaw = document.getElementById('rodadaConcurso').value.trim();
  const concursoFimRaw = document.getElementById('rodadaConcursoFim').value.trim();
  const dataBilhete = document.getElementById('rodadaDataBilhete').value.trim();
  const valorTotal = parseNumeroBR(document.getElementById('rodadaValorTotal').value);

  const { jogosValidos, erros } = extrairJogosDoBuilder('novo');
  if (erros.length > 0) {
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
      ? `Rodada Conc. ${concursos[0]} a ${concursos[concursos.length - 1]}`
      : `Rodada Conc. ${concursos[0]}`;
  }

  const selects = [...document.querySelectorAll('.select-cota-admin')];
  const participantes = selects
    .map(s => ({ id_usuario: s.dataset.uid, nome_usuario: s.dataset.nome, fracao_cota: parseFloat(s.value) }))
    .filter(p => p.fracao_cota > 0);

  if (!descricao || valorTotal <= 0 || participantes.length === 0) {
    showMsg('adminRodadaFeedback', 'Preencha descrição, valor total e cotas dos participantes.', 'err');
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
    if (res.success) {
      limparFormularioRodada();
      fecharCadastroJogos();
      await carregarDashboard();
      alert(res.message || 'Rodada e jogos cadastrados com sucesso!');
    } else {
      showMsg('adminRodadaFeedback', res.message || 'Erro ao salvar rodada.', 'err');
    }
  } catch (err) {
    showMsg('adminRodadaFeedback', err.message, 'err');
  } finally {
    btn.textContent = 'Salvar Rodada';
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
              <div class="toolbar-inline" style="gap:6px;">
                <button type="button" class="btn-primary icon-action-btn" onclick="abrirModalAdicionarMembro('${idEnc}')">＋ Adicionar</button>
                <button type="button" class="btn-secondary icon-action-btn" onclick="carregarMembrosDoBolao(decodeURIComponent('${idEnc}'), true)" aria-label="Recarregar membros">↻</button>
              </div>
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
    const cotaNum = obterCotaPadraoUsuario_(m);
    const cotaStr = String(cotaNum);
    const opcoesCota = ['0', '0.5', '1', '1.5', '2', '2.5', '3'];
    if (!opcoesCota.includes(cotaStr)) opcoesCota.push(cotaStr);

    return `
      <div class="member-mini-item">
        <div class="admin-item-top">
          <div>
            <strong>${escapeHtml(m.nome || 'Participante')}</strong>
            <div class="admin-item-meta">${escapeHtml(m.telefone || '—')} • Cota padrão: <strong>${cotaStr.replace('.', ',')}</strong></div>
          </div>
          <span class="badge ${aprovado ? 'badge-green' : (status === 'PENDENTE' ? 'badge-amber' : 'badge-red')}">${escapeHtml(status)}</span>
        </div>
        ${podeEditar ? `
          <div class="toolbar-inline" style="margin-top:8px;">
            <select style="flex:1; min-width:118px; padding:7px 9px; font-size:0.82rem;" aria-label="Cota padrão de ${escapeHtml(m.nome)}" onchange="alterarCotaMembroNoBolao('${idEnc}','${uidEnc}',this.value)">
              ${opcoesCota.map(op => {
                const lbl = op === '0' ? 'Cota: 0' : (op === '0.5' ? 'Cota: 0,5' : `Cota: ${op.replace('.', ',')}`);
                return `<option value="${op}" ${cotaStr === op ? 'selected' : ''}>${lbl}</option>`;
              }).join('')}
            </select>
            <select style="flex:1; min-width:124px; padding:7px 9px; font-size:0.82rem;" aria-label="Papel de ${escapeHtml(m.nome)}" onchange="alterarPapelMembroNoBolao('${idEnc}','${uidEnc}',this.value)">
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

async function alterarCotaMembroNoBolao(bolaoIdEnc, uidEnc, cotaPadrao) {
  await executarGerenciamentoMembroNoBolao(bolaoIdEnc, uidEnc, 'cota', undefined, parseFloat(cotaPadrao));
}

async function alterarPapelMembroNoBolao(bolaoIdEnc, uidEnc, papel) {
  await executarGerenciamentoMembroNoBolao(bolaoIdEnc, uidEnc, 'papel', papel);
}

async function removerMembroNoBolao(bolaoIdEnc, uidEnc) {
  if (!confirm('Remover esta pessoa deste bolão?')) return;
  await executarGerenciamentoMembroNoBolao(bolaoIdEnc, uidEnc, 'remover');
}

async function executarGerenciamentoMembroNoBolao(bolaoIdEnc, uidEnc, acao, papel, cotaPadrao) {
  const bolaoId = decodeURIComponent(String(bolaoIdEnc || ''));
  try {
    const req = {
      action: 'gerenciarMembroBolao',
      bolao_id: bolaoId,
      id_usuario_alvo: decodeURIComponent(String(uidEnc || '')),
      acao
    };
    if (papel !== undefined) req.papel = papel;
    if (cotaPadrao !== undefined && !isNaN(cotaPadrao)) req.cota_padrao = cotaPadrao;

    const res = await apiPost(req);
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
// MODAIS DE EDIÇÃO ADMIN — CONCURSOS, JOGOS (MULTI-SELEÇÃO 01-60) E PAGAMENTOS
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
  document.getElementById('editRodadaValorTotal').value = Number(r.valor_total || 0).toFixed(2).replace('.', ',');
  document.getElementById('editRodadaStatus').value = String(r.status || 'ABERTA').toUpperCase();
  document.getElementById('editRodadaFeedback').innerHTML = '';

  const jogosExistentes = Array.isArray(r.jogos) ? r.jogos : [];
  importarJogosNoBuilder('editar', jogosExistentes, true);

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

  recalcularPreviewEdicaoRodada();
  document.getElementById('editRodadaModal').classList.remove('hidden');
}

function fecharModalEditarRodada() {
  fecharSeletorDezena();
  const modal = document.getElementById('editRodadaModal');
  if (modal) modal.classList.add('hidden');
}

function atualizarPreviewJogosEdicao() {
  sincronizarJogosBuilderParaTexto('editar');
}

function recalcularPreviewEdicaoRodada() {
  const selects = [...document.querySelectorAll('.select-cota-edit')];
  const valorTotal = parseNumeroBR(document.getElementById('editRodadaValorTotal')?.value);
  const totalCotas = selects.reduce((acc, s) => acc + parseFloat(s.value || 0), 0);
  const ehInteiro = totalCotas > 0 && (Math.round(totalCotas * 100) % 100 === 0);

  const totalEl = document.getElementById('editPrevTotalCotas');
  const statusEl = document.getElementById('editPrevStatusCotas');
  const btn = document.getElementById('btnSalvarEdicaoRodada');
  if (!totalEl || !statusEl || !btn) return;

  totalEl.textContent = totalCotas.toString().replace('.', ',');

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
  const valorTotal = parseNumeroBR(document.getElementById('editRodadaValorTotal').value);
  const status = document.getElementById('editRodadaStatus').value;

  const { jogosValidos, erros } = extrairJogosDoBuilder('editar');
  if (erros.length > 0) {
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
    if (!res.success) throw new Error(res.message || 'Erro ao salvar concurso.');
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
  if (!confirm('Excluir este concurso, seus jogos e todas as participações vinculadas? Esta ação não pode ser desfeita.')) return;
  try {
    const res = await apiPost({ action: 'excluirRodada', id_rodada: idRodada });
    if (!res.success) throw new Error(res.message || 'Erro ao excluir concurso.');
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
      fracao_cota: parseNumeroBR(document.getElementById('editPagFracao').value),
      valor_devido: parseNumeroBR(document.getElementById('editPagDevido').value),
      valor_pago: parseNumeroBR(document.getElementById('editPagPago').value),
      status: document.getElementById('editPagStatus').value,
      data_pagamento: document.getElementById('editPagData').value.trim(),
      estornar_comprovantes: document.getElementById('editPagEstornarDocs').checked
    });
    if (!res.success) throw new Error(res.message || 'Erro ao salvar pagamento.');
    fecharModalEditarPagamento();
    await carregarDashboard();
    atualizarModalPagamentosRodadaSeAberto();
  } catch (err) {
    showMsg('editPagFeedback', err.message || String(err), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

// =========================================================================
// MODAL ADICIONAR MEMBRO AO BOLÃO (USUÁRIO EXISTENTE OU NOVO CADASTRO)
// =========================================================================
let modoAdicionarMembroAtual = 'existente';

async function abrirModalAdicionarMembro(bolaoIdEnc) {
  if (!usuarioEhAdminNoBolao()) return;
  const bolaoId = decodeURIComponent(String(bolaoIdEnc || state.bolaoId || '')).trim();
  if (!bolaoId) return;

  const bolaoObj = (state.boloesAdmin || []).find(b => String(b.bolao_id) === bolaoId) || obterBolaoAtivoLocal();
  document.getElementById('addMembroBolaoId').value = bolaoId;
  const nomeEl = document.getElementById('addMembroBolaoNome');
  if (nomeEl) nomeEl.textContent = bolaoObj ? `Bolão: ${bolaoObj.nome}` : bolaoId;

  document.getElementById('addMembroNome').value = '';
  document.getElementById('addMembroTelefone').value = '';
  document.getElementById('addMembroSenha').value = '';
  document.getElementById('addMembroNomeComprovante').value = '';
  document.getElementById('addMembroPapel').value = 'participante';
  const cotaAddEl = document.getElementById('addMembroCota');
  if (cotaAddEl) cotaAddEl.value = '1';
  document.getElementById('feedbackAddMembroModal').innerHTML = '';

  const sel = document.getElementById('addMembroUsuarioSelect');
  const hint = document.getElementById('addMembroExistenteHint');
  if (sel) sel.innerHTML = '<option value="">Carregando usuários...</option>';
  if (hint) hint.textContent = '';

  trocarModoAdicionarMembro('existente');
  document.getElementById('adicionarMembroModal')?.classList.remove('hidden');

  try {
    const res = await apiPost({ action: 'listarUsuariosDisponiveisBolao', bolao_id: bolaoId });
    if (res && res.success && Array.isArray(res.usuarios)) {
      if (res.usuarios.length === 0) {
        if (sel) sel.innerHTML = '<option value="">Todos os usuários já estão neste bolão</option>';
        if (hint) hint.innerHTML = 'Nenhuma conta pendente de vínculo. Use a aba <strong>Novo Cadastro</strong> acima para criar uma pessoa nova.';
        trocarModoAdicionarMembro('novo');
      } else {
        if (sel) {
          sel.innerHTML = '<option value="">-- Escolha uma pessoa --</option>' +
            res.usuarios.map(u => {
              const statusTag = u.status_anterior ? ` [${u.status_anterior}]` : '';
              return `<option value="${escapeHtml(u.id_usuario)}">${escapeHtml(u.nome)} (${escapeHtml(u.telefone || u.id_usuario)})${escapeHtml(statusTag)}</option>`;
            }).join('');
        }
        if (hint) hint.textContent = `${res.usuarios.length} usuário(s) já cadastrado(s) disponível(is) para vincular imediatamente.`;
      }
    } else {
      throw new Error((res && res.message) || 'Não foi possível listar usuários cadastrados.');
    }
  } catch (err) {
    if (sel) sel.innerHTML = '<option value="">Indisponível (use Novo Cadastro)</option>';
    if (hint) hint.innerHTML = `<span style="color:#fbbf24;">${escapeHtml(err.message || err)}</span>`;
  }
}

function trocarModoAdicionarMembro(modo) {
  modoAdicionarMembroAtual = modo === 'novo' ? 'novo' : 'existente';
  const ehNovo = modoAdicionarMembroAtual === 'novo';

  document.getElementById('btnModoMembroExistente')?.classList.toggle('active', !ehNovo);
  document.getElementById('btnModoMembroNovo')?.classList.toggle('active', ehNovo);
  document.getElementById('blocoAddMembroExistente')?.classList.toggle('hidden', ehNovo);
  document.getElementById('blocoAddMembroNovo')?.classList.toggle('hidden', !ehNovo);
  const fb = document.getElementById('feedbackAddMembroModal');
  if (fb) fb.innerHTML = '';
}

function fecharModalAdicionarMembro() {
  document.getElementById('adicionarMembroModal')?.classList.add('hidden');
}

async function confirmarAdicionarMembroBolao() {
  const bolaoId = document.getElementById('addMembroBolaoId')?.value.trim() || state.bolaoId;
  const papel = document.getElementById('addMembroPapel')?.value || 'participante';
  const cotaVal = parseFloat(document.getElementById('addMembroCota')?.value);
  const cota_padrao = !isNaN(cotaVal) && cotaVal >= 0 ? cotaVal : 1;
  const payload = {
    action: 'adicionarMembroBolao',
    bolao_id: bolaoId,
    papel,
    cota_padrao
  };

  if (modoAdicionarMembroAtual === 'existente') {
    const idUsuarioAlvo = document.getElementById('addMembroUsuarioSelect')?.value.trim() || '';
    if (!idUsuarioAlvo) {
      showMsg('feedbackAddMembroModal', 'Selecione um usuário da lista ou mude para "Novo Cadastro".', 'err');
      return;
    }
    payload.id_usuario_alvo = idUsuarioAlvo;
  } else {
    const nome = document.getElementById('addMembroNome')?.value.trim() || '';
    const telefone = document.getElementById('addMembroTelefone')?.value.trim() || '';
    const senha = document.getElementById('addMembroSenha')?.value.trim() || '';
    const nomeComprovante = document.getElementById('addMembroNomeComprovante')?.value.trim() || '';

    if (nome.length < 2) {
      showMsg('feedbackAddMembroModal', 'Informe o nome completo do novo membro.', 'err');
      return;
    }
    if (telefone.replace(/\D/g, '').length < 10) {
      showMsg('feedbackAddMembroModal', 'Informe um telefone válido com DDD (10 ou 11 dígitos).', 'err');
      return;
    }
    if (senha.length < 4) {
      showMsg('feedbackAddMembroModal', 'Informe uma senha inicial com pelo menos 4 caracteres.', 'err');
      return;
    }
    payload.nome = nome;
    payload.telefone = telefone;
    payload.senha = senha;
    payload.nome_comprovante = nomeComprovante;
  }

  const btn = document.getElementById('btnConfirmarAddMembro');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adicionando...';
  }

  try {
    const res = await apiPost(payload);
    if (!res.success) throw new Error(res.message || 'Erro ao adicionar membro.');

    const idEnc = encodeURIComponent(bolaoId);
    fecharModalAdicionarMembro();
    showMsg('feedbackMembros_' + idEnc, `✅ ${escapeHtml(res.message || 'Membro adicionado com sucesso!')}`, 'ok');
    await carregarMembrosDoBolao(bolaoId, true);
    if (bolaoId === state.bolaoId) {
      await carregarDashboard();
    }
  } catch (err) {
    showMsg('feedbackAddMembroModal', err.message || String(err), 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Adicionar ao Bolão';
    }
  }
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    fecharModalAdicionarMembro();
  }
});


// =========================================================================
// MODAL DE PAGAMENTOS DA RODADA (ADMIN)
// =========================================================================
let rodadaPagamentosAbertaId = '';

function abrirModalPagamentosRodada(idRodada) {
  if (!usuarioEhAdminNoBolao()) return;
  const r = (state.rodadas || []).find(item => String(item.id_rodada) === String(idRodada));
  if (!r) return;

  rodadaPagamentosAbertaId = String(r.id_rodada);
  renderConteudoModalPagamentosRodada_(r);
  document.getElementById('pagamentosRodadaModal')?.classList.remove('hidden');
}

function renderConteudoModalPagamentosRodada_(r) {
  const titleEl = document.getElementById('pagRodadaModalTitle');
  const subEl = document.getElementById('pagRodadaModalSub');
  const bodyEl = document.getElementById('pagRodadaModalBody');
  if (!bodyEl) return;

  if (titleEl) titleEl.textContent = `💳 Pagamentos — ${r.descricao}`;
  if (subEl) {
    subEl.textContent = `Total: ${formatBRL(r.valor_total)} • ${r.total_cotas} cota(s) (${formatBRL(r.valor_cota)} por cota)`;
  }

  const parts = (state.participacoes || []).filter(p => String(p.id_rodada) === String(r.id_rodada));
  if (parts.length === 0) {
    bodyEl.innerHTML = '<div class="muted">Nenhuma participação registrada nesta rodada.</div>';
    return;
  }

  const linhas = parts.map(p => {
    const devido = parseNumeroBR(p.valor_devido);
    const pago = parseNumeroBR(p.valor_pago);
    const saldo = Math.max(0, Number((devido - pago).toFixed(2)));
    const badge = saldo <= 0
      ? `<span class="badge badge-green">PAGO</span>`
      : `<span class="badge badge-red">FALTA ${formatBRL(saldo)}</span>`;

    const links = Array.isArray(p.links_comprovantes) ? p.links_comprovantes : [];
    const celulaComp = links.length > 0
      ? links.map(url => `<a href="${url}" target="_blank" rel="noopener noreferrer" title="Ver comprovante" class="doc-link">📄</a>`).join('')
      : `<span class="muted">-</span>`;

    return `
      <tr>
        <td><strong>${escapeHtml(p.nome_usuario)}</strong></td>
        <td>${String(p.fracao_cota).replace('.', ',')}</td>
        <td>${formatBRL(devido)}</td>
        <td>${badge}</td>
        <td>${celulaComp}</td>
        <td>
          <div class="toolbar-inline" style="gap:4px;">
            ${saldo > 0 ? `<button type="button" class="btn-warning icon-action-btn" onclick="baixaManualAdmin('${escapeHtml(p.id_participacao)}','${escapeHtml(p.id_usuario)}',${saldo})">Baixa</button>` : ''}
            <button type="button" class="btn-secondary icon-action-btn" title="Editar pagamento" onclick="abrirModalEditarPagamento('${escapeHtml(p.id_participacao)}')">✏️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  bodyEl.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Membro</th><th>Cota</th><th>Devido</th><th>Status</th><th>Doc</th><th></th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}

function atualizarModalPagamentosRodadaSeAberto() {
  const modal = document.getElementById('pagamentosRodadaModal');
  if (!modal || modal.classList.contains('hidden') || !rodadaPagamentosAbertaId) return;
  const r = (state.rodadas || []).find(item => String(item.id_rodada) === String(rodadaPagamentosAbertaId));
  if (r) renderConteudoModalPagamentosRodada_(r);
  else fecharModalPagamentosRodada();
}

function fecharModalPagamentosRodada() {
  rodadaPagamentosAbertaId = '';
  document.getElementById('pagamentosRodadaModal')?.classList.add('hidden');
}

// =========================================================================
// MODAL DE EDIÇÃO / CADASTRO DE RESULTADO RETROATIVO DE CONCURSO (ADMIN)
// =========================================================================
function abrirModalEditarResultado(concursoPrefill) {
  if (!usuarioEhAdminNoBolao()) return;

  const manualInput = String(document.getElementById('inputConcursoManual')?.value || '').trim();
  let concAlvo = String(concursoPrefill || '').replace(/\D/g, '');
  if (!concAlvo && /^\d{3,5}$/.test(manualInput)) {
    concAlvo = manualInput;
  }

  renderChipsHistoricoResultados_(concAlvo);

  if (concAlvo) {
    carregarResultadoNoModal_(concAlvo);
  } else if (Array.isArray(state.resultados) && state.resultados.length > 0) {
    carregarResultadoNoModal_(state.resultados[0].concurso);
  } else {
    limparCamposModalResultado_('');
  }

  document.getElementById('editResFeedback').innerHTML = '';
  document.getElementById('editResultadoModal')?.classList.remove('hidden');
}

function renderChipsHistoricoResultados_(concursoAtivo) {
  const wrap = document.getElementById('editResHistoricoWrap');
  const listaEl = document.getElementById('editResHistoricoLista');
  if (!wrap || !listaEl) return;

  const lista = Array.isArray(state.resultados) ? state.resultados : [];
  if (lista.length === 0) {
    wrap.classList.add('hidden');
    listaEl.innerHTML = '';
    return;
  }

  wrap.classList.remove('hidden');
  listaEl.innerHTML = `<button type="button" class="pill-btn ${!concursoAtivo ? 'active' : ''}" onclick="limparCamposModalResultado_('')">＋ Novo</button>` +
    lista.slice(0, 30).map(r => {
      const ativo = String(r.concurso).trim() === String(concursoAtivo || '').trim();
      return `<button type="button" class="pill-btn ${ativo ? 'active' : ''}" onclick="carregarResultadoNoModal_('${escapeHtml(r.concurso)}')">Conc. ${escapeHtml(r.concurso)}</button>`;
    }).join('');
}

function limparCamposModalResultado_(numeroConcurso) {
  document.getElementById('editResConcurso').value = numeroConcurso || '';
  document.getElementById('editResDataApuracao').value = '';
  document.getElementById('editResDezenasTexto').value = '';
  document.getElementById('editResAcumulou').value = 'SIM';
  document.getElementById('editResValorProximo').value = '';
  document.getElementById('editResDataProximo').value = '';
  document.getElementById('editResFeedback').innerHTML = '';
  document.getElementById('btnExcluirResultado')?.classList.add('hidden');
  renderChipsHistoricoResultados_(numeroConcurso || '');
  sincronizarPreviewDezenasResultado();
}

function carregarResultadoNoModal_(concursoStr) {
  const alvo = String(concursoStr || '').replace(/\D/g, '');
  const existente = (state.resultados || []).find(r => String(r.concurso).trim() === alvo);

  if (!existente) {
    limparCamposModalResultado_(alvo);
    return;
  }

  document.getElementById('editResConcurso').value = existente.concurso || alvo;
  document.getElementById('editResDataApuracao').value = existente.data_apuracao || '';
  document.getElementById('editResDezenasTexto').value = Array.isArray(existente.dezenas) ? existente.dezenas.join(' ') : '';
  document.getElementById('editResAcumulou').value = existente.acumulou ? 'SIM' : 'NAO';
  document.getElementById('editResValorProximo').value = existente.valor_estimado_proximo > 0
    ? Number(existente.valor_estimado_proximo).toFixed(2).replace('.', ',')
    : '';
  document.getElementById('editResDataProximo').value = existente.data_proximo || '';
  document.getElementById('editResFeedback').innerHTML = '';
  document.getElementById('btnExcluirResultado')?.classList.remove('hidden');

  renderChipsHistoricoResultados_(alvo);
  sincronizarPreviewDezenasResultado();
}

function parseDezenasResultadoInput_() {
  const txt = document.getElementById('editResDezenasTexto')?.value || '';
  const nums = (txt.match(/\d+/g) || [])
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n) && n >= 1 && n <= 60);
  return [...new Set(nums)].sort((a, b) => a - b).map(n => String(n).padStart(2, '0'));
}

function sincronizarPreviewDezenasResultado() {
  const prev = document.getElementById('editResDezenasPreview');
  if (!prev) return;
  const dezenas = parseDezenasResultadoInput_();
  if (dezenas.length === 0) {
    prev.innerHTML = '<span class="muted" style="font-size:0.8rem;">Digite as 6 dezenas ou toque em "Escolher (01 a 60)"</span>';
    return;
  }
  prev.innerHTML = dezenas.map(d => `<span class="ball" style="width:34px; height:34px; font-size:0.86rem;">${d}</span>`).join('') +
    (dezenas.length !== 6 ? `<span class="badge badge-amber" style="margin-left:6px;">${dezenas.length}/6</span>` : `<span class="badge badge-green" style="margin-left:6px;">6 OK</span>`);
}

function abrirSeletorDezenasResultado() {
  const atuais = parseDezenasResultadoInput_().slice(0, 6);
  state.dezenaPickerAlvo = {
    modo: 'resultado',
    jogoIdx: 0,
    selecionadas: atuais,
    focoValor: ''
  };
  renderModalSeletorDezenas();
  document.getElementById('dezenaPickerModal')?.classList.remove('hidden');
}

function fecharModalEditarResultado() {
  fecharSeletorDezena();
  document.getElementById('editResultadoModal')?.classList.add('hidden');
}

async function salvarResultadoConcursoAdmin() {
  const concurso = String(document.getElementById('editResConcurso')?.value || '').replace(/\D/g, '');
  const data_apuracao = String(document.getElementById('editResDataApuracao')?.value || '').trim();
  const dezenas = parseDezenasResultadoInput_();
  const acumulou = document.getElementById('editResAcumulou')?.value || 'SIM';
  const valor_estimado_proximo = parseNumeroBR(document.getElementById('editResValorProximo')?.value);
  const data_proximo = String(document.getElementById('editResDataProximo')?.value || '').trim();

  if (!concurso || parseInt(concurso, 10) <= 0) {
    showMsg('editResFeedback', 'Informe o número do concurso.', 'err');
    return;
  }
  if (dezenas.length !== 6) {
    showMsg('editResFeedback', `Informe exatamente 6 dezenas válidas de 01 a 60 (atual: ${dezenas.length}).`, 'err');
    return;
  }

  const btn = document.getElementById('btnSalvarResultado');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando...';
  }

  try {
    const res = await apiPost({
      action: 'salvarResultadoConcurso',
      concurso,
      data_apuracao,
      dezenas,
      acumulou,
      valor_estimado_proximo,
      data_proximo
    });
    if (!res.success) throw new Error(res.message || 'Erro ao salvar resultado.');
    fecharModalEditarResultado();
    await carregarDashboard();
    alert(res.message || `Resultado do concurso ${concurso} salvo no histórico!`);
  } catch (err) {
    showMsg('editResFeedback', err.message || String(err), 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Salvar Resultado';
    }
  }
}

async function excluirResultadoConcursoAdmin() {
  const concurso = String(document.getElementById('editResConcurso')?.value || '').replace(/\D/g, '');
  if (!concurso) return;
  if (!confirm(`Excluir o resultado salvo do concurso ${concurso} do histórico?`)) return;

  try {
    const res = await apiPost({
      action: 'excluirResultadoConcurso',
      concurso
    });
    if (!res.success) throw new Error(res.message || 'Erro ao excluir resultado.');
    fecharModalEditarResultado();
    await carregarDashboard();
    alert(res.message || `Resultado do concurso ${concurso} removido.`);
  } catch (err) {
    showMsg('editResFeedback', err.message || String(err), 'err');
  }
}
