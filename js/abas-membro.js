// =========================================================================
// ABAS DO MEMBRO — RESULTADO, PAGAR, JOGOS & CONCURSOS UNIFICADOS,
// RESUMO MENSAL, RANKINGS E PERFIL (COM BOLÕES QUE PARTICIPO)
// =========================================================================

function conferirListaJogos(jogos, resultadoObj) {
  const setSorteadas = resultadoObj
    ? new Set((resultadoObj.dezenas || []).map(d => String(d).padStart(2, '0')))
    : null;

  let senas = 0;
  let quinas = 0;
  let quadras = 0;
  let maxAcertos = 0;

  const itens = jogos.map(dezenasRaw => {
    const dezenas = dezenasRaw.map(n => String(n).padStart(2, '0'));
    let acertos = 0;
    const bolinhasHtml = dezenas.map(num => {
      const acertou = Boolean(setSorteadas && setSorteadas.has(num));
      if (acertou) acertos += 1;
      return `<span class="ball ball-sm ${acertou ? 'ball-hit' : ''}">${num}</span>`;
    }).join('');

    let rowClass = '';
    let badgeStatus = `<span class="badge badge-blue">Aguardando</span>`;

    if (setSorteadas) {
      if (acertos > maxAcertos) maxAcertos = acertos;
      if (acertos >= 6) {
        senas += 1;
        rowClass = 'jogo-row-sena';
        badgeStatus = `<span class="badge badge-gold">🎉 SENA (6)</span>`;
      } else if (acertos === 5) {
        quinas += 1;
        rowClass = 'jogo-row-quina';
        badgeStatus = `<span class="badge badge-green">🏆 QUINA (5)</span>`;
      } else if (acertos === 4) {
        quadras += 1;
        rowClass = 'jogo-row-quadra';
        badgeStatus = `<span class="badge badge-amber">🍀 QUADRA (4)</span>`;
      } else {
        badgeStatus = `<span class="muted">${acertos} acerto(s)</span>`;
      }
    }

    return { dezenas, acertos, bolinhasHtml, rowClass, badgeStatus };
  });

  return { itens, senas, quinas, quadras, maxAcertos, conferido: Boolean(setSorteadas) };
}

// =========================================================================
// BANNER ÚLTIMO RESULTADO + BUSCA MANUAL (ÚNICO OU INTERVALO)
// =========================================================================
function renderUltimoResultado() {
  const el = document.getElementById('conteudoUltimoResultado');
  if (!el) return;
  if (!state.resultados || state.resultados.length === 0) {
    el.innerHTML = `<span class="muted">Sem resultados ainda.</span>`;
    return;
  }

  const ult = state.resultados[0];
  const bolinhas = ult.dezenas.map(d => `<span class="ball">${d}</span>`).join('');
  const badgeStatus = ult.acumulou
    ? `<span class="badge badge-amber">ACUMULOU</span>`
    : `<span class="badge badge-green">GANHADOR NA SENA</span>`;
  const proxInfo = ult.valor_estimado_proximo > 0
    ? `Próximo (${ult.data_proximo || '-'}): <strong>${formatBRL(ult.valor_estimado_proximo)}</strong>`
    : '';

  el.innerHTML = `
    <div class="row-between">
      <div><strong>Concurso ${ult.concurso}</strong> <span class="muted">(${ult.data_apuracao || '-'})</span> ${badgeStatus}</div>
      <div class="muted">${proxInfo}</div>
    </div>
    <div class="balls-wrap">${bolinhas}</div>
  `;
}

