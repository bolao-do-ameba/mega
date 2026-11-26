// =========================================================================
// MOTOR DE TOUR INTERATIVO COM SPOTLIGHT
// =========================================================================
window.tourState = {
  ativo: false,
  passos: [],
  indice: 0,
  abaAnterior: 'tabTour'
};

function obterPassosTour() {
  const isAdmin = usuarioEhAdminNoBolao();
  const carrosselVisivel = !document.getElementById('boloesCarouselSection')?.classList.contains('hidden');

  const passos = [
    {
      id: 'nav',
      tab: 'tabPagar',
      selector: '#bottomNav',
      titulo: '📱 Navegação',
      texto: 'Use a barra fixa na parte inferior para alternar entre Pagar, Jogos, Rodadas, Resumo, Perfil e Tour.'
    }
  ];

  if (carrosselVisivel) {
    passos.push({
      id: 'boloes',
      tab: 'tabPagar',
      selector: '#boloesCarouselSection',
      titulo: '🎯 Meus Bolões',
      texto: 'Arraste os cartões para a esquerda ou direita e toque em um bolão para alternar entre suas sessões.'
    });
  }

  passos.push(
    {
      id: 'resultado',
      tab: 'tabPagar',
      selector: '#cardUltimoResultado',
      titulo: '🎱 Resultado da Mega-Sena',
      texto: 'Exibe automaticamente as 6 dezenas do último sorteio oficial, se acumulou e a estimativa do próximo concurso.'
    },
    {
      id: 'push',
      tab: 'tabPagar',
      selector: '#btnPush',
      titulo: '🔔 Notificações Push',
      texto: 'Ative para receber alertas de resultados, lembrete diário de cota em aberto e aprovação de convites. No iPhone, adicione à Tela de Início pelo Safari antes.'
    },
    {
      id: 'pagar',
      tab: 'tabPagar',
      selector: '#pixBoxArea',
      titulo: '💸 Chave Pix',
      texto: 'Copie a chave Pix do bolão ativo para transferir sua cota.'
    },
    {
      id: 'pendencias',
      tab: 'tabPagar',
      selector: '#pendenciasArea',
      titulo: '🧾 Pendências & Comprovante',
      texto: 'Anexe o PDF ou print do comprovante Pix. A validação ocorre no aparelho e salva uma cópia no Google Drive.'
    },
    {
      id: 'jogos',
      tab: 'tabJogos',
      selector: '#cardJogosConcursos',
      titulo: '🎟️ Jogos por Concurso',
      texto: 'Mostra todos os jogos agrupados por concurso — inclusive bilhetes de Teimosinha em cada concurso correspondente.'
    },
    {
      id: 'rodadas',
      tab: 'tabRodadas',
      selector: '#cardRodadas',
      titulo: '📄 Rodadas & Rateios',
      texto: 'Acompanhe os rateios, a data do bilhete, o ícone 📄 do comprovante no Drive e a conferência das dezenas.'
    },
    {
      id: 'resumo',
      tab: 'tabResumo',
      selector: '#cardResumoMensal',
      titulo: '📊 Resumo & Rankings',
      texto: 'Veja o consumo, saldo em aberto e status por participante na Situação Atual e mês a mês.'
    },
    {
      id: 'conta',
      tab: 'tabCadastro',
      selector: '#cardMinhasTransferencias',
      titulo: '💳 Minha Conta',
      texto: 'Consulte seu saldo total, histórico de pagamentos e comprovantes (📄).'
    },
    {
      id: 'perfil',
      tab: 'tabCadastro',
      selector: '#cardCadastro',
      titulo: '👤 Perfil',
      texto: 'Ajuste seu Nome no comprovante para coincidir com o nome impresso pelo banco no Pix.'
    }
  );

  if (isAdmin) {
    passos.push(
      {
        id: 'admin_busca',
        tab: 'tabPagar',
        selector: '#adminBuscaResultadoWrap',
        titulo: '🔄 Admin: Buscar Resultado',
        texto: 'Busque o último concurso, um número específico ou um intervalo (ex.: 3087-3090).'
      },
      {
        id: 'admin',
        tab: 'tabAdmin',
        selector: '#cardAdminRodada',
        titulo: '⚙️ Admin: Nova Rodada & OCR',
        texto: 'Use a câmera ou foto do canhoto da Caixa para ler jogos, concurso inicial/final, valor total e data do bilhete automaticamente.'
      },
      {
        id: 'admin_pix',
        tab: 'tabAdmin',
        selector: '#cardConfigPix',
        titulo: '💸 Admin: Configurar Pix',
        texto: 'Atualize o recebedor e a chave Pix deste bolão diretamente pelo portal.'
      }
    );
  }

  return passos;
}

