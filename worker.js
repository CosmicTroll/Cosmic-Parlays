// Cloudflare Worker: worker.js
// Production Execution Engine for Kalshi & Polymarket.us (CFTC DCM)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// -------------------------------------------------------------
// 1. Cryptography Helpers (WebCrypto API)
// -------------------------------------------------------------

// Convert base64 / PEM RSA string into WebCrypto Private Key for Kalshi
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
    {
      name: "RSA-PSS",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

// Sign Kalshi Request (Method + Path + Timestamp + Body)
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

// Sign Polymarket.us Request with HMAC-SHA256
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
// 2. Main Request Router
// -------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      // Endpoint 1: Market Polling (Kalshi + Polymarket US data)
      if (url.pathname === "/api/live-data" || url.pathname === "/") {
        return await handleLiveData();
      }

      // Endpoint 2: Live Spread Order Execution
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
  }
};

// -------------------------------------------------------------
// 3. Handlers
// -------------------------------------------------------------

async function handleLiveData() {
  // 1. Kalshi Public Markets
  const kalshiRes = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=10&status=open", {
    headers: { Accept: "application/json" }
  });
  const kalshiData = kalshiRes.ok ? await kalshiRes.json() : { markets: [] };

  // 2. Polymarket Public Events
  const polyRes = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=10", {
    headers: { Accept: "application/json" }
  });
  const polyData = polyRes.ok ? await polyRes.json() : [];

  const kalshi = (kalshiData.markets || []).map(m => ({
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
  // Verify secrets exist in environment
  if (!env.KALSHI_KEY_ID || !env.KALSHI_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "Missing Kalshi credentials in Cloudflare secrets" }), {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  const { kalshiTicker, kalshiSide, kalshiCount, kalshiMaxPrice, polyTicker, polySide, polyCount, polyPrice } = payload;

  // STRICT SAFETY GUARD: Prevent trades exceeding $10 while testing
  const contractsToBuy = kalshiCount || 1;
  const maxPriceCents = Math.round((kalshiMaxPrice || 0.50) * 100);
  const totalOutlay = (contractsToBuy * maxPriceCents) / 100;
  if (totalOutlay > 10.00) {
    return new Response(JSON.stringify({ error: "Risk guard: Test order exceeds $10.00 max outlay." }), {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  // --- EXECUTE LEG 1: KALSHI ---
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

  const kalshiKey = await importKalshiRsaKey(env.KALSHI_PRIVATE_KEY);
  const kalshiSig = await signKalshiRequest(kalshiKey, kalshiTimestamp, "POST", kalshiPath, kalshiBodyStr);

  const kalshiOrderRes = await fetch(`https://api.elections.kalshi.com${kalshiPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": env.KALSHI_KEY_ID,
      "KALSHI-ACCESS-SIGNATURE": kalshiSig,
      "KALSHI-ACCESS-TIMESTAMP": kalshiTimestamp
    },
    body: kalshiBodyStr
  });

  const kalshiResult = await kalshiOrderRes.json();

  // --- EXECUTE LEG 2: POLYMARKET.US ---
  let polyResult = { message: "Polymarket.us execution skipped (credentials or ticker pending)" };
  if (env.POLYMARKET_US_KEY && env.POLYMARKET_US_SECRET && polyTicker) {
    const polyPath = "/v1/trading/orders";
    const polyTimestamp = new Date().toISOString();
    const polyBodyObj = {
      symbol: polyTicker,
      side: polySide || "BUY",
      orderType: "LIMIT",
      timeInForce: "IOC", // Immediate-or-Cancel to prevent hanging unhedged exposure
      price: polyPrice || 0.50,
      quantity: contractsToBuy
    };
    const polyBodyStr = JSON.stringify(polyBodyObj);
    const polySig = await signPolymarketUsRequest(env.POLYMARKET_US_SECRET, polyTimestamp, "POST", polyPath, polyBodyStr);

    const polyOrderRes = await fetch(`https://api.polymarket.us${polyPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": env.POLYMARKET_US_KEY,
        "X-API-SIGNATURE": polySig,
        "X-API-TIMESTAMP": polyTimestamp
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