async function forcarBuscaResultado() {
  const btn = document.getElementById('btnBuscarMega');
  const concursoManual = document.getElementById('inputConcursoManual').value.trim();
  btn.disabled = true;
  btn.textContent = 'Buscando...';

  try {
    const res = await apiPost({
      action: 'buscarResultadoAgora',
      adminId: state.user.id_usuario,
      concurso: concursoManual
    });
    alert(res.message || 'Busca concluída.');
    if (res.success) {
      document.getElementById('inputConcursoManual').value = '';
      await carregarDashboard();
    }
  } catch (err) {
    alert('Erro ao buscar resultado: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Buscar';
  }
}

function copiarPix() {
  if (!state.configPix.CHAVE_PIX) return;
  navigator.clipboard.writeText(state.configPix.CHAVE_PIX).then(() => {
    alert('Chave Pix copiada!');
  });
}

// =========================================================================
// ABA 1: MINHAS PENDÊNCIAS
// =========================================================================
function renderMinhasPendencias() {
  const container = document.getElementById('listaMinhasPendencias');
  if (!container || !state.user) return;

  const minhas = state.participacoes.filter(p =>
    p.id_usuario === state.user.id_usuario &&
    Number(p.valor_devido) > Number(p.valor_pago || 0)
  );

  if (minhas.length === 0) {
    container.innerHTML = `<div class="alert alert-ok">Tudo em dia! 🎉</div>`;
    return;
  }

  container.innerHTML = minhas.map(p => {
    const rodada = state.rodadas.find(r => r.id_rodada === p.id_rodada);
    const saldo = Number((Number(p.valor_devido) - Number(p.valor_pago || 0)).toFixed(2));
    const dispConc = rodada ? obterDisplayConcursoRodada(rodada) : '';
    const extraConc = dispConc ? ` • Conc. ${escapeHtml(dispConc)}` : '';

    return `
      <div class="list-item row-between">
        <div>
          <strong>${rodada ? escapeHtml(rodada.descricao) : p.id_rodada}</strong>
          <div class="muted">Cota: ${p.fracao_cota} • Devido: ${formatBRL(p.valor_devido)} • Pago: ${formatBRL(p.valor_pago || 0)}${extraConc}</div>
        </div>
        <div class="toolbar-inline">
          <span class="badge badge-red">Falta ${formatBRL(saldo)}</span>
          <button class="btn-primary btn-sm" onclick="abrirLeitor('${p.id_participacao}')">Anexar</button>
        </div>
      </div>
    `;
  }).join('');
}

function irParaPagarParticipacao(idParticipacao) {
  trocarAba('tabPagar');
  setTimeout(() => abrirLeitor(idParticipacao), 80);
}

// =========================================================================
// ABA 2 (UNIFICADA): JOGOS POR CONCURSO + CONCURSOS & RATEIOS
// =========================================================================
function trocarVisaoJogosRodadas(visao, btnEl) {
  const modo = ['ambos', 'jogos', 'rodadas'].includes(visao) ? visao : 'ambos';
  state.visaoJogosRodadas = modo;

  document.querySelectorAll('#tabJogosRodadas .unified-top-bar .pill-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.visao === modo);
  });
  if (btnEl) btnEl.classList.add('active');

  document.getElementById('cardJogosConcursos')?.classList.toggle('hidden', modo === 'rodadas');
  document.getElementById('cardRodadas')?.classList.toggle('hidden', modo === 'jogos');
}

function alternarOrdemConcursos() {
  state.ordemConcursosDesc = !state.ordemConcursosDesc;
  document.getElementById('btnOrdemConcursos').textContent =
    state.ordemConcursosDesc ? '⇅ Maior → Menor' : '⇅ Menor → Maior';
  renderJogosPorConcurso();
}

function toggleTodosConcursos(expandir) {
  document.querySelectorAll('#listaJogosPorConcurso details.concurso-accordion').forEach(d => {
    d.open = expandir;
  });
}

