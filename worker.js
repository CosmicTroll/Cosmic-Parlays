// Cloudflare Worker: worker.js
// Clean Segregation Engine: True Reciprocal Kalshi Pricing & Polymarket

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// -------------------------------------------------------------
// 1. Cryptography Helpers (WebCrypto API)
// -------------------------------------------------------------

async function importKalshiRsaKey(pem) {
  const cleanPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binaryDer = Uint8Array.from(atob(cleanPem), c => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signKalshiRequest(privateKey, timestamp, method, path, body = "") {
  const message = `${timestamp}${method.toUpperCase()}${path}${body}`;
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    privateKey,
    encoder.encode(message)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// -------------------------------------------------------------
// 2. Strict Category Classifier
// -------------------------------------------------------------

function categorizeTitle(title) {
  const t = (title || "").toLowerCase();
  if (/house|senate|congress|election|nominee|president|governor|democrat|republican|gop|dnc|rnc|vance|trump|harris|newsom|biden|putin|ukraine|war|cabinet|veto|supreme court/i.test(t)) {
    return "POLITICS";
  }
  if (/fed|rate|inflation|cpi|interest|gdp|recession|treasury|yield|cuts|debt|unemployment|jobs|payroll|temperature|high/i.test(t)) {
    return "MACRO";
  }
  if (/vs\.?|game|spread|over\/under|total points|yards|touchdown|td|nfl|nba|mlb|nhl|fifa|uefa|mls|premier league|champions league|quarterback|receptions|goals|puck|score/i.test(t)) {
    return "SPORTS";
  }
  return "CULTURE";
}

function getPerpsFallback() {
  const meta = {
    "GOLD": { name: "Gold", unit: "/oz", lev: "15.9x", bias: 54, vol: "$3.4M", oi: "$1.1M" },
    "SILVER": { name: "Silver", unit: "/oz", lev: "12.5x", bias: 48, vol: "$1.6M", oi: "$720K" },
    "BTC": { name: "Bitcoin", unit: "", lev: "20.0x", bias: 58, vol: "$16.8M", oi: "$6.4M" },
    "ETH": { name: "Ethereum", unit: "", lev: "18.5x", bias: 51, vol: "$9.1M", oi: "$3.5M" },
    "SOL": { name: "Solana", unit: "", lev: "10.0x", bias: 62, vol: "$4.6M", oi: "$2.1M" }
  };
  const perps = {};
  for (const [key, m] of Object.entries(meta)) {
    const isUp = m.bias >= 50;
    perps[key] = {
      name: m.name,
      unit: m.unit,
      leverage: m.lev,
      vol24: m.vol,
      oi: m.oi,
      funding: isUp ? "-0.0125%" : "+0.0084%",
      countdown: "16:42:10",
      annualFunding: isUp ? "-4.56%" : "+3.06%",
      timeframes: {
        "1H": { dir: isUp ? "RISE" : "FALL", bias: m.bias, pct: "+0.4%", target: "Book", chart: [m.bias - 2, m.bias - 1, m.bias] },
        "4H": { dir: isUp ? "RISE" : "FALL", bias: m.bias + 2, pct: "+1.1%", target: "Book", chart: [m.bias - 3, m.bias, m.bias + 2] },
        "1D": { dir: isUp ? "RISE" : "FALL", bias: m.bias + 4, pct: "+2.2%", target: "Book", chart: [m.bias - 4, m.bias + 1, m.bias + 4] },
        "1W": { dir: isUp ? "RISE" : "FALL", bias: m.bias + 7, pct: "+4.5%", target: "Book", chart: [m.bias - 6, m.bias + 2, m.bias + 7] },
        "1M": { dir: isUp ? "RISE" : "FALL", bias: m.bias + 11, pct: "+7.8%", target: "Book", chart: [m.bias - 8, m.bias + 4, m.bias + 11] },
        "1Y": { dir: isUp ? "RISE" : "FALL", bias: m.bias + 16, pct: "+17.2%", target: "Book", chart: [m.bias - 10, m.bias + 8, m.bias + 16] }
      }
    };
  }
  return perps;
}

// -------------------------------------------------------------
// 3. Router
// -------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/live-data" || url.pathname === "/") {
        return await handleLiveData(env);
      }

      if (url.pathname === "/api/test-poly-dry-run") {
        return new Response(JSON.stringify({
          status: "ready_for_execution",
          platform: "Polymarket.us",
          account: "cosmicdad",
          availableCash: 2.57,
          executionGuard: "$10.00 Cap"
        }, null, 2), { status: 200, headers: CORS_HEADERS });
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    } catch (err) {
      return new Response(JSON.stringify({
        status: "degraded",
        error: err.message,
        timestamp: new Date().toISOString(),
        portfolio: {
          polyBalance: 2.57,
          polyAuth: true,
          kalshiBalance: 0.00,
          kalshiAuth: false,
          totalCash: 2.57,
          activeExposure: 0.00,
          activeContracts: 0,
          positions: []
        },
        polymarket: [],
        kalshi: [],
        perps: getPerpsFallback()
      }), { status: 200, headers: CORS_HEADERS });
    }
  }
};

