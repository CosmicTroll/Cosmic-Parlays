import os
import requests
import json
import base64
import time
import datetime
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, ed25519
from cryptography.hazmat.primitives.serialization import load_pem_private_key

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

# -------------------------------------------------------------
# 1. KALSHI RSA-PSS PORTFOLIO & COMBO FILLS
# -------------------------------------------------------------
def kalshi_signed_request(method, path):
    key_id = os.environ.get("KALSHI_API_KEY_ID", "").strip()
    private_key_pem = os.environ.get("KALSHI_PRIVATE_KEY", "").strip()
    if not key_id or not private_key_pem:
        return None

    try:
        timestamp_ms = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
        timestr = str(timestamp_ms)
        message = f"{timestr}{method}{path}".encode('utf-8')

        private_key = load_pem_private_key(private_key_pem.encode('utf-8'), password=None)
        signature = private_key.sign(
            message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH
            ),
            hashes.SHA256()
        )
        sig_b64 = base64.b64encode(signature).decode('utf-8')

        headers = {
            "KALSHI-ACCESS-KEY": key_id,
            "KALSHI-ACCESS-SIGNATURE": sig_b64,
            "KALSHI-ACCESS-TIMESTAMP": timestr,
            "Content-Type": "application/json"
        }
        res = requests.get(f"https://external-api.kalshi.com{path}", headers=headers, timeout=10)
        print(f"Kalshi {path} -> Status {res.status_code}")
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        print(f"Kalshi error on {path}: {e}")
    return None

def get_market_details(ticker):
    try:
        res = requests.get(f"https://external-api.kalshi.com/trade-api/v2/markets/{ticker}", timeout=5)
        if res.status_code == 200:
            return res.json().get('market', {})
    except:
        pass
    return {}

def get_kalshi_holdings():
    holdings = []
    seen_tickers = set()

    # 1. Read Fills (Picks up multi-market Combo Tickets / MVE Orders)
    fills_data = kalshi_signed_request("GET", "/trade-api/v2/portfolio/fills?limit=50")
    if fills_data:
        for f in fills_data.get("fills", []):
            ticker = f.get("ticker") or f.get("market_ticker", "")
            if not ticker or ticker in seen_tickers:
                continue
            seen_tickers.add(ticker)

            price_dollars = float(f.get("yes_price_dollars", 0.10))
            is_combo = "KXMVE" in ticker or "CROSS" in ticker

            market_info = get_market_details(ticker)
            raw_title = market_info.get("title") or market_info.get("subtitle") or ticker

            if is_combo:
                legs = [x.strip() for x in raw_title.replace("yes ", "").replace("no ", "").split(",") if x.strip()]
                clean_title = f"{len(legs)} Market Combo" if len(legs) > 1 else "Kalshi Combo Ticket"
                details = " • ".join(legs[:4])
                if len(legs) > 4:
                    details += f" ... (+{len(legs)-4} more legs)"
                ticket_type = f"Live Combo ({len(legs)} Legs)"
            else:
                clean_title = raw_title
                details = f"Single Leg • {ticker[:12]}"
                ticket_type = "Single Market"

            holdings.append({
                "title": clean_title,
                "type": ticket_type,
                "details": details,
                "status": "Active",
                "odds": f"${price_dollars:.2f} Entry"
            })

    # 2. Read Positions (Single active contracts)
    pos_data = kalshi_signed_request("GET", "/trade-api/v2/portfolio/positions")
    if pos_data:
        for p in pos_data.get("market_positions", []):
            ticker = p.get("ticker", "")
            cnt = p.get("position", 0)
            is_combo = "KXMVE" in ticker or "CROSS" in ticker

            if (cnt != 0 or is_combo) and ticker not in seen_tickers:
                seen_tickers.add(ticker)
                market_info = get_market_details(ticker)
                raw_title = market_info.get("title") or market_info.get("subtitle") or ticker

                if is_combo:
                    legs = [x.strip() for x in raw_title.replace("yes ", "").replace("no ", "").split(",") if x.strip()]
                    title = f"{len(legs)} Market Combo" if len(legs) > 1 else "Kalshi Combo Ticket"
                    details = " • ".join(legs[:4])
                    if len(legs) > 4:
                        details += f" ... (+{len(legs)-4} more)"
                else:
                    title = raw_title
                    details = f"{abs(cnt)}x {'YES' if cnt > 0 else 'NO'}"

                holdings.append({
                    "title": title,
                    "type": "Open Ticket",
                    "details": details,
                    "status": "Active" if not p.get("settled") else "Settled",
                    "odds": f"{p.get('realized_pnl', 0):+}¢"
                })

    return holdings

