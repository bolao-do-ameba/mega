// =========================================================================
// OCR DE BILHETE CAIXA (FOTO + CÂMERA AO VIVO + ARQUIVO/PDF + SELETOR 01-60)
// =========================================================================
function acionarCameraBilhete() {
  const inp = document.getElementById('inputCameraBilhete');
  if (!inp) return;
  inp.value = '';
  inp.click();
}

function acionarGaleriaBilhete() {
  const inp = document.getElementById('inputGaleriaBilhete');
  if (!inp) return;
  inp.value = '';
  inp.click();
}

async function abrirCameraAoVivo() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    acionarCameraBilhete();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }]
      },
      audio: false
    });
    state.cameraStream = stream;
    const video = document.getElementById('cameraLiveVideo');
    video.srcObject = stream;
    document.getElementById('cameraLiveModal').classList.remove('hidden');
  } catch (_) {
    acionarCameraBilhete();
  }
}

function fecharCameraAoVivo() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  const video = document.getElementById('cameraLiveVideo');
  if (video) video.srcObject = null;
  const modal = document.getElementById('cameraLiveModal');
  if (modal) modal.classList.add('hidden');
}

async function capturarFrameCamera() {
  const video = document.getElementById('cameraLiveVideo');
  if (!video || !video.videoWidth) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sx = Math.round(vw * 0.04);
  const sy = Math.round(vh * 0.04);
  const sw = Math.round(vw * 0.92);
  const sh = Math.round(vh * 0.92);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  fecharCameraAoVivo();
  await executarOcrBilheteDeFonte(canvas);
}

async function lerFotoBilhete(event) {
  const file = event.target.files[0];
  if (!file) return;
  await executarOcrBilheteDeFonte(file);
}

