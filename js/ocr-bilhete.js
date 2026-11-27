// =========================================================================
// OCR DE BILHETE CAIXA v4 — DETECÇÃO DE LINHAS TRACEJADAS, REMOÇÃO DE
// RISCO DIAGONAL DOS ZEROS (Ø -> 0), FOTO, CÂMERA AO VIVO E PDF
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

// =========================================================================
// PRÉ-PROCESSAMENTO DE IMAGEM (MARCA D'ÁGUA AZUL, BINARIZAÇÃO ADAPTATIVA,
// DETECÇÃO DE TRACEJADOS E LIMPEZA DO RISCO DIAGONAL DOS ZEROS)
// =========================================================================
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

  const page1 = await pdf.getPage(1);
  const viewport = page1.getViewport({ scale: 2.4 });
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
      const targetMinW = 1350;
      const targetMaxW = 1800;
      let escala = 1;
      if (w > targetMaxW) escala = targetMaxW / w;
      else if (w < targetMinW && w > 0) escala = Math.min(3.8, targetMinW / w);

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

// Extrai mapa de cinza priorizando canal azul (apaga marca d'água azul "loterias CAIXA")
function extrairCinzaSemMarcaAzul(baseCanvas) {
  const w = baseCanvas.width;
  const h = baseCanvas.height;
  const ctx = baseCanvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, w, h).data;
  const total = w * h;
  const gray = new Uint8Array(total);
  for (let i = 0, p = 0; p < total; i += 4, p++) {
    const v = 0.15 * d[i + 1] + 0.85 * d[i + 2];
    gray[p] = v < 0 ? 0 : (v > 255 ? 255 : v);
  }
  return { gray, w, h };
}

// Binarização adaptativa local (Integral Image / Bradley): retorna Uint8Array (1 = tinta preta, 0 = fundo branco)
function binarizarBradley(gray, w, h, fatorT = 0.88) {
  const total = w * h;
  const integral = new Float64Array(total);
  for (let y = 0; y < h; y++) {
    let somaLinha = 0;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      somaLinha += gray[rowOff + x];
      integral[rowOff + x] = y === 0 ? somaLinha : (integral[(y - 1) * w + x] + somaLinha);
    }
  }

  const raio = Math.max(14, Math.floor(w / 26));
  const bw = new Uint8Array(total);
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
      bw[idx] = (gray[idx] * count) < (sum * fatorT) ? 1 : 0;
    }
  }
  return bw;
}

// Detecta os limites horizontais do papel branco do bilhete (evita fundo escuro da mesa)
function detectarLimitesPapelX(gray, w, h) {
  const yIni = Math.floor(h * 0.2);
  const yFim = Math.floor(h * 0.8);
  const passoY = Math.max(1, Math.floor((yFim - yIni) / 60));
  const colMed = new Float32Array(w);
  const amostras = [];

  for (let x = 0; x < w; x++) {
    let soma = 0;
    let cnt = 0;
    for (let y = yIni; y < yFim; y += passoY) {
      soma += gray[y * w + x];
      cnt++;
    }
    const med = cnt > 0 ? soma / cnt : 0;
    colMed[x] = med;
    if (x % 4 === 0) amostras.push(med);
  }

  amostras.sort((a, b) => a - b);
  const p70 = amostras[Math.floor(amostras.length * 0.7)] || 160;
  const limiar = p70 * 0.65;

  let px0 = 0;
  let px1 = w - 1;
  for (let x = 0; x < w; x++) {
    if (colMed[x] >= limiar) { px0 = x; break; }
  }
  for (let x = w - 1; x >= 0; x--) {
    if (colMed[x] >= limiar) { px1 = x; break; }
  }
  if (px1 - px0 < w * 0.4) {
    return { px0: 0, px1: w - 1 };
  }
  return { px0, px1 };
}

