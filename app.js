// ============================================================================
// COSMIC TERMINAL - CLIENT JAVASCRIPT APPLICATION CORE (v3.3.1-modular)
// Universal Filtering, Sorting, 15M Timers, BYOK Storage, Zero-Path Prover,
// Auto-Pause Carousels, Direct Order Modals & Gemini Agent Ingestion
// ============================================================================

const WORKER_BASE = 'https://cosmic-parlays.cosmictrollgaming.workers.dev';

let currentTpMode = null;
let activeOrderVenue = 'poly';
let isCarouselPaused = false;
let currentSportFilter = 'all';

let SPORTS_PICKS_POOL = [];
let ESPORTS_PICKS_POOL = [];

let sportsCarouselIndex = 0;
let esportsCarouselIndex = 0;

// --- AUDIO CHIME SYNTHESIZER (WEB AUDIO API) ---
function playAlertChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.warn("Audio chime suppressed:", e);
  }
}

// --- LOAD DATA POOLS FROM MARKETS.JSON ---
async function loadMarketDataPools() {
  try {
    const res = await fetch('./markets.json');
    if (!res.ok) throw new Error("Local markets.json failed to load");
    const data = await res.json();
    SPORTS_PICKS_POOL = data.sports || [];
    ESPORTS_PICKS_POOL = data.esports || [];
  } catch (err) {
    console.warn("Using inline fallback market pools:", err);
    SPORTS_PICKS_POOL = [
      { id: 's1', sport: 'mlb', title: 'Nationals @ Tigers — F5 Under 4.5 Runs', pick: 'YES Under 4.5 @ $0.78', roi: 28.2, venue: 'POLY.US', yes: 0.78, no: 0.23, exp: Date.now() + 14400000 },
      { id: 's2', sport: 'mlb', title: 'Blue Jays @ Orioles — Baltimore ML', pick: 'YES Orioles ML @ $0.82', roi: 22.0, venue: 'KALSHI', yes: 0.82, no: 0.19, exp: Date.now() + 18000000 },
      { id: 's3', sport: 'nfl', title: 'Falcons @ Packers — Over 44.5 Points', pick: 'YES Over 44.5 @ $0.84', roi: 19.0, venue: 'POLY.US', yes: 0.84, no: 0.17, exp: Date.now() + 86400000 },
      { id: 's4', sport: 'mlb', title: 'Yankees @ Red Sox — First 5 Over 4.5', pick: 'YES Over 4.5 @ $0.65', roi: 53.8, venue: 'KALSHI', yes: 0.65, no: 0.36, exp: Date.now() + 21600000 },
      { id: 's5', sport: 'mlb', title: 'Dodgers @ Padres — Los Angeles ML', pick: 'YES Dodgers ML @ $0.74', roi: 35.1, venue: 'POLY.US', yes: 0.74, no: 0.27, exp: Date.now() + 25200000 },
      { id: 's6', sport: 'tennis', title: 'Daniil Medvedev vs Carlos Alcaraz', pick: 'YES Alcaraz ML @ $0.79', roi: 26.5, venue: 'POLY.US', yes: 0.79, no: 0.22, exp: Date.now() + 10800000 },
      { id: 's7', sport: 'nfl', title: 'Chiefs @ Bills — Under 48.5 Points', pick: 'YES Under 48.5 @ $0.70', roi: 42.8, venue: 'KALSHI', yes: 0.70, no: 0.31, exp: Date.now() + 90000000 },
      { id: 's8', sport: 'mlb', title: 'Phillies @ Mets — Philadelphia ML', pick: 'YES Phillies ML @ $0.80', roi: 25.0, venue: 'POLY.US', yes: 0.80, no: 0.21, exp: Date.now() + 16000000 },
      { id: 's9', sport: 'tennis', title: 'Jannik Sinner vs Alexander Zverev', pick: 'YES Sinner ML @ $0.85', roi: 17.6, venue: 'KALSHI', yes: 0.85, no: 0.16, exp: Date.now() + 32400000 }
    ];
    ESPORTS_PICKS_POOL = [
      { id: 'e1', sport: 'esports', title: 'CS2: G2 Ares vs INOX Division (BO3)', pick: 'YES G2 Ares @ $0.53', roi: 88.7, venue: 'POLY.US', yes: 0.53, no: 0.48, exp: Date.now() + 7200000 },
      { id: 'e2', sport: 'esports', title: 'CS2: Optibet vs Four Magic (BO3)', pick: 'YES Optibet Map 1 @ $0.71', roi: 40.8, venue: 'POLY.US', yes: 0.71, no: 0.30, exp: Date.now() + 12000000 },
      { id: 'e3', sport: 'esports', title: 'Dota 2: MOUZ vs Team Liquid (BO2)', pick: 'YES Liquid To Win @ $0.75', roi: 33.3, venue: 'KALSHI', yes: 0.75, no: 0.26, exp: Date.now() + 14400000 },
      { id: 'e4', sport: 'esports', title: 'CS2: NAVI vs FaZe Clan (BO3)', pick: 'YES NAVI Map 1 @ $0.68', roi: 47.0, venue: 'POLY.US', yes: 0.68, no: 0.33, exp: Date.now() + 28800000 },
      { id: 'e5', sport: 'esports', title: 'Dota 2: Spirit vs Gaimin Gladiators', pick: 'YES Spirit Map 2 @ $0.62', roi: 61.2, venue: 'KALSHI', yes: 0.62, no: 0.39, exp: Date.now() + 36000000 },
      { id: 'e6', sport: 'esports', title: 'CS2: Vitality vs Astralis (BO3)', pick: 'YES Vitality Winner @ $0.81', roi: 23.4, venue: 'POLY.US', yes: 0.81, no: 0.20, exp: Date.now() + 43200000 },
      { id: 'e7', sport: 'esports', title: 'LOL: T1 vs Gen.G (LCK Finals)', pick: 'YES T1 Map 1 @ $0.59', roi: 69.4, venue: 'KALSHI', yes: 0.59, no: 0.42, exp: Date.now() + 50400000 },
      { id: 'e8', sport: 'esports', title: 'CS2: Heroic vs Monte (BO3)', pick: 'YES Heroic Winner @ $0.76', roi: 31.5, venue: 'POLY.US', yes: 0.76, no: 0.25, exp: Date.now() + 57600000 },
      { id: 'e9', sport: 'esports', title: 'Dota 2: BetBoom vs Falcons', pick: 'YES Falcons Series @ $0.83', roi: 20.4, venue: 'POLY.US', yes: 0.83, no: 0.18, exp: Date.now() + 64800000 }
    ];
  }

  renderCarouselSet(SPORTS_PICKS_POOL, 0, 'sports-picks-container', 'sports-dots', 'SPORTS');
  renderCarouselSet(ESPORTS_PICKS_POOL, 0, 'esports-picks-container', 'esports-dots', 'ESPORTS');
}

