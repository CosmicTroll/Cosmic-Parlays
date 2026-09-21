  // --- Kalshi Live Market Catalog ---
  let kalshi = [];
  try {
    const basePath = "/trade-api/v2/markets";
    const queryString = "?limit=200&status=open";
    let kHeaders = { 
      "Accept": "application/json",
      "User-Agent": "CosmicParlaysTerminal/1.0"
    };

    if (kalshiKeyId && kalshiPrivateKey) {
      try {
        const privKey = await getKalshiCryptoKey(kalshiPrivateKey);
        const kTs = getNonceTimestamp();
        const kSig = await signKalshiRequest(privKey, kTs, "GET", basePath, "");
        kHeaders["KALSHI-ACCESS-KEY"] = kalshiKeyId;
        kHeaders["KALSHI-ACCESS-SIGNATURE"] = kSig;
        kHeaders["KALSHI-ACCESS-TIMESTAMP"] = kTs;
      } catch (_) {}
    }

    const kRes = await fetch(`https://external-api.kalshi.com${basePath}${queryString}`, {
      headers: kHeaders
    });

    if (kRes.ok) {
      const kData = await kRes.json();
      const rawMarkets = kData.markets || [];

      rawMarkets.forEach(m => {
        if (m.status && m.status !== "open" && m.status !== "active") return;

        const fullTitle = m.title || m.ticker || "";

        // Filter out multi-leg accumulator parlays and combo products
        if (
          fullTitle.includes("+") || 
          /\(\+\d+\s+more\s+legs\)/i.test(fullTitle) || 
          /more legs/i.test(fullTitle) ||
          m.ticker.startsWith("KCOMBO")
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
        else if (nBid !== null) yesVal = 1.00 - nBid;
        else if (lastP !== null) yesVal = lastP;
        else if (yBid !== null) yesVal = yBid;

        if (nAsk !== null) noVal = nAsk;
        else if (yBid !== null) noVal = 1.00 - yBid;
        else if (yesVal !== null) noVal = 1.00 - yesVal;

        if (yesVal !== null && noVal === null) noVal = 1.00 - yesVal;
        if (noVal !== null && yesVal === null) yesVal = 1.00 - noVal;

        // Skip contracts that have zero open book quotes
        if (yesVal === null && noVal === null) return;

        const candidate = m.subtitle || m.sub_title || m.yes_sub_title || "Consensus";
        const normalizedEndUtc = parseUtcIso(m.expected_expiration_time || m.expiration_time || m.close_time);

        kalshi.push({
          ticker: m.ticker,
          title: fullTitle,
          candidate: candidate,
          category: categorizeTitle(fullTitle),
          yesAsk: Number(yesVal.toFixed(2)),
          noAsk: Number(noVal.toFixed(2)),
          volume: m.volume || m.volume_24h || 0,
          endDate: normalizedEndUtc,
          platform: "Kalshi"
        });
      });
    }
  } catch (err) {
    console.error("Kalshi public markets error:", err);
  }
