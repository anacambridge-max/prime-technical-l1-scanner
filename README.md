# Prime Technical L-1 Scanner

Live 5-minute NSE/F&O scanner foundation using Upstox OAuth and Market Data Feed V3.

## Upstox app configuration

Register this exact redirect URI in the Upstox Developer App:

`https://prime-technical-l1-scanner.vercel.app/api/upstox/callback`

## Vercel environment variables

Add these to **Production** (and Preview if you want to test there):

- `UPSTOX_CLIENT_ID` = your Upstox API Key
- `UPSTOX_CLIENT_SECRET` = your Upstox API Secret
- `UPSTOX_REDIRECT_URI` = `https://prime-technical-l1-scanner.vercel.app/api/upstox/callback`

Never put the client secret in browser code or commit it to GitHub.

## Signal engine target

The next scanner layer will use live 5-minute data to evaluate:

- 09:15 opening candle
- Master Candle
- Extreme Volume / RVOL
- PDH / PDL
- Weekly High / Low
- Monthly High / Low
- 52-week High / Low
- ATH / ATL
- Confirmed breakout/breakdown
- New BUY/SELL signals only before 10:00 AM
- Entry, SL, 2R target and score

Upstox access tokens expire according to Upstox's token policy, so the app must re-authorize when required.