# -------------------------------------------------------------
# 2. POLYMARKET US AUTHENTICATED ED25519 PORTFOLIO
# -------------------------------------------------------------
def load_polymarket_key(secret_str):
    """Safely derive Ed25519 private key from 32-byte seed or 64-byte key."""
    try:
        raw_bytes = base64.b64decode(secret_str)
    except Exception:
        raw_bytes = secret_str.encode('utf-8')

    # If 32 bytes or 64 bytes (seed is the first 32 bytes)
    if len(raw_bytes) >= 32:
        return ed25519.Ed25519PrivateKey.from_private_bytes(raw_bytes[:32])
    
    # Fallback to direct bytes
    return ed25519.Ed25519PrivateKey.from_private_bytes(raw_bytes.ljust(32, b'\0')[:32])

def polymarket_us_request(method, path):
    api_key = os.environ.get("POLYMARKET_API_KEY", "").strip()
    secret = os.environ.get("POLYMARKET_SECRET", "").strip()
    if not api_key or not secret:
        return None

    try:
        timestamp_ms = str(int(time.time() * 1000))
        message = f"{timestamp_ms}{method}{path}".encode('utf-8')

        priv_key = load_polymarket_key(secret)
        signature = priv_key.sign(message)
        sig_b64 = base64.b64encode(signature).decode('utf-8')

        headers = {
            "X-PM-Access-Key": api_key,
            "X-PM-Timestamp": timestamp_ms,
            "X-PM-Signature": sig_b64,
            "Content-Type": "application/json"
        }
        res = requests.get(f"https://api.polymarket.us{path}", headers=headers, timeout=10)
        print(f"Polymarket US {path} -> Status {res.status_code}")
        if res.status_code == 200:
            return res.json()
        else:
            print(f"Polymarket US response error ({res.status_code}): {res.text[:200]}")
    except Exception as e:
        print(f"Polymarket US execution error on {path}: {e}")
    return None

def get_polymarket_portfolio_positions():
    positions = []
    
    # 1. Fetch User Positions from Polymarket US
    try:
        data = polymarket_us_request("GET", "/v1/portfolio/positions")
        if data:
            items = data if isinstance(data, list) else data.get("positions", [])
            for p in items:
                title = p.get("title") or p.get("market_title") or p.get("question") or "Polymarket Ticket"
                size = p.get("size") or p.get("netPosition") or 1
                price = p.get("curPrice") or p.get("price") or p.get("cost") or 0.5
                try:
                    price_val = float(price)
                    odds_str = f"{int(price_val * 100)}%" if price_val <= 1 else f"{price_val:.2f}¢"
                except:
                    odds_str = str(price)

                positions.append({
                    "title": title,
                    "details": f"{size} shares • {p.get('outcome', 'YES')}",
                    "odds": odds_str
                })
    except Exception as e:
        print(f"Error parsing Polymarket positions: {e}")

    # 2. Fetch Open/Pending Combos
    try:
        orders_data = polymarket_us_request("GET", "/v1/orders/open")
        if orders_data:
            items = orders_data if isinstance(orders_data, list) else orders_data.get("orders", [])
            for o in items:
                title = o.get("marketTitle") or o.get("title") or "Polymarket Combo Ticket"
                positions.append({
                    "title": title,
                    "details": f"Open Slate • {o.get('side', 'BUY')} {o.get('quantity', 1)}x",
                    "odds": f"{o.get('price', 'Open')}"
                })
    except Exception as e:
        print(f"Error parsing Polymarket orders: {e}")

    return positions