function getFilteredPool(pool) {
  if (currentSportFilter === 'all') return pool;
  return pool.filter(p => p.sport === currentSportFilter);
}

function renderCarouselSet(pool, index, containerId, dotsId, poolKey) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentPool = getFilteredPool(pool);
  
  if (currentPool.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px; text-align: center; border: 1px dashed var(--border-color); border-radius: 6px;">No active matches for selected filter.</div>';
    return;
  }

  const sliceIndex = index % Math.ceil(currentPool.length / 3);
  const currentSet = currentPool.slice(sliceIndex * 3, (sliceIndex * 3) + 3);

  container.innerHTML = currentSet.map((item, localIdx) => {
    const aiBoxId = `${containerId}-ai-${localIdx}`;
    return `
      <div class="market-card sortable-card" data-sport="${item.sport}" data-roi="${item.roi}" data-expiry="${item.exp}">
        <div class="market-card-head">
          <span>${item.title}</span>
          <span class="tag" style="background: ${item.venue === 'POLY.US' ? '#1b1330' : '#12281a'}; color: ${item.venue === 'POLY.US' ? 'var(--accent-pink)' : 'var(--accent-green)'};">${item.venue}</span>
        </div>
        <div class="market-card-meta">
          <span>${item.pick}</span>
          <span style="color: var(--accent-green); font-weight: 800;">+${item.roi.toFixed(1)}% ROI</span>
        </div>
        <div class="action-tray">
          <button class="btn btn-green" onclick="openOrderModalById('${poolKey}', ${localIdx}, 'YES')">Buy YES @ $${item.yes.toFixed(2)}</button>
          <button class="btn btn-red" onclick="openOrderModalById('${poolKey}', ${localIdx}, 'NO')">Buy NO @ $${item.no.toFixed(2)}</button>
          <button class="btn btn-ai-inline" onclick="triggerCarouselAnalysis('${poolKey}', ${localIdx}, '${aiBoxId}')">🤖 Ask Gemini</button>
        </div>
        <div class="ai-agent-box" id="${aiBoxId}"></div>
      </div>
    `;
  }).join('');

  const dots = document.querySelectorAll(`#${dotsId} .carousel-dot`);
  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === sliceIndex));
}

function rotateCarousels() {
  if (isCarouselPaused) return;

  const activeSportsPool = getFilteredPool(SPORTS_PICKS_POOL);
  const activeEsportsPool = getFilteredPool(ESPORTS_PICKS_POOL);

  if (activeSportsPool.length > 3) {
    sportsCarouselIndex = (sportsCarouselIndex + 1) % Math.ceil(activeSportsPool.length / 3);
  }
  if (activeEsportsPool.length > 3) {
    esportsCarouselIndex = (esportsCarouselIndex + 1) % Math.ceil(activeEsportsPool.length / 3);
  }

  renderCarouselSet(SPORTS_PICKS_POOL, sportsCarouselIndex, 'sports-picks-container', 'sports-dots', 'SPORTS');
  renderCarouselSet(ESPORTS_PICKS_POOL, esportsCarouselIndex, 'esports-picks-container', 'esports-dots', 'ESPORTS');
}

function triggerCarouselAnalysis(poolKey, localIdx, outputBoxId) {
  const pool = getFilteredPool(poolKey === 'SPORTS' ? SPORTS_PICKS_POOL : ESPORTS_PICKS_POOL);
  const sliceIndex = (poolKey === 'SPORTS' ? sportsCarouselIndex : esportsCarouselIndex) % Math.ceil(pool.length / 3);
  const currentSet = pool.slice(sliceIndex * 3, (sliceIndex * 3) + 3);
  const item = currentSet[localIdx];
  if (!item) return;

  executeInlineMarketAnalysis(item.title, item.pick, outputBoxId);
}

