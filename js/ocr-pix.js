// =========================================================================
// LEITOR E VALIDADOR LOCAL DE COMPROVANTE PIX (PDF + OCR + DRIVE)
// =========================================================================
function abrirLeitor(idParticipacao) {
  const p = state.participacoes.find(x => x.id_participacao === idParticipacao);
  if (!p) return;
  const saldo = Number((Number(p.valor_devido) - Number(p.valor_pago || 0)).toFixed(2));
  const rodada = state.rodadas.find(r => r.id_rodada === p.id_rodada);

  state.pendenciaSelecionada = { ...p, saldo };
  state.arquivoAtual = null;

  document.getElementById('leitorResumo').innerHTML =
    `<strong>${rodada ? escapeHtml(rodada.descricao) : p.id_rodada}</strong> • ${formatBRL(saldo)} • ${escapeHtml(state.user.nome_comprovante || state.user.nome)}`;
  document.getElementById('arquivoComprovante').value = '';
  document.getElementById('leitorResultado').innerHTML = '';
  document.getElementById('boxSugestaoPosUpload').classList.add('hidden');
  document.getElementById('detalhesTextoBruto').classList.add('hidden');
  document.getElementById('boxLeitor').classList.remove('hidden');
  document.getElementById('boxLeitor').scrollIntoView({ behavior: 'smooth' });
}

function fecharLeitor() {
  document.getElementById('boxLeitor').classList.add('hidden');
  state.pendenciaSelecionada = null;
  state.arquivoAtual = null;
}

async function processarComprovante(event) {
  const file = event.target.files[0];
  if (!file || !state.pendenciaSelecionada) return;

  if (file.size > 10 * 1024 * 1024) {
    showMsg('leitorResultado', 'O arquivo ultrapassa 10 MB. Envie um PDF ou print menor.', 'err');
    return;
  }

  state.arquivoAtual = file;

  const progWrap = document.getElementById('leitorProgressoWrap');
  const progBar = document.getElementById('leitorProgressoBar');
  const progTxt = document.getElementById('leitorStatusTexto');
  const resultEl = document.getElementById('leitorResultado');
  const sugBox = document.getElementById('boxSugestaoPosUpload');

  progWrap.classList.remove('hidden');
  progBar.style.width = '15%';
  resultEl.innerHTML = '';
  sugBox.classList.add('hidden');

  try {
    let textoExtraido = '';
    let metodo = 'OCR';

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      metodo = 'PDF';
      progTxt.textContent = 'Lendo PDF...';
      progBar.style.width = '50%';
      textoExtraido = await extrairTextoPDF(file);
      progBar.style.width = '90%';
    } else {
      metodo = 'OCR';
      progTxt.textContent = 'Lendo imagem (OCR)...';
      const resOcr = await Tesseract.recognize(file, 'por', {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            progBar.style.width = Math.max(15, pct) + '%';
            progTxt.textContent = `OCR: ${pct}%`;
          }
        }
      });
      textoExtraido = resOcr.data.text || '';
    }

    progBar.style.width = '100%';
    progTxt.textContent = 'Validando...';

    document.getElementById('textoBrutoExtraido').textContent = textoExtraido;
    document.getElementById('detalhesTextoBruto').classList.remove('hidden');

    await analisarEValidarComprovante(textoExtraido, metodo);
  } catch (err) {
    showMsg('leitorResultado', 'Erro ao ler o arquivo: ' + err.message, 'err');
  } finally {
    setTimeout(() => progWrap.classList.add('hidden'), 600);
  }
}

async function extrairTextoPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const linhas = content.items.map(item => item.str).join(' ');
    textoCompleto += linhas + '\n';
  }
  return textoCompleto;
}

function extrairCandidatoNomePagador(textoBruto, nomeAtual) {
  const linhas = textoBruto
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length >= 4 && l.length <= 70);

  const nomeRecebedorNorm = normalizarTexto(state.configPix.NOME_RECEBEDOR);
  let melhorCandidato = null;
  let melhorScore = 0;

  const rotulosPagador = /(DE|PAGADOR|ORIGEM|ENVIADO POR|NOME DO PAGADOR|CONTA DE ORIGEM)\s*:?\s*([A-Za-zÀ-ÿ\s]{4,60})/gi;
  const candidatosExtras = [];
  let match;
  while ((match = rotulosPagador.exec(textoBruto)) !== null) {
    if (match[2]) candidatosExtras.push(match[2].trim());
  }

  const todosCandidatos = [...new Set([...candidatosExtras, ...linhas])];

  for (const linha of todosCandidatos) {
    const norm = normalizarTexto(linha);
    if (/\d{3,}/.test(norm)) continue;
    if (norm.split(' ').length < 2) continue;
    if (nomeRecebedorNorm && calcularSimilaridade(norm, nomeRecebedorNorm) >= 0.75) continue;

    const scoreComAtual = Math.max(
      calcularSimilaridade(norm, nomeAtual),
      calcularSimilaridade(norm, state.user.nome)
    );

    if (scoreComAtual > melhorScore) {
      melhorScore = scoreComAtual;
      melhorCandidato = norm;
    }
  }

  return { candidato: melhorCandidato, score: melhorScore };
}