// Detecta as linhas tracejadas horizontais que separam cada jogo no bilhete da Caixa
function detectarLinhasTracejadasBilhete(bw, w, h, px0, px1) {
  const pw = px1 - px0 + 1;
  const dx0 = px0 + Math.floor(pw * 0.10);
  const dx1 = px1 - Math.floor(pw * 0.10);
  const dw = dx1 - dx0 + 1;
  if (dw < 60) return [];

  const yMin = Math.floor(h * 0.12);
  const yMax = Math.floor(h * 0.85);
  const rowInk = new Float32Array(h);
  const transitions = new Int32Array(h);

  for (let y = yMin; y < yMax; y++) {
    const off = y * w;
    let ink = 0;
    let tr = 0;
    let prev = bw[off + dx0];
    if (prev) ink++;
    for (let x = dx0 + 1; x <= dx1; x++) {
      const cur = bw[off + x];
      if (cur) ink++;
      if (!prev && cur) tr++;
      prev = cur;
    }
    rowInk[y] = ink / dw;
    transitions[y] = tr;
  }

  // Agrupa linhas contíguas com tinta
  const bands = [];
  let emBanda = false;
  let sy = 0;
  for (let y = yMin; y < yMax; y++) {
    if (rowInk[y] > 0.038) {
      if (!emBanda) {
        emBanda = true;
        sy = y;
      }
    } else if (emBanda) {
      bands.push({ y1: sy, y2: y - 1 });
      emBanda = false;
    }
  }
  if (emBanda) bands.push({ y1: sy, y2: yMax - 1 });

  const tracejadas = [];
  for (const b of bands) {
    const bh = b.y2 - b.y1 + 1;
    if (bh < 2 || bh > h * 0.020) continue;

    let maxTr = 0;
    let maxInk = 0;
    for (let y = b.y1; y <= b.y2; y++) {
      if (transitions[y] > maxTr) maxTr = transitions[y];
      if (rowInk[y] > maxInk) maxInk = rowInk[y];
    }

    let firstX = -1;
    let lastX = -1;
    for (let x = dx0; x <= dx1; x++) {
      let has = false;
      for (let y = b.y1; y <= b.y2; y++) {
        if (bw[y * w + x]) { has = true; break; }
      }
      if (has) {
        if (firstX < 0) firstX = x;
        lastX = x;
      }
    }

    const span = firstX >= 0 ? (lastX - firstX + 1) / dw : 0;
    if (span >= 0.45 && maxTr >= 12 && maxInk >= 0.10 && maxInk <= 0.85) {
      tracejadas.push({ y1: b.y1, y2: b.y2, x1: firstX, x2: lastX });
    }
  }

  return tracejadas;
}

// Identifica se um caractere binarizado é um zero com risco diagonal (Ø da impressora Caixa)
function ehZeroCortadoCaixa(bw, w, bx1, by1, bx2, by2) {
  const chW = bx2 - bx1 + 1;
  const chH = by2 - by1 + 1;
  if (chH < 14 || chW < 8 || chH > 180 || chW > 180) return false;

  const aspect = chW / chH;
  if (aspect < 0.34 || aspect > 1.35) return false;

  const mediaRegiao = (rx1, ry1, rx2, ry2) => {
    const xA = Math.max(bx1, rx1);
    const xB = Math.min(bx2, rx2);
    const yA = Math.max(by1, ry1);
    const yB = Math.min(by2, ry2);
    if (xB < xA || yB < yA) return 0;
    let soma = 0;
    let cnt = 0;
    for (let y = yA; y <= yB; y++) {
      const off = y * w;
      for (let x = xA; x <= xB; x++) {
        soma += bw[off + x];
        cnt++;
      }
    }
    return cnt > 0 ? soma / cnt : 0;
  };

  const fTop = Math.max(2, Math.floor(chH / 6));
  const fSide = Math.max(2, Math.floor(chW / 5));

  const topInk = mediaRegiao(bx1, by1, bx2, by1 + fTop - 1);
  const botInk = mediaRegiao(bx1, by2 - fTop + 1, bx2, by2);
  const leftInk = mediaRegiao(bx1, by1, bx1 + fSide - 1, by2);
  const rightInk = mediaRegiao(bx2 - fSide + 1, by1, bx2, by2);

  if (leftInk < 0.50 || rightInk < 0.50 || topInk < 0.28 || botInk < 0.32) return false;

  // Verifica ausência de "cintura" no meio (o dígito 8 estreita no meio; o 0 tem paredes retas)
  const midY1 = by1 + Math.floor(chH * 0.40);
  const midY2 = by1 + Math.floor(chH * 0.60);
  const midL = mediaRegiao(bx1, midY1, bx1 + fSide - 1, midY2);
  const midR = mediaRegiao(bx2 - fSide + 1, midY1, bx2, midY2);
  if (midL < 0.56 || midR < 0.56) return false;

  // Verifica presença da barra diagonal "/" no miolo (quadrantes NE + SW >> NW + SE)
  const iy1 = by1 + Math.floor(chH * 0.22);
  const iy2 = by1 + Math.floor(chH * 0.78);
  const ix1 = bx1 + Math.floor(chW * 0.22);
  const ix2 = bx1 + Math.floor(chW * 0.78);
  const imY = Math.floor((iy1 + iy2) / 2);
  const imX = Math.floor((ix1 + ix2) / 2);

  const qNW = mediaRegiao(ix1, iy1, imX, imY);
  const qNE = mediaRegiao(imX + 1, iy1, ix2, imY);
  const qSW = mediaRegiao(ix1, imY + 1, imX, iy2);
  const qSE = mediaRegiao(imX + 1, imY + 1, ix2, iy2);

  const cY1 = iy1 + Math.floor((iy2 - iy1) * 0.25);
  const cY2 = iy1 + Math.floor((iy2 - iy1) * 0.75);
  const cX1 = ix1 + Math.floor((ix2 - ix1) * 0.25);
  const cX2 = ix1 + Math.floor((ix2 - ix1) * 0.75);
  const ctr = mediaRegiao(cX1, cY1, cX2, cY2);

  const slash = (qNE + qSW) - (qNW + qSE);
  return ctr >= 0.22 && slash >= 0.35;
}