function openOrderModalById(poolKey, localIdx, side) {
  const pool = getFilteredPool(poolKey === 'SPORTS' ? SPORTS_PICKS_POOL : ESPORTS_PICKS_POOL);
  const sliceIndex = (poolKey === 'SPORTS' ? sportsCarouselIndex : esportsCarouselIndex) % Math.ceil(pool.length / 3);
  const currentSet = pool.slice(sliceIndex * 3, (sliceIndex * 3) + 3);
  const item = currentSet[localIdx];
  if (!item) return;

  openOrderModal(item.title, side === 'YES' ? item.yes : item.no, side === 'YES' ? 'BUY YES' : 'BUY NO', item.venue === 'POLY.US' ? 'poly' : 'kalshi');
}

// --- UNIVERSAL SPORT & TEXT FILTER ---
function applyGlobalFilters() {
  const query = (document.getElementById('market-search-input')?.value || '').toLowerCase().trim();
  const sportTag = currentSportFilter;

  sportsCarouselIndex = 0;
  esportsCarouselIndex = 0;
  renderCarouselSet(SPORTS_PICKS_POOL, 0, 'sports-picks-container', 'sports-dots', 'SPORTS');
  renderCarouselSet(ESPORTS_PICKS_POOL, 0, 'esports-picks-container', 'esports-dots', 'ESPORTS');

  const esportsSec = document.getElementById('section-esports');
  if (esportsSec) {
    esportsSec.style.display = (sportTag === 'esports' || sportTag === 'all') ? 'block' : 'none';
  }
  const sportsSec = document.getElementById('section-sports');
  if (sportsSec) {
    sportsSec.style.display = (sportTag === 'esports') ? 'none' : 'block';
  }

  const activeTab = document.querySelector('.tab-view.active');
  if (!activeTab) return;

  const cards = activeTab.querySelectorAll('.market-card');
  cards.forEach(card => {
    if (card.closest('#sports-picks-container') || card.closest('#esports-picks-container')) return;

    const cardText = card.textContent.toLowerCase();
    const explicitSport = card.dataset.sport || '';

    let matchesSport = false;
    if (sportTag === 'all') {
      matchesSport = true;
    } else if (explicitSport && explicitSport === sportTag) {
      matchesSport = true;
    } else if (sportTag === 'tennis' && (cardText.includes('tennis') || cardText.includes('vs') || cardText.includes('alcaraz') || cardText.includes('medvedev') || cardText.includes('sinner') || cardText.includes('zverev') || cardText.includes('glinka') || cardText.includes('sorger'))) {
      matchesSport = true;
    } else if (sportTag === 'mlb' && (cardText.includes('mlb') || cardText.includes('baseball') || cardText.includes('f5') || cardText.includes('tigers') || cardText.includes('orioles') || cardText.includes('red sox') || cardText.includes('yankees') || cardText.includes('dodgers') || cardText.includes('mets') || cardText.includes('phillies'))) {
      matchesSport = true;
    } else if (sportTag === 'nfl' && (cardText.includes('nfl') || cardText.includes('football') || cardText.includes('packers') || cardText.includes('falcons') || cardText.includes('bills') || cardText.includes('chiefs'))) {
      matchesSport = true;
    } else if (sportTag === 'esports' && (cardText.includes('cs2') || cardText.includes('dota') || cardText.includes('esports') || cardText.includes('g2') || cardText.includes('navi') || cardText.includes('liquid') || cardText.includes('spirit'))) {
      matchesSport = true;
    } else if (sportTag === 'macro' && (cardText.includes('fed') || cardText.includes('cpi') || cardText.includes('ipo') || cardText.includes('rate') || cardText.includes('election') || cardText.includes('gold') || cardText.includes('crude') || cardText.includes('silver') || cardText.includes('gas') || cardText.includes('oil'))) {
      matchesSport = true;
    }

    const matchesQuery = !query || cardText.includes(query);
    card.style.display = (matchesSport && matchesQuery) ? 'flex' : 'none';
  });
}

function filterBySport(sportTag, button) {
  currentSportFilter = sportTag;
  document.querySelectorAll('#sport-filter-pills .pill-btn').forEach(b => b.classList.remove('active'));
  if (button) button.classList.add('active');
  applyGlobalFilters();
}

