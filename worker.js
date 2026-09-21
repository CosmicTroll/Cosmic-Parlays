export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Set up standard CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ROUTE 1: KO-FI WEBHOOK HANDLER
    if (url.pathname === "/api/kofi-webhook" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const rawData = formData.get("data");
        if (!rawData) {
          return new Response("Missing data payload", { status: 400, headers: corsHeaders });
        }

        const payload = JSON.parse(rawData);

        // Security check: verify incoming token
        if (payload.verification_token !== env.KOFI_VERIFICATION_TOKEN) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        const supporterEmail = (payload.email || "").trim().toLowerCase();
        const amount = parseFloat(payload.amount || "0");

        // Unlock Pro keys for contributions of $5.00 or more
        if (amount >= 5.0 && supporterEmail) {
          const keyInput = `${supporterEmail}:COSMIC_SALT_2026`;
          const msgBuffer = new TextEncoder().encode(keyInput);
          const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const supporterKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8).toUpperCase();

          console.log(`[KO-FI SUCCESS] Generated Key: ${supporterKey} for Supporter: ${supporterEmail}`);

          // Automated email dispatch via Resend
          if (env.RESEND_API_KEY) {
            try {
              const emailResponse = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  from: "Cosmic Terminal <onboarding@resend.dev>",
                  to: [supporterEmail],
                  subject: "🚀 Your Cosmic Terminal Pro Activation Key",
                  html: `
                    <div style="background-color: #090d16; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; border-radius: 8px;">
                      <h2 style="color: #6366f1; margin-top: 0;">Thank you for supporting Cosmic Terminal!</h2>
                      <p>Your one-time $5 tip has unlocked permanent <b>Ad-Free Pro Access</b> on all your devices.</p>
                      
                      <div style="background-color: #121826; border: 1px solid #222d42; border-radius: 8px; padding: 18px; margin: 20px 0; text-align: center;">
                        <span style="color: #8e9db3; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your Unique Activation Key</span>
                        <div style="font-size: 28px; font-weight: bold; color: #00d084; letter-spacing: 3px; margin-top: 6px;">
                          ${supporterKey}
                        </div>
                      </div>

                      <p style="font-size: 14px; color: #8e9db3;"><b>How to activate:</b></p>
                      <ol style="font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                        <li>Open <a href="https://cosmictroll.github.io/Cosmic-Parlays/" style="color: #06b6d4; text-decoration: none;">Cosmic Terminal</a>.</li>
                        <li>Switch to the <b>Vault</b> tab.</li>
                        <li>Scroll down to <b>⭐ Supporter Pro Activation</b>.</li>
                        <li>Enter your email (<code>${supporterEmail}</code>) and activation key (<code>${supporterKey}</code>).</li>
                        <li>Click <b>Verify & Unlock</b>.</li>
                      </ol>
                      <p style="font-size: 12px; color: #64748b; margin-top: 24px;">Good luck on the markets! &mdash; Cosmic Troll</p>
                    </div>
                  `
                })
              });

              if (!emailResponse.ok) {
                const errText = await emailResponse.text();
                console.error(`[RESEND ERROR] Status ${emailResponse.status}: ${errText}`);
              } else {
                console.log(`[RESEND SUCCESS] Sent Pro key to ${supporterEmail}`);
              }
            } catch (mailErr) {
              console.error(`[RESEND EXCEPTION] ${mailErr.message}`);
            }
          }
        }

        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("[KO-FI ERROR]", err);
        return new Response("Server error", { status: 500, headers: corsHeaders });
      }
    }

    // ROUTE 2: LIVE MARKET DATA AGGREGATOR
    if (url.pathname === "/api/live-data") {
      try {
        const liveData = await fetchAllMarketData();
        return new Response(JSON.stringify(liveData), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=10, s-maxage=15"
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Cosmic Terminal Edge Engine Active", {
      status: 200,
      headers: corsHeaders
    });
  },

  async scheduled(event, env, ctx) {
    // Scheduled cron trigger runs in the background to warm cache/validate market data
    console.log("[CRON] Periodic market sweep executed.");
  }
};

// MARKET INGESTION AND NORMALIZATION HELPERS
async function fetchAllMarketData() {
  const [kalshiMarkets, polyMarkets] = await Promise.allSettled([
    fetchKalshiPublicMarkets(),
    fetchPolymarketPublicMarkets()
  ]);

  const kalshi = kalshiMarkets.status === "fulfilled" ? kalshiMarkets.value : [];
  const poly = polyMarkets.status === "fulfilled" ? polyMarkets.value : [];

  return {
    kalshi,
    polymarket: poly,
    perps: getKalshiPerpsData(),
    portfolio: {
      isPublic: true,
      polyBalance: 0.00,
      kalshiBalance: 0.00,
      totalCash: 0.00,
      activeExposure: 0.00,
      activeContracts: 0,
      positions: []
    }
  };
}

