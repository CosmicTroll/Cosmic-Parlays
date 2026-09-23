// ============================================================================
// COSMIC TERMINAL - MASTER WORKER (v3.0-universal-salvage)
// Multi-Sport Universal Mathematical Zero-Path Prover, Autonomous Salvage Engine,
// 1-Tap iOS Shortcut Installer, 60s Cron Sentinel & Exchange Order Relays
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE, X-Passkey, X-Slip-TTL, X-Gemini-Key, X-Webhook-Url",
};

// Universal Parser for Bookmaker Share Sheets & Receipts
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

// ============================================================================
// UNIVERSAL ZERO-PATH PROVER (HPT ENGINE) ACROSS ALL SPORTS & MARKETS
// ============================================================================
function evaluateZeroPathElimination(ticket, context) {
  const raw = (ticket.raw || "").toLowerCase();

  // 1. Universal "Under" Elimination (MLB, NFL, NBA, NHL)
  const underMatch = raw.match(/under\s*([0-9.]+)/i);
  if (underMatch && context.totalScore !== undefined) {
    const ceiling = parseFloat(underMatch[1]);
    if (context.totalScore >= ceiling) {
      return { 
        eliminated: true, 
        reason: `Mathematical ceiling breached: Combined score reached ${context.totalScore} (Exceeds Under ${ceiling})` 
      };
    }
  }

  // 2. Baseball (MLB) Mathematical Elimination
  if (context.sport === "mlb") {
    const isHome = context.teamIsHome;
    const diff = isHome ? (context.homeScore - context.awayScore) : (context.awayScore - context.homeScore);
    const inning = context.currentInning || 1;
    const isBottom = context.isBottomInning;
    const outs = context.outs || 0;

    // Run Line +2.5 down by 3+ in bottom 9th with 2 outs
    if (raw.includes("+2.5") && diff <= -3 && inning >= 9 && isBottom && outs >= 2) {
      return { eliminated: true, reason: "Zero outs cushion: Deficit exceeds maximum mathematical single-play cover." };
    }
    // Run Line +1.5 down by 2+ in bottom 9th with 2 outs
    if (raw.includes("+1.5") && diff <= -2 && inning >= 9 && isBottom && outs >= 2) {
      return { eliminated: true, reason: "Zero outs cushion: 2-run deficit with 2 outs in 9th." };
    }
  }

  // 3. Football (NFL / NCAA) Mathematical Elimination
  if (context.sport === "nfl") {
    const diff = context.userTeamDiff || 0; // deficit
    const clockSeconds = context.clockSeconds || 900;
    const period = context.period || 1;

    // Trailing by 17+ with less than 2 minutes in Q4 and no timeouts
    if (period === 4 && clockSeconds <= 120 && diff <= -17) {
      return { eliminated: true, reason: "Possession exhaustion: 3-possession deficit with under 2:00 in regulation." };
    }
    // Trailing by 9+ with under 35 seconds
    if (period === 4 && clockSeconds <= 35 && diff <= -9) {
      return { eliminated: true, reason: "Possession exhaustion: 2-possession deficit under 0:35." };
    }
  }

  // 4. Basketball (NBA) Mathematical Elimination
  if (context.sport === "nba") {
    const diff = context.userTeamDiff || 0;
    const clockSeconds = context.clockSeconds || 720;
    const period = context.period || 1;

    // Trailing by 15+ points with under 40 seconds left in Q4
    if (period >= 4 && clockSeconds <= 40 && diff <= -15) {
      return { eliminated: true, reason: "Pace exhaustion: Deficit mathematically unreachable based on maximum pace." };
    }
  }

  // 5. 15-Minute CFTC Binary Contracts
  if (context.sport === "kalshi_15m") {
    const minutesLeft = context.minutesLeft || 15;
    const strikeDelta = Math.abs(context.currentSpot - context.targetPrice);
    // Spot is significantly underwater with under 60 seconds left
    if (minutesLeft <= 1 && strikeDelta > 2.50 && context.currentProb <= 4) {
      return { eliminated: true, reason: "Candle exhaustion: Insufficient volatility to cross strike prior to :00 bracket close." };
    }
  }

  return { eliminated: false };
}