// --- UNIVERSAL SORT ENGINE ---
function switchSortOrder(order, button) {
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  if (button) button.classList.add('active');

  SPORTS_PICKS_POOL.sort((a, b) => {
    if (order === 'roi-high') return (b.roi || 0) - (a.roi || 0);
    if (order === 'roi-low') return (a.roi || 0) - (b.roi || 0);
    if (order === 'ending' || order === 'today') return (a.exp || 0) - (b.exp || 0);
    return 0;
  });

  ESPORTS_PICKS_POOL.sort((a, b) => {
    if (order === 'roi-high') return (b.roi || 0) - (a.roi || 0);
    if (order === 'roi-low') return (a.roi || 0) - (b.roi || 0);
    if (order === 'ending' || order === 'today') return (a.exp || 0) - (b.exp || 0);
    return 0;
  });

  sportsCarouselIndex = 0;
  esportsCarouselIndex = 0;
  renderCarouselSet(SPORTS_PICKS_POOL, 0, 'sports-picks-container', 'sports-dots', 'SPORTS');
  renderCarouselSet(ESPORTS_PICKS_POOL, 0, 'esports-picks-container', 'esports-dots', 'ESPORTS');

  const activeTab = document.querySelector('.tab-view.active');
  if (!activeTab) return;

  const containers = activeTab.querySelectorAll('#macro-picks-container, #poly-live-feed, #kalshi-live-feed');
  containers.forEach(container => {
    const cards = Array.from(container.querySelectorAll('.market-card'));
    if (cards.length <= 1) return;

    cards.sort((a, b) => {
      const roiA = parseFloat(a.dataset.roi) || extractRoiFromCard(a);
      const roiB = parseFloat(b.dataset.roi) || extractRoiFromCard(b);
      const expA = parseInt(a.dataset.expiry, 10) || Date.now();
      const expB = parseInt(b.dataset.expiry, 10) || Date.now();

      if (order === 'roi-high') return roiB - roiA;
      if (order === 'roi-low') return roiA - roiB;
      if (order === 'ending' || order === 'today') return expA - expB;
      return 0;
    });

    cards.forEach(card => container.appendChild(card));
  });
}

function extractRoiFromCard(card) {
  const match = card.textContent.match(/\+?([0-9.]+)%\s*ROI/i);
  return match ? parseFloat(match[1]) : 0;
}

// --- TAB SWITCHER & FILTER PRESERVATION ---
function switchNavTab(viewId, element) {
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add('active');
  if (element) element.classList.add('active');

  const sortNav = document.getElementById('top-sort-nav');
  const deskNav = document.getElementById('top-desk-nav');

  if (viewId === 'view-perps' || viewId === 'view-vault') {
    if (sortNav) sortNav.style.display = 'none';
    if (deskNav) deskNav.style.display = 'none';
  } else {
    if (sortNav) sortNav.style.display = 'flex';
    if (deskNav) deskNav.style.display = 'flex';
  }

  if (viewId === 'view-poly') fetchLivePoly();
  applyGlobalFilters();
}

function switchDeskFilter(desk, button) {
  document.querySelectorAll('.desk-btn').forEach(b => b.classList.remove('active'));
  if (button) button.classList.add('active');

  if (desk === 'all') {
    switchNavTab('view-picks', document.querySelectorAll('.bottom-nav .nav-item')[0]);
  } else if (desk === 'poly') {
    switchNavTab('view-poly', document.querySelectorAll('.bottom-nav .nav-item')[3]);
  } else if (desk === 'kalshi') {
    switchNavTab('view-kalshi', document.querySelectorAll('.bottom-nav .nav-item')[4]);
  } else if (desk === 'fleet') {
    switchNavTab('view-fleet', document.querySelectorAll('.bottom-nav .nav-item')[6]);
  }
}

// --- DISPLAY SCALING & UI ZOOM ---
function updateUiZoom(val) {
  document.documentElement.style.setProperty('--ui-zoom', val);
  const tag = document.getElementById('zoom-level-tag');
  if (tag) tag.textContent = `${Math.round(val * 100)}%`;
  localStorage.setItem('cosmic_ui_zoom', val);
}

function loadUiZoom() {
  const saved = localStorage.getItem('cosmic_ui_zoom');
  if (saved) {
    document.documentElement.style.setProperty('--ui-zoom', saved);
    const slider = document.getElementById('ui-zoom-slider');
    const tag = document.getElementById('zoom-level-tag');
    if (slider) slider.value = saved;
    if (tag) tag.textContent = `${Math.round(saved * 100)}%`;
  }
}

// --- PERPETUALS SUB-DESK ---
function switchPerpSubCategory(sub) {
  document.getElementById('perp-sub-crypto').style.display = sub === 'crypto' ? 'flex' : 'none';
  document.getElementById('perp-sub-commodities').style.display = sub === 'commodities' ? 'flex' : 'none';
  document.getElementById('perp-sub-15m').style.display = sub === '15min' ? 'flex' : 'none';

  document.getElementById('btn-perp-crypto').classList.toggle('active', sub === 'crypto');
  document.getElementById('btn-perp-commodities').classList.toggle('active', sub === 'commodities');
  document.getElementById('btn-perp-15m').classList.toggle('active', sub === '15min');
}

// --- SYNCHRONIZED 15-MINUTE CANDLE TIMER ---
function updateSynchronized15MinTimers() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const nextQuarterMinute = (Math.floor(minutes / 15) + 1) * 15;
  const totalSecondsRemaining = ((nextQuarterMinute - minutes) * 60) - seconds;

  const remMin = Math.floor(totalSecondsRemaining / 60);
  const remSec = totalSecondsRemaining % 60;
  const formattedTime = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;

  document.querySelectorAll('.live-15m-timer').forEach(el => {
    el.textContent = `● ${formattedTime}`;
  });
}

