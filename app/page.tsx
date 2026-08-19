"use client";

import { useCallback, useEffect, useState } from "react";

type Signal = {
  symbol: string; setup: string; breakout: string; volume: string; rvol: number; price: number; entry: number; sl: number; slPct: number; target2R: number; score: number; side: "BUY" | "SELL"; candleTime: string; level?: number;
};
type ScanResponse = {
  connected: boolean; marketOpen?: boolean; signalWindow?: boolean; marketTime?: string; scanned?: number; signals?: Signal[]; breakouts?: Signal[]; extremeVolume?: Signal[]; candidates?: Signal[];
  stats?: { buy: number; sell: number; extreme: number; avgScore: number; setups: number }; error?: string; rule?: string;
};
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function Home() {
  const [data, setData] = useState<ScanResponse>({ connected: false });
  const [loading, setLoading] = useState(false); const [lastUpdate, setLastUpdate] = useState("—");
  const [tab, setTab] = useState<"LIVE" | "CANDIDATES" | "BREAKOUTS" | "EXTREME">("LIVE");
  const scan = useCallback(async () => {
    try { setLoading(true); const r = await fetch("/api/scan", { cache: "no-store" }); const j = await r.json(); setData(j); setLastUpdate(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })); }
    catch { setData(old => ({ ...old, error: "Unable to reach scanner API." })); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { scan(); const id = window.setInterval(scan, 15000); return () => window.clearInterval(id); }, [scan]);

  const stats = data.stats ?? { buy: 0, sell: 0, extreme: 0, avgScore: 0, setups: 0 };
  const signals = tab === "LIVE" ? (data.signals ?? []) : tab === "CANDIDATES" ? (data.candidates ?? []) : tab === "BREAKOUTS" ? (data.breakouts ?? []) : (data.extremeVolume ?? []);
  const tabs = [["LIVE", "LIVE SIGNALS"], ["CANDIDATES", "PREVIOUS-DAY CANDIDATES"], ["BREAKOUTS", "BREAKOUTS"], ["EXTREME", "EXTREME VOLUME"]] as const;

  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="logo">🔥</div><div>PRIME TECHNICAL <span style={{color:"#718098",fontSize:11}}>L-1 SCANNER</span></div></div><div className="status"><span className="dot" /> {data.connected ? "UPSTOX CONNECTED" : "READY TO CONNECT"}{data.marketTime ? ` · ${data.marketTime}` : ""}</div></header>
    <section className="hero"><div><div className="eyebrow">L-1 BREAKOUT ENGINE · 5 MIN · {data.scanned ?? 0} STOCKS</div><h1>Find the <span style={{color:"#4ca0ff"}}>Prime</span> setup.</h1><p>09:15 Opening Candle · Master Candle · Extreme Volume · Key-Level Breakout</p>{data.rule && <p style={{marginTop:8,fontSize:12,color:"#63738b"}}>{data.rule}</p>}</div><div className="actions">{!data.connected && <button className="btn primary" onClick={() => { window.location.href="/api/upstox/login"; }}>Connect Upstox</button>}<button className="btn" onClick={scan}>{loading ? "Scanning…" : "Scan Now"}</button></div></section>
    <section className="grid">
      <div className="cards"><div className="card"><div className="label">A+ Setups</div><div className="value">{stats.setups}</div></div><div className="card"><div className="label">Buy Signals</div><div className="value">{stats.buy}</div></div><div className="card"><div className="label">Sell Signals</div><div className="value">{stats.sell}</div></div><div className="card"><div className="label">Extreme Volume</div><div className="value">{stats.extreme}</div></div><div className="card"><div className="label">Avg Score</div><div className="value">{stats.avgScore || "—"}</div></div></div>
      <div className="tabs">{tabs.map(([id,label]) => <button key={id} className={`tab ${tab===id?"active":""}`} onClick={() => setTab(id)}>{label}</button>)}</div>
      <div className="panel"><div className="panelhead"><div><div className="paneltitle">{tab === "LIVE" ? "Live Prime Technical Setups" : tab === "CANDIDATES" ? "Prime Opening Candidates" : tab === "BREAKOUTS" ? "Confirmed Key-Level Breakouts" : "Extreme Volume Watch"}</div><div style={{color:"#66758c",fontSize:12,marginTop:5}}>{data.connected ? `Upstox live data · auto refresh 15s · last scan ${lastUpdate}` : "Connect Upstox to start the scanner."}</div></div><span className="pill extreme">5M ENGINE</span></div>
        <div className="tablewrap"><table className="table"><thead><tr><th>Symbol</th><th>Setup</th><th>Breakout</th><th>Volume</th><th>Price</th><th>Entry</th><th>SL</th><th>SL %</th><th>2R Target</th><th>Score</th></tr></thead><tbody>{signals.length===0 ? <tr><td colSpan={10}><div className="empty">{data.connected ? (tab==="LIVE" && !data.signalWindow ? "New BUY/SELL signals are only generated from 09:15–09:59 IST. Use BREAKOUTS or EXTREME VOLUME after 10:00." : "No qualifying setup right now.") : "No live signals yet. Connect Upstox to start the scanner."}</div></td></tr> : signals.map((s,i)=><tr key={`${s.symbol}-${s.side}-${s.candleTime}-${i}`}><td><strong>{s.symbol}</strong> <span className={`pill ${s.side === "BUY" ? "buy" : "sell"}`}>{s.side}</span></td><td>{s.setup}</td><td>{s.breakout}</td><td><span className="pill extreme">{s.volume}{s.rvol ? ` · ${s.rvol}x` : ""}</span></td><td>{money(s.price)}</td><td>{money(s.entry)}</td><td>{money(s.sl)}</td><td>{s.slPct}%</td><td>{money(s.target2R)}</td><td><strong>{s.score}</strong></td></tr>)}</tbody></table></div>
      </div>
      {data.error && <div style={{marginTop:12,color:"#ff7183",fontSize:12}}>{data.error}</div>}
    </section>
  </main>;
}
