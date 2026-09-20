import os
import requests
import json

SPORTS_KEYWORDS = [
    'nfl', 'football', 'bengals', 'packers', 'vikings', 'bears', 'ravens', 'saints',
    '49ers', 'dolphins', 'bills', 'lions', 'jaguars', 'broncos', 'steelers', 'patriots',
    'panthers', 'falcons', 'buccaneers', 'browns', 'eagles', 'titans', 'cowboys', 'commanders',
    'mlb', 'diamondbacks', 'baseball', 'esports', 'cs2', 'vct', 'valorant', 'nba', 'soccer'
]

def is_sports_contract(text):
    t = text.lower()
    return any(k in t for k in SPORTS_KEYWORDS)

def clean_prop_title(text):
    clean = text.replace("yes ", "").replace("no ", "").strip()
    # Format common stat queries cleanly
    if clean.endswith(": 1+"):
        return clean[:-4] + " (Anytime TD / 1+ Hit)"
    if any(clean.endswith(f": {y}+") for y in ["150", "175", "200", "225", "250", "275", "300"]):
        return clean.replace("+", "+ Pass Yds")
    if any(clean.endswith(f": {y}+") for y in ["20", "25", "40", "50", "60", "70", "80", "100"]):
        return clean.replace("+", "+ Rush/Rec Yds")
    return clean

def get_polymarket_feeds():
    sports, macro = [], []
    try:
        url = "https://gamma-api.polymarket.com/events?limit=40&active=true&closed=false"
        res = requests.get(url, timeout=10).json()
        for event in res:
            title = event.get('title', 'Event').strip()
            markets = event.get('markets', [])
            if not markets:
                continue
            m = markets[0]
            question = (m.get('groupItemTitle') or m.get('question') or title).strip()
            outcomes = json.loads(m.get('outcomePrices', '["0","0"]'))
            prob_val = int(float(outcomes[0])*100) if outcomes else 0
            
            item = {
                "matchup": title,
                "pick": question,
                "odds": f"{prob_val}%",
                "tag": "Anchor Leg" if prob_val >= 65 else ("Value Add-on" if prob_val <= 45 else "Fair Value")
            }
            if is_sports_contract(title) or is_sports_contract(question):
                sports.append(item)
            else:
                macro.append(item)
    except Exception as e:
        print(f"Polymarket fetch error: {e}")
    return sports[:4], macro[:4]

def get_kalshi_props_and_macro():
    props, macro = [], []
    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets?limit=100&status=open"
        res = requests.get(url, timeout=10).json()
        for m in res.get('markets', []):
            ticker = m.get('ticker', '')
            raw_title = m.get('title') or m.get('subtitle') or ticker
            yes_price = m.get('yes_ask', m.get('last_price', 50))

            # STRICT FILTER: Discard Kalshi multi-leg combos entirely
            if "KXMVE" in ticker or raw_title.count(",") >= 2:
                continue

            # Check if it's an isolated player prop
            is_prop = any(k in ticker.lower() or k in raw_title.lower() for k in [
                'td', 'touchdown', 'pass', 'rush', 'rec', 'yard', 'hit', 'strikeout', 'pts', 'reb', 'ast'
            ]) or is_sports_contract(ticker) or is_sports_contract(raw_title)

            if is_prop:
                tag = "Anchor Leg (High Floor)" if yes_price >= 65 else ("Value Add-on (Longshot)" if yes_price <= 45 else "Neutral")
                props.append({
                    "matchup": f"Kalshi Matchup Discrepancy [{ticker[:12]}]",
                    "pick": clean_prop_title(raw_title),
                    "odds": f"{yes_price}%",
                    "tag": tag
                })
            else:
                macro.append({
                    "matchup": f"Kalshi Macro [{ticker[:16]}]",
                    "pick": raw_title,
                    "odds": f"{yes_price}%",
                    "tag": "Institutional Flow"
                })
    except Exception as e:
        print(f"Kalshi fetch error: {e}")
    return props[:4], macro[:4]

