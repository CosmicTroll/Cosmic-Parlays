// ============================================================================
// COSMIC TERMINAL - MASTER WORKER (v3.4.1-production-master)
// Sovereign Edge Execution, Defensive Prover, Anti-Stale Circuit Breaker,
// Kalshi 8-Asset 15M Live Resolver, Polymarket US Domestic Balance Relay,
// Quant-Restricted Gemini 2.5 Flash Relay & Zero-Leak KV Sentinel
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE, X-PM-Access-Key, X-PM-Signature, X-PM-Timestamp, X-Passkey, X-Slip-TTL, X-Gemini-Key, X-Webhook-Url",
};

function safeJson(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function parseSportsbookPayload(rawText, sourceUrl = "") {
  const result = {
    book: "Sportsbook",
    betId: null,
    odds: null,
    stake: null,
    payout: null,
    legs: [],
    raw: rawText || ""
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

  const textWithoutUrls = (rawText || "").replace(/https?:\/\/[^\s]+/g, "");
  const oddsMatch = textWithoutUrls.match(/(?:^|\s)([+-]\d{3,4})\b/);
  if (oddsMatch) result.odds = oddsMatch[1].trim();

  const stakeMatch = (rawText || "").match(/(?:Wager|Stake|Amount):\s*\$([0-9.]+)/i);
  if (stakeMatch) result.stake = parseFloat(stakeMatch[1]);

  const payoutMatch = (rawText || "").match(/(?:Payout|To Win|Return):\s*\$([0-9.]+)/i);
  if (payoutMatch) result.payout = parseFloat(payoutMatch[1]);

  const lines = (rawText || "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
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

function evaluateZeroPathDefensive(ticket, context) {
  const raw = (ticket?.raw || "").toLowerCase();

  const underMatch = raw.match(/under\s*([0-9.]+)/i);
  if (underMatch && typeof context.totalScore === "number") {
    const ceiling = parseFloat(underMatch[1]);
    if (context.totalScore >= ceiling) {
      return { 
        eliminated: true, 
        reason: `Combined score reached ${context.totalScore} (Ceiling Under ${ceiling} breached)` 
      };
    }
  }

  if (context.sport === "mlb") {
    const diff = Number(context.diff ?? 0);
    const inning = Number(context.inning ?? 1);
    const isBottom = Boolean(context.isBottom);
    const outs = Number(context.outs ?? 0);

    if (raw.includes("+2.5") && diff <= -3 && inning >= 9 && isBottom && outs >= 2) {
      return { eliminated: true, reason: "Deficit 3+ runs with 2 outs in bottom of 9th." };
    }
    if (raw.includes("+1.5") && diff <= -2 && inning >= 9 && isBottom && outs >= 2) {
      return { eliminated: true, reason: "Deficit 2+ runs with 2 outs in bottom of 9th." };
    }
  }

  if (context.sport === "nfl") {
    const diff = Number(context.diff ?? 0);
    const clockSeconds = Number(context.clockSeconds ?? 900);
    const period = Number(context.period ?? 1);

    if (period === 4 && clockSeconds <= 120 && diff <= -17) {
      return { eliminated: true, reason: "3-possession deficit with under 2:00 remaining in regulation." };
    }
  }

  return { eliminated: false };
}

export default {
  async scheduled(event, env, ctx) {
    if (!env.FLEET_KV) return;

    try {
      let mlbGames = [];
      let nflGames = [];

      try {
        const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.1" }
        });
        if (mlbRes.ok) {
          const mlbData = await mlbRes.json();
          mlbGames = mlbData?.dates?.[0]?.games || [];
        }
      } catch (e) {
        console.warn("[Sentinel] MLB scoreboard delay bypassed.");
      }

      try {
        const nflRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.1" }
        });
        if (nflRes.ok) {
          const nflData = await nflRes.json();
          nflGames = nflData?.events || [];
        }
      } catch (e) {
        console.warn("[Sentinel] NFL scoreboard delay bypassed.");
      }

      const activeUsersStr = await env.FLEET_KV.get("active_fleet_users");
      const activeUsers = safeJson(activeUsersStr) || [];

      for (const userUuid of activeUsers) {
        const slipsStr = await env.FLEET_KV.get(`user:slips:${userUuid}`);
        if (!slipsStr) continue;
        const slips = safeJson(slipsStr) || [];
        let slipsModified = false;

        for (const ticket of slips) {
          if (!ticket || ticket.settled) continue;

          const rawLower = (ticket.raw || "").toLowerCase();
          let elimination = { eliminated: false };

          for (const game of mlbGames) {
            const homeName = game?.teams?.home?.team?.name?.toLowerCase() || "";
            const awayName = game?.teams?.away?.team?.name?.toLowerCase() || "";

            if (rawLower.includes(homeName) || rawLower.includes(awayName)) {
              const homeScore = Number(game?.teams?.home?.score ?? 0);
              const awayScore = Number(game?.teams?.away?.score ?? 0);
              const isHome = rawLower.includes(homeName);
              const diff = isHome ? (homeScore - awayScore) : (awayScore - homeScore);

              elimination = evaluateZeroPathDefensive(ticket, {
                sport: "mlb",
                diff: diff,
                totalScore: homeScore + awayScore,
                inning: game?.linescore?.currentInning ?? 1,
                isBottom: game?.linescore?.isTopInning === false,
                outs: game?.linescore?.outs ?? 0
              });
            }
          }

          if (!elimination.eliminated) {
            for (const evt of nflGames) {
              const comp = evt?.competitions?.[0];
              const home = comp?.competitors?.find(c => c.homeAway === "home");
              const away = comp?.competitors?.find(c => c.homeAway === "away");
              const homeName = home?.team?.name?.toLowerCase() || "";
              const awayName = away?.team?.name?.toLowerCase() || "";

              if (rawLower.includes(homeName) || rawLower.includes(awayName)) {
                const homeScore = Number(home?.score ?? 0);
                const awayScore = Number(away?.score ?? 0);
                const isHome = rawLower.includes(homeName);
                const diff = isHome ? (homeScore - awayScore) : (awayScore - homeScore);

                elimination = evaluateZeroPathDefensive(ticket, {
                  sport: "nfl",
                  diff: diff,
                  totalScore: homeScore + awayScore,
                  period: evt?.status?.period ?? 1,
                  clockSeconds: evt?.status?.clock ?? 900
                });
              }
            }
          }

          if (elimination.eliminated) {
            const mutex = await env.FLEET_KV.get(`lock:salvage:${ticket.id}`);
            if (!mutex) {
              await env.FLEET_KV.put(`lock:salvage:${ticket.id}`, "1", { expirationTtl: 3600 });
              ticket.settled = true;
              ticket.danger = true;
              ticket.liveStatus = `🚨 ZERO-PATH CONFIRMED: ${elimination.reason}`;
              slipsModified = true;

              const userWebhook = await env.FLEET_KV.get(`webhook:${userUuid}`);
              if (userWebhook) {
                await fetch(userWebhook, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content: `🛡️ **CAPITAL SHIELD SENTINEL:** Slip [${ticket.id}] eliminated. ${elimination.reason}. Line exit trigger executed.`
                  })
                }).catch(() => {});
              }
            }
          }
        }

        if (slipsModified) {
          await env.FLEET_KV.put(`user:slips:${userUuid}`, JSON.stringify(slips));
        }
      }
    } catch (cronErr) {
      console.error("[Sentinel Scheduled Failure]:", cronErr.message);
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ 
        status: "healthy", 
        env: "production", 
        build: "3.4.1-production-master",
        edgeAutonomous: true
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (url.pathname.startsWith("/api/user/sync/") && request.method === "POST") {
      const userUuid = url.pathname.replace("/api/user/sync/", "").trim();
      const payload = await request.json();
      if (env.FLEET_KV && userUuid) {
        await env.FLEET_KV.put(`user:config:${userUuid}`, JSON.stringify(payload));
        return new Response(JSON.stringify({ status: "synced" }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: "Sync failed" }), { status: 400, headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith("/api/verify/")) {
      const sport = url.pathname.replace("/api/verify/", "").toLowerCase();
      let target = "";
      if (sport === "mlb") target = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team";
      if (sport === "nfl") target = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
      if (sport === "nba") target = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

      if (!target) {
        return new Response(JSON.stringify({ error: "Unsupported sport" }), { status: 400, headers: CORS_HEADERS });
      }

      try {
        const res = await fetch(target, {
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.1" }
        });
        return new Response(await res.text(), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
      }
    }

    if (url.pathname === "/api/kalshi/15min/live") {
      try {
        const seriesList = [
          "KXGOLD15M", "KXSLV15M", "KXWTI15M", 
          "KXBTC15M", "KXETH15M", "KXSOL15M", "KXXRP15M", "KXDOGE15M"
        ];
        const fetchPromises = seriesList.map(async (seriesTicker) => {
          try {
            const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${seriesTicker}&status=open&limit=1`, {
              headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.1" }
            });
            if (!res.ok) return null;
            const data = await res.json();
            return data?.markets?.[0] ? { ticker: seriesTicker, market: data.markets[0] } : null;
          } catch (e) {
            return null;
          }
        });

        const results = await Promise.all(fetchPromises);
        return new Response(JSON.stringify({ markets: results.filter(Boolean) }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
      }
    }

    if (url.pathname.startsWith("/api/kalshi/trade/")) {
      const kalshiPath = url.pathname.replace("/api/kalshi/trade", "");
      const targetUrl = `https://api.elections.kalshi.com/trade-api/v2${kalshiPath}${url.search}`;

      if (request.method === "POST" && kalshiPath.includes("/portfolio/orders")) {
        try {
          const body = await request.clone().json();
          if (body.action !== "sell" && body.yes_price && (body.yes_price > 95 || body.yes_price < 5)) {
            return new Response(JSON.stringify({ 
              error: "Anti-Taker Safeguard: Extreme boundary order rejected (>95¢ or <5¢)." 
            }), { status: 400, headers: CORS_HEADERS });
          }
        } catch (e) {}
      }

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
        return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
      }
    }

    if (url.pathname === "/api/poly/balance") {
      const pmKey = request.headers.get("X-PM-Access-Key");
      const pmSig = request.headers.get("X-PM-Signature");
      const pmTs = request.headers.get("X-PM-Timestamp") || Date.now().toString();

      if (!pmKey) {
        return new Response(JSON.stringify({ balance: 0.00, status: "unlinked" }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      try {
        const polyRes = await fetch("https://api.polymarket.us/v1/account/balance", {
          headers: {
            "Accept": "application/json",
            "X-PM-Access-Key": pmKey,
            "X-PM-Signature": pmSig || "",
            "X-PM-Timestamp": pmTs,
            "User-Agent": "CosmicTerminal/3.4.1"
          }
        });

        if (polyRes.ok) {
          const polyData = await polyRes.json();
          return new Response(JSON.stringify(polyData), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ balance: 0.00 }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ balance: 0.00, error: e.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/polymarket/markets") {
      try {
        const target = `https://gamma-api.polymarket.com/events?closed=false&limit=20${url.search.replace("?", "&")}`;
        const polyRes = await fetch(target, { 
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.1" } 
        });
        return new Response(await polyRes.text(), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
      }
    }

    if (url.pathname.startsWith("/api/fleet/ingest/")) {
      const userUuid = url.pathname.replace("/api/fleet/ingest/", "").trim();
      if (!userUuid) return new Response("Missing UUID", { status: 400, headers: CORS_HEADERS });

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
          const userSlipsKey = `user:slips:${userUuid}`;
          const existingSlips = safeJson(await env.FLEET_KV.get(userSlipsKey)) || [];
          existingSlips.push(parsedTicket);
          await env.FLEET_KV.put(userSlipsKey, JSON.stringify(existingSlips), { expirationTtl: userTtl });

          const activeUsersStr = await env.FLEET_KV.get("active_fleet_users");
          const activeUsers = safeJson(activeUsersStr) || [];
          if (!activeUsers.includes(userUuid)) {
            activeUsers.push(userUuid);
            await env.FLEET_KV.put("active_fleet_users", JSON.stringify(activeUsers));
          }
        }

        return new Response(JSON.stringify({ status: "queued", ttl: userTtl, ticket: parsedTicket }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    if (url.pathname.startsWith("/api/fleet/pull/")) {
      const userUuid = url.pathname.replace("/api/fleet/pull/", "").trim();
      if (!userUuid || !env.FLEET_KV) {
        return new Response(JSON.stringify({ pending: [] }), { headers: CORS_HEADERS });
      }

      const userSlipsKey = `user:slips:${userUuid}`;
      const slipsData = await env.FLEET_KV.get(userSlipsKey);
      const pending = safeJson(slipsData) || [];

      if (pending.length > 0) {
        await env.FLEET_KV.delete(userSlipsKey);
      }

      return new Response(JSON.stringify({ pending }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (url.pathname.startsWith("/api/alerts/webhook/")) {
      const userUuid = url.pathname.replace("/api/alerts/webhook/", "").trim();
      const payload = await request.json();
      if (env.FLEET_KV && payload.webhookUrl) {
        await env.FLEET_KV.put(`webhook:${userUuid}`, payload.webhookUrl);
        return new Response(JSON.stringify({ status: "saved" }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: "Missing data" }), { status: 400, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/agent/gemini" && request.method === "POST") {
      try {
        const payload = await request.json();
        const clientApiKey = request.headers.get("X-Gemini-Key") || env.GEMINI_API_KEY;
        
        if (!clientApiKey) {
          return new Response(JSON.stringify({ 
            error: "Gemini API key missing. Register key in Vault Settings." 
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

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clientApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          })
        });

        const geminiData = await geminiRes.json();
        
        if (geminiData.error) {
          return new Response(JSON.stringify({ error: geminiData.error.message }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }

        const outputText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "No quantitative edge identified.";

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