function iniciarTour(indiceInicial = 0) {
  if (!state.user) return;
  window.tourState.passos = obterPassosTour();
  if (window.tourState.passos.length === 0) return;

  window.tourState.abaAnterior = state.abaAtual || 'tabTour';
  window.tourState.ativo = true;
  window.tourState.indice = Math.max(0, Math.min(indiceInicial, window.tourState.passos.length - 1));

  document.getElementById('tourBlocker').classList.remove('hidden');
  document.getElementById('tourSpotlight').classList.remove('hidden');
  document.getElementById('tourTooltip').classList.remove('hidden');

  renderPassoTour();
}

function iniciarTourNoPasso(idPasso) {
  const passos = obterPassosTour();
  const idx = passos.findIndex(p => p.id === idPasso);
  iniciarTour(idx >= 0 ? idx : 0);
}

function proximoPassoTour() {
  if (!window.tourState.ativo) return;
  if (window.tourState.indice < window.tourState.passos.length - 1) {
    window.tourState.indice += 1;
    renderPassoTour();
  } else {
    encerrarTour();
  }
}

function anteriorPassoTour() {
  if (!window.tourState.ativo || window.tourState.indice <= 0) return;
  window.tourState.indice -= 1;
  renderPassoTour();
}

function encerrarTour() {
  if (!window.tourState.ativo) return;
  window.tourState.ativo = false;
  document.getElementById('tourBlocker').classList.add('hidden');
  document.getElementById('tourSpotlight').classList.add('hidden');
  document.getElementById('tourTooltip').classList.add('hidden');
  if (state.user && window.tourState.abaAnterior) {
    trocarAba(window.tourState.abaAnterior);
  }
}

function renderPassoTour() {
  const passo = window.tourState.passos[window.tourState.indice];
  if (!passo) return;

  if (passo.tab && state.abaAtual !== passo.tab) {
    trocarAba(passo.tab);
  }

  const total = window.tourState.passos.length;
  const atual = window.tourState.indice + 1;
  document.getElementById('tourStepCounter').textContent = `Passo ${atual} de ${total}`;
  document.getElementById('tourProgressFill').style.width = `${Math.round((atual / total) * 100)}%`;
  document.getElementById('tourTitle').textContent = passo.titulo;
  document.getElementById('tourText').textContent = passo.texto;
  document.getElementById('tourPrevBtn').disabled = window.tourState.indice === 0;
  document.getElementById('tourNextBtn').textContent =
    window.tourState.indice === total - 1 ? 'Concluir ✓' : 'Próximo →';

  const el = document.querySelector(passo.selector);
  if (el) {
    const style = window.getComputedStyle(el);
    if (style.position !== 'fixed') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => posicionarSpotlightETooltip(el), 60);
    setTimeout(() => posicionarSpotlightETooltip(el), 320);
  }
}

function posicionarSpotlightETooltip(el) {
  if (!window.tourState.ativo || !el) return;
  const spot = document.getElementById('tourSpotlight');
  const tip = document.getElementById('tourTooltip');
  const rect = el.getBoundingClientRect();

  const pad = 6;
  const top = Math.max(4, rect.top - pad);
  const left = Math.max(4, rect.left - pad);
  const width = Math.min(window.innerWidth - 8, rect.width + pad * 2);
  const height = Math.min(window.innerHeight - 8, rect.height + pad * 2);

  spot.style.top = `${top}px`;
  spot.style.left = `${left}px`;
  spot.style.width = `${width}px`;
  spot.style.height = `${height}px`;

  const tipRect = tip.getBoundingClientRect();
  const tipW = tipRect.width || Math.min(360, window.innerWidth - 24);
  const tipH = tipRect.height || 200;
  const margin = 12;

  const spaceBelow = window.innerHeight - (top + height);
  const spaceAbove = top;

  let tipTop;
  if (spaceBelow >= tipH + margin + 10) tipTop = top + height + margin;
  else if (spaceAbove >= tipH + margin + 10) tipTop = top - tipH - margin;
  else tipTop = Math.max(margin, Math.min(window.innerHeight - tipH - margin, (window.innerHeight - tipH) / 2));

  let tipLeft = left + (width / 2) - (tipW / 2);
  tipLeft = Math.max(margin, Math.min(window.innerWidth - tipW - margin, tipLeft));

  tip.style.top = `${tipTop}px`;
  tip.style.left = `${tipLeft}px`;
}

function atualizarPosicaoTourAtual() {
  if (!window.tourState.ativo) return;
  const passo = window.tourState.passos[window.tourState.indice];
  if (!passo) return;
  const el = document.querySelector(passo.selector);
  if (el) posicionarSpotlightETooltip(el);
}

window.addEventListener('resize', atualizarPosicaoTourAtual);
window.addEventListener('scroll', atualizarPosicaoTourAtual, { passive: true });
window.addEventListener('keydown', e => {
  if (!window.tourState.ativo) return;
  if (e.key === 'Escape') encerrarTour();
  else if (e.key === 'ArrowRight') proximoPassoTour();
  else if (e.key === 'ArrowLeft') anteriorPassoTour();
});
