// ============================================================================
// COSMIC TERMINAL / PARLAYS - MASTER WORKER (v2.5-zero-hallucination)
// Programmatic Multi-Sport Verification Engine, Live Kalshi Feeds,
// Polymarket Streaming, Ephemeral Fleet Queue & Quant-Restricted Gemini Copilot
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE, X-Passkey, X-Slip-TTL, X-Gemini-Key",
};

// Sportsbook Share & Receipt Parsing Engine
function parseSportsbookPayload(rawText, sourceUrl = "") {
  const result = {
    book: "Sportsbook",
    betId: null,
    odds: null,
    stake: null,
    payout: null,
    legs: [],
    raw: rawText
  };

  const combined = `${rawText} ${sourceUrl}`;

  // Detect Bookmaker Origin
  if (/draftkings\.com/i.test(combined) || /DraftKings/i.test(rawText)) {
    result.book = "DraftKings";
    const idMatch = combined.match(/DK\d{10,25}/i) || combined.match(/slip\/([a-zA-Z0-9_-]+)/);
    if (idMatch) result.betId = idMatch[0];
  } else if (/fanduel\.com/i.test(combined) || /FanDuel/i.test(rawText)) {
    result.book = "FanDuel";
    const idMatch = combined.match(/FD-\d+/i) || combined.match(/share\/bet\/([a-zA-Z0-9_-]+)/);
    if (idMatch) result.betId = idMatch[0];
  } else if (/polymarket/i.test(combined)) {
    result.book = "Polymarket";
  }

  // Strip URLs prior to regex matching to prevent UUID chunks from matching as odds
  const textWithoutUrls = rawText.replace(/https?:\/\/[^\s]+/g, "");

  // Extract American Odds
  const oddsMatch = textWithoutUrls.match(/(?:^|\s)([+-]\d{3,4})\b/);
  if (oddsMatch) result.odds = oddsMatch[1].trim();

  // Extract Stake & Returns
  const stakeMatch = rawText.match(/(?:Wager|Stake|Amount):\s*\$([0-9.]+)/i);
  if (stakeMatch) result.stake = parseFloat(stakeMatch[1]);

  const payoutMatch = rawText.match(/(?:Payout|To Win|Return):\s*\$([0-9.]+)/i);
  if (payoutMatch) result.payout = parseFloat(payoutMatch[1]);

  // Extract Selections & Legs
  const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  lines.forEach(line => {
    if (
      /[+-\d]|\b(Under|Over|Spread|ML|Run Line|Strikeouts|Total)\b/i.test(line) &&
      !line.includes("Payout") &&
      !line.includes("Wager") &&
      !line.includes("Stake") &&
      !line.startsWith("http")
    ) {
      result.legs.push(line);
    }
  });

  if (result.legs.length === 0 && rawText) {
    result.legs.push(rawText.length > 120 ? rawText.slice(0, 120) + "..." : rawText);
  }

  return result;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS Pre-Flight Options
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------------
    // 1. Health Status
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ 
        status: "healthy", 
        env: "production", 
        build: "2.5.0-universal-zero-hallucination" 
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // ------------------------------------------------------------------------
    // 2. Universal Real-Time Sports Verification Engine (Official Feeds Only)
    // GET /api/verify/:sport
    // ------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/verify/")) {
      const sport = url.pathname.replace("/api/verify/", "").toLowerCase();

      // MLB Live Linescores, Innings & Final State
      if (sport === "mlb") {
        try {
          const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/2.5" }
          });
          const data = await mlbRes.text();
          return new Response(data, {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "MLB score verification feed delayed", details: err.message }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      }

      // NFL Live Scoreboard, Quarters & Completion State
      if (sport === "nfl") {
        try {
          const nflRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/2.5" }
          });
          const data = await nflRes.text();
          return new Response(data, {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "NFL score verification feed delayed", details: err.message }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      }

      // NBA Live Scoreboard & Period Status
      if (sport === "nba") {
        try {
          const nbaRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/2.5" }
          });
          const data = await nbaRes.text();
          return new Response(data, {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "NBA score verification feed delayed", details: err.message }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      }

      // NHL Live Scoreboard, Period & Penalty Status
      if (sport === "nhl") {
        try {
          const nhlRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/2.5" }
          });
          const data = await nhlRes.text();
          return new Response(data, {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "NHL score verification feed delayed", details: err.message }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      }

      return new Response(JSON.stringify({ error: "Unsupported verification sport endpoint" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // Legacy Route Fallback for MLB Verification
    if (url.pathname === "/api/sports/verify-score") {
      try {
        const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/2.5" }
        });
        const data = await mlbRes.text();
        return new Response(data, {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Score verification feed delayed", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // ------------------------------------------------------------------------
    // 3. Kalshi 15-Minute Live Fast Feed Proxy
    // GET /api/kalshi/15min/live
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/kalshi/15min/live") {
      try {
        const seriesList = ["KXGOLD15M", "KXSLV15M", "KXWTI15M", "KXBTC15M"];
        const fetchPromises = seriesList.map(async (seriesTicker) => {
          try {
            const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events/${seriesTicker}?with_nested_markets=true`, {
              headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/2.5" }
            });
            if (!res.ok) return null;
            return await res.json();
          } catch (e) {
            return null;
          }
        });

        const results = await Promise.all(fetchPromises);
        return new Response(JSON.stringify({ markets: results.filter(Boolean) }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to poll live 15-minute books", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // ------------------------------------------------------------------------
    // 4. Kalshi Perpetuals Markets Proxy
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/kalshi/perps") {
      try {
        const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/perpetuals/markets", {
          headers: { 
            "Accept": "application/json", 
            "User-Agent": "CosmicTerminal/2.5" 
          }
        });
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to fetch Kalshi perps", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // ------------------------------------------------------------------------
    // 5. Kalshi Authenticated RSA Relay (Order Placement & Private Portfolio)
    // ------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/kalshi/trade/")) {
      const kalshiPath = url.pathname.replace("/api/kalshi/trade", "");
      const targetUrl = `https://api.elections.kalshi.com/trade-api/v2${kalshiPath}${url.search}`;

      const forwardHeaders = {
        "Content-Type": "application/json",
        "Accept": "application/json"
      };

      const keyHeader = request.headers.get("KALSHI-ACCESS-KEY");
      const tsHeader = request.headers.get("KALSHI-ACCESS-TIMESTAMP");
      const sigHeader = request.headers.get("KALSHI-ACCESS-SIGNATURE");

      if (keyHeader) forwardHeaders["KALSHI-ACCESS-KEY"] = keyHeader;
      if (tsHeader) forwardHeaders["KALSHI-ACCESS-TIMESTAMP"] = tsHeader;
      if (sigHeader) forwardHeaders["KALSHI-ACCESS-SIGNATURE"] = sigHeader;

      try {
        const kalshiReq = new Request(targetUrl, {
          method: request.method,
          headers: forwardHeaders,
          body: request.method !== "GET" ? await request.text() : undefined
        });

        const res = await fetch(kalshiReq);
        const resBody = await res.text();
        return new Response(resBody, {
          status: res.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Kalshi trade proxy failed", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // ------------------------------------------------------------------------
    // 6. Polymarket Gamma / CLOB Proxy
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/polymarket/markets") {
      try {
        const target = `https://gamma-api.polymarket.com/events?closed=false&limit=20${url.search.replace("?", "&")}`;
        const polyRes = await fetch(target, { 
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/2.5" } 
        });
        const bodyText = await polyRes.text();
        return new Response(bodyText, {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Polymarket query failed", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // ------------------------------------------------------------------------
    // 7. Ephemeral Ticket Ingestion (Customizable TTL)
    // POST /api/fleet/ingest/:uuid
    // ------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/fleet/ingest/")) {
      const userUuid = url.pathname.replace("/api/fleet/ingest/", "").trim();
      if (!userUuid) return new Response("Missing client UUID", { status: 400, headers: CORS_HEADERS });

      try {
        const payload = await request.json();
        const parsedTicket = parseSportsbookPayload(payload.text || "", payload.url || "");
        parsedTicket.timestamp = Date.now();
        parsedTicket.id = parsedTicket.betId || `slip_${Date.now()}`;

        let userTtl = parseInt(request.headers.get("X-Slip-TTL") || "1800", 10);
        if (isNaN(userTtl) || userTtl < 60) userTtl = 60;
        if (userTtl > 86400) userTtl = 86400;

        if (env.FLEET_KV) {
          await env.FLEET_KV.put(`queue:${userUuid}:${parsedTicket.id}`, JSON.stringify(parsedTicket), {
            expirationTtl: userTtl
          });
        }

        return new Response(JSON.stringify({ status: "queued", ttl: userTtl, ticket: parsedTicket }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    // ------------------------------------------------------------------------
    // 8. Read-and-Burn Drain Queue
    // GET /api/fleet/pull/:uuid
    // ------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/fleet/pull/")) {
      const userUuid = url.pathname.replace("/api/fleet/pull/", "").trim();
      if (!userUuid || !env.FLEET_KV) {
        return new Response(JSON.stringify({ pending: [] }), { headers: CORS_HEADERS });
      }

      const list = await env.FLEET_KV.list({ prefix: `queue:${userUuid}:` });
      const pending = [];

      for (const key of list.keys) {
        const data = await env.FLEET_KV.get(key.name);
        if (data) {
          pending.push(JSON.parse(data));
          await env.FLEET_KV.delete(key.name);
        }
      }

      return new Response(JSON.stringify({ pending }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // ------------------------------------------------------------------------
    // 9. Quant-Restricted Gemini Agentic Copilot Relay
    // POST /api/agent/gemini
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/agent/gemini" && request.method === "POST") {
      try {
        const payload = await request.json();
        const clientApiKey = request.headers.get("X-Gemini-Key") || env.GEMINI_API_KEY;
        
        if (!clientApiKey) {
          return new Response(JSON.stringify({ 
            error: "Missing Gemini API Key. Save key in Settings or configure Worker secret." 
          }), { status: 400, headers: CORS_HEADERS });
        }

        const promptText = `
You are an algorithmic quantitative analyst. You receive real-time spot prices, targets, and verified score states.
You MUST NOT predict, speculate on, or declare match settlement status.
Your output is strictly restricted to calculating taker/maker spread drag, edge percentages, and risk recommendations based strictly on the provided real-time variables.

Input State:
- Market: ${payload.ticker || 'Unknown'} (${payload.title || ''})
- Target Strike: ${payload.targetPrice || 'N/A'}
- Current Spot: ${payload.currentPrice || 'N/A'}
- Minutes Left in Candle: ${payload.minutesLeft || '15'}m
- Current Order Book Probabilities: ABOVE @ ${payload.yesOdds || '50'}% | BELOW @ ${payload.noOdds || '50'}%

Instructions:
1. Output Call: [BUY ABOVE / BUY BELOW / PASS]
2. Calculate mathematical edge and taker fee friction. Recommend resting limit bids inside the spread.
3. Provide exactly two factual sentences on momentum and price distance relative to target.
Do NOT use conversational filler. Deliver raw quantitative analysis only.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${clientApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        const geminiData = await geminiRes.json();
        const outputText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "No inference returned.";

        return new Response(JSON.stringify({ analysis: outputText }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  }
};