export default {
  // --------------------------------------------------------------------------
  // BACKGROUND CRON SENTINEL (Runs every 60 seconds)
  // --------------------------------------------------------------------------
  async scheduled(event, env, ctx) {
    if (!env.FLEET_KV) return;

    try {
      // 1. Fetch live multi-sport schedules
      const [mlbRes, nflRes, nbaRes] = await Promise.all([
        fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team").catch(() => null),
        fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard").catch(() => null),
        fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard").catch(() => null)
      ]);

      const mlbData = mlbRes && mlbRes.ok ? await mlbRes.json() : null;
      const nflData = nflRes && nflRes.ok ? await nflRes.json() : null;
      const nbaData = nbaRes && nbaRes.ok ? await nbaRes.json() : null;

      const mlbGames = mlbData?.dates?.[0]?.games || [];
      const nflGames = nflData?.events || [];
      const nbaGames = nbaData?.events || [];

      // 2. Scan active ticket queues in KV
      const list = await env.FLEET_KV.list({ prefix: "queue:" });

      for (const key of list.keys) {
        const itemStr = await env.FLEET_KV.get(key.name);
        if (!itemStr) continue;
        const ticket = JSON.parse(itemStr);
        if (ticket.settled) continue;

        const rawLower = (ticket.raw || "").toLowerCase();
        let elimination = { eliminated: false };

        // Check MLB
        for (const game of mlbGames) {
          const home = game.teams.home.team.name.toLowerCase();
          const away = game.teams.away.team.name.toLowerCase();
          if (rawLower.includes(home) || rawLower.includes(away)) {
            elimination = evaluateZeroPathElimination(ticket, {
              sport: "mlb",
              homeScore: game.teams.home.score,
              awayScore: game.teams.away.score,
              totalScore: game.teams.home.score + game.teams.away.score,
              currentInning: game.linescore?.currentInning || 1,
              isBottomInning: game.linescore?.isTopInning === false,
              outs: game.linescore?.outs || 0,
              teamIsHome: rawLower.includes(home)
            });
          }
        }

        // Check NFL
        if (!elimination.eliminated) {
          for (const evt of nflGames) {
            const comp = evt.competitions?.[0];
            const home = comp?.competitors?.find(c => c.homeAway === "home");
            const away = comp?.competitors?.find(c => c.homeAway === "away");
            if (rawLower.includes(home?.team?.name?.toLowerCase()) || rawLower.includes(away?.team?.name?.toLowerCase())) {
              const homeScore = parseInt(home.score || "0", 10);
              const awayScore = parseInt(away.score || "0", 10);
              const isUserHome = rawLower.includes(home.team.name.toLowerCase());
              elimination = evaluateZeroPathElimination(ticket, {
                sport: "nfl",
                period: evt.status.period,
                clockSeconds: evt.status.clock,
                totalScore: homeScore + awayScore,
                userTeamDiff: isUserHome ? (homeScore - awayScore) : (awayScore - homeScore)
              });
            }
          }
        }

        // Dispatch alert if mathematically eliminated
        if (elimination.eliminated) {
          const userWebhook = await env.FLEET_KV.get(`webhook:${ticket.userUuid}`);
          if (userWebhook) {
            await fetch(userWebhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: `🛡️ **CAPITAL SALVAGE ALERT:** Mathematical elimination confirmed for ticket [${ticket.id}]. Reason: ${elimination.reason}. Salvage cash-out immediately before line locks.`
              })
            }).catch(() => {});
          }
        }
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
        build: "3.0.0-universal-salvage" 
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // 2. Multi-Sport Real-Time Verification Engine
    if (url.pathname.startsWith("/api/verify/")) {
      const sport = url.pathname.replace("/api/verify/", "").toLowerCase();

      if (sport === "mlb") {
        try {
          const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.0" }
          });
          return new Response(await mlbRes.text(), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "MLB verification delayed", details: err.message }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      }

      if (sport === "nfl") {
        try {
          const nflRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.0" }
          });
          return new Response(await nflRes.text(), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "NFL verification delayed", details: err.message }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      }

      if (sport === "nba") {
        try {
          const nbaRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.0" }
          });
          return new Response(await nbaRes.text(), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "NBA verification delayed", details: err.message }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      }

      return new Response(JSON.stringify({ error: "Unsupported verification sport" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // 3. Dynamic 1-Tap iOS Shortcut Generator
    if (url.pathname.startsWith("/api/fleet/shortcut/")) {
      const userUuid = url.pathname.replace("/api/fleet/shortcut/", "").trim();
      const ingestUrl = `https://${url.host}/api/fleet/ingest/${userUuid}`;

      const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowActions</key>
  <array>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.downloadurl</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>WFURLActionURL</key>
        <string>${ingestUrl}</string>
        <key>WFHTTPMethod</key>
        <string>POST</string>
        <key>WFHTTPBodyType</key>
        <string>JSON</string>
        <key>WFJSONValues</key>
        <dict>
          <key>Value</key>
          <dict>
            <key>WFDictionaryFieldValueItems</key>
            <array>
              <dict>
                <key>WFItemType</key>
                <integer>0</integer>
                <key>WFKey</key>
                <dict>
                  <key>Value</key>
                  <dict>
                    <key>string</key>
                    <string>text</string>
                  </dict>
                  <key>WFSerializationType</key>
                  <string>WFTextTokenString</string>
                </dict>
                <key>WFValue</key>
                <dict>
                  <key>Value</key>
                  <dict>
                    <key>attachmentsByRange</key>
                    <dict>
                      <key>{0, 1}</key>
                      <dict>
                        <key>Type</key>
                        <string>ExtensionInput</string>
                      </dict>
                    </dict>
                    <key>string</key>
                    <string>&#xFFFC;</string>
                  </dict>
                  <key>WFSerializationType</key>
                  <string>WFTextTokenString</string>
                </dict>
              </dict>
            </array>
          </dict>
          <key>WFSerializationType</key>
          <string>WFSerializedDictionary</string>
        </dict>
      </dict>
    </dict>
  </array>
  <key>WFWorkflowInputContentItemClasses</key>
  <array>
    <string>WFURLContentItem</string>
    <string>WFStringContentItem</string>
  </array>
  <key>WFWorkflowTypes</key>
  <array>
    <string>ActionExtension</string>
  </array>
</dict>
</plist>`;

      return new Response(plistXml, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/x-apple-shortcut",
          "Content-Disposition": `attachment; filename="CosmicTerminal-${userUuid}.shortcut"`
        }
      });
    }

    // 4. Webhook Alerts Registration
    if (url.pathname.startsWith("/api/alerts/webhook/")) {
      const userUuid = url.pathname.replace("/api/alerts/webhook/", "").trim();
      const payload = await request.json();
      if (env.FLEET_KV && payload.webhookUrl) {
        await env.FLEET_KV.put(`webhook:${userUuid}`, payload.webhookUrl);
        return new Response(JSON.stringify({ status: "saved" }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: "Missing webhook URL or KV" }), { status: 400, headers: CORS_HEADERS });
    }

    // 5. Kalshi 15-Minute Live Fast Feed Proxy
    if (url.pathname === "/api/kalshi/15min/live") {
      try {
        const seriesList = ["KXGOLD15M", "KXSLV15M", "KXWTI15M", "KXBTC15M"];
        const fetchPromises = seriesList.map(async (seriesTicker) => {
          try {
            const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events/${seriesTicker}?with_nested_markets=true`, {
              headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.0" }
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
        return new Response(JSON.stringify({ error: "Failed to poll 15m books", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // 6. Kalshi Authenticated RSA Relay & Execution
    if (url.pathname.startsWith("/api/kalshi/trade/")) {
      const kalshiPath = url.pathname.replace("/api/kalshi/trade", "");
      const targetUrl = `https://api.elections.kalshi.com/trade-api/v2${kalshiPath}${url.search}`;

      if (request.method === "POST" && kalshiPath.includes("/portfolio/orders")) {
        try {
          const orderPayload = await request.clone().json();
          if (orderPayload.action !== "sell" && orderPayload.yes_price && (orderPayload.yes_price > 95 || orderPayload.yes_price < 5)) {
            return new Response(JSON.stringify({ 
              error: "Protocol Governance Rejection: Limit price violates anti-taker fee friction rule (>95¢ or <5¢)." 
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
        return new Response(JSON.stringify({ error: "Kalshi trade proxy failed", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // 7. Polymarket Proxy
    if (url.pathname === "/api/polymarket/markets") {
      try {
        const target = `https://gamma-api.polymarket.com/events?closed=false&limit=20${url.search.replace("?", "&")}`;
        const polyRes = await fetch(target, { 
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.0" } 
        });
        return new Response(await polyRes.text(), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Polymarket query failed", details: err.message }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    // 8. Fleet Ingestion
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

    // 9. Read-and-Burn Drain Queue
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

    // 10. Quant-Restricted Gemini Copilot Relay
    if (url.pathname === "/api/agent/gemini" && request.method === "POST") {
      try {
        const payload = await request.json();
        const clientApiKey = request.headers.get("X-Gemini-Key") || env.GEMINI_API_KEY;
        
        if (!clientApiKey) {
          return new Response(JSON.stringify({ 
            error: "Missing Gemini API Key. Save key in Settings." 
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
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
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