async function analisarEValidarComprovante(textoBruto, metodo) {
  const pend = state.pendenciaSelecionada;
  const textoNorm = normalizarTexto(textoBruto);
  const valorEsperado = Number(pend.saldo);

  const ehAgendamento =
    /\bAGENDAD[OA]\b|\bAGENDAMENTO\b/.test(textoNorm) &&
    !/\bEFETIVAD[OA]\b|\bCONCLUID[OA]\b|\bREALIZAD[OA]\b/.test(textoNorm);

  const regexValor = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
  const valoresEncontrados = [];
  let mVal;
  while ((mVal = regexValor.exec(textoBruto)) !== null) {
    const num = parseFloat(mVal[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(num)) valoresEncontrados.push(num);
  }
  const valorBateu = valoresEncontrados.some(v => Math.abs(v - valorEsperado) < 0.01);

  const recebedorTokens = normalizarTexto(state.configPix.NOME_RECEBEDOR)
    .split(' ')
    .filter(t => t.length > 2);
  const tokensEncontrados = recebedorTokens.filter(t => textoNorm.includes(t));
  const chaveNorm = normalizarTexto(state.configPix.CHAVE_PIX);
  const recebedorBateu =
    (recebedorTokens.length > 0 && tokensEncontrados.length >= Math.min(2, recebedorTokens.length)) ||
    (chaveNorm.length >= 6 && textoNorm.includes(chaveNorm));

  const textoSemQuebras = textoBruto.replace(/[\r\n]+/g, ' ');
  let idTransacao = '';
  const matchE2E = textoSemQuebras.match(/\bE[0-9A-Za-z]{20,35}\b/);
  if (matchE2E) {
    idTransacao = matchE2E[0].toUpperCase();
  } else {
    const matchAlt = textoSemQuebras.match(
      /(?:ID DA TRANSACAO|ID TRANSACAO|AUTENTICACAO|PROTOCOLO|CODIGO DA TRANSACAO)\s*[:#-]?\s*([A-Za-z0-9-]{10,40})/i
    );
    if (matchAlt) idTransacao = matchAlt[1].toUpperCase();
  }

  const nomeCompAtual = state.user.nome_comprovante || state.user.nome;
  const { candidato, score } = extrairCandidatoNomePagador(textoBruto, nomeCompAtual);

  if (candidato && score >= 0.45 && normalizarTexto(nomeCompAtual) !== candidato) {
    const boxSug = document.getElementById('boxSugestaoPosUpload');
    boxSug.classList.remove('hidden');
    boxSug.innerHTML = `
      <strong>💡 Nome detectado:</strong> <strong>"${escapeHtml(candidato)}"</strong> (${Math.round(score * 100)}%)
      <div class="toolbar-inline" style="margin-top:8px;">
        <input id="inputSugestaoPosUpload" type="text" value="${escapeHtml(candidato)}" style="flex:1; min-width:180px;" />
        <button class="btn-primary btn-sm" onclick="aceitarSugestaoPosUpload()">Atualizar</button>
      </div>
    `;
  }

  const erros = [];
  if (ehAgendamento) erros.push('Documento indica agendamento.');
  if (!valorBateu) {
    erros.push(
      `Valor esperado (${formatBRL(valorEsperado)}) não encontrado. Lidos: ${
        valoresEncontrados.length ? valoresEncontrados.map(formatBRL).join(', ') : 'nenhum'
      }.`
    );
  }
  if (!recebedorBateu) {
    erros.push(`Recebedor (${escapeHtml(state.configPix.NOME_RECEBEDOR)}) ou Chave Pix não identificado.`);
  }
  if (!idTransacao) erros.push('ID da transação (E2E/Autenticação) não identificado.');

  if (erros.length > 0) {
    showMsg(
      'leitorResultado',
      `<strong>Não aprovado:</strong><ul style="margin-left:18px; margin-top:6px;">${erros.map(e => `<li>${e}</li>`).join('')}</ul>`,
      'err'
    );
    return;
  }

  showMsg('leitorResultado', `Validado (${formatBRL(valorEsperado)}) • Salvando no Drive...`, 'ok');

  try {
    let arquivoBase64 = '';
    let arquivoNome = '';
    let arquivoMime = '';

    if (state.arquivoAtual) {
      arquivoBase64 = await arquivoParaBase64(state.arquivoAtual);
      arquivoNome = state.arquivoAtual.name || 'comprovante';
      arquivoMime = state.arquivoAtual.type || 'application/octet-stream';
    }

    const res = await apiPost({
      action: 'registrarPagamento',
      id_participacao: pend.id_participacao,
      id_usuario: state.user.id_usuario,
      id_transacao: idTransacao,
      valor_pago: valorEsperado,
      metodo,
      arquivo_base64: arquivoBase64,
      arquivo_nome: arquivoNome,
      arquivo_mime: arquivoMime
    });

    if (res.success) {
      const linkHtml = res.link_comprovante
        ? ` • <a href="${res.link_comprovante}" target="_blank" rel="noopener noreferrer" title="Ver comprovante" class="doc-link" style="vertical-align:middle;">📄</a>`
        : '';
      showMsg('leitorResultado', `✅ ${res.message} (ID: ${idTransacao})${linkHtml}`, 'ok');
      await carregarDashboard();
    } else {
      showMsg('leitorResultado', `❌ ${res.message}`, 'err');
    }
  } catch (err) {
    showMsg('leitorResultado', 'Erro ao registrar baixa: ' + err.message, 'err');
  }
}

async function aceitarSugestaoPosUpload() {
  const novoNome = document.getElementById('inputSugestaoPosUpload').value.trim();
  if (!novoNome) return;

  try {
    const res = await apiPost({
      action: 'atualizarNomeComprovante',
      atorId: state.user.id_usuario,
      id_usuario: state.user.id_usuario,
      novo_nome_comprovante: novoNome
    });
    if (res.success) {
      state.user.nome_comprovante = novoNome;
      localStorage.setItem('bolao_ameba_user', JSON.stringify(state.user));
      const box = document.getElementById('boxSugestaoPosUpload');
      box.innerHTML = `✅ ${res.message}`;
      box.className = 'alert alert-ok';
      await carregarDashboard();
    } else {
      alert(res.message);
    }
  } catch (err) {
    alert('Erro ao atualizar nome: ' + err.message);
  }
}
