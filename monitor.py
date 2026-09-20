import os
import requests
import json

SPORTS_KEYWORDS = [
    'nfl', 'football', 'bengals', 'packers', 'vikings', 'bears', 'ravens', 'saints',
    '49ers', 'dolphins', 'bills', 'lions', 'jaguars', 'broncos', 'steelers', 'patriots',
    'panthers', 'falcons', 'buccaneers', 'browns', 'eagles', 'titans', 'cowboys', 'commanders',
    'mlb', 'diamondbacks', 'baseball', 'esports', 'cs2', 'vct', 'valorant', 'nba', 'soccer',
    'burrow', 'chase', 'mahomes', 'allen', 'lamar', 'purdy', 'hurts', 'barkley', 'stroud'
]

def is_sports_contract(text):
    t = text.lower()
    return any(k in t for k in SPORTS_KEYWORDS)

def format_kalshi_stats(raw_title):
    items = raw_title.replace("yes ", "").replace("no ", "").split(",")
    formatted = []
    for it in items:
        it = it.strip()
        if not it:
            continue
        if it.endswith(": 1+"):
            it = it[:-4] + " (1+ Touchdown / 1+ Hit)"
        elif it.endswith(": 2+"):
            it = it[:-4] + " (2+ Hits / Multi-TD)"
        elif any(it.endswith(f": {num}+") for num in ["200", "225", "250", "275", "300"]):
            it = it.replace("+", "+ Pass Yds")
        elif any(it.endswith(f": {num}+") for num in ["20", "25", "50", "60", "70", "75", "80"]):
            it = it.replace("+", "+ Rush/Rec Yds")
        formatted.append(it)
    return " • ".join(formatted) if formatted else raw_title

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
        url = "https://external-api.kalshi.com/trade-api/v2/markets?limit=100&status=open"
        res = requests.get(url, timeout=10).json()
        for m in res.get('markets', []):
            ticker = m.get('ticker', 'KALSHI')
            raw_title = m.get('title') or m.get('subtitle') or ticker
            yes_price = m.get('yes_ask', m.get('last_price', 50))
            
            # Skip composite traps with too many variables
            if "KXMVE" in ticker or raw_title.count(",") >= 3:
                continue

            clean_title = format_kalshi_stats(raw_title)
            is_sport = is_sports_contract(ticker) or is_sports_contract(raw_title)
            
            if is_sport:
                sports.append({
                    "matchup": f"Kalshi Single Matchup [{ticker[:10]}]",
                    "pick": clean_title,
                    "odds": f"{yes_price}%"
                })
            else:
                macro.append({
                    "matchup": f"Kalshi Milestone [{ticker[:12]}]",
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
        legs = '<div style="padding: 10px 0; color: #94A3B8; font-size: 12px;">Active markets scanned. No isolated single lines matching threshold on this pass.</div>'
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

def send_discord(sports_count, macro_count):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return
    payload = {
        "username": "Cosmic Scout Agent",
        "avatar_url": "https://img.icons8.com/isometric/512/telescope.png",
        "embeds": [{
            "title": "🌌 Companion Terminal Updated",
            "description": f"Refreshed **{sports_count} Sports Lines** and **{macro_count} Macro Milestone contracts**.",
            "color": 4156648,
            "footer": {"text": "Cosmic Parlay Companion Engine"}
        }]
    }
    requests.post(webhook_url, json=payload)

def main():
    poly_sports, poly_macro = get_polymarket_feeds()
    kalshi_sports, kalshi_macro = get_kalshi_feeds()

    sports_html = build_card(
        "Single-Leg Props & Game Radar: Kalshi",
        "Scouted Add-on Legs (No Pre-Packs)",
        "Scouted Add-on",
        "scout",
        kalshi_sports,
        "Filtered for isolated single lines with defensive mismatches. Add to custom tickets as anchor or multiplier legs."
    )

    macro_html = build_card(
        "Macro Horizon: Event Milestones",
        "Event Probability Tracker (Not Stock Recommendations)",
        "Milestones",
        "macro",
        poly_macro + kalshi_macro[:2],
        "Consensus odds for timeline projections, regulatory events, and rate paths."
    )

    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            c = f.read()

        c = inject_content(c, "<!-- AUTOGEN_SPORTS_START -->", "<!-- AUTOGEN_SPORTS_END -->", sports_html)
        c = inject_content(c, "<!-- AUTOGEN_MACRO_START -->", "<!-- AUTOGEN_MACRO_END -->", macro_html)

        with open("index.html", "w", encoding="utf-8") as f:
            f.write(c)
        print("Updated index.html safely.")

    send_discord(len(kalshi_sports) + len(poly_sports), len(poly_macro) + len(kalshi_macro))

if __name__ == "__main__":
    main()