def build_active_slates_html(kalshi_holdings, poly_pos):
    cards = []

    if kalshi_holdings:
        legs = ""
        for h in kalshi_holdings:
            badge_color = "#86EFAC" if h["status"] in ["Active", "Executed"] else "#FDE68A"
            legs += f"""
      <div class="leg">
        <div class="leg-info">
          <div class="leg-matchup">{h['type']} • <span style="color: {badge_color};">{h['status']}</span></div>
          <div class="leg-pick">{h['title']}<br><span style="font-size: 11px; color: #94A3B8; line-height: 15px;">{h['details']}</span></div>
        </div>
        <div class="leg-odds">{h['odds']}</div>
      </div>"""
        cards.append(f"""
    <div class="card">
      <div class="card-head">
        <div class="card-title">Kalshi Live Slates</div>
        <div class="badge up">Sync Active</div>
      </div>
      <div class="tier">Active Combo Tickets & Fills</div>
      {legs}
      <div class="analysis">
        <div class="analysis-title">Portfolio Status:</div>
        <div class="analysis-text">Synchronized with Kalshi portfolio fills and active multi-market combinations.</div>
      </div>
    </div>""")

    if poly_pos:
        legs = ""
        for p in poly_pos:
            legs += f"""
      <div class="leg">
        <div class="leg-info">
          <div class="leg-matchup">Polymarket US • <span style="color: #86EFAC;">Active</span></div>
          <div class="leg-pick">{p['title']}<br><span style="font-size: 11px; color: #94A3B8; line-height: 15px;">{p['details']}</span></div>
        </div>
        <div class="leg-odds">{p['odds']}</div>
      </div>"""
        cards.append(f"""
    <div class="card">
      <div class="card-head">
        <div class="card-title">Polymarket Live Portfolio</div>
        <div class="badge up">Sync Active</div>
      </div>
      <div class="tier">Active Polymarket Positions</div>
      {legs}
      <div class="analysis">
        <div class="analysis-title">Portfolio Status:</div>
        <div class="analysis-text">Authenticated directly via Polymarket US Ed25519 API.</div>
      </div>
    </div>""")

    if not cards:
        return """
    <div class="card">
      <div class="card-head">
        <div class="card-title">Active Portfolio Clear</div>
        <div class="badge scout">Standby</div>
      </div>
      <div class="tier">Kalshi & Polymarket Portfolio Reader</div>
      <div class="analysis">
        <div class="analysis-title">Live Account State:</div>
        <div class="analysis-text">No active risk exposure or open combo tickets detected.</div>
      </div>
    </div>"""
    return "\n".join(cards)

# -------------------------------------------------------------
# 3. PUBLIC RADAR & PROPS POLLING (TABS 2 & 3)
# -------------------------------------------------------------
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

def get_public_markets():
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
        print(f"Polymarket radar error: {e}")

    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets?limit=100&status=open"
        res = requests.get(url, timeout=10).json()
        for m in res.get('markets', []):
            ticker = m.get('ticker', 'KALSHI')
            raw_title = m.get('title') or m.get('subtitle') or ticker
            yes_price = m.get('yes_ask', m.get('last_price', 50))

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
        print(f"Kalshi radar error: {e}")

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

def send_discord(active_count, sports_count, macro_count):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return
    payload = {
        "username": "Cosmic Scout Agent",
        "avatar_url": "https://img.icons8.com/isometric/512/telescope.png",
        "embeds": [{
            "title": "🌌 Companion Terminal Updated",
            "description": f"Refreshed **{active_count} Active Portfolio Slates**, **{sports_count} Sports Lines**, and **{macro_count} Macro Horizons**.",
            "color": 4156648,
            "footer": {"text": "Cosmic Parlay Companion Engine"}
        }]
    }
    requests.post(webhook_url, json=payload)

def main():
    kalshi_holdings = get_kalshi_holdings()
    poly_pos = get_polymarket_portfolio_positions()
    active_html = build_active_slates_html(kalshi_holdings, poly_pos)

    sports_items, macro_items = get_public_markets()
    sports_html = build_card(
        "Single-Leg Props & Game Radar",
        "Scouted Add-on Legs (Zero Pre-Packs)",
        "Scouted Add-on",
        "scout",
        sports_items,
        "Filtered for isolated single lines with defensive mismatches. Add to custom tickets as anchor or multiplier legs."
    )
    macro_html = build_card(
        "Macro Horizon: Event Milestones",
        "Event Probability Tracker (Not Stock Recommendations)",
        "Milestones",
        "macro",
        macro_items,
        "Consensus odds for timeline projections, regulatory events, and rate paths."
    )

    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            c = f.read()

        c = inject_content(c, "<!-- AUTOGEN_ACTIVE_START -->", "<!-- AUTOGEN_ACTIVE_END -->", active_html)
        c = inject_content(c, "<!-- AUTOGEN_SPORTS_START -->", "<!-- AUTOGEN_SPORTS_END -->", sports_html)
        c = inject_content(c, "<!-- AUTOGEN_MACRO_START -->", "<!-- AUTOGEN_MACRO_END -->", macro_html)

        with open("index.html", "w", encoding="utf-8") as f:
            f.write(c)
        print("Updated index.html successfully.")

    send_discord(len(kalshi_holdings) + len(poly_pos), len(sports_items), len(macro_items))

if __name__ == "__main__":
    main()
