// Cloudflare Worker: worker.js (Public Aggregator + Automated Ko-fi Webhook)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const SECRET_SALT = "COSMIC_SALT_2026";

// Cryptographic Supporter License Generator
async function generateSupporterKey(email) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(email.toLowerCase().trim() + ":" + SECRET_SALT)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8)
    .toUpperCase();
}

function parseUtcIso(dateInput) {
  if (!dateInput) return null;
  let parsedMs =
    typeof dateInput === "number"
      ? dateInput < 1e11
        ? dateInput * 1000
        : dateInput
      : Date.parse(dateInput);

  if (isNaN(parsedMs)) return null;
  return new Date(parsedMs).toISOString();
}

function categorizeTitle(title) {
  const t = (title || "").toLowerCase();
  if (
    /house|senate|congress|election|nominee|president|governor|democrat|republican|gop|dnc|rnc|vance|trump|harris|newsom|biden|putin|ukraine|war|cabinet|veto|supreme court/i.test(
      t
    )
  ) {
    return "POLITICS";
  }
  if (
    /fed|rate|inflation|cpi|interest|gdp|recession|treasury|yield|cuts|debt|unemployment|jobs|payroll|temperature|high/i.test(
      t
    )
  ) {
    return "MACRO";
  }
  if (
    /vs\.?|game|spread|over\/under|total points|yards|touchdown|td|nfl|nba|mlb|nhl|fifa|uefa|mls|premier league|champions league|quarterback|receptions|goals|puck|score/i.test(
      t
    )
  ) {
    return "SPORTS";
  }
  return "CULTURE";
}

function getPerpsFallback() {
  const meta = {
    GOLD: { name: "Gold", unit: "/oz", lev: "15.9x", bias: 54, vol: "$3.4M", oi: "$1.1M" },
    SILVER: { name: "Silver", unit: "/oz", lev: "12.5x", bias: 48, vol: "$1.6M", oi: "$720K" },
    BTC: { name: "Bitcoin", unit: "", lev: "20.0x", bias: 58, vol: "$16.8M", oi: "$6.4M" },
    ETH: { name: "Ethereum", unit: "", lev: "18.5x", bias: 51, vol: "$9.1M", oi: "$3.5M" },
    SOL: { name: "Solana", unit: "", lev: "10.0x", bias: 62, vol: "$4.6M", oi: "$2.1M" },
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
        "1Y": { dir: isUp ? "RISE" : "FALL", bias: m.bias + 16, pct: "+17.2%", target: "Book", chart: [m.bias - 10, m.bias + 8, m.bias + 16] },
      },
    };
  }
  return perps;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleLiveData());
  },

  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      // 1. Live Public Market Aggregator
      if (url.pathname === "/api/live-data" || url.pathname === "/") {
        const isBypass = url.searchParams.has("t") || url.searchParams.has("fresh");
        const cache = caches.default;
        const cacheKey = new Request(url.origin + url.pathname, request);

        if (!isBypass) {
          const cached = await cache.match(cacheKey);
          if (cached) return cached;
        }

        const freshResponse = await handleLiveData();

        if (!isBypass) {
          const resToCache = new Response(freshResponse.body, freshResponse);
          resToCache.headers.set("Cache-Control", "public, max-age=12");
          ctx.waitUntil(cache.put(cacheKey, resToCache.clone()));
          return resToCache;
        }

        return freshResponse;
      }

      // 2. Automated Ko-fi Webhook Endpoint
      if (url.pathname === "/api/kofi-webhook" && request.method === "POST") {
        return await handleKofiWebhook(request, env);
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          status: "degraded",
          error: err.message,
          timestamp: new Date().toISOString(),
          portfolio: {
            isPublic: true,
            polyBalance: 0.0,
            kalshiBalance: 0.0,
            totalCash: 0.0,
            activeExposure: 0.0,
            activeContracts: 0,
            positions: [],
          },
          polymarket: [],
          kalshi: [],
          perps: getPerpsFallback(),
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }
  },
};

