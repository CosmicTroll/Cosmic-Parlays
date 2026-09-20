// Cloudflare Worker: worker.js
// Production Automated Scanner & Execution Engine for Kalshi & Polymarket.us

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

async function signPolymarketUsRequest(secret, timestamp, method, path, body = "") {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const payload = `${timestamp}${method.toUpperCase()}${path}${body}`;
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

          if (env.DISCORD_WEBHOOK) {
            await fetch(env.DISCORD_WEBHOOK, {
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

      if (url.pathname === "/api/test-discord") {
        if (!env.DISCORD_WEBHOOK) {
          return new Response(JSON.stringify({ error: "DISCORD_WEBHOOK secret not found" }), {
            status: 400,
            headers: CORS_HEADERS
          });
        }

        const pingRes = await fetch(env.DISCORD_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "🚀 **Cosmic Parlays Terminal Online!** Webhook successfully connected to Cloudflare Edge Worker."
          })
        });

        return new Response(JSON.stringify({ 
          status: pingRes.ok ? "sent" : "failed",
          discordStatusCode: pingRes.status 
        }), { headers: CORS_HEADERS });
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
// 4. Data Gathering & Execution
// -------------------------------------------------------------

async function handleLiveData() {
  let kalshiMarkets = [];
  try {
    const kalshiRes = await fetch("https://external-api.kalshi.com/trade-api/v2/markets?limit=15&status=open", {
      headers: {
        "Accept": "application/json",
        "User-Agent": "CosmicParlaysTerminal/1.0"
      }
    });

    if (kalshiRes.ok) {
      const kJson = await kalshiRes.json();
      kalshiMarkets = kJson.markets || [];
    } else {
      const backupRes = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=15&status=open", {
        headers: {
          "Accept": "application/json",
          "User-Agent": "CosmicParlaysTerminal/1.0"
        }
      });
      if (backupRes.ok) {
        const bJson = await backupRes.json();
        kalshiMarkets = bJson.markets || [];
      }
    }
  } catch (err) {
    console.error("Kalshi public fetch error:", err);
  }

  let polyData = [];
  try {
    const polyRes = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=15", {
      headers: {
        "Accept": "application/json",
        "User-Agent": "CosmicParlaysTerminal/1.0"
      }
    });
    if (polyRes.ok) {
      polyData = await polyRes.json();
    }
  } catch (err) {
    console.error("Polymarket public fetch error:", err);
  }

  const kalshi = kalshiMarkets.map(m => ({
    ticker: m.ticker,
    title: m.title || m.subtitle || m.ticker,
    yesAsk: m.yes_ask ? m.yes_ask / 100 : 0.50,
    noAsk: m.no_ask ? m.no_ask / 100 : 0.50,
    platform: "Kalshi"
  }));

  const polymarket = (Array.isArray(polyData) ? polyData : []).map(e => {
    const firstMarket = e.markets?.[0] || {};
    let outcomePrices = [0.50, 0.50];
    try {
      if (firstMarket.outcomePrices) outcomePrices = JSON.parse(firstMarket.outcomePrices);
    } catch (_) {}
    return {
      ticker: e.slug || firstMarket.id,
      title: e.title,
      yesAsk: parseFloat(outcomePrices[0]) || 0.50,
      noAsk: parseFloat(outcomePrices[1]) || 0.50,
      platform: "Polymarket.us"
    };
  });

  return new Response(JSON.stringify({ status: "healthy", kalshi, polymarket }), {
    headers: CORS_HEADERS
  });
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

  let polyResult = { message: "Polymarket.us execution skipped (credentials or ticker pending)" };
  if (polyKey && polySecret && polyTicker) {
    const polyPath = "/v1/trading/orders";
    const polyTimestamp = new Date().toISOString();
    const polyBodyObj = {
      symbol: polyTicker,
      side: polySide || "BUY",
      orderType: "LIMIT",
      timeInForce: "IOC",
      price: polyPrice || 0.50,
      quantity: contractsToBuy
    };
    const polyBodyStr = JSON.stringify(polyBodyObj);
    const polySig = await signPolymarketUsRequest(polySecret, polyTimestamp, "POST", polyPath, polyBodyStr);

    const polyOrderRes = await fetch(`https://api.polymarket.us${polyPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": polyKey,
        "X-API-SIGNATURE": polySig,
        "X-API-TIMESTAMP": polyTimestamp,
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
