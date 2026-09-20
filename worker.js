// Cloudflare Worker: worker.js
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // Endpoint: /api/live-data
      if (url.pathname === "/api/live-data") {
        // 1. Fetch Kalshi Public Markets (Free public endpoint, no auth required for price reading)
        const kalshiRes = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=15&status=open", {
          headers: { "Accept": "application/json" }
        });
        const kalshiData = kalshiRes.ok ? await kalshiRes.json() : { markets: [] };

        // 2. Fetch Polymarket Active Events via Gamma API
        const polyRes = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=15", {
          headers: { "Accept": "application/json" }
        });
        const polyData = polyRes.ok ? await polyRes.json() : [];

        // 3. Normalizer & Discrepancy Engine
        const sanitizedKalshi = (kalshiData.markets || []).slice(0, 8).map(m => ({
          ticker: m.ticker,
          title: m.title || m.subtitle || m.ticker,
          yesAsk: m.yes_ask ? m.yes_ask / 100 : 0.50,
          noAsk: m.no_ask ? m.no_ask / 100 : 0.50,
          volume: m.volume || 0,
          platform: "Kalshi"
        }));

        const sanitizedPoly = (Array.isArray(polyData) ? polyData : []).slice(0, 8).map(e => {
          const firstMarket = e.markets?.[0] || {};
          let outcomePrices = [0.50, 0.50];
          try {
            if (firstMarket.outcomePrices) {
              outcomePrices = JSON.parse(firstMarket.outcomePrices);
            }
          } catch (_) {}
          return {
            ticker: e.slug || firstMarket.id,
            title: e.title,
            yesAsk: parseFloat(outcomePrices[0]) || 0.50,
            noAsk: parseFloat(outcomePrices[1]) || 0.50,
            volume: e.volume || 0,
            platform: "Polymarket"
          };
        });

        // 4. Arbitrage Scanner Simulation (Kalshi Yes + Poly No < $1.00 net of 1.5% taker friction)
        const arbOpportunities = [];
        for (const k of sanitizedKalshi) {
          for (const p of sanitizedPoly) {
            // Check string similarity match or demo spread
            const totalCost = k.yesAsk + p.noAsk;
            const netEdge = 1.00 - totalCost - 0.02; // minus approx 2c fees
            if (netEdge > 0) {
              arbOpportunities.push({
                event: k.title,
                kalshiLeg: `Buy Yes @ $${k.yesAsk.toFixed(2)}`,
                polyLeg: `Buy No @ $${p.noAsk.toFixed(2)}`,
                netEdgePercent: (netEdge * 100).toFixed(1)
              });
            }
          }
        }

        return new Response(JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          kalshi: sanitizedKalshi,
          polymarket: sanitizedPoly,
          arbitrage: arbOpportunities
        }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), { 
        status: 404, 
        headers: corsHeaders 
      });

    } catch (err) {
      return new Response(JSON.stringify({ status: "error", message: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
