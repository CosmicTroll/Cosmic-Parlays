const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE, X-PM-Access-Key, X-PM-Signature, X-PM-Timestamp, X-Gemini-Key, X-Slip-TTL"
};

function safeJson(str) { try { return JSON.parse(str); } catch (e) { return null; } }

export default {
  async scheduled(event, env, ctx) {
    if (!env.FLEET_KV) return;
    try {
      const mlbRes = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore");
      const mlbGames = mlbRes.ok ? (await mlbRes.json()).dates?.[0]?.games || [] : [];
      
      const activeUsers = safeJson(await env.FLEET_KV.get("active_fleet_users")) || [];
      for (const uuid of activeUsers) {
        let slips = safeJson(await env.FLEET_KV.get(`user:slips:${uuid}`)) || [];
        let modified = false;

        for (let ticket of slips) {
          if (ticket.settled) continue;
          
          // Zero-Path Prover Logic (MLB Example)
          for (const game of mlbGames) {
            const homeScore = game?.teams?.home?.score || 0;
            const awayScore = game?.teams?.away?.score || 0;
            const total = homeScore + awayScore;
            
            if (ticket.raw.toLowerCase().includes("under") && total > ticket.targetScore) {
              const mutex = await env.FLEET_KV.get(`lock:salvage:${ticket.id}`);
              if (!mutex) {
                await env.FLEET_KV.put(`lock:salvage:${ticket.id}`, "1", { expirationTtl: 3600 });
                ticket.settled = true;
                ticket.danger = true;
                ticket.liveStatus = `🚨 ZERO-PATH: Total score ${total} breached Under ${ticket.targetScore}`;
                modified = true;
              }
            }
          }
        }
        if (modified) await env.FLEET_KV.put(`user:slips:${uuid}`, JSON.stringify(slips));
      }
    } catch (err) { console.error("Cron Error:", err); }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "healthy", build: "4.0.0-modular-master" }), { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/agent/gemini" && request.method === "POST") {
      const payload = await request.json();
      const geminiKey = request.headers.get("X-Gemini-Key") || env.GEMINI_API_KEY;
      if (!geminiKey) return new Response(JSON.stringify({ error: "Missing Gemini API Key" }), { status: 401, headers: CORS_HEADERS });

      const promptText = `
You are an algorithmic quantitative analyst. You receive real-time spot prices, targets, and verified score states.
You MUST NOT predict, speculate on, or declare match settlement status.
Input State:
- Market: ${payload.title}
- Target: ${payload.targetPrice} | Spot: ${payload.currentPrice}
- Order Book: ABOVE ${payload.yesOdds}% | BELOW ${payload.noOdds}%
Instructions:
1. Output Call: [BUY ABOVE / BUY BELOW / PASS]
2. Calculate mathematical edge and taker fee friction. Recommend limit bids.
3. Provide exactly two factual sentences. No fluff.`;

      try {
        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
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
        const aiData = await aiRes.json();
        if (aiData.error) throw new Error(aiData.error.message);
        return new Response(JSON.stringify({ analysis: aiData.candidates[0].content.parts[0].text }), { headers: CORS_HEADERS });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
      }
    }

    if (url.pathname === "/api/poly/balance") {
      const pmKey = request.headers.get("X-PM-Access-Key");
      if (!pmKey) return new Response(JSON.stringify({ balance: 0 }), { headers: CORS_HEADERS });
      try {
        const polyRes = await fetch("https://api.polymarket.us/v1/account/balance", {
          headers: { "X-PM-Access-Key": pmKey, "User-Agent": "CosmicTerminal/4.0.0" }
        });
        return new Response(await polyRes.text(), { headers: CORS_HEADERS });
      } catch (e) {
        return new Response(JSON.stringify({ balance: 0 }), { headers: CORS_HEADERS });
      }
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  }
};
