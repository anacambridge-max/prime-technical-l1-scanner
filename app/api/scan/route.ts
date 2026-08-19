import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Candle=[string,number,number,number,number,number,number?];
type Instrument={instrument_key:string;trading_symbol:string;segment:string;instrument_type:string};
type Levels={pdh:number;pdl:number;weeklyHigh:number;weeklyLow:number;monthlyHigh:number;monthlyLow:number;high52w:number;low52w:number;ath:number;atl:number};
type Row={symbol:string;setup:string;breakout:string;volume:string;rvol:number;price:number;entry:number;sl:number;slPct:number;target2R:number;score:number;side:"BUY"|"SELL";candleTime:string;level?:number;levelName?:string};

let cachedInstruments:Instrument[]|null=null;
let cachePromise:Promise<Instrument[]>|null=null;
const levelCache=new Map<string,{day:string;value:Levels}>();

function nowIST(){return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}))}
function dateStr(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function market(){const d=nowIST(),m=d.getHours()*60+d.getMinutes();return{d,open:m>=555&&m<930,signal:m>=555&&m<=595}}
async function api(token:string,url:string){const r=await fetch(url,{headers:{Accept:"application/json",Authorization:`Bearer ${token}`},cache:"no-store"});if(!r.ok)return null;return r.json()}

async function resolveFNO(token:string){
  if(cachedInstruments)return cachedInstruments;if(cachePromise)return cachePromise;
  cachePromise=(async()=>{
    const all:any[]=[];
    for(let page=1;;page++){
      const u=new URL("https://api.upstox.com/v2/instruments/search");
      u.searchParams.set("query","FUT");u.searchParams.set("exchanges","NSE");u.searchParams.set("segments","FO");
      u.searchParams.set("instrument_types","FUT");u.searchParams.set("expiry","current_month");u.searchParams.set("page_number",String(page));u.searchParams.set("records","30");
      const j=await api(token,u.toString());if(!j)break;all.push(...(j.data||[]));
      const p=j.meta_data?.page;if(!p||page>=Number(p.total_pages||page))break;
    }
    const seen=new Set<string>();
    cachedInstruments=all.filter(x=>x?.underlying_type==="EQUITY"&&x?.underlying_key&&x?.underlying_symbol).map(x=>({instrument_key:x.underlying_key,trading_symbol:x.underlying_symbol,segment:"NSE_EQ",instrument_type:"EQ"})).filter(x=>{if(seen.has(x.instrument_key))return false;seen.add(x.instrument_key);return true});
    cachePromise=null;return cachedInstruments;
  })().catch(e=>{cachePromise=null;throw e});return cachePromise;
}

async function candles(token:string,key:string){const j=await api(token,`https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(key)}/minutes/5`);return Array.isArray(j?.data?.candles)?j.data.candles as Candle[]:[]}
async function historical(token:string,key:string,unit:"days"|"months",to:string,from:string){const j=await api(token,`https://api.upstox.com/v3/historical-candle/${encodeURIComponent(key)}/${unit}/1/${to}/${from}`);return Array.isArray(j?.data?.candles)?j.data.candles as Candle[]:[]}
function weekKey(d:Date){const x=new Date(d);x.setHours(0,0,0,0);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return dateStr(x)}
async function levels(token:string,key:string,today:Date){const day=dateStr(today),hit=levelCache.get(key);if(hit?.day===day)return hit.value;const to=new Date(today);to.setDate(to.getDate()-1);const from=new Date(to);from.setFullYear(from.getFullYear()-1);const mf=new Date(to);mf.setFullYear(2000,0,1);const [ds,ms]=await Promise.all([historical(token,key,"days",dateStr(to),dateStr(from)),historical(token,key,"months",dateStr(to),dateStr(mf))]);if(!ds.length)return null;const d=[...ds].sort((a,b)=>new Date(a[0]).getTime()-new Date(b[0]).getTime()),pd=d[d.length-1];const pw=new Date(to);pw.setDate(pw.getDate()-((pw.getDay()+6)%7)-7);const wh=d.filter(c=>weekKey(new Date(c[0]))===weekKey(pw));const pm=new Date(to.getFullYear(),to.getMonth()-1,1);const mh=d.filter(c=>{const x=new Date(c[0]);return x.getFullYear()===pm.getFullYear()&&x.getMonth()===pm.getMonth()});const last52=d.slice(-260);const v:Levels={pdh:+pd[2],pdl:+pd[3],weeklyHigh:Math.max(...(wh.length?wh:[pd]).map(c=>+c[2])),weeklyLow:Math.min(...(wh.length?wh:[pd]).map(c=>+c[3])),monthlyHigh:Math.max(...(mh.length?mh:[pd]).map(c=>+c[2])),monthlyLow:Math.min(...(mh.length?mh:[pd]).map(c=>+c[3])),high52w:Math.max(...last52.map(c=>+c[2])),low52w:Math.min(...last52.map(c=>+c[3])),ath:ms.length?Math.max(...ms.map(c=>+c[2])):Math.max(...d.map(c=>+c[2])),atl:ms.length?Math.min(...ms.map(c=>+c[3])):Math.min(...d.map(c=>+c[3]))};levelCache.set(key,{day,value:v});return v}
function cross(c:Candle,l:Levels){for(const [n,v] of [["PDH",l.pdh],["WEEKLY HIGH",l.weeklyHigh],["MONTHLY HIGH",l.monthlyHigh],["52W HIGH",l.high52w],["ATH",l.ath]] as [string,number][])if(+c[2]>=v)return{side:"BUY" as const,name:n,level:v};for(const [n,v] of [["PDL",l.pdl],["WEEKLY LOW",l.weeklyLow],["MONTHLY LOW",l.monthlyLow],["52W LOW",l.low52w],["ATL",l.atl]] as [string,number][])if(+c[3]<=v)return{side:"SELL" as const,name:n,level:v};return null}
function score(r:number,n:string,master:boolean,opening:boolean){let s=n==="ATH"||n==="ATL"?100:n.includes("52W")?80:n.includes("MONTHLY")?60:n.includes("WEEKLY")?40:n.startsWith("PD")?20:0;if(r>=3)s+=10;else if(r>=2.5)s+=5;if(master)s+=3;if(opening)s+=2;return Math.min(100,s)}
function done(cs:Candle[],now:Date){return [...cs].sort((a,b)=>new Date(a[0]).getTime()-new Date(b[0]).getTime()).filter(c=>new Date(c[0]).getTime()+300000<=now.getTime())}

export async function GET(req:NextRequest){
  const token=req.cookies.get("pt_access_token")?.value;if(!token)return NextResponse.json({connected:false,error:"Upstox is not connected."},{status:401});
  const {d,open,signal}=market();const marketTime=d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  if(!open)return NextResponse.json({connected:true,marketOpen:false,signalWindow:false,marketTime,scanned:0,signals:[],breakouts:[],extremeVolume:[],candidates:[],stats:{buy:0,sell:0,extreme:0,avgScore:0,setups:0}});
  const instruments=await resolveFNO(token);
  const rows=await Promise.all(instruments.map(async ins=>{try{
    const cs=done(await candles(token,ins.instrument_key),d);if(!cs.length)return null;const l=await levels(token,ins.instrument_key,d);if(!l)return null;
    const c=cs[cs.length-1],dt=new Date(c[0]),prior=cs.slice(0,-1).slice(-5),avg=prior.length?prior.reduce((s,x)=>s+Number(x[5]||0),0)/prior.length:Number(c[5]||0),r=avg?Number(c[5]||0)/avg:0,ev=r>=2.5,bull=+c[4]>+c[1],bear=+c[4]<+c[1],range=+c[2]-+c[3],avgRange=prior.length?prior.reduce((s,x)=>s+(+x[2]-+x[3]),0)/prior.length:range,master=signal&&range>=avgRange*1.5&&ev,x=cross(c,l);
    const mk=(side:"BUY"|"SELL",setup:string,b:string):Row|null=>{const entry=+c[4],sl=side==="BUY"?+c[3]:+c[2],risk=Math.abs(entry-sl);if(!risk)return null;return{symbol:ins.trading_symbol,setup,breakout:b,volume:r>=3?"EXTREME":"2.5X+",rvol:+r.toFixed(2),price:entry,entry,sl,slPct:+(risk/entry*100).toFixed(2),target2R:side==="BUY"?entry+risk*2:entry-risk*2,score:score(r,b,setup==="MASTER CANDLE",setup==="09:15 OPENING"),side,candleTime:c[0],level:x?.level,levelName:x?.name}};
    const openingBuy=dt.getHours()===9&&dt.getMinutes()===15&&ev&&bull&&!!x&&x.side==="BUY",openingSell=dt.getHours()===9&&dt.getMinutes()===15&&ev&&bear&&!!x&&x.side==="SELL";
    const masterBuy=master&&bull&&!!x&&x.side==="BUY",masterSell=master&&bear&&!!x&&x.side==="SELL";
    const signalRow=(openingBuy||openingSell)?mk(openingBuy?"BUY":"SELL","09:15 OPENING",x!.name):(masterBuy||masterSell)?mk(masterBuy?"BUY":"SELL","MASTER CANDLE",x!.name):null;
    const breakout=x?mk(x.side,master?"MASTER CANDLE":"KEY LEVEL",x.name):null;
    const extreme=ev?mk(bull?"BUY":"SELL",master?"MASTER CANDLE":"EXTREME VOLUME",x?.name||"NONE"):null;
    let candidate:Row|null=null;if(dt.getHours()===9&&dt.getMinutes()===15){const p=+c[4],arr=[["PDH",l.pdh],["WEEKLY HIGH",l.weeklyHigh],["MONTHLY HIGH",l.monthlyHigh],["52W HIGH",l.high52w],["ATH",l.ath],["PDL",l.pdl],["WEEKLY LOW",l.weeklyLow],["MONTHLY LOW",l.monthlyLow],["52W LOW",l.low52w],["ATL",l.atl]] as [string,number][],near=arr.sort((a,b)=>Math.abs(a[1]-p)-Math.abs(b[1]-p))[0];candidate={symbol:ins.trading_symbol,setup:"09:15 CANDIDATE",breakout:near[0],volume:ev?(r>=3?"EXTREME":"2.5X+"):"NORMAL",rvol:+r.toFixed(2),price:p,entry:p,sl:bull?+c[3]:+c[2],slPct:0,target2R:p,score:0,side:bull?"BUY":"SELL",candleTime:c[0],level:near[1],levelName:near[0]}}
    return{signal:signalRow,breakout,extreme,candidate};
  }catch{return null}}));
  const signals=rows.map(x=>x?.signal).filter(Boolean).sort((a,b)=>b!.score-a!.score) as Row[],breakouts=rows.map(x=>x?.breakout).filter(Boolean).sort((a,b)=>b!.score-a!.score) as Row[],extremeVolume=rows.map(x=>x?.extreme).filter(Boolean).sort((a,b)=>b!.rvol-a!.rvol) as Row[],candidates=rows.map(x=>x?.candidate).filter(Boolean) as Row[];
  const buy=signals.filter(x=>x.side==="BUY").length,sell=signals.filter(x=>x.side==="SELL").length,avgScore=signals.length?Math.round(signals.reduce((s,x)=>s+x.score,0)/signals.length):0;
  return NextResponse.json({connected:true,marketOpen:true,signalWindow:signal,marketTime,scanned:instruments.length,signals,breakouts,extremeVolume,candidates,stats:{buy,sell,extreme:signals.filter(x=>x.volume==="EXTREME").length,avgScore,setups:signals.length}})
}