// Localiza todos os componentes conectados em uma região recortada, apaga o risco interno
// de todos os zeros cortados (Ø -> 0 limpo) e opcionalmente limpa pequenos ruídos
function limparZerosCortadosERuido(bw, w, h, removerRuido = true) {
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let zerosLimpos = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const startIdx = y * w + x;
      if (!bw[startIdx] || visited[startIdx]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;

      let bx1 = x, bx2 = x, by1 = y, by2 = y;

      while (head < tail) {
        const idx = queue[head++];
        const cx = idx % w;
        const cy = (idx - cx) / w;
        if (cx < bx1) bx1 = cx;
        if (cx > bx2) bx2 = cx;
        if (cy < by1) by1 = cy;
        if (cy > by2) by2 = cy;

        if (cx > 0) {
          const n = idx - 1;
          if (bw[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
        }
        if (cx + 1 < w) {
          const n = idx + 1;
          if (bw[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
        }
        if (cy > 0) {
          const n = idx - w;
          if (bw[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
        }
        if (cy + 1 < h) {
          const n = idx + w;
          if (bw[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
        }
      }

      const area = tail;
      const chW = bx2 - bx1 + 1;
      const chH = by2 - by1 + 1;

      if (removerRuido && (area < 12 || (chH < 8 && chW < 8))) {
        for (let k = 0; k < tail; k++) bw[queue[k]] = 0;
        continue;
      }

      if (ehZeroCortadoCaixa(bw, w, bx1, by1, bx2, by2)) {
        const padY = Math.max(2, Math.round(chH * 0.22));
        const padX = Math.max(2, Math.round(chW * 0.24));
        for (let ry = by1 + padY; ry <= by2 - padY; ry++) {
          const off = ry * w;
          for (let rx = bx1 + padX; rx <= bx2 - padX; rx++) {
            bw[off + rx] = 0;
          }
        }
        zerosLimpos++;
      }
    }
  }

  return zerosLimpos;
}

// Recorta uma faixa de `bw` global, limpa zeros cortados e retorna um canvas com margem branca
function montarCanvasRecorteLimpo(bwGlobal, wGlobal, hGlobal, rx1, ry1, rx2, ry2, removerRuido = true) {
  const x1 = Math.max(0, Math.floor(rx1));
  const y1 = Math.max(0, Math.floor(ry1));
  const x2 = Math.min(wGlobal - 1, Math.ceil(rx2));
  const y2 = Math.min(hGlobal - 1, Math.ceil(ry2));
  const cw = Math.max(1, x2 - x1 + 1);
  const ch = Math.max(1, y2 - y1 + 1);

  const subBw = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    const srcOff = (y1 + y) * wGlobal + x1;
    const dstOff = y * cw;
    for (let x = 0; x < cw; x++) {
      subBw[dstOff + x] = bwGlobal[srcOff + x];
    }
  }

  const zerosLimpos = limparZerosCortadosERuido(subBw, cw, ch, removerRuido);

  const pad = 24;
  const out = document.createElement('canvas');
  out.width = cw + pad * 2;
  out.height = ch + pad * 2;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);

  const imgData = ctx.createImageData(cw, ch);
  const d = imgData.data;
  for (let i = 0, p = 0; p < subBw.length; i += 4, p++) {
    const v = subBw[p] ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imgData, pad, pad);

  return { canvas: out, zerosLimpos };
}

function gerarCanvasContrasteSuaveRecorte(baseCanvas, rx1, ry1, rx2, ry2) {
  const x1 = Math.max(0, Math.floor(rx1));
  const y1 = Math.max(0, Math.floor(ry1));
  const cw = Math.max(1, Math.min(baseCanvas.width - x1, Math.ceil(rx2) - x1 + 1));
  const ch = Math.max(1, Math.min(baseCanvas.height - y1, Math.ceil(ry2) - y1 + 1));

  const pad = 24;
  const out = document.createElement('canvas');
  out.width = cw + pad * 2;
  out.height = ch + pad * 2;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(baseCanvas, x1, y1, cw, ch, pad, pad, cw, ch);

  const imgData = ctx.getImageData(pad, pad, cw, ch);
  const d = imgData.data;
  const contrast = 1.85;
  const intercept = 128 * (1 - contrast);
  for (let i = 0; i < d.length; i += 4) {
    let v = (0.15 * d[i + 1] + 0.85 * d[i + 2]) * contrast + intercept;
    v = v < 0 ? 0 : (v > 255 ? 255 : v);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imgData, pad, pad);
  return out;
}

// =========================================================================
// PARSERS DE TEXTO DO BILHETE CAIXA
// =========================================================================
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
    if (isNaN(ini) || ini < 100 || ini > 99999) return null;
    const fimValido = !isNaN(fim) && fim >= ini && (fim - ini) < 50;
    const fimFinal = fimValido ? fim : ini;
    const concursos = [];
    for (let c = ini; c <= fimFinal; c++) concursos.push(String(c));
    return {
      concursoInicio: String(ini),
      concursoFim: String(fimFinal),
      concursos,
      concursoDisplay: ini === fimFinal ? String(ini) : `${ini} a ${fimFinal}`
    };
  };

  // Ex.: CONC 3087 ATÉ 3090 / CONC. 3087 A 3090 / CONC 3087 - 3090
  const mFaixa = textoNorm.match(
    /C[O0]NC(?:URS[O0])?\.?\s*[:#-]?\s*([0-9OQØDIL|]{3,5})\s*(?:AT[E3C]|A1E|A|-|–|\/)\s*([0-9OQØDIL|]{3,5})/
  );
  if (mFaixa) {
    const res = montarFaixa(mFaixa[1], mFaixa[2]);
    if (res) return res;
  }

  // Fallback quando "ATÉ" sai borrado entre dois concursos de 4 dígitos
  const mConcDoisNums = textoNorm.match(
    /C[O0]NC(?:URS[O0])?\.?\s*[:#-]?\s*([0-9OQØDIL|]{4})\s+[^\n\d]{1,6}\s*([0-9OQØDIL|]{4})/
  );
  if (mConcDoisNums) {
    const res = montarFaixa(mConcDoisNums[1], mConcDoisNums[2]);
    if (res && res.concursos.length > 1) return res;
  }

  const mAte = textoNorm.match(/\b([0-9OQØD]{4})\s+AT[E3C]\s+([0-9OQØD]{4})\b/);
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

// Extrai as dezenas de UMA única faixa recortada entre duas linhas tracejadas
function extrairDezenasDeFaixaJogo(textoFaixa) {
  const norm = String(textoFaixa || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const tokens = norm.replace(/[^0-9A-Z]/g, ' ').split(/\s+/).filter(Boolean);
  const numeros = [];

  tokens.forEach(tk => {
    const digitos = corrigirDigitosTokenBilhete(tk);
    if (!digitos) return;

    if (digitos.length <= 2) {
      const n = parseInt(digitos, 10);
      if (n >= 1 && n <= 60) numeros.push(n);
    } else if (digitos.length % 2 === 0 && digitos.length <= 12) {
      // Caso dois pares tenham vindo colados sem espaço (ex.: "0409" -> 04, 09)
      const pares = [];
      let todosValidos = true;
      for (let i = 0; i < digitos.length; i += 2) {
        const n = parseInt(digitos.slice(i, i + 2), 10);
        if (n >= 1 && n <= 60) pares.push(n);
        else { todosValidos = false; break; }
      }
      if (todosValidos) pares.forEach(n => numeros.push(n));
    }
  });

  const unicos = [...new Set(numeros)].sort((a, b) => a - b);
  if (unicos.length >= 6 && unicos.length <= 20) {
    return unicos.map(n => String(n).padStart(2, '0'));
  }
  return [];
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

async function rodarTesseractBilhete(canvas, opcoes = {}, onProgresso) {
  const params = {
    tessedit_pageseg_mode: opcoes.psm || '6',
    preserve_interword_spaces: '1',
    logger: m => {
      if (m.status === 'recognizing text' && typeof onProgresso === 'function') {
        onProgresso(m.progress || 0);
      }
    }
  };
  if (opcoes.whitelist) {
    params.tessedit_char_whitelist = opcoes.whitelist;
  }
  const res = await Tesseract.recognize(canvas, opcoes.lang || 'por', params);
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

// =========================================================================
// PIPELINE PRINCIPAL DO OCR (COM DETECÇÃO DE TRACEJADOS + LIMPEZA DE Ø -> 0)
// =========================================================================
async function executarOcrBilheteDeFonte(fonte) {
  const progWrap = document.getElementById('bilheteOcrProgressoWrap');
  const progBar = document.getElementById('bilheteOcrBar');
  const progTxt = document.getElementById('bilheteOcrStatus');
  const feedback = document.getElementById('bilheteOcrFeedback');
  const resumoChips = document.getElementById('bilheteOcrResumo');

  progWrap.classList.remove('hidden');
  progBar.style.width = '8%';
  progTxt.textContent = 'Tratando imagem e removendo marca d’água...';
  feedback.innerHTML = '';
  if (resumoChips) resumoChips.classList.add('hidden');

  try {
    let resultado = null;
    let logsOcr = [];
    let fonteImagem = fonte;

    const ehPdf = !(fonte instanceof HTMLCanvasElement) && (
      fonte.type === 'application/pdf' ||
      String(fonte.name || '').toLowerCase().endsWith('.pdf')
    );

    if (ehPdf) {
      progTxt.textContent = 'Lendo PDF do bilhete...';
      progBar.style.width = '35%';
      const pdfRes = await extrairTextoOuCanvasDePDFBilhete(fonte);
      if (pdfRes.modo === 'texto') {
        resultado = pdfRes.parsed;
        logsOcr.push('--- PDF TEXTO DIGITAL ---\n' + pdfRes.texto);
        progBar.style.width = '95%';
      } else {
        fonteImagem = pdfRes.canvas;
      }
    }

    if (!resultado) {
      const baseCanvas = await carregarImagemEmCanvasBase(fonteImagem);
      const { gray, w, h } = extrairCinzaSemMarcaAzul(baseCanvas);
      const bw = binarizarBradley(gray, w, h, 0.88);
      const { px0, px1 } = detectarLimitesPapelX(gray, w, h);
      const pw = px1 - px0 + 1;
      const tracejadas = detectarLinhasTracejadasBilhete(bw, w, h, px0, px1);

      logsOcr.push(`Dimensões: ${w}x${h} | Papel X: ${px0}..${px1} | Linhas tracejadas: ${tracejadas.length}`);

      // MODO 1 (PRECISÃO MÁXIMA): Bilhete físico Caixa com linhas tracejadas separando os jogos
      if (tracejadas.length >= 2) {
        const dashXs1 = tracejadas.map(t => t.x1).sort((a, b) => a - b);
        const dashXs2 = tracejadas.map(t => t.x2).sort((a, b) => a - b);
        const dashX1 = dashXs1[Math.floor(dashXs1.length / 2)];
        const dashX2 = dashXs2[Math.floor(dashXs2.length / 2)];

        // Faixas entre tracejados consecutivos com altura plausível para 1 jogo (1 a 3 linhas de dezenas)
        const faixasJogos = [];
        for (let i = 0; i < tracejadas.length - 1; i++) {
          const gy1 = tracejadas[i].y2 + 3;
          const gy2 = tracejadas[i + 1].y1 - 3;
          const gh = gy2 - gy1 + 1;
          if (gh >= Math.max(24, h * 0.022) && gh <= h * 0.24) {
            faixasJogos.push({ y1: gy1, y2: gy2 });
          }
        }

        const jogosLidos = [];
        const totalEtapas = faixasJogos.length + 2;
        let etapaAtual = 0;

        for (let i = 0; i < faixasJogos.length; i++) {
          etapaAtual++;
          progBar.style.width = Math.round(15 + (etapaAtual / totalEtapas) * 70) + '%';
          progTxt.textContent = `Lendo Jogo ${i + 1} de ${faixasJogos.length} (limpando zeros cortados)...`;

          const faixa = faixasJogos[i];
          // Recorta exatamente na largura dos tracejados (exclui letras A/B/C e bordas azuis)
          const recorte = montarCanvasRecorteLimpo(bw, w, h, dashX1 - 6, faixa.y1, dashX2 + 6, faixa.y2, true);
          let txtJogo = await rodarTesseractBilhete(recorte.canvas, {
            psm: '6',
            whitelist: '0123456789 '
          });
          let dezenas = extrairDezenasDeFaixaJogo(txtJogo);

          // Se falhou na primeira leitura da faixa, tenta contraste suave naquela faixa
          if (dezenas.length < 6) {
            const softCanvas = gerarCanvasContrasteSuaveRecorte(baseCanvas, dashX1 - 6, faixa.y1, dashX2 + 6, faixa.y2);
            const txtSoft = await rodarTesseractBilhete(softCanvas, {
              psm: '6',
              whitelist: '0123456789 '
            });
            const dezSoft = extrairDezenasDeFaixaJogo(txtSoft);
            if (dezSoft.length >= 6) {
              dezenas = dezSoft;
              txtJogo = `${txtJogo.trim()} | [soft]: ${txtSoft.trim()}`;
            }
          }

          logsOcr.push(`Jogo #${i + 1} (y=${faixa.y1}..${faixa.y2}, Ø limpos=${recorte.zerosLimpos}): "${txtJogo.trim()}" => [${dezenas.join(' ')}]`);
          if (dezenas.length >= 6) {
            jogosLidos.push(dezenas);
          }
        }

        // Faixa do rodapé (logo abaixo do último tracejado: CONC, ATÉ, DATA e TOTAL R$)
        etapaAtual++;
        progBar.style.width = Math.round(15 + (etapaAtual / totalEtapas) * 70) + '%';
        progTxt.textContent = 'Lendo concurso, data e valor total...';

        const ultimoDash = tracejadas[tracejadas.length - 1];
        const footerY1 = ultimoDash.y2 + 3;
        const footerY2 = Math.min(h - 1, ultimoDash.y2 + Math.round(h * 0.17));
        const footerX1 = px0 + Math.floor(pw * 0.05);
        const footerX2 = px1 - Math.floor(pw * 0.05);

        const recorteFooter = montarCanvasRecorteLimpo(bw, w, h, footerX1, footerY1, footerX2, footerY2, false);
        const txtFooter = await rodarTesseractBilhete(recorteFooter.canvas, { psm: '6' });
        logsOcr.push(`--- RODAPÉ (Ø limpos=${recorteFooter.zerosLimpos}) ---\n${txtFooter.trim()}`);

        let conc = extrairConcursosBilheteLocal(txtFooter);
        let valorTotal = extrairValorTotalBilheteLocal(txtFooter);
        let dataInfo = normalizarDataBilheteCaixa(txtFooter);

        // Se faltou concurso, valor ou data no rodapé, tenta contraste suave no rodapé + cabeçalho acima do 1º tracejado
        if (!conc.concursoInicio || valorTotal === null || !dataInfo.data_bilhete) {
          const softFooter = gerarCanvasContrasteSuaveRecorte(baseCanvas, footerX1, footerY1, footerX2, footerY2);
          const txtFooterSoft = await rodarTesseractBilhete(softFooter, { psm: '6' });
          logsOcr.push(`--- RODAPÉ (soft) ---\n${txtFooterSoft.trim()}`);

          if (!conc.concursoInicio) conc = extrairConcursosBilheteLocal(txtFooterSoft);
          if (valorTotal === null) valorTotal = extrairValorTotalBilheteLocal(txtFooterSoft);
          if (!dataInfo.data_bilhete) dataInfo = normalizarDataBilheteCaixa(txtFooterSoft);
        }

        if (!dataInfo.data_bilhete) {
          const primeiroDash = tracejadas[0];
          const headY1 = Math.max(0, primeiroDash.y1 - Math.round(h * 0.10));
          const headY2 = Math.max(headY1 + 10, primeiroDash.y1 - 3);
          const recorteHead = montarCanvasRecorteLimpo(bw, w, h, footerX1, headY1, footerX2, headY2, false);
          const txtHead = await rodarTesseractBilhete(recorteHead.canvas, { psm: '6' });
          logsOcr.push(`--- CABEÇALHO (Ø limpos=${recorteHead.zerosLimpos}) ---\n${txtHead.trim()}`);
          dataInfo = normalizarDataBilheteCaixa(txtHead);
        }

        resultado = {
          jogos: jogosLidos,
          concursoInicio: conc.concursoInicio,
          concursoFim: conc.concursoFim,
          concursos: conc.concursos,
          concursoDisplay: conc.concursoDisplay,
          valorTotal,
          dataBilhete: dataInfo.data_bilhete,
          dataBilheteRaw: dataInfo.data_bilhete_raw
        };
      }

      // MODO 2 (FALLBACK): se não detectou tracejados (ex.: print digital ou foto sem tracejado)
      if (!resultado || resultado.jogos.length === 0) {
        progBar.style.width = '30%';
        progTxt.textContent = 'Lendo bilhete completo (limpando zeros cortados)...';

        const recorteFull = montarCanvasRecorteLimpo(bw, w, h, px0, 0, px1, h - 1, false);
        const texto1 = await rodarTesseractBilhete(recorteFull.canvas, { psm: '6' }, p => {
          progBar.style.width = Math.round(30 + p * 35) + '%';
          progTxt.textContent = `OCR Completo: ${Math.round(p * 100)}%`;
        });
        logsOcr.push(`--- FALLBACK COMPLETO (Ø limpos=${recorteFull.zerosLimpos}) ---\n${texto1.trim()}`);

        let resFull = parsearBilheteCaixaLocal(texto1);

        if (resFull.jogos.length === 0 || !resFull.concursoInicio || resFull.valorTotal === null || !resFull.dataBilhete) {
          progTxt.textContent = 'Refinando leitura (2/2)...';
          const softFull = gerarCanvasContrasteSuaveRecorte(baseCanvas, px0, 0, px1, h - 1);
          const texto2 = await rodarTesseractBilhete(softFull, { psm: '6' }, p => {
            progBar.style.width = Math.round(65 + p * 30) + '%';
            progTxt.textContent = `Refinando OCR: ${Math.round(p * 100)}%`;
          });
          logsOcr.push(`--- FALLBACK SOFT ---\n${texto2.trim()}`);
          resFull = mesclarResultadosOCR(resFull, parsearBilheteCaixaLocal(texto2));
        }

        resultado = resultado ? mesclarResultadosOCR(resultado, resFull) : resFull;
      }
    }

    document.getElementById('textoBilheteBruto').textContent = logsOcr.join('\n\n');
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
      document.getElementById('rodadaValorTotal').value = resultado.valorTotal.toFixed(2).replace('.', ',');
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

    if (typeof recalcularPreviewRodada === 'function') recalcularPreviewRodada();
    renderizarResumoChipsOCR(resultado);

    const faltantes = [];
    if (resultado.jogos.length === 0) faltantes.push('jogos');
    if (!resultado.concursoInicio) faltantes.push('concurso');
    if (resultado.valorTotal === null) faltantes.push('valor total');
    if (!resultado.dataBilhete) faltantes.push('data');

    if (faltantes.length === 0) {
      showMsg('bilheteOcrFeedback', '✅ Bilhete lido por completo! Toque em qualquer dezena para ajustar o jogo ou selecione as cotas abaixo.', 'ok');
    } else if (resultado.jogos.length > 0 || resultado.concursoInicio || resultado.valorTotal !== null) {
      showMsg(
        'bilheteOcrFeedback',
        `⚠️ Leitura parcial. Não identificado automaticamente: <strong>${faltantes.join(', ')}</strong>. Complete manualmente tocando nos campos.`,
        'warn'
      );
    } else {
      showMsg(
        'bilheteOcrFeedback',
        'Não foi possível ler o bilhete. Tente fotografar mais de perto, sem brilho e com o canhoto reto, ou preencha tocando nos jogos.',
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
