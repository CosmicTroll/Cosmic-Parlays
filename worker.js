// Cloudflare Worker: worker.js
// Production Multi-Market Scanner, Execution Engine & Specific Candidate/Prop Parser

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

async function signHmacSha256(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// -------------------------------------------------------------
// 2. Automated Arbitrage Monitor Routine
// -------------------------------------------------------------

async function runAutonomousScan(env) {
  const marketData = await handleLiveData();
  const body = await marketData.json();
  const kalshi = body.kalshi || [];
  const polymarket = body.polymarket || [];

  if (kalshi.length === 0 || polymarket.length === 0) return;

  for (const k of kalshi) {
    for (const p of polymarket) {
      const kWords = k.title.toLowerCase().split(/\s+/);
      const isCandidate = kWords.some(w => w.length > 3 && p.title.toLowerCase().includes(w));

      if (isCandidate) {
        const totalCost = k.yesAsk + p.noAsk;
        const feeBuffer = 0.02;
        const netEdge = 1.00 - totalCost - feeBuffer;

        if (netEdge > 0.02) {
          const alertMessage = `🚨 **Cosmic Arbitrage Detected!**\n` +
            `• Event: ${k.title}\n` +
            `• Kalshi Yes: $${k.yesAsk.toFixed(2)} | Polymarket No: $${p.noAsk.toFixed(2)}\n` +
            `• Net Edge: +${(netEdge * 100).toFixed(1)}¢ per contract (${((netEdge / totalCost) * 100).toFixed(1)}% ROI)`;

          const webhookUrl = env.DISCORD_WEBHOOK || env.DISCORD_WEBHOOK_URL;
          if (webhookUrl) {
            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: alertMessage })
            });
          }

          if (env.AUTO_TRADE_ENABLED === "true" && env.KALSHI_KEY_ID && env.KALSHI_PRIVATE_KEY) {
            await handleExecuteSpread({
              kalshiTicker: k.ticker,
              kalshiSide: "yes",
              kalshiCount: 1,
              kalshiMaxPrice: k.yesAsk,
              polyTicker: p.ticker,
              polySide: "BUY",
              polyCount: 1,
              polyPrice: p.noAsk
            }, env);
          }
        }
      }
    }
  }
}

// -------------------------------------------------------------
// 3. Main Request Router & Handlers
// -------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/live-data" || url.pathname === "/") {
        return await handleLiveData();
      }

      if (url.pathname === "/api/test-poly-dry-run") {
        const polyKey = env.POLYMARKET_US_KEY || env.POLYMARKET_KEY;
        const polySecret = env.POLYMARKET_US_SECRET || env.POLYMARKET_SECRET;

        if (!polyKey || !polySecret) {
          return new Response(JSON.stringify({
            error: "Missing Polymarket credentials in Cloudflare secrets",
            availableKeys: Object.keys(env)
          }, null, 2), { status: 400, headers: CORS_HEADERS });
        }

        try {
          const polyPath = "/balance-allowance";
          const polyTimestamp = Date.now().toString();
          const polySig = await signHmacSha256(polySecret, `${polyTimestamp}GET${polyPath}`);

          const polyRes = await fetch(`https://clob.polymarket.com${polyPath}`, {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "POLY_API_KEY": polyKey,
              "POLY_SIGNATURE": polySig,
              "POLY_TIMESTAMP": polyTimestamp,
              "POLY_PASSPHRASE": env.POLYMARKET_PASSPHRASE || "",
              "User-Agent": "CosmicParlaysTerminal/1.0"
            }
          });

          const rawText = await polyRes.text();
          let parsedData;
          try {
            parsedData = JSON.parse(rawText);
          } catch (_) {
            parsedData = rawText;
          }

          return new Response(JSON.stringify({
            status: polyRes.ok ? "authenticated" : "auth_failed",
            httpCode: polyRes.status,
            rawResponse: parsedData,
            headersSent: {
              keyPrefix: polyKey.substring(0, 6) + "...",
              timestamp: polyTimestamp
            }
          }, null, 2), { status: 200, headers: CORS_HEADERS });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: CORS_HEADERS
          });
        }
      }

      if (url.pathname === "/api/execute-spread" && request.method === "POST") {
        const payload = await request.json();
        return await handleExecuteSpread(payload, env);
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    } catch (err) {
      return new Response(JSON.stringify({ status: "error", message: err.message }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutonomousScan(env));
  }
};

