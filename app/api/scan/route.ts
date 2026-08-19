import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Candle = [string, number, number, number, number, number, number?];
type Instrument = { instrument_key: string; trading_symbol: string; segment: string; instrument_type: string };

const UNIVERSE = [
  "RELIANCE","HDFCBANK","ICICIBANK","SBIN","INFY","TCS","BHARTIARTL","ITC","KOTAKBANK","LT",
  "AXISBANK","HINDUNILVR","BAJFINANCE","MARUTI","M&M","SUNPHARMA","TITAN","ULTRACEMCO","NTPC","ONGC",
  "POWERGRID","ADANIENT","ADANIPORTS","TATASTEEL","JSWSTEEL","COALINDIA","HINDALCO","GRASIM","EICHERMOT","TECHM",
  "HCLTECH","WIPRO","DRREDDY","CIPLA","APOLLOHOSP","DIVISLAB","TATAMOTORS","BAJAJFINSV","BAJAJ-AUTO","TRENT",
  "BEL","SHRIRAMFIN","INDUSINDBK","NESTLEIND","ASIANPAINT","HEROMOTOCO","ETERNAL","JIOFIN","TATAELXSI","INDIGO"
];

let cachedInstruments: Instrument[] | null = null;
let cachePromise: Promise<Instrument[]> | null = null;

function nowIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function marketWindow() {
  const d = nowIST();
  const minutes = d.getHours() * 60 + d.getMinutes();
  return { d, open: minutes >= 555 && minutes < 930, signalWindow: minutes >= 560 && minutes < 600 };
}

async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const result = await Promise.all(batch.map(worker));
    out.push(...result);
  }
  return out;
}

async function resolveInstruments(token: string): Promise<Instrument[]> {
  if (cachedInstruments) return cachedInstruments;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    const results = await inBatches(UNIVERSE, 8, async (symbol) => {
      const url = new URL("https://api.upstox.com/v2/instruments/search");
      url.searchParams.set("query", symbol);
      url.searchParams.set("exchanges", "NSE");
      url.searchParams.set("segments", "EQ");
      url.searchParams.set("instrument_types", "EQ");
      url.searchParams.set("records", "10");
      const r = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) return null;
      const j = await r.json();
      return (j?.data ?? []).find((x: Instrument) => x.segment === "NSE_EQ" && x.instrument_type === "EQ" && x.trading_symbol === symbol) ?? null;
    });
    cachedInstruments = results.filter(Boolean) as Instrument[];
    cachePromise = null;
    return cachedInstruments;
  })().catch((error) => {
    cachePromise = null;
    throw error;
  });

  return cachePromise;
}

async function candles(token: string, key: string): Promise<Candle[]> {
  const url = `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(key)}/minutes/5`;
  const r = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j?.data?.candles) ? j.data.candles : [];
}

function scoreSignal(side: "BUY" | "SELL", rvol: number, rangePct: number) {
  let score = 50;
  if (rvol >= 3) score += 25;
  else if (rvol >= 2) score += 18;
  if (rangePct >= 1) score += 10;
  else if (rangePct >= 0.5) score += 5;
  if (side === "BUY" || side === "SELL") score += 5;
  return Math.min(100, score);
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pt_access_token")?.value;
  if (!token) return NextResponse.json({ connected: false, error: "Upstox is not connected." }, { status: 401 });

  const { d, open, signalWindow } = marketWindow();
  const marketTime = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  if (!open) {
    return NextResponse.json({ connected: true, marketOpen: false, signalWindow: false, marketTime, scanned: 0, signals: [], stats: { buy: 0, sell: 0, extreme: 0, avgScore: 0, setups: 0 } });
  }

  const instruments = await resolveInstruments(token);
  const rows = await inBatches(instruments, 8, async (instrument) => {
    const cs = await candles(token, instrument.instrument_key);
    if (cs.length < 2) return null;

    const ordered = [...cs].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
    const opening = ordered[0];
    const current = ordered[ordered.length - 1];
    const prior = ordered.slice(1, -1).slice(-5);
    const avgVol = prior.length ? prior.reduce((s, c) => s + Number(c[5] || 0), 0) / prior.length : Number(opening[5] || 0);
    const rvol = avgVol > 0 ? Number(current[5] || 0) / avgVol : 0;
    const rangePct = opening[1] > 0 ? ((opening[2] - opening[3]) / opening[1]) * 100 : 0;
    const bullishBreak = current[2] > opening[2] && current[4] > current[1];
    const bearishBreak = current[3] < opening[3] && current[4] < current[1];
    const extreme = rvol >= 2;

    if (!signalWindow || !extreme || (!bullishBreak && !bearishBreak)) return null;

    const side: "BUY" | "SELL" = bullishBreak ? "BUY" : "SELL";
    const entry = Number(current[4]);
    const sl = side === "BUY" ? Number(opening[3]) : Number(opening[2]);
    const risk = Math.abs(entry - sl);
    if (!Number.isFinite(entry) || !Number.isFinite(sl) || risk <= 0) return null;
    const target = side === "BUY" ? entry + risk * 2 : entry - risk * 2;
    const score = scoreSignal(side, rvol, rangePct);

    return {
      symbol: instrument.trading_symbol,
      setup: "OPENING + EXTREME VOLUME",
      breakout: "OPENING RANGE",
      volume: rvol >= 3 ? "EXTREME" : "2X+",
      rvol: Number(rvol.toFixed(2)),
      price: entry,
      entry,
      sl,
      slPct: Number(((risk / entry) * 100).toFixed(2)),
      target2R: target,
      score,
      side,
      candleTime: current[0],
      openingHigh: opening[2],
      openingLow: opening[3],
    };
  });

  const signals = rows.filter(Boolean).sort((a: any, b: any) => b.score - a.score);
  const buys = signals.filter((x: any) => x.side === "BUY").length;
  const sells = signals.filter((x: any) => x.side === "SELL").length;
  const extreme = signals.filter((x: any) => x.volume === "EXTREME").length;
  const avgScore = signals.length ? Math.round(signals.reduce((s: number, x: any) => s + x.score, 0) / signals.length) : 0;

  return NextResponse.json({
    connected: true,
    marketOpen: true,
    signalWindow,
    marketTime,
    scanned: instruments.length,
    signals,
    stats: { buy: buys, sell: sells, extreme, avgScore, setups: signals.length },
    rule: "New BUY/SELL signals are allowed only from 09:20 through 09:59 IST and require an opening-range break with >=2x recent 5-minute volume.",
  });
}