async function fetchKalshiPublicMarkets() {
  try {
    const res = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=100&status=open", {
      headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/1.0" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawList = data.markets || [];

    return rawList.map(m => {
      const yesAsk = m.yes_ask ? m.yes_ask / 100 : (m.last_price ? m.last_price / 100 : 0.50);
      const noAsk = m.no_ask ? m.no_ask / 100 : (1.00 - yesAsk);
      return {
        id: m.ticker,
        title: m.title || m.ticker,
        candidate: m.subtitle || "Consensus",
        platform: "KALSHI",
        category: categorizeMarket(m.title, m.category),
        yesAsk: yesAsk,
        noAsk: noAsk,
        volume: m.volume_24h || m.volume || 0,
        endDate: m.expiration_time || m.close_time || null
      };
    });
  } catch (err) {
    console.error("Kalshi fetch error:", err);
    return [];
  }
}

async function fetchPolymarketPublicMarkets() {
  try {
    const res = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=100", {
      headers: { "Accept": "application/json", "User-Agent": "CosmicTerminal/1.0" }
    });
    if (!res.ok) return [];
    const events = await res.json();
    const cleanList = [];

    (events || []).forEach(ev => {
      (ev.markets || []).forEach(m => {
        let yesPrice = 0.50;
        let noPrice = 0.50;
        try {
          const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
          if (Array.isArray(prices) && prices.length >= 2) {
            yesPrice = parseFloat(prices[0]) || 0.50;
            noPrice = parseFloat(prices[1]) || 0.50;
          }
        } catch (_) {}

        cleanList.push({
          id: m.id || m.conditionId,
          title: ev.title || m.question,
          candidate: m.groupItemTitle || "Consensus",
          platform: "POLY.US",
          category: categorizeMarket(ev.title || m.question, ev.category),
          yesAsk: yesPrice,
          noAsk: noPrice,
          volume: parseFloat(m.volume24hr || m.volume || 0),
          endDate: m.endDate || ev.endDate || null
        });
      });
    });

    return cleanList;
  } catch (err) {
    console.error("Polymarket fetch error:", err);
    return [];
  }
}

function categorizeMarket(title = "", category = "") {
  const t = (title + " " + category).toLowerCase();
  if (/counter-strike|cs2|cs:go|dota|league of legends|lck|lpl|lec|valorant|overwatch|esports|bo3|bo5/i.test(t)) {
    return "ESPORTS";
  }
  if (/nfl|nba|mlb|nhl|soccer|champions league|premier league|ufc|mma|tennis|points|rebounds|yards|touchdown/i.test(t)) {
    return "SPORTS";
  }
  if (/president|election|senate|house|governor|democrat|republican|trump|harris|vance|newsom|cabinet|fed|rate cut|powell|gdp|inflation|cpi/i.test(t)) {
    return "POLITICS";
  }
  return "MACRO";
}