def build_card(title, tier, badge_text, badge_class, items, notes):
    legs = ""
    for it in items:
        legs += f"""
      <div class="leg">
        <div class="leg-info">
          <div class="leg-matchup">{it['matchup']} • <span style="color: #A5B4FC; font-weight: 600;">{it.get('tag', 'Scouted')}</span></div>
          <div class="leg-pick">{it['pick']}</div>
        </div>
        <div class="leg-odds">{it['odds']}</div>
      </div>"""
    if not items:
        legs = '<div style="padding: 10px 0; color: #64748B; font-size: 12px;">Monitoring board for single-player mismatch opportunities...</div>'
    return f"""
    <div class="card">
      <div class="card-head">
        <div class="card-title">{title}</div>
        <div class="badge {badge_class}">{badge_text}</div>
      </div>
      <div class="tier">{tier}</div>
      {legs}
      <div class="analysis">
        <div class="analysis-title">Cosmic Matchup Thesis:</div>
        <div class="analysis-text">{notes}</div>
      </div>
    </div>"""

def inject_content(html, start_tag, end_tag, new_content):
    if start_tag in html and end_tag in html:
        before = html.split(start_tag)[0]
        after = html.split(end_tag)[1]
        return before + start_tag + "\n" + new_content + "\n    " + end_tag + after
    return html

def send_discord(props_count, macro_count):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return
    payload = {
        "username": "Cosmic Scout Agent",
        "avatar_url": "https://img.icons8.com/isometric/512/telescope.png",
        "embeds": [{
            "title": "🌌 Matchup Discrepancies Scouted (Zero Pre-Packs)",
            "description": f"Extracted **{props_count} Single-Player Add-on Candidates** and **{macro_count} Macro Milestone contracts**.",
            "color": 4156648,
            "footer": {"text": "Cosmic Parlay Companion Engine"}
        }]
    }
    requests.post(webhook_url, json=payload)

def main():
    poly_sports, poly_macro = get_polymarket_feeds()
    kalshi_props, kalshi_macro = get_kalshi_props_and_macro()

    sports_html = build_card(
        "Single-Player Matchup Radar: Kalshi Props", 
        "Scouted Add-ons: Uneven Defensive Splits", 
        "Target Add-on", 
        "scout", 
        kalshi_props, 
        "Isolated single-player props exhibiting script mismatches. Combine high-floor anchor lines (≥65%) with game totals, or sprinkle low-delta lines (≤45%) as ticket multipliers."
    ) + "\n" + build_card(
        "Game Script Radar: Polymarket", 
        "Game Environment: Moneyline & Outright Liquidity", 
        "Game Flow", 
        "scout", 
        poly_sports, 
        "Baseline game-pace metrics to pair with player usage anomalies."
    )

    macro_html = build_card(
        "Macro Horizon: Long-Range Polymarket", 
        "Macro Predictions: Tech & Geopolitics", 
        "Horizon", 
        "macro", 
        poly_macro, 
        "Long-duration narrative and milestone contracts."
    ) + "\n" + build_card(
        "Macro Horizon: Institutional Kalshi", 
        "Macro Predictions: Rates & Indices", 
        "Horizon", 
        "macro", 
        kalshi_macro, 
        "Regulated central bank interest rate trajectories and economic indexes."
    )

    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            c = f.read()

        c = inject_content(c, "<!-- AUTOGEN_SPORTS_START -->", "<!-- AUTOGEN_SPORTS_END -->", sports_html)
        c = inject_content(c, "<!-- AUTOGEN_MACRO_START -->", "<!-- AUTOGEN_MACRO_END -->", macro_html)

        with open("index.html", "w", encoding="utf-8") as f:
            f.write(c)
        print("Updated index.html successfully with single-prop add-on filtering.")

    send_discord(len(kalshi_props), len(poly_macro) + len(kalshi_macro))

if __name__ == "__main__":
    main()
