"use client";

import { useState } from "react";

export default function Home() {
  const [connected, setConnected] = useState(false);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="logo">🔥</div><div>PRIME TECHNICAL <span style={{color:"#718098",fontSize:11}}>L-1 SCANNER</span></div></div>
        <div className="status"><span className="dot" /> {connected ? "UPSTOX CONNECTED" : "READY TO CONNECT"}</div>
      </header>
      <section className="hero">
        <div><div className="eyebrow">L-1 BREAKOUT ENGINE · 5 MIN</div><h1>Find the <span style={{color:"#4ca0ff"}}>Prime</span> setup.</h1><p>09:15 Opening Candle · Master Candle · Extreme Volume · Key-Level Breakout</p></div>
        <div className="actions">
          <button className="btn primary" onClick={() => { window.location.href = "/api/upstox/login"; }}>Connect Upstox</button>
          <button className="btn" onClick={() => setConnected(true)}>Scan Now</button>
        </div>
      </section>
      <section className="grid">
        <div className="cards">
          <div className="card"><div className="label">A+ Setups</div><div className="value">—</div></div>
          <div className="card"><div className="label">Buy Signals</div><div className="value">—</div></div>
          <div className="card"><div className="label">Sell Signals</div><div className="value">—</div></div>
          <div className="card"><div className="label">Extreme Volume</div><div className="value">—</div></div>
          <div className="card"><div className="label">Avg Score</div><div className="value">—</div></div>
        </div>
        <div className="tabs"><div className="tab active">LIVE SIGNALS</div><div className="tab">PREVIOUS-DAY CANDIDATES</div><div className="tab">BREAKOUTS</div><div className="tab">EXTREME VOLUME</div></div>
        <div className="panel">
          <div className="panelhead"><div><div className="paneltitle">Live Prime Technical Setups</div><div style={{color:"#66758c",fontSize:12,marginTop:5}}>Signals will appear after live Upstox market data is connected.</div></div><span className="pill extreme">5M ENGINE</span></div>
          <div className="tablewrap"><table className="table"><thead><tr><th>Symbol</th><th>Setup</th><th>Breakout</th><th>Volume</th><th>Price</th><th>Entry</th><th>SL</th><th>SL %</th><th>2R Target</th><th>Score</th></tr></thead><tbody><tr><td colSpan={10}><div className="empty">No live signals yet. Connect Upstox to start the scanner.</div></td></tr></tbody></table></div>
        </div>
      </section>
    </main>
  );
}