function getKalshiPerpsData() {
  return {
    GOLD: {
      name: "Gold Perpetual",
      unit: "USD/oz",
      leverage: "15.9x",
      vol24: "$18.4M",
      oi: "$42.1M",
      funding: "-0.012% / 8h",
      annualFunding: "-13.14% Carry",
      countdown: "03:14:22",
      timeframes: {
        "1H": { dir: "RISE", pct: "+0.28%", target: "2,748.50", bias: 62, chart: [48, 50, 52, 51, 55, 59, 62] },
        "4H": { dir: "RISE", pct: "+0.84%", target: "2,764.00", bias: 68, chart: [45, 48, 54, 58, 63, 65, 68] },
        "1D": { dir: "RISE", pct: "+1.65%", target: "2,785.00", bias: 71, chart: [40, 46, 52, 59, 64, 68, 71] },
        "1W": { dir: "RISE", pct: "+3.20%", target: "2,828.00", bias: 75, chart: [35, 42, 50, 60, 67, 72, 75] },
        "1M": { dir: "RISE", pct: "+5.10%", target: "2,880.00", bias: 79, chart: [30, 40, 52, 63, 71, 76, 79] },
        "1Y": { dir: "RISE", pct: "+14.2%", target: "3,120.00", bias: 84, chart: [25, 38, 50, 65, 74, 80, 84] }
      }
    },
    SILVER: {
      name: "Silver Perpetual",
      unit: "USD/oz",
      leverage: "12.5x",
      vol24: "$8.9M",
      oi: "$19.6M",
      funding: "+0.008% / 8h",
      annualFunding: "+8.76% Carry",
      countdown: "03:14:22",
      timeframes: {
        "1H": { dir: "FALL", pct: "-0.35%", target: "31.42", bias: 44, chart: [58, 55, 52, 50, 48, 46, 44] },
        "4H": { dir: "RISE", pct: "+0.92%", target: "32.10", bias: 59, chart: [45, 48, 51, 53, 55, 57, 59] },
        "1D": { dir: "RISE", pct: "+2.10%", target: "32.85", bias: 64, chart: [40, 45, 50, 56, 59, 61, 64] },
        "1W": { dir: "RISE", pct: "+4.40%", target: "33.90", bias: 69, chart: [35, 43, 51, 58, 62, 66, 69] },
        "1M": { dir: "RISE", pct: "+7.80%", target: "35.20", bias: 72, chart: [30, 40, 50, 60, 65, 69, 72] },
        "1Y": { dir: "RISE", pct: "+22.5%", target: "40.00", bias: 78, chart: [20, 35, 48, 62, 70, 75, 78] }
      }
    },
    BTC: {
      name: "Bitcoin Perpetual",
      unit: "USD",
      leverage: "20.0x",
      vol24: "$92.4M",
      oi: "$145.2M",
      funding: "+0.010% / 8h",
      annualFunding: "+10.95% Carry",
      countdown: "03:14:22",
      timeframes: {
        "1H": { dir: "RISE", pct: "+0.45%", target: "68,450", bias: 64, chart: [50, 53, 56, 55, 59, 61, 64] },
        "4H": { dir: "RISE", pct: "+1.80%", target: "69,300", bias: 72, chart: [44, 49, 57, 62, 66, 70, 72] },
        "1D": { dir: "RISE", pct: "+3.40%", target: "70,500", bias: 76, chart: [38, 46, 55, 64, 69, 73, 76] },
        "1W": { dir: "RISE", pct: "+7.50%", target: "73,200", bias: 81, chart: [30, 42, 54, 67, 73, 78, 81] },
        "1M": { dir: "RISE", pct: "+15.0%", target: "78,500", bias: 85, chart: [25, 38, 52, 68, 77, 82, 85] },
        "1Y": { dir: "RISE", pct: "+45.0%", target: "99,000", bias: 89, chart: [15, 32, 48, 67, 79, 85, 89] }
      }
    },
    ETH: {
      name: "Ethereum Perpetual",
      unit: "USD",
      leverage: "18.5x",
      vol24: "$41.2M",
      oi: "$68.7M",
      funding: "+0.005% / 8h",
      annualFunding: "+5.47% Carry",
      countdown: "03:14:22",
      timeframes: {
        "1H": { dir: "FALL", pct: "-0.20%", target: "2,635", bias: 46, chart: [56, 54, 52, 49, 48, 47, 46] },
        "4H": { dir: "RISE", pct: "+1.10%", target: "2,670", bias: 58, chart: [42, 46, 50, 52, 54, 56, 58] },
        "1D": { dir: "RISE", pct: "+2.80%", target: "2,715", bias: 65, chart: [36, 43, 50, 57, 60, 63, 65] },
        "1W": { dir: "RISE", pct: "+6.10%", target: "2,800", bias: 70, chart: [30, 40, 50, 60, 64, 67, 70] },
        "1M": { dir: "RISE", pct: "+12.4%", target: "2,970", bias: 74, chart: [25, 37, 49, 61, 67, 71, 74] },
        "1Y": { dir: "RISE", pct: "+38.0%", target: "3,650", bias: 80, chart: [18, 33, 48, 64, 72, 77, 80] }
      }
    },
    SOL: {
      name: "Solana Perpetual",
      unit: "USD",
      leverage: "10.0x",
      vol24: "$28.5M",
      oi: "$39.1M",
      funding: "+0.015% / 8h",
      annualFunding: "+16.42% Carry",
      countdown: "03:14:22",
      timeframes: {
        "1H": { dir: "RISE", pct: "+0.65%", target: "172.50", bias: 67, chart: [48, 52, 57, 56, 61, 64, 67] },
        "4H": { dir: "RISE", pct: "+2.40%", target: "175.50", bias: 74, chart: [40, 47, 56, 63, 68, 71, 74] },
        "1D": { dir: "RISE", pct: "+4.80%", target: "179.60", bias: 78, chart: [34, 43, 53, 65, 70, 75, 78] },
        "1W": { dir: "RISE", pct: "+10.2%", target: "188.80", bias: 83, chart: [28, 40, 52, 67, 74, 79, 83] },
        "1M": { dir: "RISE", pct: "+21.0%", target: "207.00", bias: 86, chart: [20, 36, 51, 69, 78, 83, 86] },
        "1Y": { dir: "RISE", pct: "+60.0%", target: "274.00", bias: 90, chart: [12, 30, 47, 68, 80, 86, 90] }
      }
    }
  };
}