async function extrairTextoOuCanvasDePDFBilhete(file) {
  if (!window.pdfjsLib) {
    throw new Error('Biblioteca PDF.js não carregada.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let textoPdf = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let ultimaY = null;
    let linha = [];
    content.items.forEach(item => {
      const y = item.transform ? Math.round(item.transform[5]) : null;
      if (ultimaY !== null && y !== null && Math.abs(y - ultimaY) > 4) {
        textoPdf += linha.join(' ') + '\n';
        linha = [];
      }
      linha.push(item.str);
      ultimaY = y;
    });
    if (linha.length) textoPdf += linha.join(' ') + '\n';
  }

  const parsedTexto = parsearBilheteCaixaLocal(textoPdf);
  if (parsedTexto.jogos.length > 0) {
    return { modo: 'texto', texto: textoPdf, parsed: parsedTexto };
  }

  // Fallback para PDF escaneado como imagem: renderiza a página 1 em canvas para OCR
  const page1 = await pdf.getPage(1);
  const viewport = page1.getViewport({ scale: 2.2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page1.render({ canvasContext: ctx, viewport }).promise;
  return { modo: 'canvas', canvas };
}

function carregarImagemEmCanvasBase(fonte) {
  return new Promise((resolve, reject) => {
    const montar = (imgSource, w, h) => {
      const targetMinW = 1200;
      const targetMaxW = 1850;
      let escala = 1;
      if (w > targetMaxW) escala = targetMaxW / w;
      else if (w < targetMinW && w > 0) escala = Math.min(2.2, targetMinW / w);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * escala);
      canvas.height = Math.round(h * escala);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgSource, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };

    if (fonte instanceof HTMLCanvasElement) {
      montar(fonte, fonte.width, fonte.height);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => montar(img, img.width, img.height);
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem do bilhete.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(fonte);
  });
}

function gerarCanvasProcessadoBilhete(baseCanvas, modo) {
  const w = baseCanvas.width;
  const h = baseCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(baseCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const totalPixels = w * h;
  const gray = new Uint8Array(totalPixels);

  // Canal azul pesado remove a marca d'água azul "loterias CAIXA" preservando a tinta preta
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const lum = 0.12 * d[i] + 0.28 * d[i + 1] + 0.60 * d[i + 2];
    gray[p] = lum < 0 ? 0 : (lum > 255 ? 255 : lum);
  }

  if (modo === 'soft') {
    const contrast = 1.75;
    const intercept = 128 * (1 - contrast);
    for (let i = 0, p = 0; p < totalPixels; i += 4, p++) {
      let v = gray[p] * contrast + intercept;
      v = v < 0 ? 0 : (v > 255 ? 255 : v);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  // Binarização adaptativa local (Integral Image / Bradley)
  const integral = new Float64Array(totalPixels);
  for (let y = 0; y < h; y++) {
    let somaLinha = 0;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      somaLinha += gray[rowOff + x];
      integral[rowOff + x] = y === 0 ? somaLinha : (integral[(y - 1) * w + x] + somaLinha);
    }
  }

  const raio = Math.max(12, Math.floor(w / 32));
  const fatorT = 0.86;

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - raio);
    const y2 = Math.min(h - 1, y + raio);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - raio);
      const x2 = Math.min(w - 1, x + raio);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      let sum = integral[y2 * w + x2];
      if (y1 > 0) sum -= integral[(y1 - 1) * w + x2];
      if (x1 > 0) sum -= integral[y2 * w + (x1 - 1)];
      if (y1 > 0 && x1 > 0) sum += integral[(y1 - 1) * w + (x1 - 1)];

      const idx = y * w + x;
      const val = (gray[idx] * count) < (sum * fatorT) ? 0 : 255;
      const off = idx * 4;
      d[off] = d[off + 1] = d[off + 2] = val;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return out;
}

function corrigirDigitosTokenBilhete(str) {
  return String(str || '')
    .toUpperCase()
    .replace(/[OQØD@]/g, '0')
    .replace(/[IL|!]/g, '1')
    .replace(/[^0-9]/g, '');
}

function normalizarDataBilheteCaixa(textoBruto) {
  const textoNorm = String(textoBruto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const meses = {
    JAN: '01',
    FEV: '02', FEB: '02',
    MAR: '03',
    ABR: '04', APR: '04',
    MAI: '05', MAY: '05',
    JUN: '06',
    JUL: '07',
    AGO: '08', AG0: '08', AUG: '08',
    SET: '09', SEP: '09',
    OUT: '10', '0UT': '10', OCT: '10', '0CT': '10',
    NOV: '11', N0V: '11',
    DEZ: '12', DEC: '12'
  };

  const mCaixa = textoNorm.match(
    /\b([0-3OQØD][0-9OQØD]|[0-9])\s*[\/.-]?\s*(JAN|FEV|FEB|MAR|ABR|APR|MAI|MAY|JUN|JUL|AG[O0]|AUG|SET|SEP|[O0]UT|[O0]CT|N[O0]V|DEZ|DEC)\s*[\/.-]?\s*([12][0-9OQØD]{3})\b/
  );
  if (mCaixa) {
    const dia = parseInt(corrigirDigitosTokenBilhete(mCaixa[1]), 10);
    const mes = meses[mCaixa[2]];
    const ano = parseInt(corrigirDigitosTokenBilhete(mCaixa[3]), 10);
    if (dia >= 1 && dia <= 31 && mes && ano >= 2000 && ano <= 2100) {
      return {
        data_bilhete: `${String(dia).padStart(2, '0')}/${mes}/${ano}`,
        data_bilhete_raw: `${String(dia).padStart(2, '0')}${mCaixa[2].replace(/0/g, 'O')}${ano}`
      };
    }
  }

  const mBR = textoNorm.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/);
  if (mBR) {
    const dia = parseInt(mBR[1], 10);
    const mes = parseInt(mBR[2], 10);
    const ano = parseInt(mBR[3], 10);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) {
      return {
        data_bilhete: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`,
        data_bilhete_raw: mBR[0]
      };
    }
  }

  return { data_bilhete: '', data_bilhete_raw: '' };
}

function extrairConcursosBilheteLocal(textoBruto) {
  const textoNorm = String(textoBruto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const montarFaixa = (iniRaw, fimRaw) => {
    const ini = parseInt(corrigirDigitosTokenBilhete(iniRaw), 10);
    const fim = parseInt(corrigirDigitosTokenBilhete(fimRaw), 10);
    if (isNaN(ini) || ini <= 0) return null;
    const fimFinal = (!isNaN(fim) && fim >= ini && (fim - ini) < 50) ? fim : ini;
    const concursos = [];
    for (let c = ini; c <= fimFinal; c++) concursos.push(String(c));
    return {
      concursoInicio: String(ini),
      concursoFim: String(fimFinal),
      concursos,
      concursoDisplay: ini === fimFinal ? String(ini) : `${ini} a ${fimFinal}`
    };
  };

  const mFaixa = textoNorm.match(
    /C[O0]NC(?:URS[O0])?\.?\s*[:#-]?\s*([0-9OQØDIL|]{3,5})\s*(?:AT[E3]|A|-|–|\/)\s*([0-9OQØDIL|]{3,5})/
  );
  if (mFaixa) {
    const res = montarFaixa(mFaixa[1], mFaixa[2]);
    if (res) return res;
  }

  const mAte = textoNorm.match(/\b([0-9OQØD]{4})\s+AT[E3]\s+([0-9OQØD]{4})\b/);
  if (mAte) {
    const res = montarFaixa(mAte[1], mAte[2]);
    if (res) return res;
  }

  const mUnico = textoNorm.match(/C[O0]NC(?:URS[O0])?\.?\s*[:#-]?\s*([0-9OQØDIL|]{3,5})/);
  if (mUnico) {
    const res = montarFaixa(mUnico[1], mUnico[1]);
    if (res) return res;
  }

  return { concursoInicio: '', concursoFim: '', concursos: [], concursoDisplay: '' };
}

function extrairValorTotalBilheteLocal(textoBruto) {
  const linhas = String(textoBruto || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const ehPromo = norm => /\b(BILH|MILH|VALEND|PREMI|ESTIMAD|ACUMULAD|VIRADA)\b/.test(norm);
  const regexMoeda = /(?:R\s*[\$S5]\s*)?([0-9OQØD]{1,3}(?:\.[0-9OQØD]{3})*|[0-9OQØD]+)\s*[,.]\s*([0-9OQØD]{2})\b/g;

  for (let i = linhas.length - 1; i >= 0; i--) {
    const norm = linhas[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (ehPromo(norm)) continue;
    if (!/\b(T[O0]TAL|VAL[O0]R|VLR)\b/.test(norm)) continue;

    regexMoeda.lastIndex = 0;
    let ultimo = null;
    let m;
    while ((m = regexMoeda.exec(norm)) !== null) {
      const inteiro = corrigirDigitosTokenBilhete(m[1].replace(/\./g, ''));
      const centavos = corrigirDigitosTokenBilhete(m[2]);
      const val = parseFloat(`${inteiro}.${centavos}`);
      if (!isNaN(val) && val > 0) ultimo = val;
    }
    if (ultimo !== null) return Number(ultimo.toFixed(2));
  }

  const regexComRS = /R\s*[\$S5]\s*([0-9OQØD]{1,3}(?:\.[0-9OQØD]{3})*|[0-9OQØD]+)\s*[,.]\s*([0-9OQØD]{2})\b/g;
  for (let i = linhas.length - 1; i >= 0; i--) {
    const norm = linhas[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (ehPromo(norm)) continue;

    regexComRS.lastIndex = 0;
    let ultimo = null;
    let m;
    while ((m = regexComRS.exec(norm)) !== null) {
      const inteiro = corrigirDigitosTokenBilhete(m[1].replace(/\./g, ''));
      const centavos = corrigirDigitosTokenBilhete(m[2]);
      const val = parseFloat(`${inteiro}.${centavos}`);
      if (!isNaN(val) && val > 0) ultimo = val;
    }
    if (ultimo !== null) return Number(ultimo.toFixed(2));
  }

  return null;
}

function extrairJogosBilheteLocal(textoBruto) {
  const linhas = String(textoBruto || '').split(/\r?\n/).map(l => l.trim());
  const jogos = [];
  const vistos = new Set();

  const ehSeparador = l => !l || /^[-_=.~•·*—–\s]+$/.test(l);

  const ehCabecalhoOuRodape = norm => {
    if (/\b(MEGA|VIRADA|PARTIU|APOSTAR|BILH|MILH|VALEND|CAIXA|LOTERIC|TERMINAL|HORA|C[O0]NC|T[O0]TAL|VAL[O0]R|PREMI|AUTENTIC)\b/.test(norm)) {
      return true;
    }
    if (/R\s*[\$S5]\s*\d/.test(norm)) return true;
    if (/\d{2}:\d{2}/.test(norm)) return true;
    if (/\d{2}[\/.-]\d{2}[\/.-]\d{2,4}/.test(norm)) return true;
    if (/\b\d{1,2}\s*(JAN|FEV|FEB|MAR|ABR|APR|MAI|MAY|JUN|JUL|AG[O0]|AUG|SET|SEP|[O0]UT|[O0]CT|N[O0]V|DEZ|DEC)\s*\d{4}\b/.test(norm)) return true;
    if (/[A-Z0-9]{4,}-[A-Z0-9]{6,}/.test(norm)) return true;
    if (/\d{7,}/.test(norm)) return true;
    return false;
  };

  let blocoAtual = [];

  const fecharBloco = () => {
    if (blocoAtual.length >= 6 && blocoAtual.length <= 20) {
      const unicos = [...new Set(blocoAtual)].sort((a, b) => a - b);
      if (unicos.length >= 6 && unicos.length <= 20) {
        const formatado = unicos.map(n => String(n).padStart(2, '0'));
        const chave = formatado.join(' ');
        if (!vistos.has(chave)) {
          vistos.add(chave);
          jogos.push(formatado);
        }
      }
    }
    blocoAtual = [];
  };

  linhas.forEach(linhaOriginal => {
    if (ehSeparador(linhaOriginal)) {
      fecharBloco();
      return;
    }

    const norm = linhaOriginal.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (ehCabecalhoOuRodape(norm)) {
      fecharBloco();
      return;
    }

    const temPrefixo = /^\s*(?:(?:JOGO|APOSTA)\s*)?[A-J]\s*[:.)\-]?\s+/.test(norm);
    const tratada = norm
      .replace(/^\s*(?:JOGO|APOSTA)\s*\d+\s*[:.)\-]\s*/i, ' ')
      .replace(/^\s*(?:JOGO|APOSTA)?\s*[A-J]\s*[:.)\-]?\s+(?=[0-6OQØDIL|][0-9OQØDIL|]\b)/i, ' ');

    const tokensBrutos = tratada.replace(/[^\w|@]/g, ' ').split(/\s+/).filter(Boolean);
    let tokensNum = [];

    tokensBrutos.forEach(tk => {
      if (/^[0-9OQØDIL|@]{1,2}$/.test(tk) && /\d/.test(tk)) {
        const limpo = corrigirDigitosTokenBilhete(tk);
        if (limpo.length >= 1 && limpo.length <= 2) tokensNum.push(limpo);
      }
    });

    if (
      tokensNum.length >= 7 &&
      tokensNum[0].length === 1 &&
      tokensNum.slice(1).every(t => t.length === 2)
    ) {
      tokensNum = tokensNum.slice(1);
    }

    const dezenasLinha = tokensNum
      .map(t => parseInt(t, 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 60);

    if (dezenasLinha.length === 0) {
      fecharBloco();
      return;
    }

    if (temPrefixo && blocoAtual.length > 0) {
      fecharBloco();
    }

    if (blocoAtual.length === 0) {
      blocoAtual = dezenasLinha;
    } else {
      const ultimoBloco = blocoAtual[blocoAtual.length - 1];
      const primeiroLinha = dezenasLinha[0];
      if (!temPrefixo && primeiroLinha > ultimoBloco && (blocoAtual.length + dezenasLinha.length) <= 20) {
        blocoAtual = blocoAtual.concat(dezenasLinha);
      } else {
        fecharBloco();
        blocoAtual = dezenasLinha;
      }
    }
  });

  fecharBloco();
  return jogos;
}

function parsearBilheteCaixaLocal(textoBruto) {
  const jogos = extrairJogosBilheteLocal(textoBruto);
  const conc = extrairConcursosBilheteLocal(textoBruto);
  const valorTotal = extrairValorTotalBilheteLocal(textoBruto);
  const dataInfo = normalizarDataBilheteCaixa(textoBruto);

  return {
    jogos,
    concursoInicio: conc.concursoInicio,
    concursoFim: conc.concursoFim,
    concursos: conc.concursos,
    concursoDisplay: conc.concursoDisplay,
    valorTotal,
    dataBilhete: dataInfo.data_bilhete,
    dataBilheteRaw: dataInfo.data_bilhete_raw
  };
}

function mesclarResultadosOCR(r1, r2) {
  const jogos = r2.jogos.length > r1.jogos.length ? r2.jogos : r1.jogos;
  const usarConc2 = (r2.concursos.length > r1.concursos.length) || (!r1.concursoInicio && r2.concursoInicio);

  return {
    jogos,
    concursoInicio: usarConc2 ? r2.concursoInicio : r1.concursoInicio,
    concursoFim: usarConc2 ? r2.concursoFim : r1.concursoFim,
    concursos: usarConc2 ? r2.concursos : r1.concursos,
    concursoDisplay: usarConc2 ? r2.concursoDisplay : r1.concursoDisplay,
    valorTotal: r1.valorTotal !== null ? r1.valorTotal : r2.valorTotal,
    dataBilhete: r1.dataBilhete || r2.dataBilhete,
    dataBilheteRaw: r1.dataBilheteRaw || r2.dataBilheteRaw
  };
}

async function rodarTesseractBilhete(canvas, onProgresso) {
  const res = await Tesseract.recognize(canvas, 'por', {
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
    logger: m => {
      if (m.status === 'recognizing text' && typeof onProgresso === 'function') {
        onProgresso(m.progress || 0);
      }
    }
  });
  return (res && res.data && res.data.text) ? res.data.text : '';
}

function atualizarPreviewIntervaloConcursos() {
  const el = document.getElementById('previewIntervaloConcursos');
  if (!el) return;
  const ini = parseInt(String(document.getElementById('rodadaConcurso')?.value || '').trim(), 10);
  const fim = parseInt(String(document.getElementById('rodadaConcursoFim')?.value || '').trim(), 10);

  if (isNaN(ini) || ini <= 0) {
    el.innerHTML = '';
    return;
  }
  if (isNaN(fim) || fim === ini) {
    el.innerHTML = `<span style="color:#60a5fa;">Válido para 1 concurso: <strong>${ini}</strong></span>`;
    return;
  }
  if (fim < ini) {
    el.innerHTML = `<span style="color:#f87171;">⚠️ Concurso final (${fim}) menor que o inicial (${ini}).</span>`;
    return;
  }
  const qtd = (fim - ini) + 1;
  if (qtd > 50) {
    el.innerHTML = `<span style="color:#f87171;">⚠️ Intervalo muito grande (${qtd} concursos).</span>`;
    return;
  }
  el.innerHTML = `<span style="color:#34d399;">Teimosinha: <strong>${qtd} concursos</strong> (${ini} até ${fim})</span>`;
}

function renderizarResumoChipsOCR(dados) {
  const wrap = document.getElementById('bilheteOcrResumo');
  if (!wrap) return;

  const chips = [];
  if (dados.jogos.length > 0) {
    chips.push(`🎟️ ${dados.jogos.length} jogo${dados.jogos.length > 1 ? 's' : ''}`);
  }
  if (dados.concursoInicio) {
    const labelConc = dados.concursos.length > 1
      ? `Conc. ${dados.concursoInicio} até ${dados.concursoFim} (${dados.concursos.length}x)`
      : `Conc. ${dados.concursoInicio}`;
    chips.push(`🔢 ${labelConc}`);
  }
  if (dados.valorTotal !== null) {
    chips.push(`💰 ${formatBRL(dados.valorTotal)}`);
  }
  if (dados.dataBilhete) {
    chips.push(`📅 ${dados.dataBilhete}`);
  }

  if (chips.length === 0) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = chips.map(c => `<span class="ocr-chip">${escapeHtml(c)}</span>`).join('');
  wrap.classList.remove('hidden');
}

async function executarOcrBilheteDeFonte(fonte) {
  const progWrap = document.getElementById('bilheteOcrProgressoWrap');
  const progBar = document.getElementById('bilheteOcrBar');
  const progTxt = document.getElementById('bilheteOcrStatus');
  const feedback = document.getElementById('bilheteOcrFeedback');
  const resumoChips = document.getElementById('bilheteOcrResumo');

  progWrap.classList.remove('hidden');
  progBar.style.width = '10%';
  progTxt.textContent = 'Tratando arquivo do bilhete...';
  feedback.innerHTML = '';
  if (resumoChips) resumoChips.classList.add('hidden');

  try {
    let resultado = null;
    let textoFinalExibicao = '';
    let fonteImagem = fonte;

    const ehPdf = !(fonte instanceof HTMLCanvasElement) && (
      fonte.type === 'application/pdf' ||
      String(fonte.name || '').toLowerCase().endsWith('.pdf')
    );

    if (ehPdf) {
      progTxt.textContent = 'Lendo PDF do bilhete...';
      progBar.style.width = '40%';
      const pdfRes = await extrairTextoOuCanvasDePDFBilhete(fonte);
      if (pdfRes.modo === 'texto') {
        resultado = pdfRes.parsed;
        textoFinalExibicao = pdfRes.texto;
        progBar.style.width = '95%';
      } else {
        fonteImagem = pdfRes.canvas;
      }
    }

    if (!resultado) {
      const baseCanvas = await carregarImagemEmCanvasBase(fonteImagem);
      const canvasAdapt = gerarCanvasProcessadoBilhete(baseCanvas, 'adaptive');

      progBar.style.width = '20%';
      progTxt.textContent = 'Lendo bilhete (1/2)...';

      const texto1 = await rodarTesseractBilhete(canvasAdapt, p => {
        progBar.style.width = Math.round(20 + p * 45) + '%';
        progTxt.textContent = `OCR Bilhete: ${Math.round(p * 100)}%`;
      });

      resultado = parsearBilheteCaixaLocal(texto1);
      textoFinalExibicao = texto1;

      const faltouAlgo =
        resultado.jogos.length === 0 ||
        !resultado.concursoInicio ||
        resultado.valorTotal === null ||
        !resultado.dataBilhete;

      if (faltouAlgo) {
        progTxt.textContent = 'Refinando leitura (2/2)...';
        const canvasSoft = gerarCanvasProcessadoBilhete(baseCanvas, 'soft');
        const texto2 = await rodarTesseractBilhete(canvasSoft, p => {
          progBar.style.width = Math.round(65 + p * 30) + '%';
          progTxt.textContent = `Refinando OCR: ${Math.round(p * 100)}%`;
        });
        const res2 = parsearBilheteCaixaLocal(texto2);
        resultado = mesclarResultadosOCR(resultado, res2);
        textoFinalExibicao = `--- PASSADA 1 ---\n${texto1}\n\n--- PASSADA 2 ---\n${texto2}`;
      }
    }

    document.getElementById('textoBilheteBruto').textContent = textoFinalExibicao;
    document.getElementById('detalhesBilheteBruto').classList.remove('hidden');

    if (resultado.concursoInicio) {
      document.getElementById('rodadaConcurso').value = resultado.concursoInicio;
      document.getElementById('rodadaConcursoFim').value = resultado.concursoFim || resultado.concursoInicio;
      atualizarPreviewIntervaloConcursos();
    }

    if (resultado.dataBilhete) {
      document.getElementById('rodadaDataBilhete').value = resultado.dataBilhete;
    }

    if (resultado.valorTotal !== null) {
      document.getElementById('rodadaValorTotal').value = resultado.valorTotal.toFixed(2);
      if (typeof recalcularPreviewRodada === 'function') recalcularPreviewRodada();
    }

    const descEl = document.getElementById('rodadaDescricao');
    if (descEl && !descEl.value.trim() && resultado.concursoInicio) {
      descEl.value = resultado.concursos.length > 1
        ? `Mega-Sena Conc. ${resultado.concursoInicio} a ${resultado.concursoFim}`
        : `Mega-Sena Conc. ${resultado.concursoInicio}`;
    }

    if (resultado.jogos.length > 0) {
      if (typeof importarJogosNoBuilder === 'function') {
        importarJogosNoBuilder('novo', resultado.jogos, false);
      } else {
        const ta = document.getElementById('rodadaJogosTexto');
        const existentes = ta.value.trim();
        const novasLinhas = resultado.jogos.map(j => j.join(' ')).join('\n');
        ta.value = existentes ? `${existentes}\n${novasLinhas}` : novasLinhas;
        atualizarPreviewJogos();
      }
    }

    renderizarResumoChipsOCR(resultado);

    const faltantes = [];
    if (resultado.jogos.length === 0) faltantes.push('jogos');
    if (!resultado.concursoInicio) faltantes.push('concurso');
    if (resultado.valorTotal === null) faltantes.push('valor total');
    if (!resultado.dataBilhete) faltantes.push('data');

    if (faltantes.length === 0) {
      showMsg('bilheteOcrFeedback', '✅ Bilhete lido! Toque em qualquer dezena acima se precisar ajustar algum número (01 a 60).', 'ok');
    } else if (resultado.jogos.length > 0 || resultado.concursoInicio || resultado.valorTotal !== null) {
      showMsg(
        'bilheteOcrFeedback',
        `⚠️ Leitura parcial. Não identificado automaticamente: <strong>${faltantes.join(', ')}</strong>. Complete manualmente tocando nos campos.`,
        'warn'
      );
    } else {
      showMsg(
        'bilheteOcrFeedback',
        'Não foi possível ler o bilhete. Tente fotografar mais de perto, sem brilho e com o canhoto reto, ou preencha tocando nas dezenas.',
        'err'
      );
    }
  } catch (err) {
    showMsg('bilheteOcrFeedback', 'Erro na leitura OCR: ' + err.message, 'err');
  } finally {
    progBar.style.width = '100%';
    setTimeout(() => progWrap.classList.add('hidden'), 600);
  }
}