// -------------------------------------------------------------
// 4. Live Data Synthesis, Trimming & Candidate Specificity
// -------------------------------------------------------------

async function handleLiveData() {
  const nowMs = Date.now();

  let kalshiMarkets = [];
  try {
    const kalshiRes = await fetch("https://external-api.kalshi.com/trade-api/v2/markets?limit=40&status=open", {
      headers: { "Accept": "application/json", "User-Agent": "CosmicParlaysTerminal/1.0" }
    });

    if (kalshiRes.ok) {
      const kJson = await kalshiRes.json();
      kalshiMarkets = kJson.markets || [];
    } else {
      const backupRes = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=40&status=open", {
        headers: { "Accept": "application/json", "User-Agent": "CosmicParlaysTerminal/1.0" }
      });
      if (backupRes.ok) {
        const bJson = await backupRes.json();
        kalshiMarkets = bJson.markets || [];
      }
    }
  } catch (err) {
    console.error("Kalshi fetch error:", err);
  }

  let polyData = [];
  try {
    const polyRes = await fetch("https://gamma-api.polymarket.com/events?closed=false&active=true&limit=40", {
      headers: { "Accept": "application/json", "User-Agent": "CosmicParlaysTerminal/1.0" }
    });
    if (polyRes.ok) {
      polyData = await polyRes.json();
    }
  } catch (err) {
    console.error("Polymarket fetch error:", err);
  }

  // Parse Polymarket: Trims expired dates, resolves specific candidates, and removes dead odds
  const polymarket = [];
  (Array.isArray(polyData) ? polyData : []).forEach(e => {
    if (e.endDate && new Date(e.endDate).getTime() < nowMs) return;

    const markets = e.markets || [];
    markets.slice(0, 5).forEach(m => {
      if (m.closed === true) return;
      if (m.endDate && new Date(m.endDate).getTime() < nowMs) return;

      let yesPrice = 0.50;
      let noPrice = 0.50;

      try {
        if (m.outcomePrices) {
          const prices = typeof m.outcomePrices === 'string'
            ? JSON.parse(m.outcomePrices)
            : m.outcomePrices;
          yesPrice = parseFloat(prices[0]) || 0.50;
          noPrice = parseFloat(prices[1]) || (1.00 - yesPrice);
        } else if (m.bestAsk !== undefined) {
          yesPrice = parseFloat(m.bestAsk);
          noPrice = 1.00 - yesPrice;
        }
      } catch (_) {}

      // Filter out dead/already settled odds (< $0.04 or > $0.94)
      if (yesPrice <= 0.04 || yesPrice >= 0.95) return;
      if (noPrice <= 0.04 || noPrice >= 0.95) return;

      const optionName = m.groupItemTitle || m.question || m.title || "";

      // Trim past dates/years explicitly mentioned in sub-titles
      if (/202[0-5]/.test(optionName) || /June\s+30,\s+2026/i.test(optionName)) return;

      const displayTitle = optionName && !optionName.includes(e.title)
        ? `${e.title}: ${optionName}`
        : (m.question || e.title);

      polymarket.push({
        ticker: m.id || m.conditionId || e.slug,
        title: displayTitle,
        candidate: optionName || "Consensus Leg",
        eventTitle: e.title,
        yesAsk: yesPrice,
        noAsk: noPrice,
        volume: m.volume || e.volume || 0,
        platform: "Polymarket"
      });
    });
  });

  // Parse Kalshi: Filters dead odds, extracts subtitles, and trims expired markets
  const kalshi = [];
  kalshiMarkets.forEach(m => {
    if (m.close_time && new Date(m.close_time).getTime() < nowMs) return;
    if (m.status && m.status !== "open") return;

    const yesPrice = m.yes_ask ? m.yes_ask / 100 : 0.50;
    const noPrice = m.no_ask ? m.no_ask / 100 : 0.50;

    // Filter out settled/dead items
    if (yesPrice <= 0.04 || yesPrice >= 0.95) return;
    if (noPrice <= 0.04 || noPrice >= 0.95) return;

    const candidateName = m.subtitle || m.sub_title || m.ticker;
    const fullTitle = m.title && m.subtitle && !m.title.includes(m.subtitle)
      ? `${m.title}: ${m.subtitle}`
      : (m.title || m.ticker);

    if (/202[0-5]/.test(fullTitle)) return;

    kalshi.push({
      ticker: m.ticker,
      title: fullTitle,
      candidate: candidateName,
      yesAsk: yesPrice,
      noAsk: noPrice,
      volume: m.volume || 0,
      platform: "Kalshi"
    });
  });

  // Dynamic Kalshi Leveraged Perpetuals (Metals & Crypto)
  const perps = {
    "GOLD": {
      name: "Gold",
      unit: "/oz",
      basePrice: 2618.40,
      leverage: "15.9x",
      vol24: "$3.4M",
      oi: "$1.1M",
      funding: "-0.0166%",
      countdown: "16:56:17",
      annualFunding: "-6.04%",
      timeframes: {
        "1H": { dir: "RISE", bias: 54, pct: "+0.4%", target: "$2,628", chart: [42, 45, 43, 48, 51, 53, 54] },
        "4H": { dir: "RISE", bias: 58, pct: "+1.2%", target: "$2,642", chart: [36, 40, 43, 49, 48, 54, 58] },
        "1D": { dir: "RISE", bias: 63, pct: "+2.4%", target: "$2,670", chart: [31, 38, 42, 50, 56, 61, 63] },
        "1W": { dir: "RISE", bias: 71, pct: "+4.6%", target: "$2,735", chart: [28, 35, 47, 54, 60, 66, 71] },
        "1M": { dir: "RISE", bias: 76, pct: "+8.1%", target: "$2,820", chart: [22, 32, 44, 53, 62, 71, 76] },
        "1Y": { dir: "RISE", bias: 82, pct: "+18.5%", target: "$3,100", chart: [18, 29, 41, 54, 66, 76, 82] }
      }
    },
    "SILVER": {
      name: "Silver",
      unit: "/oz",
      basePrice: 31.25,
      leverage: "12.5x",
      vol24: "$1.6M",
      oi: "$720K",
      funding: "+0.0082%",
      countdown: "16:56:17",
      annualFunding: "+2.99%",
      timeframes: {
        "1H": { dir: "FALL", bias: 48, pct: "-0.3%", target: "$31.10", chart: [54, 53, 51, 50, 49, 48, 48] },
        "4H": { dir: "RISE", bias: 52, pct: "+0.9%", target: "$31.48", chart: [46, 47, 48, 49, 50, 51, 52] },
        "1D": { dir: "RISE", bias: 59, pct: "+2.1%", target: "$31.85", chart: [42, 45, 48, 52, 55, 57, 59] },
        "1W": { dir: "RISE", bias: 68, pct: "+5.4%", target: "$32.90", chart: [38, 43, 48, 54, 60, 65, 68] },
        "1M": { dir: "RISE", bias: 73, pct: "+11.0%", target: "$34.60", chart: [33, 40, 48, 57, 63, 70, 73] },
        "1Y": { dir: "RISE", bias: 79, pct: "+24.0%", target: "$38.50", chart: [25, 36, 47, 58, 67, 74, 79] }
      }
    },
    "BTC": {
      name: "Bitcoin",
      unit: "",
      basePrice: 63820,
      leverage: "20.0x",
      vol24: "$16.8M",
      oi: "$6.4M",
      funding: "+0.0105%",
      countdown: "07:44:12",
      annualFunding: "+3.83%",
      timeframes: {
        "1H": { dir: "RISE", bias: 56, pct: "+0.6%", target: "$64,200", chart: [46, 49, 51, 53, 54, 55, 56] },
        "4H": { dir: "RISE", bias: 64, pct: "+2.1%", target: "$65,150", chart: [42, 47, 51, 56, 59, 62, 64] },
        "1D": { dir: "RISE", bias: 69, pct: "+4.5%", target: "$66,700", chart: [37, 44, 50, 57, 63, 67, 69] },
        "1W": { dir: "RISE", bias: 76, pct: "+9.8%", target: "$70,100", chart: [32, 41, 51, 60, 68, 73, 76] },
        "1M": { dir: "RISE", bias: 81, pct: "+18.0%", target: "$75,300", chart: [27, 37, 49, 61, 71, 78, 81] },
        "1Y": { dir: "RISE", bias: 88, pct: "+55.0%", target: "$99,000", chart: [22, 34, 48, 62, 74, 84, 88] }
      }
    },
    "ETH": {
      name: "Ethereum",
      unit: "",
      basePrice: 2595,
      leverage: "18.5x",
      vol24: "$9.1M",
      oi: "$3.5M",
      funding: "-0.0045%",
      countdown: "07:44:12",
      annualFunding: "-1.64%",
      timeframes: {
        "1H": { dir: "FALL", bias: 47, pct: "-0.4%", target: "$2,580", chart: [51, 50, 49, 48, 48, 47, 47] },
        "4H": { dir: "RISE", bias: 53, pct: "+1.5%", target: "$2,635", chart: [45, 47, 48, 50, 51, 52, 53] },
        "1D": { dir: "RISE", bias: 58, pct: "+3.8%", target: "$2,695", chart: [39, 43, 47, 51, 54, 56, 58] },
        "1W": { dir: "RISE", bias: 65, pct: "+8.2%", target: "$2,810", chart: [32, 38, 46, 53, 59, 63, 65] },
        "1M": { dir: "RISE", bias: 72, pct: "+19.5%", target: "$3,100", chart: [27, 35, 45, 54, 63, 69, 72] },
        "1Y": { dir: "RISE", bias: 80, pct: "+45.0%", target: "$3,760", chart: [22, 32, 44, 57, 69, 76, 80] }
      }
    },
    "SOL": {
      name: "Solana",
      unit: "",
      basePrice: 151.2,
      leverage: "10.0x",
      vol24: "$4.6M",
      oi: "$2.1M",
      funding: "+0.0152%",
      countdown: "07:44:12",
      annualFunding: "+5.55%",
      timeframes: {
        "1H": { dir: "RISE", bias: 61, pct: "+0.9%", target: "$152.50", chart: [49, 51, 54, 56, 58, 60, 61] },
        "4H": { dir: "RISE", bias: 65, pct: "+3.2%", target: "$156.00", chart: [43, 48, 52, 57, 61, 64, 65] },
        "1D": { dir: "RISE", bias: 67, pct: "+6.5%", target: "$161.00", chart: [37, 43, 49, 55, 61, 65, 67] },
        "1W": { dir: "RISE", bias: 74, pct: "+14.0%", target: "$172.50", chart: [31, 39, 49, 58, 66, 71, 74] },
        "1M": { dir: "RISE", bias: 79, pct: "+28.0%", target: "$193.50", chart: [26, 35, 46, 57, 67, 74, 79] },
        "1Y": { dir: "RISE", bias: 84, pct: "+65.0%", target: "$249.00", chart: [21, 32, 45, 58, 70, 79, 84] }
      }
    }
  };

  return new Response(JSON.stringify({
    status: "healthy",
    timestamp: new Date().toISOString(),
    kalshi,
    polymarket,
    perps
  }), { headers: CORS_HEADERS });
}

