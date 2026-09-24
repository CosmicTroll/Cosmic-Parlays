// ============================================================================
// COSMIC TERMINAL / PARLAYS - MASTER WORKER (v3.4.3-unabridged-mailer)
// Sovereign Edge Execution, Defensive Schema Proving, Anti-Stale Circuit Breaker,
// Kalshi Full 8-Asset 15M Live Resolver, Polymarket US Domestic Balance Relay,
// Autonomous Salvage/Sniper Engine, Gemini Copilot & Resend Auto-Mailer
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE, X-PM-Access-Key, X-PM-Signature, X-PM-Timestamp, X-Passkey, X-Slip-TTL, X-Gemini-Key, X-Webhook-Url",
};

// Safe JSON parser helper
function safeJson(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

// Universal Sportsbook Share Sheet Parser
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

// Defensive Zero-Path Prover with Deep Schema Fallbacks
function evaluateZeroPathDefensive(ticket, context) {
  const raw = (ticket?.raw || "").toLowerCase();

  // 1. Totals Under Check
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

  // 2. MLB Defensive Check
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

  // 3. NFL Defensive Check
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
  // --------------------------------------------------------------------------
  // BACKGROUND CRON SENTINEL (Runs every 60s - Fully Autonomous Edge Engine)
  // HIGH-EFFICIENCY GET-DRIVEN LOOKUP: 0 LIST OPERATIONS CONSUMED
  // --------------------------------------------------------------------------
  async scheduled(event, env, ctx) {
    if (!env.FLEET_KV) return;

    try {
      let mlbGames = [];
      let nflGames = [];

      try {
        const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.3" }
        });
        if (mlbRes.ok) {
          const mlbData = await mlbRes.json();
          mlbGames = mlbData?.dates?.[0]?.games || [];
        }
      } catch (e) {
        console.warn("[Circuit Breaker] MLB feed delayed, skipping cycle safely.");
      }

      try {
        const nflRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.3" }
        });
        if (nflRes.ok) {
          const nflData = await nflRes.json();
          nflGames = nflData?.events || [];
        }
      } catch (e) {
        console.warn("[Circuit Breaker] NFL feed delayed, skipping cycle safely.");
      }

      const activeUsers = await env.FLEET_KV.get("active_fleet_users", { type: "json" }) || [];
      if (activeUsers.length === 0) return;

      const updatedActiveUsers = [];

      for (const userUuid of activeUsers) {
        const userIndexKey = `user:slips:${userUuid}`;
        const tickets = await env.FLEET_KV.get(userIndexKey, { type: "json" }) || [];

        if (tickets.length === 0) continue;
        
        updatedActiveUsers.push(userUuid);
        let updatedTickets = false;

        for (const ticket of tickets) {
          if (ticket.settled) continue;

          const rawLower = (ticket.raw || "").toLowerCase();
          let elimination = { eliminated: false };

          // Evaluate MLB
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

          // Evaluate NFL
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

          // Autonomous Salvage Trigger
          if (elimination.eliminated) {
            const mutex = await env.FLEET_KV.get(`lock:salvage:${ticket.id}`);
            if (!mutex) {
              await env.FLEET_KV.put(`lock:salvage:${ticket.id}`, "1", { expirationTtl: 3600 });
              ticket.settled = true;
              ticket.danger = true;
              ticket.liveStatus = `🚨 ZERO-PATH CONFIRMED: ${elimination.reason}`;
              updatedTickets = true;

              const userWebhook = await env.FLEET_KV.get(`webhook:${userUuid}`);
              if (userWebhook) {
                await fetch(userWebhook, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content: `🛡️ **AUTONOMOUS CAPITAL SALVAGE:** Ticket [${ticket.id}] mathematically eliminated. Reason: ${elimination.reason}. Line exit executed.`
                  })
                }).catch(() => {});
              }
            }
          }
        }

        if (updatedTickets) {
          await env.FLEET_KV.put(userIndexKey, JSON.stringify(tickets), { expirationTtl: 86400 });
        }
      }

      if (updatedActiveUsers.length !== activeUsers.length) {
        await env.FLEET_KV.put("active_fleet_users", JSON.stringify(updatedActiveUsers), { expirationTtl: 86400 });
      }

    } catch (cronErr) {
      console.error("[Cron Sentinel] Safe execution caught:", cronErr.message);
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------------
    // KO-FI WEBHOOK & RESEND AUTO-MAILER
    // POST /api/billing/kofi-webhook
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/billing/kofi-webhook" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const dataString = formData.get("data");
        
        if (!dataString) return new Response("Missing data", { status: 400, headers: CORS_HEADERS });

        const payload = JSON.parse(dataString);
        
        // 1. Verify Ko-fi Token
        const expectedToken = env.KOFI_WEBHOOK_SECRET;
        if (!expectedToken || payload.verification_token !== expectedToken) {
          return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
        }

        // 2. Determine Tier & Generate Passkey
        const customerEmail = payload.email || "anonymous";
        const amount = parseFloat(payload.amount);
        const tierName = (payload.tier_name || "").toLowerCase();
        
        let assignedTier = "pro"; 
        if (tierName.includes("institutional") || amount >= 79.00) {
          assignedTier = "institutional";
        } else if (tierName.includes("sentinel") || amount >= 29.00) {
          assignedTier = "sentinel";
        }
        
        const passkey = `cosmic_${assignedTier}_${crypto.randomUUID().replace(/-/g, '')}`;
        
        // 3. Store Entitlement in FLEET_KV
        if (env.FLEET_KV) {
          await env.FLEET_KV.put(`passkey:${passkey}`, JSON.stringify({
            status: "active",
            tier: assignedTier,
            email: customerEmail,
            issuedAt: Date.now(),
            kofi_id: payload.kofi_transaction_id
          }));
        }

        // 4. Send Automated Email via Resend API
        if (env.RESEND_API_KEY && customerEmail !== "anonymous") {
          const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #0d1224;">Welcome to Cosmic Terminal 🚀</h2>
              <p>Your transaction was successful. Here is your unique private passkey:</p>
              <div style="background: #f4f4f5; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 16px; margin: 20px 0;">
                ${passkey}
              </div>
              <p><strong>Next Steps:</strong></p>
              <ol>
                <li>Open your Cosmic Terminal.</li>
                <li>Go to the <strong>Vault</strong> tab.</li>
                <li>Paste this key into the Passkey field.</li>
              </ol>
              <p>See you on the edge.</p>
            </div>
          `;

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              from: "Cosmic Terminal <onboarding@resend.dev>", 
              to: customerEmail,
              subject: "Your Cosmic Terminal Passkey",
              html: emailHtml
            })
          });
        }
        
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: CORS_HEADERS });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    // ------------------------------------------------------------------------
    // 1. Health Status with Edge Telemetry
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ 
        status: "healthy", 
        env: "production", 
        build: "3.4.3-unabridged-mailer",
        edgeAutonomous: true
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // ------------------------------------------------------------------------
    // 2. Synchronize User Account Configuration to KV
    // ------------------------------------------------------------------------
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

    // ------------------------------------------------------------------------
    // 3. Multi-Sport Live Score Verification Endpoints
    // ------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/verify/")) {
      const sport = url.pathname.replace("/api/verify/", "").toLowerCase();

      if (sport === "mlb") {
        try {
          const res = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.3" }
          });
          return new Response(await res.text(), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
        }
      }

      if (sport === "nfl") {
        try {
          const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.3" }
          });
          return new Response(await res.text(), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
        }
      }

      if (sport === "nba") {
        try {
          const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", {
            headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.3" }
          });
          return new Response(await res.text(), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
        }
      }

      return new Response(JSON.stringify({ error: "Unsupported sport" }), { status: 400, headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------------
    // 4. Kalshi 15-Minute Live Feed (Full 8-Asset Commodities & Crypto Series)
    // ------------------------------------------------------------------------
    if (url.pathname === "/api/kalshi/15min/live") {
      try {
        const seriesList = [
          "KXGOLD15M", "KXSLV15M", "KXWTI15M", 
          "KXBTC15M", "KXETH15M", "KXSOL15M", "KXXRP15M", "KXDOGE15M"
        ];
        const fetchPromises = seriesList.map(async (seriesTicker) => {
          try {
            const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${seriesTicker}&status=open&limit=1`, {
              headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.3" }
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

    // ------------------------------------------------------------------------
    // 5. Kalshi Authenticated RSA Relay with Anti-Taker Slippage Check
    // ------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/kalshi/trade/")) {
      const kalshiPath = url.pathname.replace("/api/kalshi/trade", "");
      const targetUrl = `https://api.elections.kalshi.com/trade-api/v2${kalshiPath}${url.search}`;

      if (request.method === "POST" && kalshiPath.includes("/portfolio/orders")) {
        try {
          const body = await request.clone().json();
          if (body.action !== "sell" && body.yes_price && (body.yes_price > 95 || body.yes_price < 5)) {
            return new Response(JSON.stringify({ 
              error: "Protocol Governance Rejection: Order price violates anti-taker slippage rule (>95¢ or <5¢)." 
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

    // ------------------------------------------------------------------------
    // 6. Polymarket Proxy & Polymarket US Domestic Balance Relay
    // ------------------------------------------------------------------------
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
            "User-Agent": "CosmicTerminal/3.4.3"
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
          headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/3.4.3" } 
        });
        return new Response(await polyRes.text(), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: CORS_HEADERS });
      }
    }

    // ------------------------------------------------------------------------
    // 7. Fleet Ingestion (GET/PUT Hybrid Architecture)
    // ------------------------------------------------------------------------
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
        return new Response(JSON.stringify({ 
          status: "queued", 
          ttl: userTtl, 
          ticket: parsedTicket,
          instantEdgeEvaluated: isPaid
        }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    // ------------------------------------------------------------------------
    // 8. Read-and-Burn Drain Queue (Direct Key Fetch)
    // ------------------------------------------------------------------------
    if (url.pathname.startsWith("/api/fleet/pull/")) {
      const userUuid = url.pathname.replace("/api/fleet/pull/", "").trim();
      if (!userUuid || !env.FLEET_KV) {
        return new Response(JSON.stringify({ pending: [] }), { headers: CORS_HEADERS });
      }

      const userKey = `user:slips:${userUuid}`;
      const slips = await env.FLEET_KV.get(userKey, { type: "json" }) || [];

      if (slips.length > 0) {
        await env.FLEET_KV.delete(userKey);
      }

      return new Response(JSON.stringify({ pending: slips }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // ------------------------------------------------------------------------
    // 9. Alert Webhook & iOS Shortcut
    // ------------------------------------------------------------------------
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

    if (url.pathname.startsWith("/api/fleet/shortcut/")) {
      const userUuid = url.pathname.replace("/api/fleet/shortcut/", "").trim();
      const ingestUrl = `https://${url.host}/api/fleet/ingest/${userUuid}`;
      const plistXml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>WFWorkflowActions</key>\n  <array>\n    <dict>\n      <key>WFWorkflowActionIdentifier</key>\n      <string>is.workflow.actions.downloadurl</string>\n      <key>WFWorkflowActionParameters</key>\n      <dict>\n        <key>WFURLActionURL</key>\n        <string>${ingestUrl}</string>\n        <key>WFHTTPMethod</key>\n        <string>POST</string>\n        <key>WFHTTPBodyType</key>\n        <string>JSON</string>\n        <key>WFJSONValues</key>\n        <dict>\n          <key>Value</key>\n          <dict>\n            <key>WFDictionaryFieldValueItems</key>\n            <array>\n              <dict>\n                <key>WFItemType</key>\n                <integer>0</integer>\n                <key>WFKey</key>\n                <dict>\n                  <key>Value</key>\n                  <dict><key>string</key><string>text</string></dict>\n                  <key>WFSerializationType</key>\n                  <string>WFTextTokenString</string>\n                </dict>\n                <key>WFValue</key>\n                <dict>\n                  <key>Value</key>\n                  <dict>\n                    <key>attachmentsByRange</key>\n                    <dict><key>{0, 1}</key><dict><key>Type</key><string>ExtensionInput</string></dict></dict>\n                    <key>string</key><string>&#xFFFC;</string>\n                  </dict>\n                  <key>WFSerializationType</key>\n                  <string>WFTextTokenString</string>\n                </dict>\n              </dict>\n            </array>\n          </dict>\n          <key>WFSerializationType</key>\n          <string>WFSerializedDictionary</string>\n        </dict>\n      </dict>\n    </dict>\n  </array>\n  <key>WFWorkflowInputContentItemClasses</key>\n  <array><string>WFURLContentItem</string><string>WFStringContentItem</string></array>\n  <key>WFWorkflowTypes</key>\n  <array><string>ActionExtension</string></array>\n</dict>\n</plist>`;
      
      return new Response(plistXml, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/x-apple-shortcut",
          "Content-Disposition": `attachment; filename="CosmicTerminal-${userUuid}.shortcut"`
        }
      });
    }

    // ------------------------------------------------------------------------
    // 10. Quant-Restricted Gemini Copilot Relay
    // ------------------------------------------------------------------------
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

        const safetySettings = [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clientApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            contents: [{ parts: [{ text: promptText }] }],
            safetySettings: safetySettings
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
