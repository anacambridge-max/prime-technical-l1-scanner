import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Candle = [string, number, number, number, number, number, number?];
type Instrument = { instrument_key: string; trading_symbol: string; segment: string; instrument_type: string };
type Levels = {
  pdh: number; pdl: number;
  weeklyHigh: number; weeklyLow: number;
  monthlyHigh: number; monthlyLow: number;
  high52w: number; low52w: number;
  ath: number; atl: number;
};

type Row = {
  symbol: string; setup: string; breakout: string; volume: string; rvol: number;
  price: number; entry: number; sl: number; slPct: number; target2R: number;
  score: number; side: "BUY" | "SELL"; candleTime: string;
  level?: number; levelName?: string; masterHigh?: number; masterLow?: number;
};

const UNIVERSE = [
  "RELIANCE","HDFCBANK","ICICIBANK","SBIN","INFY","TCS","BHARTIARTL","ITC","KOTAKBANK","LT",
  "AXISBANK","HINDUNILVR","BAJFINANCE","MARUTI","M&M","SUNPHARMA","TITAN","ULTRACEMCO","NTPC","ONGC",
  "POWERGRID","ADANIENT","ADANIPORTS","TATASTEEL","JSWSTEEL","COALINDIA","HINDALCO","GRASIM","EICHERMOT","TECHM",
  "HCLTECH","WIPRO","DRREDDY","CIPLA","APOLLOHOSP","DIVISLAB","TATAMOTORS","BAJAJFINSV","BAJAJ-AUTO","TRENT",
  "BEL","SHRIRAMFIN","INDUSINDBK","NESTLEIND","ASIANPAINT","HEROMOTOCO","ETERNAL","JIOFIN","TATAELXSI","INDIGO"
];

let cachedInstruments: Instrument[] | null = null;
let cachePromise: Promise<Instrument[]> | null = null;
const levelsCache = new Map<string, { at: number; value: Levels }>();
const LEVEL_TTL = 10 * 60 * 1000;

function nowIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}
function istDateString(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function marketWindow() {
  const d = nowIST(); const minutes = d.getHours() * 60 + d.getMinutes();
  return { d, minutes, open: minutes >= 555 && minutes < 930, signalWindow: minutes >= 555 && minutes < 600 };
}
async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(worker)));
  return out;
}
async function resolveInstruments(token: string): Promise<Instrument[]> {
  if (cachedInstruments) return cachedInstruments;
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    const results = await inBatches(UNIVERSE, 10, async (symbol) => {
      const url = new URL("https://api.upstox.com/v2/instruments/search");
      url.searchParams.set("query", symbol); url.searchParams.set("exchanges", "NSE"); url.searchParams.set("segments", "EQ"); url.searchParams.set("instrument_types", "EQ"); url.searchParams.set("records", "10");
      const r = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      return (j?.data ?? []).find((x: Instrument) => x.segment === "NSE_EQ" && x.instrument_type === "EQ" && x.trading_symbol === symbol) ?? null;
    });
    cachedInstruments = results.filter(Boolean) as Instrument[]; cachePromise = null; return cachedInstruments;
  })().catch((e) => { cachePromise = null; throw e; });
  return cachePromise;
}
async function intraday(token: string, key: string): Promise<Candle[]> {
  const url = `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(key)}/minutes/5`;
  const r = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) return [];
  const j = await r.json(); return Array.isArray(j?.data?.candles) ? j.data.candles : [];
}
async function historical(token: string, key: string, unit: "days" | "months", to: string, from: string): Promise<Candle[]> {
  const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(key)}/${unit}/1/${to}/${from}`;
  const r = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) return [];
  const j = await r.json(); return Array.isArray(j?.data?.candles) ? j.data.candles : [];
}
function getWeekKey(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day + 3);
  const firstThursday = new Date(x.getFullYear(), 0, 4);
  return `${x.getFullYear()}-${Math.ceil((((x.getTime() - firstThursday.getTime()) / 86400000) + firstThursday.getDay() + 1) / 7)}`;
}
async function getLevels(token: string, instrument: Instrument, today: Date): Promise<Levels | null> {
  const cached = levelsCache.get(instrument.instrument_key); if (cached && Date.now() - cached.at < LEVEL_TTL) return cached.value;
  const to = new Date(today); to.setDate(to.getDate() - 1); const from = new Date(to); from.setFullYear(from.getFullYear() - 1);
  const monthlyFrom = new Date(to); monthlyFrom.setFullYear(2000); monthlyFrom.setMonth(0, 1);
  const [days, months] = await Promise.all([
    historical(token, instrument.instrument_key, "days", istDateString(to), istDateString(from)),
    historical(token, instrument.instrument_key, "months", istDateString(to), istDateString(monthlyFrom)),
  ]);
  if (!days.length) return null;
  const ordered = [...days].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()); const pd = ordered[ordered.length - 1];
  const currentWeekKey = getWeekKey(today); const week = ordered.filter(c => getWeekKey(new Date(c[0])) === currentWeekKey);
  const month = ordered.filter(c => { const x = new Date(c[0]); return x.getMonth() === today.getMonth() && x.getFullYear() === today.getFullYear(); });
  const yearAgo = new Date(today); yearAgo.setDate(yearAgo.getDate() - 365); const y52 = ordered.filter(c => new Date(c[0]).getTime() >= yearAgo.getTime());
  const monthBars = months.length ? months : ordered;
  const value: Levels = {
    pdh: Number(pd[2]), pdl: Number(pd[3]),
    weeklyHigh: Math.max(...(week.length ? week : [pd]).map(c => Number(c[2]))), weeklyLow: Math.min(...(week.length ? week : [pd]).map(c => Number(c[3]))),
    monthlyHigh: Math.max(...(month.length ? month : [pd]).map(c => Number(c[2]))), monthlyLow: Math.min(...(month.length ? month : [pd]).map(c => Number(c[3]))),
    high52w: Math.max(...(y52.length ? y52 : [pd]).map(c => Number(c[2]))), low52w: Math.min(...(y52.length ? y52 : [pd]).map(c => Number(c[3]))),
    ath: Math.max(...monthBars.map(c => Number(c[2]))), atl: Math.min(...monthBars.map(c => Number(c[3]))),
  };
  levelsCache.set(instrument.instrument_key, { at: Date.now(), value }); return value;
}
function completedCandles(cs: Candle[], now: Date) {
  return [...cs].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()).filter(c => new Date(c[0]).getTime() + 5 * 60 * 1000 <= now.getTime());
}
function keyBreakout(c: Candle, levels: Levels) {
  const candidates: Array<[string, number]> = [
    ["PDH", levels.pdh], ["PDL", levels.pdl], ["WEEKLY HIGH", levels.weeklyHigh], ["WEEKLY LOW", levels.weeklyLow],
    ["MONTHLY HIGH", levels.monthlyHigh], ["MONTHLY LOW", levels.monthlyLow], ["52W HIGH", levels.high52w], ["52W LOW", levels.low52w], ["ATH", levels.ath], ["ATL", levels.atl],
  ];
  for (const [name, level] of candidates) {
    if (c[4] > level && c[1] <= level) return { side: "BUY" as const, name, level };
    if (c[4] < level && c[2] >= level) return { side: "SELL" as const, name, level };
  }
  return null;
}
function score(rvol: number, breakout: string, master: boolean, opening: boolean) {
  let s = 40; if (rvol >= 3) s += 30; else if (rvol >= 2) s += 22; else if (rvol >= 1.5) s += 10;
  if (breakout === "ATH" || breakout === "ATL") s += 15; else if (breakout.includes("52W")) s += 12; else if (breakout.includes("WEEKLY") || breakout.includes("MONTHLY")) s += 8; else if (breakout === "PDH" || breakout === "PDL") s += 6;
  if (master) s += 8; if (opening) s += 7; return Math.min(100, s);
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pt_access_token")?.value;
  if (!token) return NextResponse.json({ connected: false, error: "Upstox is not connected." }, { status: 401 });
  const { d, open, signalWindow } = marketWindow();
  const marketTime = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  if (!open) return NextResponse.json({ connected: true, marketOpen: false, signalWindow: false, marketTime, scanned: 0, signals: [], breakouts: [], extremeVolume: [], candidates: [], stats: { buy: 0, sell: 0, extreme: 0, avgScore: 0, setups: 0 } });

  const instruments = await resolveInstruments(token);
  const rows = await inBatches(instruments, 8, async (instrument): Promise<{ signal: Row | null; breakout: Row | null; extreme: Row | null; candidate: Row | null }> => {
    const closed = completedCandles(await intraday(token, instrument.instrument_key), d);
    if (closed.length < 2) return { signal: null, breakout: null, extreme: null, candidate: null };
    const levels = await getLevels(token, instrument, d); if (!levels) return { signal: null, breakout: null, extreme: null, candidate: null };
    const opening = closed.find(c => { const dt = new Date(c[0]); return dt.getHours() === 9 && dt.getMinutes() === 15; });
    const current = closed[closed.length - 1]; const prior = closed.slice(0, -1).slice(-5);
    const avgVol = prior.length ? prior.reduce((s, c) => s + Number(c[5] || 0), 0) / prior.length : Number(current[5] || 0);
    const rvol = avgVol > 0 ? Number(current[5] || 0) / avgVol : 0;
    const currentRange = Math.max(0, Number(current[2]) - Number(current[3])); const priorAvgRange = prior.length ? prior.reduce((s, c) => s + (Number(c[2]) - Number(c[3])), 0) / prior.length : currentRange;
    const master = currentRange >= priorAvgRange * 1.5; const openingBreak = !!opening && (current[4] > opening[2] || current[4] < opening[3]);
    const kb = keyBreakout(current, levels); const extreme = rvol >= 2; const candleSide = current[4] >= current[1] ? "BUY" as const : "SELL" as const;

    let breakout: Row | null = null;
    if (kb) {
      const entry = Number(current[4]); const sl = kb.side === "BUY" ? Number(current[3]) : Number(current[2]); const risk = Math.abs(entry - sl);
      if (risk > 0) breakout = { symbol: instrument.trading_symbol, setup: master ? "MASTER CANDLE" : "KEY LEVEL", breakout: kb.name, volume: rvol >= 3 ? "EXTREME" : "2X+", rvol: Number(rvol.toFixed(2)), price: entry, entry, sl, slPct: Number(((risk / entry) * 100).toFixed(2)), target2R: kb.side === "BUY" ? entry + risk * 2 : entry - risk * 2, score: score(rvol, kb.name, master, openingBreak), side: kb.side, candleTime: current[0], level: kb.level, levelName: kb.name };
    }

    let extremeRow: Row | null = null;
    if (extreme) {
      const entry = Number(current[4]); const sl = candleSide === "BUY" ? Number(current[3]) : Number(current[2]); const risk = Math.abs(entry - sl);
      extremeRow = risk > 0 ? { symbol: instrument.trading_symbol, setup: master ? "MASTER CANDLE" : openingBreak ? "OPENING CANDLE" : "EXTREME VOLUME", breakout: kb?.name ?? "NONE", volume: rvol >= 3 ? "EXTREME" : "2X+", rvol: Number(rvol.toFixed(2)), price: entry, entry, sl, slPct: Number((risk / entry * 100).toFixed(2)), target2R: candleSide === "BUY" ? entry + risk * 2 : entry - risk * 2, score: score(rvol, kb?.name ?? "NONE", master, openingBreak), side: candleSide, candleTime: current[0] } : null;
    }

    let signal: Row | null = null;
    // New BUY/SELL confirmation: only before 10:00, and always requires extreme volume.
    if (signalWindow && extreme && kb) signal = breakout;
    else if (signalWindow && extreme && openingBreak && opening) {
      const entry = Number(current[4]); const bullish = current[4] > opening[2]; const sl = bullish ? Number(opening[3]) : Number(opening[2]); const risk = Math.abs(entry - sl);
      if (risk > 0) signal = { symbol: instrument.trading_symbol, setup: master ? "MASTER CANDLE" : "OPENING CANDLE", breakout: "OPENING RANGE", volume: rvol >= 3 ? "EXTREME" : "2X+", rvol: Number(rvol.toFixed(2)), price: entry, entry, sl, slPct: Number(((risk / entry) * 100).toFixed(2)), target2R: bullish ? entry + risk * 2 : entry - risk * 2, score: score(rvol, "OPENING RANGE", master, true), side: bullish ? "BUY" : "SELL", candleTime: current[0] };
    }

    const candidate = opening ? (() => {
      const near = [["PDH", levels.pdh], ["PDL", levels.pdl], ["WEEKLY HIGH", levels.weeklyHigh], ["WEEKLY LOW", levels.weeklyLow], ["MONTHLY HIGH", levels.monthlyHigh], ["MONTHLY LOW", levels.monthlyLow], ["52W HIGH", levels.high52w], ["52W LOW", levels.low52w], ["ATH", levels.ath], ["ATL", levels.atl]].find(([, v]) => Math.abs(Number(opening[4]) - Number(v)) / (Number(v) || 1) <= 0.005);
      return near ? { symbol: instrument.trading_symbol, setup: "OPENING CANDIDATE", breakout: String(near[0]), volume: "WATCH", rvol: 0, price: Number(opening[4]), entry: Number(opening[4]), sl: Number(opening[3]), slPct: Number((Math.abs(Number(opening[4]) - Number(opening[3])) / Number(opening[4]) * 100).toFixed(2)), target2R: Number(opening[4]) + Math.abs(Number(opening[4]) - Number(opening[3])) * 2, score: 55, side: Number(opening[4]) >= Number(opening[1]) ? "BUY" : "SELL", candleTime: opening[0] } as Row : null;
    })() : null;
    return { signal, breakout, extreme: extremeRow, candidate };
  });

  const signals = rows.map(x => x.signal).filter(Boolean) as Row[]; const breakouts = rows.map(x => x.breakout).filter(Boolean) as Row[]; const extremeVolume = rows.map(x => x.extreme).filter(Boolean) as Row[]; const candidates = rows.map(x => x.candidate).filter(Boolean) as Row[];
  signals.sort((a, b) => b.score - a.score); breakouts.sort((a, b) => b.score - a.score); extremeVolume.sort((a, b) => b.rvol - a.rvol); candidates.sort((a, b) => b.score - a.score);
  const buys = signals.filter(x => x.side === "BUY").length, sells = signals.filter(x => x.side === "SELL").length; const avgScore = signals.length ? Math.round(signals.reduce((s, x) => s + x.score, 0) / signals.length) : 0;
  return NextResponse.json({ connected: true, marketOpen: true, signalWindow, marketTime, scanned: instruments.length, signals, breakouts, extremeVolume, candidates, stats: { buy: buys, sell: sells, extreme: extremeVolume.length, avgScore, setups: signals.length }, rule: "BUY/SELL confirmation: 5M candle + Extreme Volume (>=2x prior 5 closed candles) + breakout of PDH/PDL, Weekly H/L, Monthly H/L, 52W H/L or ATH/ATL. Master/Opening signals are only generated before 10:00 IST. Breakout candidates remain visible after 10:00." });
}