function renderJogosPorConcurso() {
  const container = document.getElementById('listaJogosPorConcurso');
  if (!container) return;

  const isAdmin = usuarioEhAdminNoBolao();
  const grupos = {};

  state.rodadas.forEach(r => {
    const jogos = Array.isArray(r.jogos) ? r.jogos : [];
    if (jogos.length === 0) return;

    const concursosDaRodada = obterConcursosDaRodadaLocal(r);
    const alvos = concursosDaRodada.length > 0 ? concursosDaRodada : ['__SEM_CONCURSO__'];
    const concDisplay = obterDisplayConcursoRodada(r);

    alvos.forEach(conc => {
      if (!grupos[conc]) {
        grupos[conc] = {
          concurso: conc,
          num: conc === '__SEM_CONCURSO__' ? -1 : parseInt(conc, 10) || 0,
          itens: []
        };
      }
      jogos.forEach(dezenas => {
        grupos[conc].itens.push({
          idRodada: r.id_rodada,
          rodadaDescricao: r.descricao,
          dataBilhete: r.data_bilhete || '',
          concDisplay,
          ehTeimosinha: concursosDaRodada.length > 1,
          dezenas: dezenas.map(n => String(n).padStart(2, '0'))
        });
      });
    });
  });

  const listaGrupos = Object.values(grupos);
  if (listaGrupos.length === 0) {
    container.innerHTML = `<p class="muted">Nenhum jogo cadastrado.</p>`;
    return;
  }

  listaGrupos.sort((a, b) => {
    if (a.concurso === '__SEM_CONCURSO__') return 1;
    if (b.concurso === '__SEM_CONCURSO__') return -1;
    return state.ordemConcursosDesc ? (b.num - a.num) : (a.num - b.num);
  });

  container.innerHTML = listaGrupos.map((g, gIdx) => {
    const ehValido = g.concurso !== '__SEM_CONCURSO__';
    const resultado = ehValido
      ? state.resultados.find(res => String(res.concurso).trim() === g.concurso)
      : null;

    const conf = conferirListaJogos(g.itens.map(i => i.dezenas), resultado);

    const linhasHtml = conf.itens.map((c, idx) => {
      const meta = g.itens[idx];
      const badgeStatus = ehValido ? c.badgeStatus : `<span class="muted">Sem concurso</span>`;
      const tagBilhete = meta.dataBilhete ? ` • ${escapeHtml(meta.dataBilhete)}` : '';
      const tagTeim = meta.ehTeimosinha ? ` (${escapeHtml(meta.concDisplay)})` : '';
      const btnEditJogo = isAdmin
        ? `<button type="button" class="btn-secondary icon-action-btn" title="Editar jogos deste concurso" onclick="abrirModalEditarRodada('${escapeHtml(meta.idRodada)}')">✏️</button>`
        : '';

      return `
        <div class="jogo-row ${c.rowClass}">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="muted" style="min-width:44px; font-weight:700;">#${idx + 1}</span>
            ${c.bolinhasHtml}
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="muted" style="font-size:0.74rem;">${escapeHtml(meta.rodadaDescricao)}${tagTeim}${tagBilhete}</span>
            ${badgeStatus}
            ${btnEditJogo}
          </div>
        </div>
      `;
    }).join('');

    const badgesPremio = [];
    if (conf.senas > 0) badgesPremio.push(`<span class="badge badge-gold">🎉 ${conf.senas} SENA</span>`);
    if (conf.quinas > 0) badgesPremio.push(`<span class="badge badge-green">🏆 ${conf.quinas} QUINA</span>`);
    if (conf.quadras > 0) badgesPremio.push(`<span class="badge badge-amber">🍀 ${conf.quadras} QUADRA</span>`);
    if (conf.conferido && badgesPremio.length === 0) {
      badgesPremio.push(`<span class="badge badge-blue">Máx. ${conf.maxAcertos}</span>`);
    } else if (!conf.conferido) {
      badgesPremio.push(`<span class="badge badge-blue">${ehValido ? 'Aguardando' : 'Sem nº'}</span>`);
    }

    const tituloConcurso = ehValido ? `Concurso ${g.concurso}` : 'Sem concurso';
    const subResultado = resultado
      ? `
        <div style="margin:10px 0;">
          <div class="muted" style="margin-bottom:6px;">Sorteio ${resultado.concurso} (${resultado.data_apuracao || '-'})</div>
          <div class="balls-wrap" style="margin:0;">
            ${resultado.dezenas.map(d => `<span class="ball" style="width:32px; height:32px; font-size:0.84rem;">${d}</span>`).join('')}
          </div>
        </div>
      `
      : `<div class="muted" style="margin:10px 0;">${ehValido ? `Aguardando concurso ${g.concurso}.` : 'Sem concurso vinculado.'}</div>`;

    return `
      <details class="concurso-accordion" ${gIdx === 0 ? 'open' : ''}>
        <summary>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="concurso-chevron">▸</span>
            <strong>${tituloConcurso}</strong>
            <span class="muted">(${g.itens.length} jogo${g.itens.length > 1 ? 's' : ''})</span>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${badgesPremio.join('')}
          </div>
        </summary>
        <div class="concurso-body">
          ${subResultado}
          ${linhasHtml}
        </div>
      </details>
    `;
  }).join('');
}

function montarBlocoJogosConferencia(rodada) {
  const jogos = Array.isArray(rodada.jogos) ? rodada.jogos : [];
  if (jogos.length === 0) return '';

  const concursos = obterConcursosDaRodadaLocal(rodada);
  const resultadosDaRodada = concursos
    .map(c => state.resultados.find(res => String(res.concurso).trim() === c))
    .filter(Boolean);

  if (resultadosDaRodada.length === 0) {
    const conf = conferirListaJogos(jogos, null);
    const linhas = conf.itens.map((c, idx) => `
      <div class="jogo-row">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="muted" style="min-width:48px;">Jogo ${idx + 1}</span>
          ${c.bolinhasHtml}
        </div>
        <div><span class="badge badge-blue">Aguardando</span></div>
      </div>
    `).join('');

    const disp = obterDisplayConcursoRodada(rodada);
    const resumo = `🎱 ${jogos.length} jogo(s)${disp ? ` — Aguardando ${disp}` : ''}`;

    return `
      <details style="margin-top:10px; border-top:1px solid var(--border); padding-top:8px;">
        <summary>${resumo}</summary>
        <div style="margin-top:8px;">${linhas}</div>
      </details>
    `;
  }

  let totSenas = 0;
  let totQuinas = 0;
  let totQuadras = 0;
  let maxGeral = 0;

  const blocosPorConcurso = resultadosDaRodada.map(res => {
    const conf = conferirListaJogos(jogos, res);
    totSenas += conf.senas;
    totQuinas += conf.quinas;
    totQuadras += conf.quadras;
    if (conf.maxAcertos > maxGeral) maxGeral = conf.maxAcertos;

    const linhas = conf.itens.map((c, idx) => `
      <div class="jogo-row ${c.rowClass}">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="muted" style="min-width:48px;">Jogo ${idx + 1}</span>
          ${c.bolinhasHtml}
        </div>
        <div>${c.badgeStatus}</div>
      </div>
    `).join('');

    return `
      <div style="margin-top:10px;">
        <div class="muted" style="margin-bottom:6px;">
          Concurso <strong>${res.concurso}</strong> (${res.data_apuracao || '-'}): <strong>${res.dezenas.join(' - ')}</strong>
        </div>
        ${linhas}
      </div>
    `;
  }).join('');

  const pendentes = concursos.filter(c => !resultadosDaRodada.some(r => String(r.concurso).trim() === c));
  const avisoPendentes = pendentes.length > 0
    ? `<div class="muted" style="margin-top:8px;">Aguardando sorteio: ${pendentes.join(', ')}</div>`
    : '';

  let resumoTopo = `🎱 ${jogos.length} jogo(s)`;
  if (totSenas > 0) resumoTopo += ` — 🎉 ${totSenas} SENA(S)`;
  else if (totQuinas > 0) resumoTopo += ` — 🏆 ${totQuinas} QUINA(S)`;
  else if (totQuadras > 0) resumoTopo += ` — 🍀 ${totQuadras} QUADRA(S)`;
  else resumoTopo += ` — Máx. ${maxGeral} acerto(s)`;
  if (concursos.length > 1) resumoTopo += ` (${resultadosDaRodada.length}/${concursos.length} apurados)`;

  return `
    <details open style="margin-top:10px; border-top:1px solid var(--border); padding-top:8px;">
      <summary>${resumoTopo}</summary>
      ${blocosPorConcurso}
      ${avisoPendentes}
    </details>
  `;
}