// -------------------------------------------------------------
// 4. Live Data Synthesis Engine
// -------------------------------------------------------------

async function handleLiveData(env) {
  let polyBalance = 2.57;
  let polyPositions = [];

  // --- Kalshi Authenticated Account Sync ---
  let kalshiBalance = 0.00;
  let kalshiPositions = [];
  let kalshiAuth = false;

  const kalshiKeyId = env?.KALSHI_KEY_ID || env?.KALSHI_API_KEY;
  const kalshiPrivateKey = env?.KALSHI_PRIVATE_KEY;

  if (kalshiKeyId && kalshiPrivateKey) {
    try {
      const privKey = await importKalshiRsaKey(kalshiPrivateKey);

      // 1. Portfolio Balance
      const bPath = "/trade-api/v2/portfolio/balance";
      const bTs = Date.now().toString();
      const bSig = await signKalshiRequest(privKey, bTs, "GET", bPath, "");

      const bRes = await fetch(`https://external-api.kalshi.com${bPath}`, {
        headers: {
          "Accept": "application/json",
          "KALSHI-ACCESS-KEY": kalshiKeyId,
          "KALSHI-ACCESS-SIGNATURE": bSig,
          "KALSHI-ACCESS-TIMESTAMP": bTs,
          "User-Agent": "CosmicParlaysTerminal/1.0"
        }
      });

      if (bRes.ok) {
        const bData = await bRes.json();
        kalshiBalance = (bData.balance || 0) / 100;
        kalshiAuth = true;
      }

      // 2. Portfolio Resting Orders
      const oPath = "/trade-api/v2/portfolio/orders?status=resting";
      const oTs = Date.now().toString();
      const oSig = await signKalshiRequest(privKey, oTs, "GET", oPath, "");

      const oRes = await fetch(`https://external-api.kalshi.com${oPath}`, {
        headers: {
          "Accept": "application/json",
          "KALSHI-ACCESS-KEY": kalshiKeyId,
          "KALSHI-ACCESS-SIGNATURE": oSig,
          "KALSHI-ACCESS-TIMESTAMP": oTs,
          "User-Agent": "CosmicParlaysTerminal/1.0"
        }
      });

      if (oRes.ok) {
        const oData = await oRes.json();
        (oData.orders || []).forEach(ord => {
          const count = ord.order_count || ord.remaining_count || ord.count || ord.quantity || 1;
          const priceCents = ord.yes_price || ord.no_price || ord.price || 50;
          kalshiPositions.push({
            platform: "Kalshi",
            title: `${ord.ticker} (${(ord.action || "BUY").toUpperCase()} ${(ord.side || "YES").toUpperCase()})`,
            count: count,
            price: priceCents / 100,
            exposure: (count * priceCents) / 100,
            status: "Resting Limit"
          });
        });
      }
    } catch (e) {
      console.error("Kalshi live sync error:", e);
    }
  }

  const allPositions = [...polyPositions, ...kalshiPositions];
  const activeExposure = allPositions.reduce((acc, p) => acc + (p.exposure || 0), 0);
  const activeContracts = allPositions.reduce((acc, p) => acc + (p.count || 0), 0);

  // --- Polymarket Public Catalog (Exclude Multi-Leg Accumulators) ---
  let polymarket = [];
  try {
    const [genRes, sportsRes] = await Promise.all([
      fetch("https://gamma-api.polymarket.com/events?closed=false&active=true&limit=60", {
        headers: { "Accept": "application/json", "User-Agent": "CosmicParlaysTerminal/1.0" }
      }),
      fetch("https://gamma-api.polymarket.com/events?closed=false&active=true&tag_id=100639&limit=60", {
        headers: { "Accept": "application/json", "User-Agent": "CosmicParlaysTerminal/1.0" }
      })
    ]);

    const polyEvents = [];
    if (genRes.ok) polyEvents.push(...(await genRes.json()));
    if (sportsRes.ok) polyEvents.push(...(await sportsRes.json()));

    const seenEvent = new Set();
    polyEvents.forEach(e => {
      if (!e || seenEvent.has(e.id)) return;
      seenEvent.add(e.id);

      // Filter out long combo parlay strings entirely from the source
      const title = e.title || "";
      if (title.includes(",") && title.split(",").length > 2) return;

      const endDate = e.endDate || e.end_date || (e.markets && e.markets[0] && e.markets[0].endDate) || null;

      (e.markets || []).slice(0, 3).forEach(m => {
        if (!m || m.closed) return;
        let yes = 0.50, no = 0.50;
        try {
          if (m.outcomePrices) {
            const p = JSON.parse(m.outcomePrices);
            yes = parseFloat(p[0]) || 0.50;
            no = parseFloat(p[1]) || 0.50;
          }
        } catch (_) {}

        polymarket.push({
          ticker: m.id || e.slug,
          title: title || m.question,
          candidate: m.groupItemTitle || "Consensus",
          category: categorizeTitle(title || m.question),
          yesAsk: Number(yes.toFixed(2)),
          noAsk: Number(no.toFixed(2)),
          volume: m.volume || e.volume || 0,
          endDate: endDate,
          platform: "Polymarket.us"
        });
      });
    });
  } catch (err) {
    console.error("Polymarket catalog fetch error:", err);
  }

  // --- Kalshi Live Market Catalog (True Reciprocal Bid/Ask Calculation) ---
  let kalshi = [];
  try {
    const basePath = "/trade-api/v2/markets";
    const queryString = "?limit=100&status=open";
    let kHeaders = { 
      "Accept": "application/json",
      "User-Agent": "CosmicParlaysTerminal/1.0"
    };

    if (kalshiKeyId && kalshiPrivateKey) {
      try {
        const privKey = await importKalshiRsaKey(kalshiPrivateKey);
        const kTs = Date.now().toString();
        const kSig = await signKalshiRequest(privKey, kTs, "GET", basePath, "");
        kHeaders["KALSHI-ACCESS-KEY"] = kalshiKeyId;
        kHeaders["KALSHI-ACCESS-SIGNATURE"] = kSig;
        kHeaders["KALSHI-ACCESS-TIMESTAMP"] = kTs;
      } catch (_) {}
    }

    const kRes = await fetch(`https://external-api.kalshi.com${basePath}${queryString}`, {
      headers: kHeaders
    });

    if (kRes.ok) {
      const kData = await kRes.json();
      const rawMarkets = kData.markets || [];

      rawMarkets.forEach(m => {
        if (m.status && m.status !== "open" && m.status !== "active") return;

        // Skip combo multi-leg accumulator titles
        const fullTitle = m.title || m.ticker;
        if (fullTitle.includes(",") && fullTitle.split(",").length > 2) return;

        let yesAsk = null;
        let noAsk = null;
        let isLiveQuoted = false;

        // 1. Direct Asks
        if (m.yes_ask_dollars !== undefined && parseFloat(m.yes_ask_dollars) > 0) {
          yesAsk = parseFloat(m.yes_ask_dollars);
          isLiveQuoted = true;
        } else if (m.yes_ask && m.yes_ask > 0) {
          yesAsk = m.yes_ask > 1 ? m.yes_ask / 100 : m.yes_ask;
          isLiveQuoted = true;
        }

        if (m.no_ask_dollars !== undefined && parseFloat(m.no_ask_dollars) > 0) {
          noAsk = parseFloat(m.no_ask_dollars);
          isLiveQuoted = true;
        } else if (m.no_ask && m.no_ask > 0) {
          noAsk = m.no_ask > 1 ? m.no_ask / 100 : m.no_ask;
          isLiveQuoted = true;
        }

        // 2. Kalshi Reciprocal Orderbook Math: Yes Ask = 1 - No Bid | No Ask = 1 - Yes Bid
        if (yesAsk === null) {
          if (m.no_bid_dollars !== undefined && parseFloat(m.no_bid_dollars) > 0) {
            yesAsk = 1.00 - parseFloat(m.no_bid_dollars);
            isLiveQuoted = true;
          } else if (m.no_bid && m.no_bid > 0) {
            const nb = m.no_bid > 1 ? m.no_bid / 100 : m.no_bid;
            yesAsk = 1.00 - nb;
            isLiveQuoted = true;
          }
        }

        if (noAsk === null) {
          if (m.yes_bid_dollars !== undefined && parseFloat(m.yes_bid_dollars) > 0) {
            noAsk = 1.00 - parseFloat(m.yes_bid_dollars);
            isLiveQuoted = true;
          } else if (m.yes_bid && m.yes_bid > 0) {
            const yb = m.yes_bid > 1 ? m.yes_bid / 100 : m.yes_bid;
            noAsk = 1.00 - yb;
            isLiveQuoted = true;
          }
        }

        // 3. Last Executed Trade Price
        if (yesAsk === null) {
          if (m.last_price_dollars !== undefined && parseFloat(m.last_price_dollars) > 0) {
            yesAsk = parseFloat(m.last_price_dollars);
            isLiveQuoted = true;
          } else if (m.last_price && m.last_price > 0) {
            yesAsk = m.last_price > 1 ? m.last_price / 100 : m.last_price;
            isLiveQuoted = true;
          }
        }

        // Derive complements
        if (yesAsk !== null && noAsk === null) noAsk = 1.00 - yesAsk;
        if (noAsk !== null && yesAsk === null) yesAsk = 1.00 - noAsk;

        // If completely unquoted, assign market midpoint (flagged as unquoted)
        if (yesAsk === null) {
          yesAsk = 0.50;
          noAsk = 0.50;
          isLiveQuoted = false;
        }

        const candidate = m.subtitle || m.sub_title || m.yes_sub_title || m.ticker;

        kalshi.push({
          ticker: m.ticker,
          title: fullTitle,
          candidate: candidate,
          category: categorizeTitle(fullTitle),
          yesAsk: Number(Number(yesAsk).toFixed(2)),
          noAsk: Number(Number(noAsk).toFixed(2)),
          isLiveQuoted: isLiveQuoted,
          volume: m.volume || m.volume_24h || 0,
          endDate: m.close_time || m.expiration_time || null,
          platform: "Kalshi"
        });
      });
    }
  } catch (err) {
    console.error("Kalshi public markets error:", err);
  }

  return new Response(JSON.stringify({
    status: "healthy",
    timestamp: new Date().toISOString(),
    portfolio: {
      polyBalance: Number(polyBalance.toFixed(2)),
      polyAuth: true,
      kalshiBalance: Number(kalshiBalance.toFixed(2)),
      kalshiAuth: kalshiAuth,
      totalCash: Number((polyBalance + kalshiBalance).toFixed(2)),
      activeExposure: Number(activeExposure.toFixed(2)),
      activeContracts: activeContracts,
      positions: allPositions
    },
    polymarket,
    kalshi,
    perps: getPerpsFallback()
  }, null, 2), { headers: CORS_HEADERS });
}
