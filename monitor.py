import os
import requests
import json
import re

SPORTS_KEYWORDS = [
    'nfl', 'football', 'bengals', 'packers', 'vikings', 'bears', 'ravens', 'saints',
    '49ers', 'dolphins', 'bills', 'lions', 'jaguars', 'broncos', 'steelers', 'patriots',
    'panthers', 'falcons', 'buccaneers', 'browns', 'eagles', 'titans', 'cowboys', 'commanders',
    'mlb', 'diamondbacks', 'baseball', 'esports', 'cs2', 'vct', 'valorant', 'nba', 'soccer',
    'hurts', 'barkley', 'witt', 'stroud', 'herbert', 'metcalf', 'henry', 'williams', 'jeanty',
    'mahomes', 'allen', 'lamar', 'purdy', 'cmc', 'nacua', 'chase', 'kittle'
]

def is_sports_contract(text):
    t = text.lower()
    return any(k in t for k in SPORTS_KEYWORDS)

def format_kalshi_stats(raw_title):
    # Cleans raw combo texts and adds explicit statistical indicators
    items = raw_title.replace("yes ", "").replace("no ", "").split(",")
    formatted = []
    for it in items:
        it = it.strip()
        if not it:
            continue
        if re.search(r':\s*1\+$', it):
            it = re.sub(r':\s*1\+$', ' (1+ Touchdown)', it)
        elif re.search(r':\s*2\+$', it):
            it = re.sub(r':\s*2\+$', ' (2+ Hits / TDs)', it)
        elif re.search(r':\s*([2-9]\d{2,})\+$', it):
            it = re.sub(r':\s*(\d+)\+$', r' (\1+ Passing Yds)', it)
        elif re.search(r':\s*(\d+)\+$', it):
            it = re.sub(r':\s*(\d+)\+$', r' (\1+ Rush/Rec Yds)', it)
        formatted.append(it)
    return " • ".join(formatted)

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
            prob = f"{int(float(outcomes[0])*100)}%" if outcomes else "N/A"
            
            item = {"matchup": title, "pick": question, "odds": prob}
            if is_sports_contract(title) or is_sports_contract(question):
                sports.append(item)
            else:
                macro.append(item)
    except Exception as e:
        print(f"Polymarket fetch error: {e}")
    return sports[:4], macro[:4]

def get_kalshi_feeds():
    sports, macro = [], []
    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets?limit=60&status=open"
        res = requests.get(url, timeout=10).json()
        for m in res.get('markets', []):
            ticker = m.get('ticker', 'KALSHI')
            raw_title = m.get('title') or m.get('subtitle') or ticker
            yes_price = m.get('yes_ask', m.get('last_price', 50))
            
            is_sport = is_sports_contract(ticker) or is_sports_contract(raw_title) or 'KXMVE' in ticker
            
            if is_sport:
                clean_title = format_kalshi_stats(raw_title)
                sports.append({
                    "matchup": f"Kalshi Player Prop Ticket [{ticker[:10]}]",
                    "pick": clean_title,
                    "odds": f"{yes_price}%"
                })
            else:
                category = m.get('category', 'Macro Event')
                macro.append({
                    "matchup": f"Kalshi {category} [{ticker}]",
                    "pick": raw_title,
                    "odds": f"{yes_price}%"
                })
    except Exception as e:
        print(f"Kalshi fetch error: {e}")
    return sports[:4], macro[:4]

def build_card(title, tier, badge_text, badge_class, items, notes):
    legs = ""
    for it in items:
        legs += f"""
      <div class="leg">
        <div class="leg-info">
          <div class="leg-matchup">{it['matchup']}</div>
          <div class="leg-pick">{it['pick']}</div>
        </div>
        <div class="leg-odds">{it['odds']}</div>
      </div>"""
    if not items:
        legs = '<div style="padding: 10px 0; color: #64748B; font-size: 12px;">Scanning for liquid lines matching current parameters...</div>'
    return f"""
    <div class="card">
      <div class="card-head">
        <div class="card-title">{title}</div>
        <div class="badge {badge_class}">{badge_text}</div>
      </div>
      <div class="tier">{tier}</div>
      {legs}
      <div class="analysis">
        <div class="analysis-title">Automated Intel:</div>
        <div class="analysis-text">{notes}</div>
      </div>
    </div>"""

def send_discord(sports_count, macro_count):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return
    payload = {
        "username": "Cosmic Scout Agent",
        "avatar_url": "https://img.icons8.com/isometric/512/telescope.png",
        "embeds": [{
            "title": "🌌 Terminal Refreshed: Sports & Macro Boards",
            "description": f"Processed **{sports_count} Prop & Sports lines** and **{macro_count} Pure Macro contracts** with full stat labeling.",
            "color": 4156648,
            "footer": {"text": "Cosmic Parlay Companion Engine"}
        }]
    }
    requests.post(webhook_url, json=payload)

def main():
    poly_sports, poly_macro = get_polymarket_feeds()
    kalshi_sports, kalshi_macro = get_kalshi_feeds()

    sports_html = build_card(
        "Sports & Esports Radar: Polymarket", 
        "Scouted Horizon: Game Markets", 
        "Live Sports", 
        "scout", 
        poly_sports, 
        "Live event volumes and moneyline flow tracked across liquid game markets."
    ) + "\n" + build_card(
        "Sports & Esports Radar: Kalshi Props", 
        "Scouted Horizon: Player Milestones (Labeled)", 
        "Live Sports", 
        "scout", 
        kalshi_sports, 
        "CFTC-compliant touchdown, yardage, and hit milestones with unit clarifications."
    )

    macro_html = build_card(
        "Macro Horizon: Long-Range Polymarket", 
        "Macro Predictions: Tech & Geopolitics", 
        "Horizon", 
        "macro", 
        poly_macro, 
        "Monitoring tech IPO timelines and geopolitical milestone contracts."
    ) + "\n" + build_card(
        "Macro Horizon: Institutional Kalshi", 
        "Macro Predictions: Fed, Inflation & Policy", 
        "Horizon", 
        "macro", 
        kalshi_macro, 
        "Institutional rates, CPI indices, and regulated macroeconomic forecasts."
    )

    if os.path.exists("index.html"):
        with open("index.html", "r") as f:
            c = f.read()

        c = re.sub(r"<!-- AUTOGEN_SPORTS_START -->[\s\S]*?<!-- AUTOGEN_SPORTS_END -->",
                   f"<!-- AUTOGEN_SPORTS_START -->\n{sports_html}\n    <!-- AUTOGEN_SPORTS_END -->", c)
        c = re.sub(r"<!-- AUTOGEN_MACRO_START -->[\s\S]*?<!-- AUTOGEN_MACRO_END -->",
                   f"<!-- AUTOGEN_MACRO_START -->\n{macro_html}\n    <!-- AUTOGEN_MACRO_END -->", c)

        with open("index.html", "w") as f:
            f.write(c)
        print("Updated index.html successfully.")

    send_discord(len(poly_sports) + len(kalshi_sports), len(poly_macro) + len(kalshi_macro))

if __name__ == "__main__":
    main()