function renderRodadas() {
  const container = document.getElementById('listaRodadas');
  if (!container) return;
  if (state.rodadas.length === 0) {
    container.innerHTML = `<p class="muted">Nenhum concurso cadastrado.</p>`;
    return;
  }

  const isAdmin = usuarioEhAdminNoBolao();

  container.innerHTML = state.rodadas.map(r => {
    const parts = state.participacoes.filter(p => p.id_rodada === r.id_rodada);
    const linhas = parts.map(p => {
      const saldo = Number((Number(p.valor_devido) - Number(p.valor_pago || 0)).toFixed(2));
      const badge = saldo <= 0
        ? `<span class="badge badge-green">PAGO</span>`
        : `<span class="badge badge-red">FALTA ${formatBRL(saldo)}</span>`;

      const links = Array.isArray(p.links_comprovantes) ? p.links_comprovantes : [];
      const celulaComp = links.length > 0
        ? links.map(url =>
            `<a href="${url}" target="_blank" rel="noopener noreferrer" title="Ver comprovante" class="doc-link">📄</a>`
          ).join('')
        : `<span class="muted">-</span>`;

      const acoesAdmin = isAdmin
        ? `<div class="toolbar-inline" style="gap:4px;">
            ${saldo > 0 ? `<button class="btn-warning icon-action-btn" onclick="baixaManualAdmin('${escapeHtml(p.id_participacao)}','${escapeHtml(p.id_usuario)}',${saldo})">Baixa</button>` : ''}
            <button class="btn-secondary icon-action-btn" title="Editar pagamento" onclick="abrirModalEditarPagamento('${escapeHtml(p.id_participacao)}')">✏️</button>
          </div>`
        : '';

      return `
        <tr>
          <td>${escapeHtml(p.nome_usuario)}</td>
          <td>${p.fracao_cota}</td>
          <td>${formatBRL(p.valor_devido)}</td>
          <td>${badge}</td>
          <td>${celulaComp}</td>
          <td>${acoesAdmin}</td>
        </tr>
      `;
    }).join('');

    const dispConc = obterDisplayConcursoRodada(r);
    const tagConcurso = dispConc ? `<span class="badge badge-blue">Conc. ${escapeHtml(dispConc)}</span>` : '';
    const tagDataBilhete = r.data_bilhete ? `<span class="badge badge-green">📅 ${escapeHtml(r.data_bilhete)}</span>` : '';
    const blocoJogos = montarBlocoJogosConferencia(r);

    const botoesRodadaAdmin = isAdmin
      ? `<div class="toolbar-inline" style="gap:6px;">
          <button type="button" class="btn-secondary btn-sm" onclick="abrirModalEditarRodada('${escapeHtml(r.id_rodada)}')">✏️ Editar</button>
          <button type="button" class="btn-danger btn-sm" onclick="excluirRodadaAdmin('${escapeHtml(r.id_rodada)}')" aria-label="Excluir concurso">🗑️</button>
        </div>`
      : '';

    return `
      <div class="list-item">
        <div class="row-between" style="margin-bottom:8px;">
          <div>
            <strong>${escapeHtml(r.descricao)}</strong> ${tagConcurso} ${tagDataBilhete}
            <div class="muted">${r.data_criacao} • ${formatBRL(r.valor_total)} • ${r.total_cotas} cota(s) (${formatBRL(r.valor_cota)})</div>
          </div>
          ${botoesRodadaAdmin}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Amigo</th><th>Cota</th><th>Valor</th><th>Status</th><th>Doc</th><th></th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        ${blocoJogos}
      </div>
    `;
  }).join('');
}