// --- GEMINI INLINE ANALYST (PAUSE ROTATION & LIVE RELAY) ---
async function executeInlineMarketAnalysis(title, meta, outputBoxId) {
  const box = document.getElementById(outputBoxId);
  if (!box) return;

  if (box.style.display === 'block') {
    box.style.display = 'none';
    isCarouselPaused = false;
    return;
  }

  isCarouselPaused = true;
  box.style.display = 'block';
  box.innerHTML = '<span style="color: var(--accent-cyan);">⚡ Querying Gemini quant engine for live edge...</span>';

  const geminiKey = localStorage.getItem('gemini_api_key') || '';
  const now = new Date();
  const minLeft = 15 - (now.getMinutes() % 15);

  try {
    const res = await fetch(`${WORKER_BASE}/api/agent/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gemini-Key': geminiKey
      },
      body: JSON.stringify({
        ticker: title,
        title: title,
        targetPrice: meta,
        currentPrice: 'Live Desk State',
        minutesLeft: minLeft,
        yesOdds: 85,
        noOdds: 15
      })
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.analysis) {
      box.innerHTML = `<div style="color: #fff; white-space: pre-wrap; font-size: 11px;">${data.analysis}</div>`;
    } else {
      throw new Error(data.error || "No inference returned");
    }
  } catch (err) {
    box.innerHTML = `
      <div style="color: var(--accent-red); font-weight: 800;">⚠️ Gemini Live Inference Error</div>
      <div style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">
        ${err.message || 'Check your Gemini API Key in the Vault tab.'}
      </div>
    `;
  }
}

// --- DIRECT EXECUTION ORDER MODAL WITH CIRCUIT BREAKER ---
function openOrderModal(target, defaultPrice, actionLabel, venue) {
  activeOrderVenue = venue;
  document.getElementById('order-modal-title').textContent = `${actionLabel} [${venue.toUpperCase()}]`;
  document.getElementById('modal-market-target').value = target;
  document.getElementById('modal-market-price').value = defaultPrice;
  document.getElementById('modal-shares').value = 1;
  document.getElementById('modal-confirm-input').value = '';
  document.getElementById('modal-circuit-breaker-box').style.display = 'none';

  selectAutoTp(null, document.getElementById('tp-none'));
  updateOrderCalculations();
  document.getElementById('order-modal').style.display = 'flex';
}

function closeOrderModal() {
  document.getElementById('order-modal').style.display = 'none';
}

function selectAutoTp(mode, button) {
  currentTpMode = mode;
  document.querySelectorAll('.btn-tp').forEach(b => b.classList.remove('active'));
  if (button) button.classList.add('active');

  const price = parseFloat(document.getElementById('modal-market-price').value) || 0;
  const desc = document.getElementById('tp-target-desc');

  if (mode === 'even') {
    desc.textContent = `Auto-post limit sell at break-even ($${price.toFixed(2)}) once filled.`;
  } else if (mode === 0.50) {
    const target = Math.min(0.99, +(price * 1.50).toFixed(2));
    desc.textContent = `Auto-post limit sell at $${target.toFixed(2)} (+50% profit) once filled.`;
  } else if (mode === 0.75) {
    const target = Math.min(0.99, +(price * 1.75).toFixed(2));
    desc.textContent = `Auto-post limit sell at $${target.toFixed(2)} (+75% profit) once filled.`;
  } else {
    desc.textContent = `Hold to final settlement.`;
  }
}

function updateOrderCalculations() {
  const price = parseFloat(document.getElementById('modal-market-price').value) || 0;
  const shares = parseInt(document.getElementById('modal-shares').value, 10) || 0;
  const outlay = price * shares;
  const estReturn = shares * 1.00;

  document.getElementById('modal-outlay-disp').textContent = `$${outlay.toFixed(2)}`;
  document.getElementById('modal-return-disp').textContent = `$${estReturn.toFixed(2)}`;

  const deployable = parseFloat(document.getElementById('net-available-disp').textContent.replace('$', '')) || 7.00;
  const ceiling = parseFloat(localStorage.getItem('risk_ceiling') || '25.00');
  const guardrail = document.getElementById('modal-guardrail-disp');
  const btn = document.getElementById('modal-submit-btn');
  const breakerBox = document.getElementById('modal-circuit-breaker-box');

  document.getElementById('modal-ceiling-indicator').textContent = ceiling.toFixed(2);

  if (outlay > deployable) {
    guardrail.textContent = 'EXCEEDS CASH';
    guardrail.style.color = 'var(--accent-red)';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    breakerBox.style.display = 'none';
  } else if (outlay > ceiling) {
    guardrail.textContent = 'CONFIRM REQ';
    guardrail.style.color = 'var(--accent-gold)';
    breakerBox.style.display = 'block';
    checkConfirmChallenge();
  } else {
    guardrail.textContent = 'PASSED';
    guardrail.style.color = 'var(--accent-cyan)';
    btn.disabled = false;
    btn.style.opacity = '1';
    breakerBox.style.display = 'none';
  }
}

function checkConfirmChallenge() {
  const input = document.getElementById('modal-confirm-input').value.trim();
  const btn = document.getElementById('modal-submit-btn');
  if (input === 'CONFIRM') {
    btn.disabled = false;
    btn.style.opacity = '1';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  }
}

async function submitOrderExecution() {
  const target = document.getElementById('modal-market-target').value;
  const price = parseFloat(document.getElementById('modal-market-price').value);
  const shares = parseInt(document.getElementById('modal-shares').value, 10);
  const outlay = price * shares;

  alert(`Order submitted for ${shares} contracts of ${target} at $${price.toFixed(2)} (Outlay: $${outlay.toFixed(2)}). Auto-exit: ${currentTpMode ? (currentTpMode === 'even' ? 'Break-Even' : `+${currentTpMode * 100}%`) : 'Hold'}.`);
  closeOrderModal();
}

function saveRiskSettings() {
  const ceiling = document.getElementById('risk-ceiling-input').value;
  const floor = document.getElementById('salvage-floor-input').value;
  if (ceiling) localStorage.setItem('risk_ceiling', ceiling);
  if (floor) localStorage.setItem('salvage_floor', floor);
}

function loadRiskSettings() {
  const ceiling = localStorage.getItem('risk_ceiling');
  const floor = localStorage.getItem('salvage_floor');
  if (ceiling && document.getElementById('risk-ceiling-input')) document.getElementById('risk-ceiling-input').value = ceiling;
  if (floor && document.getElementById('salvage-floor-input')) document.getElementById('salvage-floor-input').value = floor;
}

// --- DUAL-EXCHANGE LIVE BALANCE POLLING ---
async function fetchLiveExchangeBalances() {
  try {
    const kRes = await fetch(`${WORKER_BASE}/api/kalshi/trade/portfolio/balance`).catch(() => null);
    const kData = kRes && kRes.ok ? await kRes.json() : { balance: 0 };
    const pRes = await fetch(`${WORKER_BASE}/api/poly/balance`).catch(() => null);
    const pData = pRes && pRes.ok ? await pRes.json() : { balance: 7.00 };

    const kBal = (kData.balance || 0) / 100;
    const pBal = pData.balance || 7.00;
    const total = kBal + pBal;

    document.getElementById('kalshi-balance-disp').textContent = `$${kBal.toFixed(2)}`;
    document.getElementById('poly-balance-disp').textContent = `$${pBal.toFixed(2)}`;
    document.getElementById('net-available-disp').textContent = `$${total.toFixed(2)}`;
  } catch (err) {
    console.warn("Balance poller deferred:", err);
  }
}

// --- BYOK VAULT & INITIALIZATION ---
function toggleMask(fieldId) {
  const el = document.getElementById(fieldId);
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

function saveVaultCredentials() {
  const kKey = document.getElementById('kalshi-key-id')?.value.trim();
  const kPriv = document.getElementById('kalshi-private-key')?.value.trim();
  const pKey = document.getElementById('poly-key-id')?.value.trim();
  const gKey = document.getElementById('gemini-api-key')?.value.trim();

  if (kKey) localStorage.setItem('kalshi_key_id', kKey);
  if (kPriv) localStorage.setItem('kalshi_private_key', kPriv);
  if (pKey) localStorage.setItem('poly_key_id', pKey);
  if (gKey) localStorage.setItem('gemini_api_key', gKey);

  alert("Credentials securely locked into local browser storage.");
  updateVaultStatusUI();
}

function clearLocalStorageVault() {
  if (confirm("Completely wipe all saved keys, slips, and session data from this device?")) {
    localStorage.clear();
    document.getElementById('kalshi-key-id').value = '';
    document.getElementById('kalshi-private-key').value = '';
    document.getElementById('poly-key-id').value = '';
    document.getElementById('poly-private-key').value = '';
    document.getElementById('gemini-api-key').value = '';
    renderFleetTickets();
    updateVaultStatusUI();
    alert("Storage wiped completely.");
  }
}

function updateVaultStatusUI() {
  const kKey = localStorage.getItem('kalshi_key_id');
  const pKey = localStorage.getItem('poly_key_id');
  const traderTag = document.getElementById('trader-mode-tag');

  const kalshiLinked = !!kKey;
  const polyLinked = !!pKey;

  if (traderTag) {
    if (kalshiLinked || polyLinked) {
      traderTag.textContent = "Trader Mode Active";
      traderTag.style.color = "var(--accent-green)";
    } else {
      traderTag.textContent = "Disconnected";
      traderTag.style.color = "var(--text-muted)";
    }
  }
}

function loadVaultCredentials() {
  const kKey = localStorage.getItem('kalshi_key_id');
  const kPriv = localStorage.getItem('kalshi_private_key');
  const pKey = localStorage.getItem('poly_key_id');
  const gKey = localStorage.getItem('gemini_api_key');

  if (kKey && document.getElementById('kalshi-key-id')) document.getElementById('kalshi-key-id').value = kKey;
  if (kPriv && document.getElementById('kalshi-private-key')) document.getElementById('kalshi-private-key').value = kPriv;
  if (pKey && document.getElementById('poly-key-id')) document.getElementById('poly-key-id').value = pKey;
  if (gKey && document.getElementById('gemini-api-key')) document.getElementById('gemini-api-key').value = gKey;

  updateVaultStatusUI();
}

// --- FLEET TRACKER & ZERO-PATH SALVAGE ENGINE ---
function getOrCreateClientUuid() {
  let uuid = localStorage.getItem('cosmic_fleet_uuid');
  if (!uuid) {
    uuid = 'cpt_' + crypto.randomUUID().slice(0, 12);
    localStorage.setItem('cosmic_fleet_uuid', uuid);
  }
  const tag = document.getElementById('fleet-uuid-tag');
  if (tag) tag.textContent = `ENDPOINT: ${uuid}`;
  return uuid;
}

function updateTtlPreference() {
  const select = document.getElementById('user-ttl-select');
  if (select) localStorage.setItem('cosmic_slip_ttl', select.value);
}

function loadLocalFleetTickets() {
  return JSON.parse(localStorage.getItem('cosmic_fleet_tickets') || '[]');
}

function saveLocalFleetTickets(tickets) {
  localStorage.setItem('cosmic_fleet_tickets', JSON.stringify(tickets));
  renderFleetTickets();
}

function updateFleetMetrics(tickets) {
  let totalRisk = 0;
  let totalPayout = 0;

  tickets.forEach(t => {
    if (typeof t.stake === 'number' && !isNaN(t.stake)) totalRisk += t.stake;
    if (typeof t.payout === 'number' && !isNaN(t.payout)) totalPayout += t.payout;
  });

  const countEl = document.getElementById('fleet-slips-count');
  const riskEl = document.getElementById('fleet-risk-val');
  const payoutEl = document.getElementById('fleet-payout-val');
  const navBadge = document.getElementById('nav-fleet-count');

  if (countEl) countEl.textContent = tickets.length;
  if (navBadge) navBadge.textContent = tickets.length;
  if (riskEl) riskEl.textContent = `$${totalRisk.toFixed(2)}`;
  if (payoutEl) payoutEl.textContent = `$${totalPayout.toFixed(2)}`;
}

function renderFleetTickets() {
  const container = document.getElementById('fleet-tickets-container');
  const tickets = loadLocalFleetTickets();
  updateFleetMetrics(tickets);

  if (!container) return;

  if (tickets.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 10px; padding: 12px; text-align: center; border: 1px dashed var(--border-color); border-radius: 6px;">No imported slips active.</div>';
    return;
  }

  container.innerHTML = tickets.map((t, idx) => `
    <div class="ticket-card ${t.danger ? 'ticket-danger' : ''}">
      <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px;">
        <span style="color: var(--accent-cyan);">${t.book} [${t.betId || 'Slip'}]</span>
        <span style="color: var(--accent-gold);">${t.odds ? (t.odds.startsWith('+') || t.odds.startsWith('-') ? t.odds : '+' + t.odds) : ''} | Ret: $${t.payout ? t.payout.toFixed(2) : '--'}</span>
      </div>
      <div style="color: var(--text-muted); font-size: 9px; margin-bottom: 6px; display: flex; justify-content: space-between;">
        <span>Stake: $${t.stake ? t.stake.toFixed(2) : '--'} | ${new Date(t.timestamp).toLocaleTimeString()}</span>
        <span style="cursor: pointer; color: var(--accent-pink);" onclick="removeSlip(${idx})">✕ Remove</span>
      </div>
      <div style="padding-left: 8px; border-left: 2px solid ${t.danger ? 'var(--accent-red)' : 'var(--accent-pink)'};">
        ${(t.legs || []).map(l => `<div style="font-size: 10px; color: #fff;">• ${l}</div>`).join('')}
      </div>
      ${t.dangerReason ? `<div style="color: var(--accent-red); font-size: 9px; margin-top: 4px; font-weight: bold;">🚨 AUTO-SALVAGE: ${t.dangerReason}</div>` : ''}
    </div>
  `).join('');
}

function removeSlip(index) {
  const tickets = loadLocalFleetTickets();
  tickets.splice(index, 1);
  saveLocalFleetTickets(tickets);
}

async function pollSharedSlips() {
  const uuid = getOrCreateClientUuid();
  try {
    const res = await fetch(`${WORKER_BASE}/api/fleet/pull/${uuid}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.pending && data.pending.length > 0) {
      const current = loadLocalFleetTickets();
      data.pending.forEach(item => {
        if (!current.some(c => c.id === item.id)) current.unshift(item);
      });
      saveLocalFleetTickets(current);
    }
  } catch (err) {
    console.warn("Slip poll deferred:", err);
  }
}

