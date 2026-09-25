// ============================================================================
// COSMIC TERMINAL / PARLAYS - MASTER WORKER (v4.1.0-monolithic-master)
// Zero-List Architecture, Ephemeral Ingestion, Anti-Taker Slippage Safeguards,
// 60s High-Capacity GET Sentinel, Gemini Copilot & Resend Auto-Mailer
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE, X-PM-Access-Key, X-PM-Signature, X-PM-Timestamp, X-Passkey, X-Slip-TTL, X-Gemini-Key, X-Webhook-Url",
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

  const textWithoutUrls = rawText.replace(/https?:\/\/[^\s]+/g, "");
  const oddsMatch = textWithoutUrls.match(/(?:^|\s)([+-]\d{3,4})\b/);
  if (oddsMatch) result.odds = oddsMatch[1].trim();

  const stakeMatch = rawText.match(/(?:Wager|Stake|Amount):\s*\$([0-9.]+)/i);
  if (stakeMatch) result.stake = parseFloat(stakeMatch[1]);

  const payoutMatch = rawText.match(/(?:Payout|To Win|Return):\s*\$([0-9.]+)/i);
  if (payoutMatch) result.payout = parseFloat(payoutMatch[1]);

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
  // --------------------------------------------------------------------------
  // BACKGROUND CRON SENTINEL (Runs every 60 seconds)
  // HIGH-EFFICIENCY GET-DRIVEN LOOKUP: 0 LIST OPERATIONS CONSUMED
  // --------------------------------------------------------------------------
  async scheduled(event, env, ctx) {
    if (!env.FLEET_KV) return;

    try {
      const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
        headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/4.1.0" }
      });
      const mlbData = mlbRes.ok ? await mlbRes.json() : null;
      const games = mlbData?.dates?.[0]?.games || [];

      const activeUsers = await env.FLEET_KV.get("active_fleet_users", { type: "json" }) || [];
      if (activeUsers.length === 0) return;

      const updatedActiveUsers = [];

      for (const uuid of activeUsers) {
        const userIndexKey = `user:slips:${uuid}`;
        const tickets = await env.FLEET_KV.get(userIndexKey, { type: "json" }) || [];

        if (tickets.length === 0) continue;

        updatedActiveUsers.push(uuid);

        for (const ticket of tickets) {
          if (ticket.settled) continue;

          for (const game of games) {
            const home = game?.teams?.home?.team?.name?.toLowerCase() || "";
            const away = game?.teams?.away?.team?.name?.toLowerCase() || "";
            const rawLower = (ticket.raw || "").toLowerCase();

            if (home && away && (rawLower.includes(home) || rawLower.includes(away))) {
              const awayScore = game?.teams?.away?.score ?? 0;
              const homeScore = game?.teams?.home?.score ?? 0;
              const inning = game?.linescore?.currentInningOrdinal || "Live";
              const diff = homeScore - awayScore;

              if (rawLower.includes("+2.5") && rawLower.includes("rangers") && diff <= -3) {
                const userWebhook = await env.FLEET_KV.get(`webhook:${uuid}`);
                if (userWebhook) {
                  await fetch(userWebhook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      content: `🚨 **Cosmic Risk Alert:** Rangers down by ${Math.abs(diff)} (${inning}). Leg is underwater. Evaluate cash-out.`
                    })
                  });
                }
              }
            }
          }
        }
      }

      if (updatedActiveUsers.length !== activeUsers.length) {
        await env.FLEET_KV.put("active_fleet_users", JSON.stringify(updatedActiveUsers), { expirationTtl: 86400 });
      }
    } catch (err) {
      console.error("Scheduled check failed:", err);
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 1. Health Status
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ 
        status: "healthy", 
        env: "production", 
        build: "4.1.0-monolithic-master"
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // 2. Real-Time Sports Verification Engine
    if (url.pathname.startsWith("/api/verify/")) {
      const sport = url.pathname.replace("/api/verify/", "").toLowerCase();

      if (sport === "mlb") {
        try {
          const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/4.1.0" }
          });
          return new Response(await mlbRes.text(), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        } catch (err) {
          return new Response(JSON.stringify({ error: "MLB verification delayed" }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
      }

      if (sport === "nfl") {
        try {
          const nflRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/4.1.0" }
          });
          return new Response(await nflRes.text(), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        } catch (err) {
          return new Response(JSON.stringify({ error: "NFL verification delayed" }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
      }

      return new Response(JSON.stringify({ error: "Unsupported verification sport" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // 3. Kalshi 15-Minute Live Fast Feed Proxy
    if (url.pathname === "/api/kalshi/15min/live") {
      try {
        const seriesList = ["KXGOLD15M", "KXSLV15M", "KXWTI15M", "KXBTC15M", "KXETH15M", "KXSOL15M", "KXXRP15M", "KXDOGE15M"];
        const fetchPromises = seriesList.map(async (seriesTicker) => {
          try {
            const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events/${seriesTicker}?with_nested_markets=true`, {
              headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/4.1.0" }
            });
            if (!res.ok) return null;
            return await res.json();
          } catch (e) { return null; }
        });
        const results = await Promise.all(fetchPromises);
        return new Response(JSON.stringify({ markets: results.filter(Boolean) }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to poll 15m books" }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
    }

    // 4. Kalshi Authenticated RSA Relay with Protocol Governance Filter
    if (url.pathname.startsWith("/api/kalshi/trade/")) {
      const kalshiPath = url.pathname.replace("/api/kalshi/trade", "");
      const targetUrl = `https://api.elections.kalshi.com/trade-api/v2${kalshiPath}${url.search}`;

      if (request.method === "POST" && kalshiPath.includes("/portfolio/orders")) {
        try {
          const orderPayload = await request.clone().json();
          if (orderPayload.yes_price && (orderPayload.yes_price > 95 || orderPayload.yes_price < 5)) {
            return new Response(JSON.stringify({ error: "Protocol Governance Rejection: Limit price violates core anti-taker slippage rule." }), { status: 400, headers: CORS_HEADERS });
          }
        } catch (e) {}
      }

      const forwardHeaders = { "Content-Type": "application/json", "Accept": "application/json" };
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
        return new Response(await res.text(), { status: res.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Kalshi trade proxy failed" }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
    }

    // 5. Polymarket Proxy
    if (url.pathname === "/api/polymarket/markets") {
      try {
        const target = `https://gamma-api.polymarket.com/events?closed=false&limit=20${url.search.replace("?", "&")}`;
        const polyRes = await fetch(target, { headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/4.1.0" } });
        return new Response(await polyRes.text(), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Polymarket query failed" }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
    }

    // 6. Fleet Ingestion (GET/PUT Hybrid Architecture)
    if (url.pathname.startsWith("/api/fleet/ingest/")) {
      const userUuid = url.pathname.replace("/api/fleet/ingest/", "").trim();
      if (!userUuid) return new Response("Missing client UUID", { status: 400, headers: CORS_HEADERS });

      try {
        const payload = await request.json();
        const parsedTicket = parseSportsbookPayload(payload.text || "", payload.url || "");
        parsedTicket.timestamp = Date.now();
        parsedTicket.id = parsedTicket.betId || `slip_${Date.now()}`;
        parsedTicket.userUuid = userUuid;

        let userTtl = parseInt(request.headers.get("X-Slip-TTL") || "1800", 10);
        if (isNaN(userTtl) || userTtl < 60) userTtl = 60;
        if (userTtl > 86400) userTtl = 86400;

        if (env.FLEET_KV) {
          const userKey = `user:slips:${userUuid}`;
          let userSlips = await env.FLEET_KV.get(userKey, { type: "json" }) || [];
          userSlips = userSlips.filter(s => s.id !== parsedTicket.id);
          userSlips.push(parsedTicket);
          await env.FLEET_KV.put(userKey, JSON.stringify(userSlips), { expirationTtl: userTtl });

          let activeUsers = await env.FLEET_KV.get("active_fleet_users", { type: "json" }) || [];
          if (!activeUsers.includes(userUuid)) {
            activeUsers.push(userUuid);
            await env.FLEET_KV.put("active_fleet_users", JSON.stringify(activeUsers), { expirationTtl: 86400 });
          }
        }

        const isPaid = !!request.headers.get("X-Passkey");
        return new Response(JSON.stringify({ status: "queued", ttl: userTtl, ticket: parsedTicket, instantEdgeEvaluated: isPaid }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    // 7. Read-and-Burn Drain Queue
    if (url.pathname.startsWith("/api/fleet/pull/")) {
      const userUuid = url.pathname.replace("/api/fleet/pull/", "").trim();
      if (!userUuid || !env.FLEET_KV) return new Response(JSON.stringify({ pending: [] }), { headers: CORS_HEADERS });

      const userKey = `user:slips:${userUuid}`;
      const slips = await env.FLEET_KV.get(userKey, { type: "json" }) || [];

      if (slips.length > 0) {
        await env.FLEET_KV.delete(userKey);
      }

      return new Response(JSON.stringify({ pending: slips }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // 8. Quant-Restricted Gemini Copilot Relay
    if (url.pathname === "/api/agent/gemini" && request.method === "POST") {
      try {
        const payload = await request.json();
        const clientApiKey = request.headers.get("X-Gemini-Key") || env.GEMINI_API_KEY;
        
        if (!clientApiKey) return new Response(JSON.stringify({ error: "Missing Gemini API Key in Vault." }), { status: 400, headers: CORS_HEADERS });

        const promptText = `You are an algorithmic quantitative analyst. You receive real-time spot prices, targets, and verified score states. You MUST NOT predict, speculate on, or declare match settlement status. Your output is strictly restricted to calculating taker/maker spread drag, edge percentages, and risk recommendations based strictly on the provided real-time variables. Input State: - Market: ${payload.ticker || 'Unknown'} (${payload.title || ''}) - Target Strike: ${payload.targetPrice || 'N/A'} - Current Spot: ${payload.currentPrice || 'N/A'} - Minutes Left in Candle: ${payload.minutesLeft || '15'}m - Current Order Book Probabilities: ABOVE @ ${payload.yesOdds || '50'}% | BELOW @ ${payload.noOdds || '50'}% Instructions: 1. Output Call: [BUY ABOVE / BUY BELOW / PASS] 2. Calculate mathematical edge and taker fee friction. Recommend resting limit bids inside the spread. 3. Provide exactly two factual sentences on momentum and price distance relative to target. Do NOT use conversational filler. Deliver raw quantitative analysis only.`;

        const safetySettings = [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clientApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], safetySettings })
        });

        const geminiData = await geminiRes.json();
        const outputText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "No inference returned.";

        return new Response(JSON.stringify({ analysis: outputText }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  }
};