async function baixaManualAdmin(idParticipacao, idUsuario, saldo) {
  if (!confirm(`Confirmar baixa manual de ${formatBRL(saldo)}?`)) return;
  try {
    const res = await apiPost({
      action: 'registrarPagamento',
      id_participacao: idParticipacao,
      id_usuario: idUsuario,
      id_transacao: '',
      valor_pago: saldo,
      metodo: 'MANUAL'
    });
    alert(res.message);
    if (res.success) await carregarDashboard();
  } catch (err) {
    alert('Erro na baixa manual: ' + err.message);
  }
}

// =========================================================================
// ABA 3: RESUMO MENSAL & RANKINGS
// =========================================================================
function calcularDadosResumoMensal() {
  const mapaRodadaMes = {};
  const mesesMap = {};

  state.rodadas.forEach(r => {
    const infoMes = extrairChaveMes(r.data_bilhete || r.data_criacao);
    mapaRodadaMes[r.id_rodada] = infoMes;
    mesesMap[infoMes.key] = infoMes.label;
  });

  const atualPorUsuario = {};
  state.usuarios.forEach(u => {
    atualPorUsuario[u.id_usuario] = {
      id_usuario: u.id_usuario,
      nome: u.nome,
      consumo: 0,
      pago: 0,
      deve: 0
    };
  });

  const porMes = {};
  Object.keys(mesesMap).forEach(k => {
    porMes[k] = { key: k, label: mesesMap[k], usuarios: {} };
  });

  state.participacoes.forEach(p => {
    const uid = p.id_usuario;
    const nome = p.nome_usuario || (atualPorUsuario[uid] ? atualPorUsuario[uid].nome : uid);
    const devido = Number(p.valor_devido) || 0;
    const pago = Number(p.valor_pago) || 0;
    const saldo = Math.max(0, Number((devido - pago).toFixed(2)));

    if (!atualPorUsuario[uid]) {
      atualPorUsuario[uid] = { id_usuario: uid, nome, consumo: 0, pago: 0, deve: 0 };
    }
    atualPorUsuario[uid].consumo = Number((atualPorUsuario[uid].consumo + devido).toFixed(2));
    atualPorUsuario[uid].pago = Number((atualPorUsuario[uid].pago + pago).toFixed(2));
    atualPorUsuario[uid].deve = Number((atualPorUsuario[uid].deve + saldo).toFixed(2));

    const infoMes = mapaRodadaMes[p.id_rodada] || { key: '0000-00', label: 'Sem data' };
    if (!porMes[infoMes.key]) {
      porMes[infoMes.key] = { key: infoMes.key, label: infoMes.label, usuarios: {} };
    }
    if (!porMes[infoMes.key].usuarios[uid]) {
      porMes[infoMes.key].usuarios[uid] = { id_usuario: uid, nome, consumo: 0, pago: 0, deve: 0 };
    }
    porMes[infoMes.key].usuarios[uid].consumo = Number((porMes[infoMes.key].usuarios[uid].consumo + devido).toFixed(2));
    porMes[infoMes.key].usuarios[uid].pago = Number((porMes[infoMes.key].usuarios[uid].pago + pago).toFixed(2));
    porMes[infoMes.key].usuarios[uid].deve = Number((porMes[infoMes.key].usuarios[uid].deve + saldo).toFixed(2));
  });

  const mesesOrdenados = Object.values(porMes).sort((a, b) => b.key.localeCompare(a.key));
  return {
    atual: Object.values(atualPorUsuario).sort((a, b) => (b.deve - a.deve) || (b.consumo - a.consumo)),
    meses: mesesOrdenados
  };
}

function popularFiltroMesesResumo() {
  const sel = document.getElementById('filtroMesResumo');
  if (!sel) return;
  const valorAtual = sel.value || '__TODOS__';
  const { meses } = calcularDadosResumoMensal();

  let options = `
    <option value="__TODOS__">Todos (Atual + Meses)</option>
    <option value="__ATUAL__">Situação Atual</option>
  `;
  meses.forEach(m => {
    options += `<option value="${m.key}">${m.label}</option>`;
  });

  sel.innerHTML = options;
  sel.value = [...sel.options].some(o => o.value === valorAtual) ? valorAtual : '__TODOS__';
}

function badgeStatusFinanceiro(consumo, pago, deve) {
  if (deve <= 0) {
    return consumo > 0
      ? `<span class="badge badge-green">EM DIA</span>`
      : `<span class="badge badge-blue">SEM GASTOS</span>`;
  }
  if (pago > 0) return `<span class="badge badge-amber">PARCIAL</span>`;
  return `<span class="badge badge-red">PENDENTE</span>`;
}