// Webhook Engine: Ko-fi sends form-encoded payload with `data` containing the JSON
async function handleKofiWebhook(request, env) {
  try {
    const formData = await request.formData();
    const rawData = formData.get("data");

    if (!rawData) {
      return new Response(JSON.stringify({ error: "Missing data payload" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const payload = JSON.parse(rawData);

    // Verify Ko-fi Verification Token if configured in Cloudflare Secrets
    if (env.KOFI_VERIFICATION_TOKEN) {
      if (payload.verification_token !== env.KOFI_VERIFICATION_TOKEN) {
        return new Response(JSON.stringify({ error: "Unauthorized token" }), {
          status: 401,
          headers: CORS_HEADERS,
        });
      }
    }

    const amount = parseFloat(payload.amount || "0");
    const email = (payload.email || "").toLowerCase().trim();

    // Check minimum threshold ($5.00)
    if (amount >= 5.0 && email) {
      const generatedKey = await generateSupporterKey(email);

      // Log success in Cloudflare worker logs for easy audit
      console.log(`[KO-FI SUCCESS] Generated Key: ${generatedKey} for Supporter: ${email}`);

      // If you configure a Resend API key in Cloudflare secrets, send the email instantly:
      if (env.RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Cosmic Terminal <terminal@cosmictrollgaming.com>",
            to: email,
            subject: "Your Cosmic Terminal Ad-Free License Key ⭐",
            html: `
              <p>Hey ${payload.from_name || "there"},</p>
              <p>Thank you for supporting the development of Cosmic Terminal!</p>
              <p>Here is your permanent cross-device activation key:</p>
              <h2 style="letter-spacing: 2px; background: #eee; padding: 10px; display: inline-block;">${generatedKey}</h2>
              <p><b>How to activate:</b></p>
              <ol>
                <li>Open the <a href="https://cosmictroll.github.io/Cosmic-Parlays/">Cosmic Terminal</a>.</li>
                <li>Go to the <b>Vault</b> tab.</li>
                <li>Under <i>Supporter Pro Activation</i>, enter this email (<b>${email}</b>) and key <b>${generatedKey}</b>.</li>
              </ol>
              <p>This permanently disables all sponsor banners on this and any other device you use.</p>
            `
          })
        });
      }

      return new Response(
        JSON.stringify({
          status: "success",
          license: generatedKey,
          email: email,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(JSON.stringify({ status: "ignored_below_threshold" }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err) {
    console.error("Ko-fi webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

async function handleLiveData() {
  let polymarket = [];
  try {
    const [genRes, sportsRes] = await Promise.all([
      fetch("https://gamma-api.polymarket.com/events?closed=false&active=true&limit=60", {
        headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/1.0" },
      }),
      fetch("https://gamma-api.polymarket.com/events?closed=false&active=true&tag_id=100639&limit=60", {
        headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/1.0" },
      }),
    ]);

    const polyEvents = [];
    if (genRes.ok) polyEvents.push(...(await genRes.json()));
    if (sportsRes.ok) polyEvents.push(...(await sportsRes.json()));

    const seenEvent = new Set();
    polyEvents.forEach((e) => {
      if (!e || seenEvent.has(e.id)) return;
      seenEvent.add(e.id);

      const title = e.title || "";
      const rawEnd = e.endDate || e.end_date || (e.markets && e.markets[0] && e.markets[0].endDate) || null;
      const normalizedEndUtc = parseUtcIso(rawEnd);

      (e.markets || []).forEach((m) => {
        if (!m || m.closed) return;

        let yes = null;
        let no = null;

        if (m.outcomePrices) {
          try {
            const p = JSON.parse(m.outcomePrices);
            if (p[0] !== undefined && parseFloat(p[0]) > 0) yes = parseFloat(p[0]);
            if (p[1] !== undefined && parseFloat(p[1]) > 0) no = parseFloat(p[1]);
          } catch (_) {}
        }

        if (yes === null && m.bestBid) yes = parseFloat(m.bestBid);
        if (yes === null && m.lastTradePrice) yes = parseFloat(m.lastTradePrice);

        if (yes !== null && no === null) no = 1.0 - yes;
        if (no !== null && yes === null) yes = 1.0 - no;

        if (yes === null) {
          yes = 0.5;
          no = 0.5;
        }

        let candidateName = m.groupItemTitle || "";
        if (!candidateName && m.question && m.question !== title) {
          candidateName = m.question;
        }
        if (!candidateName && m.outcomes) {
          try {
            const outArr = JSON.parse(m.outcomes);
            if (outArr && outArr[0] && outArr[0].toLowerCase() !== "yes") {
              candidateName = outArr[0];
            }
          } catch (_) {}
        }
        if (!candidateName) candidateName = "Consensus";

        polymarket.push({
          ticker: m.id || e.slug,
          title: title || m.question,
          candidate: candidateName,
          category: categorizeTitle(title || m.question),
          yesAsk: Number(yes.toFixed(2)),
          noAsk: Number(no.toFixed(2)),
          volume: m.volume || e.volume || 0,
          endDate: normalizedEndUtc,
          platform: "Polymarket.us",
        });
      });
    });
  } catch (err) {
    console.error("Polymarket public catalog error:", err);
  }

  let kalshi = [];
  try {
    const kRes = await fetch(
      "https://external-api.kalshi.com/trade-api/v2/events?limit=100&status=open&with_nested_markets=true",
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "CosmicTerminal/1.0",
        },
      }
    );

    if (kRes.ok) {
      const kData = await kRes.json();
      const events = kData.events || [];

      events.forEach((ev) => {
        const eventTitle = ev.title || "";
        (ev.markets || []).forEach((m) => {
          if (m.status && m.status !== "open" && m.status !== "active") return;

          const marketTitle = m.title || eventTitle || m.ticker || "";

          if (
            marketTitle.includes("+") ||
            /\(\+\d+\s+more\s+legs\)/i.test(marketTitle) ||
            /more legs/i.test(marketTitle) ||
            m.ticker.startsWith("KCOMBO") ||
            marketTitle.includes(",yes ") ||
            marketTitle.includes(",no ") ||
            marketTitle.includes(", yes ") ||
            marketTitle.includes(", no ")
          ) {
            return;
          }

          const parsePrice = (v) => {
            if (v === undefined || v === null || v === "") return null;
            const num = parseFloat(v);
            if (isNaN(num) || num <= 0) return null;
            return num > 1 ? num / 100 : num;
          };

          const yAsk = parsePrice(m.yes_ask) || parsePrice(m.yes_ask_dollars);
          const nAsk = parsePrice(m.no_ask) || parsePrice(m.no_ask_dollars);
          const yBid = parsePrice(m.yes_bid) || parsePrice(m.yes_bid_dollars);
          const nBid = parsePrice(m.no_bid) || parsePrice(m.no_bid_dollars);
          const lastP = parsePrice(m.last_price) || parsePrice(m.last_price_dollars);

          let yesVal = null;
          let noVal = null;

          if (yAsk !== null) yesVal = yAsk;
          else if (nBid !== null) yesVal = 1.0 - nBid;
          else if (lastP !== null) yesVal = lastP;
          else if (yBid !== null) yesVal = yBid;

          if (nAsk !== null) noVal = nAsk;
          else if (yBid !== null) noVal = 1.0 - yBid;
          else if (yesVal !== null) noVal = 1.0 - yesVal;

          if (yesVal !== null && noVal === null) noVal = 1.0 - yesVal;
          if (noVal !== null && yesVal === null) yesVal = 1.0 - noVal;

          if (yesVal === null && noVal === null) return;

          let candidate = m.subtitle || m.sub_title || m.yes_sub_title || "";
          if (!candidate && eventTitle && marketTitle && eventTitle !== marketTitle) {
            candidate = marketTitle;
          }
          if (!candidate) candidate = "Consensus";

          const normalizedEndUtc = parseUtcIso(
            m.expiration_time || m.expected_expiration_time || m.close_time || ev.expiration_time
          );

          kalshi.push({
            ticker: m.ticker,
            title: eventTitle || marketTitle,
            candidate: candidate,
            category: categorizeTitle(`${eventTitle} ${marketTitle}`),
            yesAsk: Number((yesVal ?? 0.5).toFixed(2)),
            noAsk: Number((noVal ?? 0.5).toFixed(2)),
            volume: m.volume || m.volume_24h || ev.volume || 0,
            endDate: normalizedEndUtc,
            platform: "Kalshi",
          });
        });
      });
    }
  } catch (err) {
    console.error("Kalshi public catalog error:", err);
  }

  return new Response(
    JSON.stringify(
      {
        status: "healthy",
        mode: "public_community_terminal",
        timestamp: new Date().toISOString(),
        portfolio: {
          isPublic: true,
          polyBalance: 0.0,
          kalshiBalance: 0.0,
          totalCash: 0.0,
          activeExposure: 0.0,
          activeContracts: 0,
          positions: [],
        },
        polymarket,
        kalshi,
        perps: getPerpsFallback(),
      },
      null,
      2
    ),
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, max-age=12",
      },
    }
  );
}