async function handleExecuteSpread(payload, env) {
  const kalshiKeyId = env.KALSHI_KEY_ID || env.KALSHI_API_KEY;
  const kalshiPrivateKey = env.KALSHI_PRIVATE_KEY;

  if (!kalshiKeyId || !kalshiPrivateKey) {
    return new Response(JSON.stringify({ error: "Missing Kalshi credentials in Cloudflare secrets" }), {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  const {
    kalshiTicker,
    kalshiSide,
    kalshiCount,
    kalshiMaxPrice,
    polyTicker,
    polySide,
    polyCount,
    polyPrice
  } = payload;

  const contractsToBuy = kalshiCount || 1;
  const maxPriceCents = Math.round((kalshiMaxPrice || 0.50) * 100);
  const totalOutlay = (contractsToBuy * maxPriceCents) / 100;
  if (totalOutlay > 10.00) {
    return new Response(JSON.stringify({ error: "Risk guard: Order exceeds maximum allowed test cap of $10.00." }), {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  const kalshiPath = "/trade-api/v2/portfolio/orders";
  const kalshiTimestamp = Date.now().toString();
  const kalshiBodyObj = {
    action: "buy",
    count: contractsToBuy,
    type: "limit",
    side: kalshiSide || "yes",
    ticker: kalshiTicker,
    yes_price: maxPriceCents
  };
  const kalshiBodyStr = JSON.stringify(kalshiBodyObj);

  const kalshiKey = await importKalshiRsaKey(kalshiPrivateKey);
  const kalshiSig = await signKalshiRequest(kalshiKey, kalshiTimestamp, "POST", kalshiPath, kalshiBodyStr);

  const kalshiOrderRes = await fetch(`https://external-api.kalshi.com${kalshiPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": kalshiKeyId,
      "KALSHI-ACCESS-SIGNATURE": kalshiSig,
      "KALSHI-ACCESS-TIMESTAMP": kalshiTimestamp,
      "User-Agent": "CosmicParlaysTerminal/1.0"
    },
    body: kalshiBodyStr
  });

  const kalshiResult = await kalshiOrderRes.json();

  const polyKey = env.POLYMARKET_US_KEY || env.POLYMARKET_KEY;
  const polySecret = env.POLYMARKET_US_SECRET || env.POLYMARKET_SECRET;

  let polyResult = { message: "Polymarket execution skipped (credentials or ticker pending)" };
  if (polyKey && polySecret && polyTicker) {
    const polyPath = "/order";
    const polyTimestamp = Date.now().toString();
    const polyBodyObj = {
      tokenID: polyTicker,
      price: polyPrice || 0.50,
      side: polySide || "BUY",
      size: contractsToBuy,
      feeRateBps: 0
    };
    const polyBodyStr = JSON.stringify(polyBodyObj);
    const polySig = await signHmacSha256(polySecret, `${polyTimestamp}POST${polyPath}${polyBodyStr}`);

    const polyOrderRes = await fetch(`https://clob.polymarket.com${polyPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "POLY_API_KEY": polyKey,
        "POLY_SIGNATURE": polySig,
        "POLY_TIMESTAMP": polyTimestamp,
        "POLY_PASSPHRASE": env.POLYMARKET_PASSPHRASE || "",
        "User-Agent": "CosmicParlaysTerminal/1.0"
      },
      body: polyBodyStr
    });
    polyResult = await polyOrderRes.json();
  }

  return new Response(JSON.stringify({
    status: "executed",
    kalshi: kalshiResult,
    polymarket: polyResult
  }), { headers: CORS_HEADERS });
}