function renderResumoMensal() {
  const tbody = document.getElementById('tabelaResumoBody');
  const kpiEl = document.getElementById('resumoKpiStrip');
  const sel = document.getElementById('filtroMesResumo');
  if (!tbody || !kpiEl) return;

  const filtro = sel ? sel.value : '__TODOS__';
  const { atual, meses } = calcularDadosResumoMensal();

  let kpiConsumo = 0, kpiPago = 0, kpiDeve = 0;
  if (filtro === '__TODOS__' || filtro === '__ATUAL__') {
    atual.forEach(u => { kpiConsumo += u.consumo; kpiPago += u.pago; kpiDeve += u.deve; });
  } else {
    const mesAlvo = meses.find(m => m.key === filtro);
    if (mesAlvo) {
      Object.values(mesAlvo.usuarios).forEach(u => {
        kpiConsumo += u.consumo; kpiPago += u.pago; kpiDeve += u.deve;
      });
    }
  }

  kpiEl.innerHTML = `
    <div class="kpi-box">
      <div class="kpi-label">Consumo</div>
      <div class="kpi-value">${formatBRL(kpiConsumo)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Pago</div>
      <div class="kpi-value" style="color:#34d399;">${formatBRL(kpiPago)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Em Aberto</div>
      <div class="kpi-value" style="color:${kpiDeve > 0 ? '#f87171' : '#34d399'};">${formatBRL(kpiDeve)}</div>
    </div>
  `;

  let html = '';

  const montarLinhasGrupo = (titulo, lista) => {
    const totConsumo = lista.reduce((acc, x) => acc + x.consumo, 0);
    const totDeve = lista.reduce((acc, x) => acc + x.deve, 0);

    let bloco = `
      <tr class="group-header-row">
        <td colspan="2">${titulo}</td>
        <td colspan="2" style="text-align:right;">Gasto: ${formatBRL(totConsumo)} • Deve: ${formatBRL(totDeve)}</td>
      </tr>
    `;

    if (lista.length === 0) {
      bloco += `<tr><td colspan="4" class="muted">Sem movimentações.</td></tr>`;
      return bloco;
    }

    bloco += lista.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.nome)}</strong></td>
        <td>${formatBRL(u.consumo)}</td>
        <td style="color:${u.deve > 0 ? '#f87171' : '#34d399'}; font-weight:700;">${formatBRL(u.deve)}</td>
        <td>${badgeStatusFinanceiro(u.consumo, u.pago, u.deve)}</td>
      </tr>
    `).join('');

    return bloco;
  };

  if (filtro === '__TODOS__' || filtro === '__ATUAL__') {
    html += montarLinhasGrupo('📌 Situação Atual (Geral)', atual);
  }

  meses.forEach(m => {
    if (filtro !== '__TODOS__' && filtro !== m.key) return;
    const listaMes = Object.values(m.usuarios).sort((a, b) => (b.deve - a.deve) || (b.consumo - a.consumo));
    html += montarLinhasGrupo(`📅 ${m.label}`, listaMes);
  });

  tbody.innerHTML = html || `<tr><td colspan="4" class="muted">Sem registros.</td></tr>`;
}

function renderRankings() {
  const elAtual = document.getElementById('rankingAtual');
  const elHist = document.getElementById('rankingHistorico');
  if (!elAtual || !elHist) return;

  if (state.devedoresAtuais.length === 0) {
    elAtual.innerHTML = `<div class="alert alert-ok">Ninguém devendo! 🎉</div>`;
  } else {
    elAtual.innerHTML = state.devedoresAtuais.map((d, i) => `
      <div class="list-item row-between">
        <div>
          <strong>#${i + 1} ${escapeHtml(d.nome)}</strong>
          <div class="muted">${d.rodadas_pendentes} concurso(s)</div>
        </div>
        <span class="badge badge-red">${formatBRL(d.divida_atual)}</span>
      </div>
    `).join('');
  }

  if (state.rankingHistorico.length === 0) {
    elHist.innerHTML = `<p class="muted">Sem registros.</p>`;
  } else {
    elHist.innerHTML = state.rankingHistorico.map((d, i) => `
      <div class="list-item row-between">
        <div><strong>#${i + 1} ${escapeHtml(d.nome)}</strong></div>
        <span class="badge badge-blue">${formatBRL(d.historico_dividas_geradas)}</span>
      </div>
    `).join('');
  }
}

// =========================================================================
// ABA 4: PERFIL — BOLÕES QUE PARTICIPO + MINHA CONTA + PERFIL
// =========================================================================
function renderMeusBoloesPerfil() {
  const alvo = document.getElementById('listaMeusBoloesPerfil');
  if (!alvo) return;

  const lista = (state.boloes || []).filter(b =>
    String(b.status_membro || '').toUpperCase() !== 'REMOVIDO'
  );

  if (lista.length === 0) {
    alvo.innerHTML = '<div class="muted">Você ainda não participa de nenhum bolão.</div>';
    return;
  }

  alvo.innerHTML = lista.map(b => {
    const idEnc = encodeURIComponent(String(b.bolao_id || ''));
    const cor = normalizarHexCor6(b.cor_tema, '#10b981');
    const statusMembro = String(b.status_membro || '').toUpperCase();
    const statusBolao = String(b.status || 'ATIVO').toUpperCase();
    const isAtivo = String(b.bolao_id) === String(state.bolaoId);
    const tipoLabel = String(b.tipo || 'FREQUENTE').toUpperCase() === 'COMEMORATIVO' ? 'Comemorativo' : 'Frequente';
    const papelLabel = statusMembro === 'APROVADO'
      ? (String(b.papel || '').toLowerCase() === 'admin_bolao' ? 'Admin' : 'Membro')
      : statusMembro;

    let acaoHtml = '';
    if (statusMembro === 'APROVADO') {
      acaoHtml = isAtivo
        ? `<span class="badge badge-green">ATUAL</span>`
        : `<button type="button" class="btn-primary btn-sm" onclick="trocarBolaoAtivo('${idEnc}', true)">Abrir</button>`;
    } else if (statusMembro === 'PENDENTE') {
      acaoHtml = `<button type="button" class="btn-warning btn-sm" onclick="abrirPendenteDoCarrossel('${idEnc}')">Pendente</button>`;
    } else {
      acaoHtml = `<span class="badge badge-red">${escapeHtml(statusMembro)}</span>`;
    }

    const badgeStatusBolao = statusBolao !== 'ATIVO'
      ? ` <span class="badge badge-blue">${escapeHtml(statusBolao)}</span>`
      : '';

    return `
      <div class="bolao-perfil-card ${isAtivo ? 'active' : ''}" style="--card-accent:${escapeHtml(cor)}">
        <div style="min-width:0; flex:1;">
          <strong>🍀 ${escapeHtml(b.nome)}</strong>${badgeStatusBolao}
          <div class="muted">${tipoLabel} • ${escapeHtml(papelLabel)}</div>
        </div>
        <div>${acaoHtml}</div>
      </div>
    `;
  }).join('');
}

function trocarFiltroMinhasTransferencias(filtro, btnEl) {
  state.filtroMinhasTransferencias = filtro;
  document.querySelectorAll('#cardMinhasTransferencias .pill-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderMinhasTransferencias();
}

function renderMinhasTransferencias() {
  const kpiEl = document.getElementById('meuResumoFinanceiro');
  const tbody = document.getElementById('tabelaMinhasTransferenciasBody');
  const statusBadge = document.getElementById('meuStatusGeralBadge');
  if (!kpiEl || !tbody || !state.user) return;

  const todasMinhas = state.participacoes.filter(p => p.id_usuario === state.user.id_usuario);

  let totalDevido = 0, totalPago = 0, totalSaldo = 0, totalDocs = 0;

  todasMinhas.forEach(p => {
    const dev = Number(p.valor_devido) || 0;
    const pag = Number(p.valor_pago) || 0;
    const sal = Math.max(0, Number((dev - pag).toFixed(2)));
    totalDevido += dev;
    totalPago += pag;
    totalSaldo += sal;
    if (Array.isArray(p.links_comprovantes)) totalDocs += p.links_comprovantes.length;
  });

  if (totalSaldo <= 0) {
    statusBadge.className = 'badge badge-green';
    statusBadge.textContent = 'EM DIA';
  } else if (totalPago > 0) {
    statusBadge.className = 'badge badge-amber';
    statusBadge.textContent = 'PARCIAL';
  } else {
    statusBadge.className = 'badge badge-red';
    statusBadge.textContent = 'PENDENTE';
  }

  kpiEl.innerHTML = `
    <div class="kpi-box">
      <div class="kpi-label">Total Cotas</div>
      <div class="kpi-value">${formatBRL(totalDevido)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Total Pago</div>
      <div class="kpi-value" style="color:#34d399;">${formatBRL(totalPago)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Saldo Devedor</div>
      <div class="kpi-value" style="color:${totalSaldo > 0 ? '#f87171' : '#34d399'};">${formatBRL(totalSaldo)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Comprovantes</div>
      <div class="kpi-value">${totalDocs}</div>
    </div>
  `;

  const filtradas = todasMinhas.filter(p => {
    const dev = Number(p.valor_devido) || 0;
    const pag = Number(p.valor_pago) || 0;
    const sal = Math.max(0, Number((dev - pag).toFixed(2)));
    if (state.filtroMinhasTransferencias === 'pagas') return pag > 0;
    if (state.filtroMinhasTransferencias === 'pendentes') return sal > 0;
    return true;
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Nenhuma transferência encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map(p => {
    const rodada = state.rodadas.find(r => r.id_rodada === p.id_rodada);
    const dev = Number(p.valor_devido) || 0;
    const pag = Number(p.valor_pago) || 0;
    const sal = Math.max(0, Number((dev - pag).toFixed(2)));

    const badge = sal <= 0
      ? `<span class="badge badge-green">PAGO</span>`
      : (pag > 0 ? `<span class="badge badge-amber">PARCIAL</span>` : `<span class="badge badge-red">PENDENTE</span>`);

    const links = Array.isArray(p.links_comprovantes) ? p.links_comprovantes : [];
    const docsHtml = links.length > 0
      ? links.map(url => `<a href="${url}" target="_blank" rel="noopener noreferrer" title="Ver comprovante" class="doc-link">📄</a>`).join('')
      : (sal > 0
          ? `<button class="btn-primary btn-sm" onclick="irParaPagarParticipacao('${p.id_participacao}')">Pagar</button>`
          : `<span class="muted">-</span>`);

    const dataExib = p.data_pagamento || (rodada ? (rodada.data_bilhete || rodada.data_criacao) : '-');
    const dispConc = rodada ? obterDisplayConcursoRodada(rodada) : '';
    const tituloRodada = rodada
      ? `${escapeHtml(rodada.descricao)}${dispConc ? ` <span class="muted">(#${escapeHtml(dispConc)})</span>` : ''}`
      : p.id_rodada;

    return `
      <tr>
        <td><strong>${tituloRodada}</strong></td>
        <td class="muted">${escapeHtml(dataExib)}</td>
        <td>${formatBRL(dev)}</td>
        <td style="color:#34d399;">${formatBRL(pag)}</td>
        <td style="color:${sal > 0 ? '#f87171' : '#34d399'}; font-weight:700;">${formatBRL(sal)}</td>
        <td>${badge}</td>
        <td>${docsHtml}</td>
      </tr>
    `;
  }).join('');
}

function renderCadastroUsuarios() {
  const sel = document.getElementById('cadSelectUsuario');
  if (!sel || !state.user) return;
  const isAdmin = usuarioEhAdminNoBolao();

  let options = state.usuarios.map(u =>
    `<option value="${u.id_usuario}">${escapeHtml(u.nome)} (${u.id_usuario})</option>`
  ).join('');

  if (isAdmin) {
    options = `<option value="__NOVO__">+ Novo Usuário</option>` + options;
  }

  sel.innerHTML = options;
  sel.value = state.user.id_usuario;
  aoTrocarUsuarioCadastro();
}

function aoTrocarUsuarioCadastro() {
  const selVal = document.getElementById('cadSelectUsuario').value;
  const isAdmin = usuarioEhAdminNoBolao();
  const ehNovo = selVal === '__NOVO__';

  document.getElementById('camposCredenciaisAdmin').classList.toggle('hidden', !isAdmin);
  document.getElementById('cadNome').disabled = !isAdmin && !ehNovo;

  if (ehNovo) {
    document.getElementById('cadNome').value = '';
    document.getElementById('cadNomeComprovante').value = '';
    document.getElementById('cadTelefone').value = '';
    document.getElementById('cadSenha').value = '';
  } else {
    const u = state.usuarios.find(x => x.id_usuario === selVal);
    if (u) {
      document.getElementById('cadNome').value = u.nome || '';
      document.getElementById('cadNomeComprovante').value = u.nome_comprovante || u.nome || '';
      document.getElementById('cadTelefone').value = '';
      document.getElementById('cadSenha').value = '';
    }
  }
  document.getElementById('cadFeedback').innerHTML = '';
  atualizarSugestaoCadastro();
}

function atualizarSugestaoCadastro() {
  const nome = document.getElementById('cadNome').value.trim();
  const nomeComp = document.getElementById('cadNomeComprovante').value.trim();
  const box = document.getElementById('boxSugestaoCadastro');

  if (!nome) {
    box.classList.add('hidden');
    state.sugestaoCadastroAtual = '';
    return;
  }

  const sugerido = normalizarTexto(nome);
  const sim = calcularSimilaridade(nome, nomeComp || nome);
  state.sugestaoCadastroAtual = sugerido;

  box.classList.remove('hidden');
  box.innerHTML = `✨ <code>${escapeHtml(sugerido)}</code> • Similaridade: <strong>${Math.round(sim * 100)}%</strong>`;
}

function aplicarSugestaoCadastro() {
  if (!state.sugestaoCadastroAtual) return;
  document.getElementById('cadNomeComprovante').value = state.sugestaoCadastroAtual;
  atualizarSugestaoCadastro();
}

async function salvarUsuarioCadastro() {
  const selVal = document.getElementById('cadSelectUsuario').value;
  const ehNovo = selVal === '__NOVO__';
  const nome = document.getElementById('cadNome').value.trim();
  const nomeComprovante = document.getElementById('cadNomeComprovante').value.trim();
  const telefone = document.getElementById('cadTelefone').value.trim();
  const senha = document.getElementById('cadSenha').value.trim();

  if (ehNovo && (!nome || !telefone || !senha)) {
    showMsg('cadFeedback', 'Preencha nome, telefone e senha.', 'err');
    return;
  }

  try {
    const res = await apiPost({
      action: 'cadastrarUsuario',
      atorId: state.user.id_usuario,
      idUsuarioAlvo: ehNovo ? '' : selVal,
      nome,
      nomeComprovante: nomeComprovante || normalizarTexto(nome),
      telefone,
      senha
    });
    showMsg('cadFeedback', res.message, res.success ? 'ok' : 'err');
    if (res.success) await carregarDashboard();
  } catch (err) {
    showMsg('cadFeedback', err.message, 'err');
  }
}
