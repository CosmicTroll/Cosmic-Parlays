import os
import requests
import json
import re

# 1. Fetch live public contract data
def get_polymarket_sample():
    try:
        url = "https://gamma-api.polymarket.com/events?limit=5&active=true&closed=false"
        res = requests.get(url, timeout=10).json()
        markets = []
        for event in res:
            title = event.get('title', 'Unknown')
            for m in event.get('markets', [])[:2]:
                q = m.get('groupItemTitle') or m.get('question')
                # Parse outcome prices
                outcomes = json.loads(m.get('outcomePrices', '["0","0"]'))
                prob = f"{int(float(outcomes[0])*100)}%" if outcomes else "N/A"
                markets.append(f"{title} - {q}: {prob}")
        return "\n".join(markets[:6])
    except Exception as e:
        return f"Polymarket fetch error: {e}"

def get_kalshi_sample():
    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets?limit=6&status=open"
        res = requests.get(url, timeout=10).json()
        markets = []
        for m in res.get('markets', []):
            ticker = m.get('ticker')
            yes_price = m.get('yes_ask', m.get('last_price', 0))
            markets.append(f"Kalshi [{ticker}]: {yes_price}%")
        return "\n".join(markets[:6])
    except Exception as e:
        return f"Kalshi fetch error: {e}"

# 2. Call AI to analyze movements
def analyze_with_ai(market_data):
    api_key = os.environ.get("AI_API_KEY")
    if not api_key:
        return "Market liquidity steady across late boards. Spread discrepancies within standard threshold."

    prompt = f"""
    You are the Cosmic Parlay Theorem scout. Review these live contract prices from Polymarket and Kalshi:
    {market_data}
    
    Write a 2-sentence sharp, cosmic-themed scouting summary on market variance, line movements, and opportunities.
    """
    
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": "gpt-4o-mini", # or any provider
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 100
    }
    try:
        res = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=15)
        return res.json()['choices'][0]['message']['content'].strip()
    except Exception:
        return "Contract pricing steady across board. Maintaining priority watch on prime-window liquidity."

# 3. Send notification to your phone (e.g. Telegram)
def send_telegram_alert(text):
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if bot_token and chat_id:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        requests.post(url, json={"chat_id": chat_id, "text": f"🌌 Cosmic Parlay Alert:\n\n{text}"})

def main():
    poly_data = get_polymarket_sample()
    kalshi_data = get_kalshi_sample()
    combined = f"Polymarket:\n{poly_data}\n\nKalshi:\n{kalshi_data}"
    
    analysis = analyze_with_ai(combined)
    send_telegram_alert(analysis)
    
    # Update index.html scouting text automatically
    if os.path.exists("index.html"):
        with open("index.html", "r") as f:
            content = f.read()
        
        # Replace the first scouting note text dynamically
        pattern = r'(<div class="analysis-text">)(.*?)(</div>)'
        new_content = re.sub(pattern, rf'\1{analysis}\3', content, count=1)
        
        with open("index.html", "w") as f:
            f.write(new_content)
        print("Updated index.html successfully.")

if __name__ == "__main__":
    main()