function parseSanitizedSlipText(rawText) {
  const result = {
    book: /draftkings/i.test(rawText) ? 'DraftKings' : /fanduel/i.test(rawText) ? 'FanDuel' : /polymarket/i.test(rawText) ? 'Polymarket' : 'Sportsbook',
    legs: []
  };

  const textWithoutUrls = (rawText || "").replace(/https?:\/\/[^\s]+/g, "");
  const oddsMatch = textWithoutUrls.match(/(?:^|\s)([+-]\d{3,4})\b/);
  if (oddsMatch) result.odds = oddsMatch[1].trim();

  const stakeMatch = (rawText || "").match(/(?:Wager|Stake|Amount):\s*\$([0-9.]+)/i);
  if (stakeMatch) result.stake = parseFloat(stakeMatch[1]);

  const payoutMatch = (rawText || "").match(/(?:Payout|To Win|Return):\s*\$([0-9.]+)/i);
  if (payoutMatch) result.payout = parseFloat(payoutMatch[1]);

  const lines = (rawText || "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
  lines.forEach(line => {
    if (/[+-\d]|\b(Under|Over|Spread|ML|Run Line|Strikeouts|Total)\b/i.test(line) && !line.includes("Payout") && !line.includes("Wager") && !line.includes("Stake") && !line.startsWith("http")) {
      result.legs.push(line);
    }
  });

  if (result.legs.length === 0 && rawText) {
    result.legs.push(rawText.length > 120 ? rawText.slice(0, 120) + "..." : rawText);
  }

  return result;
}

function ingestManualSlip() {
  const input = document.getElementById('manual-slip-input');
  if (!input || !input.value.trim()) return;

  const raw = input.value.trim();
  const parsed = parseSanitizedSlipText(raw);
  const ticket = {
    id: `manual_${Date.now()}`,
    book: parsed.book,
    raw: raw,
    timestamp: Date.now(),
    legs: parsed.legs,
    odds: parsed.odds,
    stake: parsed.stake,
    payout: parsed.payout
  };

  const current = loadLocalFleetTickets();
  current.unshift(ticket);
  saveLocalFleetTickets(current);
  input.value = '';
}

function promptAdPasskey() {
  const passkey = prompt("Enter Pro Passkey to Remove Ads:");
  if (passkey) {
    localStorage.setItem('cosmic_ad_free', 'true');
    const banner = document.getElementById('sponsor-banner');
    if (banner) banner.style.display = 'none';
    alert("Cosmic Pro Active: Ads Removed!");
  }
}

function checkAdState() {
  if (localStorage.getItem('cosmic_ad_free') === 'true') {
    const banner = document.getElementById('sponsor-banner');
    if (banner) banner.style.display = 'none';
  }
}

function openSetupModal() {
  const uuid = getOrCreateClientUuid();
  const endpointEl = document.getElementById('modal-endpoint-copy');
  if (endpointEl) endpointEl.textContent = `${WORKER_BASE}/api/fleet/ingest/${uuid}`;
  const modal = document.getElementById('setup-modal');
  if (modal) modal.style.display = 'flex';
}

function closeSetupModal() {
  const modal = document.getElementById('setup-modal');
  if (modal) modal.style.display = 'none';
}

function copyEndpointUrl() {
  const uuid = getOrCreateClientUuid();
  const url = `${WORKER_BASE}/api/fleet/ingest/${uuid}`;
  navigator.clipboard.writeText(url).then(() => {
    alert("Private endpoint URL copied to clipboard!");
  }).catch(() => {
    prompt("Copy your private endpoint URL:", url);
  });
}

function refreshCurrentTab() {
  const activeTab = document.querySelector('.tab-view.active');
  if (!activeTab) return;
  if (activeTab.id === 'view-fleet') pollSharedSlips();
  if (activeTab.id === 'view-poly') fetchLivePoly();
}

async function fetchLivePoly() {
  const container = document.getElementById('poly-live-feed');
  try {
    const res = await fetch(`${WORKER_BASE}/api/polymarket/markets`);
    if (!res.ok) throw new Error("Poly unavailable");
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      container.innerHTML = data.slice(0, 8).map((ev, idx) => {
        return `
          <div class="market-card">
            <div class="market-card-head">
              <span>${ev.title}</span>
              <span class="tag" style="background: #1b1330; color: var(--accent-pink);">POLY.US</span>
            </div>
            <div class="market-card-meta">
              <span>Volume: $${Math.round(ev.volume || 0).toLocaleString()}</span>
              <span style="color: var(--accent-green); font-weight: 800;">CLOB Active</span>
            </div>
            <div class="action-tray">
              <button class="btn btn-green" onclick="openOrderModal('${ev.title.replace(/'/g, "\\'")}', 0.50, 'BUY YES', 'poly')">Buy YES</button>
              <button class="btn btn-red" onclick="openOrderModal('${ev.title.replace(/'/g, "\\'")}', 0.50, 'BUY NO', 'poly')">Buy NO</button>
              <button class="btn btn-ai-inline" onclick="executeInlineMarketAnalysis('${ev.title.replace(/'/g, "\\'")}', 'Volume: $${Math.round(ev.volume || 0).toLocaleString()}', 'poly-ai-${idx}')">🤖 Ask Gemini</button>
            </div>
            <div class="ai-agent-box" id="poly-ai-${idx}"></div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    container.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px;">Polymarket CLOB proxy active.</div>';
  }
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  loadUiZoom();
  loadRiskSettings();
  checkAdState();
  getOrCreateClientUuid();
  loadVaultCredentials();
  fetchLiveExchangeBalances();
  renderFleetTickets();

  loadMarketDataPools();

  setInterval(rotateCarousels, 6000);
  setInterval(pollSharedSlips, 10000);
  setInterval(fetchLiveExchangeBalances, 30000);
  updateSynchronized15MinTimers();
  setInterval(updateSynchronized15MinTimers, 1000);
});
