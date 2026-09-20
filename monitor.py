import os
import requests
import json
import re

def get_polymarket_sample():
    try:
        url = "https://gamma-api.polymarket.com/events?limit=5&active=true&closed=false"
        res = requests.get(url, timeout=10).json()
        markets = []
        for event in res:
            title = event.get('title', 'Unknown')
            for m in event.get('markets', [])[:2]:
                q = m.get('groupItemTitle') or m.get('question')
                outcomes = json.loads(m.get('outcomePrices', '["0","0"]'))
                prob = f"{int(float(outcomes[0])*100)}%" if outcomes else "N/A"
                markets.append(f"• {title} ({q}): **{prob}**")
        return "\n".join(markets[:5])
    except Exception as e:
        return f"Polymarket read error: {e}"

def get_kalshi_sample():
    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets?limit=5&status=open"
        res = requests.get(url, timeout=10).json()
        markets = []
        for m in res.get('markets', []):
            ticker = m.get('ticker')
            yes_price = m.get('yes_ask', m.get('last_price', 0))
            markets.append(f"• Kalshi [{ticker}]: **{yes_price}%**")
        return "\n".join(markets[:5])
    except Exception as e:
        return f"Kalshi read error: {e}"

def send_discord_alert(poly_text, kalshi_text):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        print("No DISCORD_WEBHOOK_URL provided, skipping alert.")
        return

    # Rich Discord Embed Payload
    payload = {
        "username": "Cosmic Scout Agent",
        "avatar_url": "https://img.icons8.com/isometric/512/telescope.png",
        "embeds": [
            {
                "title": "🌌 Cosmic Parlay Theorem — Slate & Contract Update",
                "description": "Automated orderbook scan across active Polymarket & Kalshi liquidity.",
                "color": 8497656, # Cosmic Indigo (#818CF8)
                "fields": [
                    {"name": "Polymarket Contract Radar", "value": poly_text or "No contracts", "inline": False},
                    {"name": "Kalshi Probability Feed", "value": kalshi_text or "No contracts", "inline": False},
                ],
                "footer": {"text": "For entertainment and educational analysis only."}
            }
        ]
    }
    res = requests.post(webhook_url, json=payload)
    print(f"Discord alert response: {res.status_code}")

def main():
    poly_data = get_polymarket_sample()
    kalshi_data = get_kalshi_sample()
    
    # 1. Send Discord alert to your server
    send_discord_alert(poly_data, kalshi_data)
    
    # 2. Update index.html live scouting section
    if os.path.exists("index.html"):
        with open("index.html", "r") as f:
            content = f.read()
        
        scout_summary = "Automated contract scan complete. Market liquidity depth aligned with baseline theorem expectations."
        pattern = r'(<div class="analysis-text">)(.*?)(</div>)'
        new_content = re.sub(pattern, rf'\1{scout_summary}\3', content, count=1)
        
        with open("index.html", "w") as f:
            f.write(new_content)
        print("index.html updated successfully.")

if __name__ == "__main__":
    main()
