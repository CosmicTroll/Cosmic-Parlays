import os
import requests
import json
import base64
import time
import datetime
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key

# CONFIGURABLE THRESHOLDS
PROFIT_CASHOUT_ALERT_PCT = 80.0   # 80% profit: Render 1-click button
AUTO_EXECUTE_PROFIT_PCT = 90.0    # 90% profit: Automatically close position
STOP_LOSS_PCT = -35.0             # -35% loss: Automated capital preservation exit

def kalshi_signed_request(method, path, body=None):
    key_id = os.environ.get("KALSHI_API_KEY_ID", "").strip()
    private_key_pem = os.environ.get("KALSHI_PRIVATE_KEY", "").strip()
    if not key_id or not private_key_pem:
        return None

    try:
        timestamp_ms = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
        timestr = str(timestamp_ms)
        message_str = f"{timestr}{method}{path}"
        if body:
            message_str += json.dumps(body)
            
        message = message_str.encode('utf-8')
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
        url = f"https://external-api.kalshi.com{path}"
        if method == "POST":
            res = requests.post(url, headers=headers, json=body, timeout=10)
        else:
            res = requests.get(url, headers=headers, timeout=10)
            
        if res.status_code in [200, 201]:
            return res.json()
        print(f"Kalshi API ({path}) status {res.status_code}: {res.text}")
    except Exception as e:
        print(f"Kalshi request exception: {e}")
    return None

def execute_kalshi_sell(ticker, side, count):
    """Submits automated closing order directly to Kalshi matching book."""
    print(f"🚨 AUTO-EXECUTING PROFIT LOCK: Selling {count}x {side} on {ticker}")
    body = {
        "action": "sell",
        "ticker": ticker,
        "type": "market",
        "side": side.lower(),
        "count": count
    }
    result = kalshi_signed_request("POST", "/trade-api/v2/portfolio/orders", body=body)
    return result is not None

def audit_position_rules(holdings):
    updated = []
    for h in holdings:
        cost = h.get("cost_basis", 0.50)
        current = h.get("current_val", cost)
        profit_pct = ((current - cost) / cost) * 100 if cost > 0 else 0
        h["profit_pct"] = profit_pct

        # RULE 1: AUTO-EXECUTE AT 90%
        if profit_pct >= AUTO_EXECUTE_PROFIT_PCT:
            h["trigger_state"] = "AUTO_SOLD"
            if h.get("raw_ticker"):
                execute_kalshi_sell(h["raw_ticker"], h.get("side", "yes"), h.get("count", 1))
        # RULE 2: 1-CLICK CASH OUT AT 80%
        elif profit_pct >= PROFIT_CASHOUT_ALERT_PCT:
            h["trigger_state"] = "ALERT_CASHOUT"
        # RULE 3: STOP LOSS
        elif profit_pct <= STOP_LOSS_PCT:
            h["trigger_state"] = "STOP_LOSS_HIT"
            if h.get("raw_ticker"):
                execute_kalshi_sell(h["raw_ticker"], h.get("side", "yes"), h.get("count", 1))
        else:
            h["trigger_state"] = "NORMAL"

        updated.append(h)
    return updated
