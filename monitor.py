import os
import requests
import json
import re
from datetime import datetime

def get_polymarket_contracts():
    items = []
    try:
        url = "https://gamma-api.polymarket.com/events?limit=8&active=true&closed=false"
        res = requests.get(url, timeout=10).json()
        for event in res:
            title = event.get('title', 'Event Market')
            for m in event.get('markets', [])[:1]:
                q = m.get('groupItemTitle') or m.get('question') or title
                outcomes = json.loads(m.get('outcomePrices', '["0","0"]'))
                prob = f"{int(float(outcomes[0])*100)}%" if outcomes else "N/A"
                items.append({
                    "matchup": title[:36],
                    "pick": q[:40],
                    "odds": prob
                })
        return items[:4]
    except Exception as e:
        print(f"Polymarket fetch error: {e}")
        return []

def get_kalshi_contracts():
    items = []
    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets?limit=8&status=open"
        res = requests.get(url, timeout=10).json()
        for m in res.get('markets', []):
            ticker = m.get('ticker', 'KALSHI')
            title = m.get('title') or m.get('subtitle') or ticker
            yes_price = m.get('yes_ask', m.get('last_price', 50))
            items.append({
                "matchup": f"Kalshi [{ticker}]",
                "pick": title[:40],
                "odds": f"{yes_price}%"
            })
        return items[:4]
    except Exception as e:
        print(f"Kalshi fetch error: {e}")
        return []

def build_card_html(title, tier, badge_text, items, notes):
    legs_html = ""
    for item in items:
        legs_html += f"""
      <div class="leg">
        <div>
          <div class="leg-matchup">{item['matchup']}</div>
          <div class="leg-pick">{item['pick']}</div>
        </div>
        <div class="leg-odds">{item['odds']}</div>
      </div>"""

    return f"""
    <div class="card">
      <div class="card-head">
        <div class="card-title">{title}</div>
        <div class="badge scout">{badge_text}</div>
      </div>
      <div class="tier">{tier}</div>
      {legs_html}
      <div class="analysis">
        <div class="analysis-title">Automated Scout Intel:</div>
        <div class="analysis-text">{notes}</div>
      </div>
    </div>"""

def send_discord_alert(poly_count, kalshi_count):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return
    payload = {
        "username": "Cosmic Scout Agent",
        "avatar_url": "https://img.icons8.com/isometric/512/telescope.png",
        "embeds": [{
            "title": "🌌 Website Scouted Tab Updated Live",
            "description": f"Successfully pulled **{poly_count} Polymarket** and **{kalshi_count} Kalshi** live contracts into the Cosmic Parlay Theorem radar.",
            "color": 3978086, # Emerald Green
            "footer": {"text": "Auto-pushed to GitHub Pages"}
        }]
    }
    requests.post(webhook_url, json=payload)

def main():
    poly_items = get_polymarket_contracts()
    kalshi_items = get_kalshi_contracts()

    poly_card = build_card_html(
        title="Live Polymarket Radar Board",
        tier="Scouted Horizon: Orderbook Momentum",
        badge_text="Live Market",
        items=poly_items,
        notes="High-volume contract probabilities monitored in real-time. Tracking spread compression across active outcomes."
    )

    kalshi_card = build_card_html(
        title="Live Kalshi Event Spread Radar",
        tier="Scouted Horizon: Event Probabilities",
        badge_text="Live Flow",
        items=kalshi_items,
        notes="Regulated event contracts tracking current yes/ask probabilities. Flagging asymmetric payout opportunities."
    )

    scout_block = poly_card + "\n" + kalshi_card

    if os.path.exists("index.html"):
        with open("index.html", "r") as f:
            content = f.read()

        # Replace everything between the AUTOGEN comments
        pattern = r"<!-- AUTOGEN_START -->[\s\S]*?<!-- AUTOGEN_END -->"
        replacement = f"<!-- AUTOGEN_START -->\n{scout_block}\n    <!-- AUTOGEN_END -->"
        new_content = re.sub(pattern, replacement, content)

        with open("index.html", "w") as f:
            f.write(new_content)
        print("Updated index.html scouted tab successfully.")

    send_discord_alert(len(poly_items), len(kalshi_items))

if __name__ == "__main__":
    main()
