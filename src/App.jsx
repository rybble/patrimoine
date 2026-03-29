import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, LineChart, Line, BarChart, Bar, Legend, ReferenceLine } from "recharts";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// ─── FIREBASE ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAznyIUYKfWPMBDIfMpNKDf4gvYBlwH0J0",
  authDomain:        "patrimoine-f2e19.firebaseapp.com",
  projectId:         "patrimoine-f2e19",
  storageBucket:     "patrimoine-f2e19.firebasestorage.app",
  messagingSenderId: "692110467597",
  appId:             "1:692110467597:web:7c6aada75fede7427beb44",
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);
const auth  = getAuth(fbApp);

async function fbGet(uid, key) {
  try {
    const snap = await getDoc(doc(db, "patrimoine", uid, "data", key));
    return snap.exists() ? snap.data().value : null;
  } catch (e) { console.warn("fbGet error", key, e); return null; }
}
async function fbSet(uid, key, value) {
  try {
    await setDoc(doc(db, "patrimoine", uid, "data", key), { value, updatedAt: Date.now() });
  } catch (e) { console.warn("fbSet error", key, e); }
}
function makeDebounced(fn, delay = 1500) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}


// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CG_KEY = "CG-awA3tjVWYZgAyyAngdNth8Ek";
const FINNHUB_KEY = "d6m3vjpr01qi0ajkqmp0d6m3vjpr01qi0ajkqmpg";
const ORA_REF_PRICE = 13.50;

// Mapping code → CoinGecko ID
const CG_IDS = {
  ETH:  "ethereum",
  BTC:  "bitcoin",
  BNB:  "binancecoin",
  SOL:  "solana",
  TON:  "the-open-network",
  HNT:  "helium",
  USDC: "usd-coin",
  FLUX: "flux",
  ADA:  "cardano",
  KAS:  "kaspa",
  ETHW: "ethereum-pow-iou",
  ERG:  "ergo",
  ETC:  "ethereum-classic",
  POL:  "matic-network",
  RXD:  "radiant",
  MLC:  "my-lovely-coin",
};

// Helper: fetch CoinGecko with API key header
const cgFetch = (url) => fetch(url, { headers: { "x-cg-demo-api-key": CG_KEY } });

// ─── HISTORY (localStorage) ───────────────────────────────────────────────────
const HISTORY_KEY = "patrimoine_history_v1";
const MAX_HISTORY = 365; // 1 an de données

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY))); } catch {}
}

function pushHistoryPoint(totals) {
  const history = loadHistory();
  const today = new Date().toISOString().slice(0, 10);
  const last = history[history.length - 1];
  // On ne pousse qu'une fois par jour
  if (last?.date === today) {
    history[history.length - 1] = { date: today, ...totals };
  } else {
    history.push({ date: today, ...totals });
  }
  saveHistory(history);
  return history;
}

// ─── MINI AREA CHART ──────────────────────────────────────────────────────────
const PERIODS = [
  { key:"24h",  label:"24h",   days:1   },
  { key:"7d",   label:"7j",    days:7   },
  { key:"30d",  label:"30j",   days:30  },
  { key:"12m",  label:"12m",   days:365 },
  { key:"all",  label:"Tout",  days:null },
];

function filterByPeriod(data, periodKey) {
  if (!data || !data.length) return data;
  const p = PERIODS.find(x => x.key === periodKey);
  if (!p || p.days === null) return data;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - p.days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = data.filter(d => d.date >= cutoffStr);
  return filtered.length >= 2 ? filtered : data.slice(-2);
}

function PeriodSelector({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:4, marginBottom:8 }}>
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)}
          style={{ background: value===p.key ? "rgba(129,140,248,0.2)" : "transparent",
            border: `1px solid ${value===p.key ? "#818CF8" : "rgba(255,255,255,0.08)"}`,
            borderRadius:6, color: value===p.key ? "#818CF8" : "#64748B",
            padding:"3px 9px", fontSize:11, cursor:"pointer", fontWeight: value===p.key ? 700 : 400 }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

// Formate un label de date/heure selon la période
function formatXLabel(dateStr, period) {
  if (!dateStr) return "";
  const isDateTime = dateStr.length > 10;
  if (isDateTime) {
    const d = new Date(dateStr);
    if (period === "24h") return d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
    if (period === "7d")  return d.toLocaleDateString("fr-FR", { weekday:"short", day:"numeric" }) + " " + d.getHours() + "h";
    return d.toLocaleDateString("fr-FR", { month:"2-digit", day:"2-digit" });
  }
  return dateStr.slice(5);
}

function getXTickInterval(data, period) {
  if (!data?.length) return "preserveStartEnd";
  if (period === "24h") return 0; // 1 tick par point = 1 tick/heure (~24 points)
  if (period === "7d")  {
    // données horaires sur 7j = ~168 points, on veut 1 tick toutes les 4h = ~42 ticks
    return Math.max(0, Math.floor(data.length / 42) - 1);
  }
  return "preserveStartEnd";
}

function MiniAreaChart({ data, dataKey, color, height = 60, showPeriodSelector = false, onPeriodChange, intradayData }) {
  const [period, setPeriod] = useState("all");

  // Pour 24h/7d : utiliser les données intraday dédiées (série complète, pas de filtre)
  const useIntraday = (period === "24h" || period === "7d") && intradayData;
  const activeData  = useIntraday ? (intradayData[period] || null) : data;

  // Pour les autres périodes : filtrer les données daily
  const filtered = useIntraday
    ? activeData  // données intraday = déjà la bonne fenêtre temporelle
    : (showPeriodSelector ? filterByPeriod(data, period) : data);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (onPeriodChange) onPeriodChange(p);
  };

  if (!filtered || filtered.length < 2) return (
    <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center", color:"#334155", fontSize:12 }}>
      {useIntraday && !activeData ? "⏳ Chargement données intraday…" : "Pas encore assez de données historiques"}
    </div>
  );

  const vals = filtered.map(d => d[dataKey]).filter(v => v != null && !isNaN(v));
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range  = maxVal - minVal || 1;
  const pad    = range * 0.12;
  const yMin   = minVal - pad;
  const yMax   = maxVal + pad;
  const isUp   = vals[vals.length-1] >= vals[0];
  const lineColor = isUp ? "#00C8A0" : "#FF5B7F";
  const gradColor = isUp ? "#00C8A0" : "#FF5B7F";

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background:"#0F1929", border:"1px solid #1E3050", borderRadius:8,
        padding:"8px 14px", fontSize:12, color:"#E2E8F0", boxShadow:"0 4px 20px rgba(0,0,0,0.5)" }}>
        <div style={{ color:"#64748B", marginBottom:3 }}>{formatXLabel(label, period)}</div>
        <div style={{ color:lineColor, fontWeight:700, fontSize:14 }}>{fmt(payload[0].value)}</div>
      </div>
    );
  };

  const tickFmt = v => {
    if (v >= 1000000) return `${(v/1000000).toFixed(2)}M`;
    if (v >= 1000) return `${(v/1000).toFixed(2)}k`;
    return v.toFixed(2);
  };

  const xInterval = getXTickInterval(filtered, period);

  return (
    <div style={{ background:"transparent" }}>
      {showPeriodSelector && (
        <div style={{ display:"flex", gap:3, marginBottom:10 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => handlePeriodChange(p.key)} style={{
              background: period===p.key ? "rgba(0,200,160,0.15)" : "transparent",
              border: `1px solid ${period===p.key ? "rgba(0,200,160,0.5)" : "rgba(255,255,255,0.07)"}`,
              borderRadius:5, color: period===p.key ? "#00C8A0" : "#475569",
              padding:"3px 10px", fontSize:11, cursor:"pointer", fontWeight: period===p.key ? 700 : 400,
              transition:"all 0.15s"
            }}>{p.label}</button>
          ))}
          {vals.length >= 2 && (() => {
            const pct = ((vals[vals.length-1] - vals[0]) / (vals[0]||1)) * 100;
            return (
              <span style={{ marginLeft:"auto", fontSize:12, fontWeight:700,
                color: pct >= 0 ? "#00C8A0" : "#FF5B7F",
                background: pct >= 0 ? "rgba(0,200,160,0.1)" : "rgba(255,91,127,0.1)",
                border:`1px solid ${pct>=0?"rgba(0,200,160,0.3)":"rgba(255,91,127,0.3)"}`,
                borderRadius:5, padding:"2px 8px" }}>
                {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
              </span>
            );
          })()}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={filtered} margin={{ top:8, right:60, bottom:4, left:0 }}>
          <defs>
            <linearGradient id={`lcw_${dataKey}_${period}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={gradColor} stopOpacity={0.20} />
              <stop offset="100%" stopColor={gradColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" horizontal={true} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize:10, fill:"#475569" }} tickLine={false} axisLine={false}
            tickFormatter={d => formatXLabel(d, period)}
            interval={xInterval} />
          <YAxis
            orientation="right"
            domain={[yMin, yMax]}
            tick={{ fontSize:10, fill:"#475569" }} tickLine={false} axisLine={false}
            tickFormatter={tickFmt} width={52} tickCount={5} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke:"rgba(255,255,255,0.15)", strokeWidth:1, strokeDasharray:"4 4" }} />
          <Area
            type="monotone" dataKey={dataKey}
            stroke={lineColor} strokeWidth={2}
            fill={`url(#lcw_${dataKey}_${period})`}
            dot={false}
            activeDot={{ r:5, fill:lineColor, stroke:"#0B1120", strokeWidth:2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────

// ─── VARIATION BADGE ─────────────────────────────────────────────────────────
function Variation({ history, dataKey, color }) {
  if (!history || history.length < 2) return null;
  const first = history[0][dataKey] || 0;
  const last = history[history.length - 1][dataKey] || 0;
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;
  const abs = last - first;
  const up = abs >= 0;
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13, color: up ? "#34D399" : "#F87171", fontWeight: 700 }}>
        {up ? "↑" : "↓"} {up ? "+" : ""}{fmt(abs)} ({up ? "+" : ""}{pct.toFixed(1)}%)
      </span>
      <span style={{ fontSize: 11, color: "#64748B" }}>depuis {history[0].date}</span>
    </div>
  );
}


const INITIAL_CRYPTO = [
  { code: "ETH",  symbol: "ETH",  qty: 1.0258,      color: "#627EEA" },
  { code: "BTC",  symbol: "BTC",  qty: 0.014986033, color: "#F7931A" },
  { code: "BNB",  symbol: "BNB",  qty: 0.521,       color: "#F3BA2F" },
  { code: "SOL",  symbol: "SOL",  qty: 5.065,       color: "#9945FF" },
  { code: "TON",  symbol: "TON",  qty: 123.97,      color: "#0088CC" },
  { code: "HNT",  symbol: "HNT",  qty: 108.05,      color: "#474DFF" },
  { code: "USDC", symbol: "USDC", qty: 1626,        color: "#2775CA" },
  { code: "FLUX", symbol: "FLUX", qty: 54.48546,    color: "#2B61D1" },
  { code: "ADA",  symbol: "ADA",  qty: 10,          color: "#3CC8C8" },
  { code: "KAS",  symbol: "KAS",  qty: 3002,        color: "#49EACB" },
  { code: "ETHW", symbol: "ETHW", qty: 1.0143,      color: "#8A92B2" },
  { code: "ERG",  symbol: "ERG",  qty: 95.76,       color: "#FF5722" },
  { code: "ETC",  symbol: "ETC",  qty: 0.2403,      color: "#3AB83A" },
  { code: "POL",  symbol: "POL",  qty: 11.2,        color: "#8247E5" },
  { code: "RXD",  symbol: "RXD",  qty: 34159,       color: "#E84142" },
  { code: "MLC",  symbol: "MLC",  qty: 335.66,      color: "#F59E0B" },
];

const INITIAL_STOCKS = [
  { symbol: "BYD",    name: "BYD Co. Ltd.",             qty: 0.463606,  price: 10.18,  isin: "CNE100000296" },
  { symbol: "CSPX",   name: "iShares Core S&P 500 ETF", qty: 0.204307,  price: 630.40, isin: "IE00B5BMR087" },
  { symbol: "APOLLO", name: "Apollo Priv. Mkt-Aligned",  qty: 0.245187,  price: 101.53, isin: "LU3170240538" },
  { symbol: "EQTF",   name: "EQT Nexus ELTIF",           qty: 0.474686,  price: 105.62, isin: "LU3176111881" },
  { symbol: "AAPL",   name: "Apple Inc.",                qty: 0.0466,    price: 223.25, isin: "US0378331005" },
  { symbol: "TSLA",   name: "Tesla Inc.",                qty: 0.012771,  price: 348.20, isin: "US88160R1014" },
];

const INITIAL_SAVINGS = {
  peg: [
    { id: "ora-garanti",     name: "Orange Actions Garanti 2021",    type: "ora_linked", qty: 154.4579,  manualVl: 13.39 },
    { id: "ora-classique-c", name: "Orange Actions Classique (C)",   type: "ora_linked", qty: 1811.4961, manualVl: 14.18 },
    { id: "ora-classique-d", name: "Orange Actions Classique (D)",   type: "ora_linked", qty: 43.344,    manualVl: 14.19 },
    { id: "cap-orange",      name: "Cap'Orange Classique (C)",       type: "ora_linked", qty: 369.4568,  manualVl: 14.23 },
  ],
  percol: [
    { id: "oblig-pilote",   name: "Obligations Euro Monde",           sub: "Gestion pilotée",        type: "manual", qty: 27.2616,  manualVl: 184.12 },
    { id: "actions-pilote", name: "Actions Euro Monde",               sub: "Gestion pilotée",        type: "manual", qty: 18.9285,  manualVl: 268.12 },
    { id: "oblig-libre",    name: "Obligations Euro Monde",           sub: "Gestion libre",          type: "manual", qty: 2.0046,   manualVl: 184.12 },
    { id: "actions-libre",  name: "Actions Euro Monde",               sub: "Gestion libre",          type: "manual", qty: 6.2945,   manualVl: 268.12 },
    { id: "mh-epargne",     name: "MH Épargne Actions Retraite Sol.", sub: "Gestion libre · Part A", type: "manual", qty: 24.2722,  manualVl: 16.608 },
  ],
};

const BANK_RATES = {
  1: 0,    // Compte Courant
  2: 1.5,  // Livret A (taux depuis 01/02/2026)
  3: 1.5,  // LDDS (taux depuis 01/02/2026)
};

const INITIAL_BANK = [
  { id: 1, name: "Compte Courant", type: "current", balance: 0,     icon: "🏦", color: "#4F86F7", interestRate: 0 },
  { id: 2, name: "Livret A",       type: "savings", balance: 22950, icon: "📗", color: "#34D399", interestRate: 1.5 },
  { id: 3, name: "LDDS",           type: "savings", balance: 10500, icon: "📘", color: "#60A5FA", interestRate: 1.5 },
];

const INITIAL_REALESTATE = [
  {
    id: "eucalyptus",
    name: "Appartement Montpellier",
    address: "250 rue des Eucalyptus, 34090 Montpellier",
    purchasePrice: 56000,
    purchaseYear: 2024,
    estimatedPrice: 54000, // 18m² × 3000€/m²
    pricePerM2: 3000,
    surfaceM2: 18,
    monthlyRent: 363,       // loyer HC mensuel
    color: "#F472B6",
  },
];

const INITIAL_SCPI = [
  {
    id: "comete",
    name: "SCPI Comète",
    manager: "Alderan",
    parts: 20,
    pricePerPart: 250,
    priceRetrait: 225,
    tdvm2025: 9.00,
    dividendeAnnuel: 22.49,
    lastPriceUpdate: "2026-03-01",
    color: "#A78BFA",
    strategy: "Immobilier tertiaire international — Europe + Canada",
    labelISR: true,
  },
  {
    id: "transitions-europe",
    name: "SCPI Transitions Europe",
    manager: "Arkéa REIM",
    parts: 25,
    pricePerPart: 202,
    priceRetrait: 181.80,
    tdvm2025: 7.60,
    dividendeAnnuel: 15.35,
    lastPriceUpdate: "2026-03-06",
    color: "#34D399",
    strategy: "Immobilier diversifié paneuropéen — 7 pays",
    labelISR: true,
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n, currency = "EUR") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const fmtPct = (n) => {
  const v = parseFloat(n) || 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
};

const pctColor = (n) => (parseFloat(n) >= 0 ? "#34D399" : "#F87171");

// ─── DESIGN TOKENS (Finary-inspired) ─────────────────────────────────────────
const T = {
  bg:        "#0F1117",
  bgCard:    "#161B27",
  bgCard2:   "#1C2333",
  border:    "rgba(255,255,255,0.07)",
  border2:   "rgba(255,255,255,0.12)",
  text:      "#E8EDF5",
  textMuted: "#6B7A99",
  textDim:   "#3D4B66",
  accent:    "#3DD68C",   // vert Finary signature
  accentDim: "rgba(61,214,140,0.12)",
  accentBorder: "rgba(61,214,140,0.28)",
  blue:      "#5B8DEF",
  blueDim:   "rgba(91,141,239,0.12)",
  red:       "#F56565",
  yellow:    "#F6C90E",
  radius:    "16px",
  radiusLg:  "20px",
  radiusSm:  "10px",
  shadow:    "0 4px 24px rgba(0,0,0,0.35)",
};

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "16px",
      padding: "18px 20px",
      cursor: onClick ? "pointer" : "default",
      transition: onClick ? "border-color 0.15s, background 0.15s" : undefined,
      ...style,
    }}
    onMouseEnter={onClick ? e => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.background = "#1E293B"; } : undefined}
    onMouseLeave={onClick ? e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; } : undefined}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.3px" }}>{children}</h2>
      {sub && <p style={{ margin: "5px 0 0", fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
      border: active ? "1px solid rgba(52,211,153,0.2)" : "1px solid rgba(255,255,255,0.08)",
      color: active ? "#34D399" : "#64748B",
      borderRadius: 24, padding: "6px 16px", fontSize: 12, fontWeight: 600,
      cursor: "pointer", transition: "all 0.15s",
    }}>
      {label}
    </button>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      flex: "1 1 160px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{ background: color + "1A", color, border: `1px solid ${color}33`, borderRadius: "6px", padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  );
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// OBJECTIFS FINANCIERS
// ══════════════════════════════════════════════════════════════════════════════
function ObjectifsFinanciers({ uid }) {
  const [objectifs, setObjectifs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editObj, setEditObj] = useState(null);
  const [form, setForm] = useState({ nom:"", cible:0, actuel:0, categorie:"Épargne", dateLimit:"", couleur:"#818CF8" });

  const CATEGORIES = ["Épargne","Investissement","Immobilier","Voyage","Retraite","Urgence","Autre"];
  const COULEURS = ["#818CF8","#34D399","#F87171","#FBBF24","#60A5FA","#F472B6","#FB923C","#A78BFA"];

  useEffect(() => {
    if (!uid) return;
    fbGet(uid, "objectifs").then(v => { if (Array.isArray(v)) setObjectifs(v); });
  }, [uid]);

  const save = async (list) => {
    setObjectifs(list);
    if (uid) await fbSet(uid, "objectifs", list);
  };

  const handleSubmit = () => {
    if (!form.nom || !form.cible) return;
    const obj = { ...form, id: editObj?.id || Date.now(), cible: parseFloat(form.cible), actuel: parseFloat(form.actuel)||0 };
    const updated = editObj
      ? objectifs.map(o => o.id === editObj.id ? obj : o)
      : [...objectifs, obj];
    save(updated);
    setShowForm(false); setEditObj(null);
    setForm({ nom:"", cible:0, actuel:0, categorie:"Épargne", dateLimit:"", couleur:"#818CF8" });
  };

  const handleEdit = (obj) => {
    setEditObj(obj);
    setForm({ nom:obj.nom, cible:obj.cible, actuel:obj.actuel, categorie:obj.categorie, dateLimit:obj.dateLimit||"", couleur:obj.couleur||"#818CF8" });
    setShowForm(true);
  };

  const handleDelete = (id) => save(objectifs.filter(o => o.id !== id));

  const updateActuel = async (id, val) => {
    const updated = objectifs.map(o => o.id === id ? { ...o, actuel: parseFloat(val)||0 } : o);
    save(updated);
  };

  if (objectifs.length === 0 && !showForm) return (
    <Card style={{ marginBottom:16, padding:"18px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9" }}>🎯 Objectifs financiers</div>
        <button onClick={() => setShowForm(true)} style={{ background:"rgba(129,140,248,0.2)", border:"1px solid rgba(129,140,248,0.4)", borderRadius:8, color:"#818CF8", padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:600 }}>+ Ajouter</button>
      </div>
      <div style={{ color:"#475569", fontSize:13 }}>Aucun objectif défini. Crée ton premier objectif !</div>
    </Card>
  );

  return (
    <Card style={{ marginBottom:16, padding:"18px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9" }}>🎯 Objectifs financiers</div>
        <button onClick={() => { setShowForm(!showForm); setEditObj(null); setForm({ nom:"", cible:0, actuel:0, categorie:"Épargne", dateLimit:"", couleur:"#818CF8" }); }}
          style={{ background:"rgba(129,140,248,0.2)", border:"1px solid rgba(129,140,248,0.4)", borderRadius:8, color:"#818CF8", padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:600 }}>
          {showForm ? "Annuler" : "+ Ajouter"}
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"14px 16px", marginBottom:16, border:"1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Nom de l'objectif</div>
              <input value={form.nom} onChange={e=>setForm(f=>({...f,nom:e.target.value}))}
                placeholder="ex: Apport immobilier"
                style={{ width:"100%", background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"7px 10px", fontSize:13, boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Catégorie</div>
              <select value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}
                style={{ width:"100%", background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"7px 10px", fontSize:13 }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Montant cible (€)</div>
              <input type="number" value={form.cible} onChange={e=>setForm(f=>({...f,cible:e.target.value}))}
                style={{ width:"100%", background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"7px 10px", fontSize:13, boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Montant actuel (€)</div>
              <input type="number" value={form.actuel} onChange={e=>setForm(f=>({...f,actuel:e.target.value}))}
                style={{ width:"100%", background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"7px 10px", fontSize:13, boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Date limite (optionnel)</div>
              <input type="date" value={form.dateLimit} onChange={e=>setForm(f=>({...f,dateLimit:e.target.value}))}
                style={{ width:"100%", background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"7px 10px", fontSize:13, boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Couleur</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {COULEURS.map(c => (
                  <div key={c} onClick={() => setForm(f=>({...f,couleur:c}))}
                    style={{ width:22, height:22, borderRadius:"50%", background:c, cursor:"pointer", border: form.couleur===c ? "3px solid #fff" : "2px solid transparent" }} />
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleSubmit}
            style={{ background:form.couleur, border:"none", borderRadius:8, color:"#0B1120", padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {editObj ? "Mettre à jour" : "Créer l'objectif"}
          </button>
        </div>
      )}

      {/* Liste objectifs */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {objectifs.map(obj => {
          const pct = Math.min(100, obj.cible > 0 ? (obj.actuel / obj.cible) * 100 : 0);
          const reste = Math.max(0, obj.cible - obj.actuel);
          const col = obj.couleur || "#818CF8";
          const done = pct >= 100;

          // Calcul jours restants
          let joursLabel = "";
          if (obj.dateLimit) {
            const jours = Math.ceil((new Date(obj.dateLimit) - new Date()) / 86400000);
            joursLabel = jours > 0 ? `${jours}j restants` : "Échéance dépassée";
          }

          return (
            <div key={obj.id} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"14px 16px", border:`1px solid ${col}33` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:col }} />
                    <span style={{ fontSize:14, fontWeight:700, color:"#F1F5F9" }}>{obj.nom}</span>
                    {done && <span style={{ fontSize:11, background:"rgba(52,211,153,0.2)", color:"#34D399", borderRadius:4, padding:"1px 6px" }}>✅ Atteint</span>}
                  </div>
                  <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>
                    {obj.categorie}{joursLabel ? ` · ${joursLabel}` : ""}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => handleEdit(obj)}
                    style={{ background:"rgba(255,255,255,0.06)", border:"none", borderRadius:6, color:"#94A3B8", padding:"4px 8px", fontSize:11, cursor:"pointer" }}>✏️</button>
                  <button onClick={() => handleDelete(obj.id)}
                    style={{ background:"rgba(248,113,113,0.1)", border:"none", borderRadius:6, color:"#F87171", padding:"4px 8px", fontSize:11, cursor:"pointer" }}>✕</button>
                </div>
              </div>

              {/* Barre de progression */}
              <div style={{ marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, color:col, fontWeight:700 }}>{fmt(obj.actuel)}</span>
                  <span style={{ fontSize:12, color:"#64748B" }}>objectif : {fmt(obj.cible)}</span>
                </div>
                <div style={{ height:10, background:"rgba(255,255,255,0.08)", borderRadius:5, overflow:"hidden" }}>
                  <div style={{
                    width:`${pct}%`, height:"100%", borderRadius:5,
                    background: done
                      ? "linear-gradient(90deg, #34D399, #6EE7B7)"
                      : `linear-gradient(90deg, ${col}, ${col}99)`,
                    transition:"width 0.6s ease"
                  }} />
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                  <span style={{ fontSize:11, color:"#64748B" }}>{pct.toFixed(1)}%</span>
                  {!done && <span style={{ fontSize:11, color:"#64748B" }}>reste {fmt(reste)}</span>}
                </div>
              </div>

              {/* Mise à jour rapide du montant actuel */}
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:11, color:"#475569" }}>Mettre à jour :</span>
                <input type="number" defaultValue={obj.actuel}
                  onBlur={e => updateActuel(obj.id, e.target.value)}
                  style={{ width:100, background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"4px 8px", fontSize:12 }} />
                <span style={{ fontSize:11, color:"#475569" }}>€</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ALERTES BUDGET
// ══════════════════════════════════════════════════════════════════════════════
function AlertesBudget({ uid, transactions, curYear, curMonth }) {
  const [alertes, setAlertes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ categorie:"", plafond:0, couleur:"#F87171" });

  useEffect(() => {
    if (!uid) return;
    fbGet(uid, "alertes_budget").then(v => { if (Array.isArray(v)) setAlertes(v); });
  }, [uid]);

  const save = async (list) => {
    setAlertes(list);
    if (uid) await fbSet(uid, "alertes_budget", list);
  };

  const addAlerte = () => {
    if (!form.categorie || !form.plafond) return;
    save([...alertes, { id: Date.now(), ...form, plafond: parseFloat(form.plafond) }]);
    setForm({ categorie:"", plafond:0, couleur:"#F87171" });
    setShowForm(false);
  };

  // Calculer dépenses du mois courant par catégorie
  const depensesParCat = {};
  transactions
    .filter(t => t.annee === curYear && t.mois === curMonth && t.es === "Sortie")
    .forEach(t => { depensesParCat[t.type] = (depensesParCat[t.type]||0) + t.montant; });

  const alertesActives = alertes.filter(a => {
    const dep = depensesParCat[a.categorie] || 0;
    return dep > 0;
  });

  if (alertesActives.length === 0 && !showForm) {
    if (alertes.length === 0) return (
      <Card style={{ marginBottom:14, padding:"14px 18px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9" }}>🔔 Alertes budget</div>
          <button onClick={() => setShowForm(true)} style={{ background:"rgba(248,113,113,0.15)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:8, color:"#F87171", padding:"4px 10px", fontSize:11, cursor:"pointer" }}>+ Alerte</button>
        </div>
        <div style={{ fontSize:12, color:"#475569", marginTop:6 }}>Aucune alerte configurée</div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom:14, padding:"14px 18px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9" }}>🔔 Alertes budget — {["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"][curMonth-1]}</div>
        <button onClick={() => setShowForm(!showForm)} style={{ background:"rgba(248,113,113,0.15)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:8, color:"#F87171", padding:"4px 10px", fontSize:11, cursor:"pointer" }}>
          {showForm ? "Annuler" : "+ Alerte"}
        </button>
      </div>

      {showForm && (
        <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"12px", marginBottom:12, display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:11, color:"#64748B", marginBottom:3 }}>Catégorie</div>
            <input value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}
              placeholder="ex: Nourriture"
              style={{ background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"6px 10px", fontSize:13, width:140 }} />
          </div>
          <div>
            <div style={{ fontSize:11, color:"#64748B", marginBottom:3 }}>Plafond (€/mois)</div>
            <input type="number" value={form.plafond} onChange={e=>setForm(f=>({...f,plafond:e.target.value}))}
              style={{ background:"#1E293B", border:"1px solid #334155", borderRadius:6, color:"#F1F5F9", padding:"6px 10px", fontSize:13, width:100 }} />
          </div>
          <button onClick={addAlerte} style={{ background:"#F87171", border:"none", borderRadius:8, color:"#0B1120", padding:"7px 14px", fontSize:13, fontWeight:700, cursor:"pointer" }}>Ajouter</button>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {alertes.map(a => {
          const dep = depensesParCat[a.categorie] || 0;
          const pct = Math.min(100, (dep / a.plafond) * 100);
          const depasse = dep > a.plafond;
          const proche = pct >= 80 && !depasse;
          const col = depasse ? "#F87171" : proche ? "#FBBF24" : "#34D399";

          return (
            <div key={a.id} style={{ background:"rgba(255,255,255,0.02)", borderRadius:8, padding:"10px 12px", border:`1px solid ${col}33` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, color:col }}>
                    {depasse ? "🔴" : proche ? "🟡" : "🟢"}
                  </span>
                  <span style={{ fontSize:13, fontWeight:600, color:"#F1F5F9" }}>{a.categorie}</span>
                  {depasse && <span style={{ fontSize:10, background:"rgba(248,113,113,0.2)", color:"#F87171", borderRadius:4, padding:"1px 6px" }}>DÉPASSÉ</span>}
                </div>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:col }}>{fmt(dep)}</span>
                  <span style={{ fontSize:11, color:"#475569" }}>/ {fmt(a.plafond)}</span>
                  <button onClick={() => save(alertes.filter(x => x.id !== a.id))}
                    style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:13 }}>✕</button>
                </div>
              </div>
              <div style={{ height:6, background:"rgba(255,255,255,0.08)", borderRadius:3 }}>
                <div style={{ width:`${pct}%`, height:"100%", borderRadius:3, background:col, transition:"width 0.4s" }} />
              </div>
              <div style={{ fontSize:10, color:"#64748B", marginTop:3 }}>{pct.toFixed(0)}% du plafond</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Overview({ cryptoData, cryptoPrices, stocks, bank, savings, oraPrice, realestateTotal, scpiTotal, onNavigate, history, marketHistoryTotal, marketHistoryIntraday, uid }) {
  const getVl = (f) => (f.type === "ora_linked" && oraPrice > 0) ? oraPrice : f.manualVl;
  const cryptoTotal = cryptoData.reduce((s, c) => s + (cryptoPrices[c.code]?.eur || 0) * c.qty, 0);
  const stocksTotal = stocks.reduce((s, st) => s + st.price * st.qty, 0);
  const savingsTotal = [...savings.peg, ...savings.percol].reduce((s, f) => s + getVl(f) * f.qty, 0);
  const bankTotal = bank.reduce((s, b) => s + b.balance, 0);
  const grandTotal = cryptoTotal + stocksTotal + savingsTotal + bankTotal + realestateTotal + scpiTotal;

  const sections = [
    { key: "crypto",      label: "Crypto",                        value: cryptoTotal,     color: "#818CF8", icon: "₿" },
    { key: "stocks",      label: "Bourse (Trade Republic)",        value: stocksTotal,     color: "#34D399", icon: "📈" },
    { key: "savings",     label: "Épargne salariale (PEG / PER)",  value: savingsTotal,    color: "#FBBF24", icon: "🟠" },
    { key: "scpi",        label: "SCPI",                           value: scpiTotal,       color: "#A78BFA", icon: "🏢" },
    { key: "realestate",  label: "Immobilier",                     value: realestateTotal, color: "#F472B6", icon: "🏠" },
    { key: "bank",        label: "Banque",                         value: bankTotal,       color: "#60A5FA", icon: "🏦" },
  ];

  const pieData = sections.filter(s => s.value > 0).map(s => ({ name: s.label.split(" ")[0], value: s.value, color: s.color }));

  const scpiRevenuAnnuel = scpiTotal > 0 ? (scpiTotal * 0.083) : 0;
  const bankInteret = bank.reduce((s, b) => s + b.balance * (b.interestRate || 0) / 100, 0);
  const rentAnnuel = 363 * 12;
  const revenuPassifTotal = scpiRevenuAnnuel + bankInteret + rentAnnuel;
  const tauxRendementGlobal = grandTotal > 0 ? (revenuPassifTotal / grandTotal) * 100 : 0;
  const diversification = sections.filter(s => s.value > 0).length;

  return (
    <div>
      <SectionTitle sub="Vue d'ensemble de ton patrimoine">Patrimoine Global</SectionTitle>

      <Card style={{ marginBottom: 16, background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(52,211,153,0.08))" }}>
        <div style={{ fontSize: 12, color: "#64748B", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Patrimoine Total</div>
        <div style={{ fontSize: 46, fontWeight: 800, color: "#F1F5F9", fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>
          {fmt(grandTotal)}
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 6, marginBottom: 14 }}>Prix crypto en EUR · CoinGecko live</div>
        {marketHistoryTotal && marketHistoryTotal.length > 1
          ? <><Variation history={marketHistoryTotal} dataKey="total" color="#818CF8" /><MiniAreaChart data={marketHistoryTotal} dataKey="total" color="#818CF8" height={220} showPeriodSelector={true} intradayData={{ "24h": marketHistoryIntraday?.total24h, "7d": marketHistoryIntraday?.total7d }} /></>
          : <><Variation history={history} dataKey="total" color="#818CF8" /><MiniAreaChart data={history} dataKey="total" color="#818CF8" height={220} showPeriodSelector={true} /></>
        }
      </Card>

      {/* Stats globales */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Revenus passifs /an" value={fmt(revenuPassifTotal)} sub="SCPI + loyer + intérêts" color="#34D399" icon="💰" />
        <StatCard label="Rendement global" value={`${tauxRendementGlobal.toFixed(2)}%`} sub="Sur patrimoine total" color="#FBBF24" icon="📈" />
        <StatCard label="Diversification" value={`${diversification}/6`} sub="Classes d'actifs actives" color="#818CF8" icon="🎯" />
        <StatCard label="Actifs liquides" value={fmt(cryptoTotal + stocksTotal + bankTotal)} sub="Crypto + Bourse + Banque" color="#60A5FA" icon="💧" />
      </div>

      {/* Sections liste */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {sections.map(s => (
          <Card key={s.key} onClick={() => onNavigate(s.key)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: s.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 14 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>
                  {grandTotal > 0 ? ((s.value / grandTotal) * 100).toFixed(1) : 0}% · voir le détail →
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: s.color }}>{fmt(s.value)}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Objectifs financiers ──────────────────────────── */}
      <ObjectifsFinanciers uid={uid} />


      {/* Graphique répartition — sous les sections, pleine largeur */}
      <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Répartition</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 16, width: "100%" }}>
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", color: "#F1F5F9", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <span style={{ color: "#64748B" }}>{d.name}</span>
                </div>
                <span style={{ color: "#F1F5F9", fontWeight: 600 }}>{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── CRYPTO VIEW ──────────────────────────────────────────────────────────────
// ─── CRYPTO TREEMAP ───────────────────────────────────────────────────────────
function CryptoTreemap({ cryptoData, cryptoPrices }) {
  const containerRef = useRef(null);
  const [W, setW] = useState(500);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(e => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const total = cryptoData.reduce((s, c) => s + (cryptoPrices[c.code]?.eur || 0) * c.qty, 0);
  if (!total) return <div ref={containerRef} style={{height:200,display:"flex",alignItems:"center",justifyContent:"center",color:"#334155",fontSize:12}}>Chargement des prix…</div>;

  const H = Math.round(W * 0.55);
  const GAP = 3;

  const items = [...cryptoData]
    .map(c => ({ ...c, value: (cryptoPrices[c.code]?.eur || 0) * c.qty }))
    .filter(c => c.value > 1)
    .sort((a, b) => b.value - a.value);

  // Squarified treemap — algorithme Bruls 1999
  function squarify(data, x, y, w, h) {
    if (!data.length) return [];
    const area = w * h;
    const total = data.reduce((s, d) => s + d.v, 0);
    // Normaliser les surfaces
    const normed = data.map(d => ({ ...d, v: d.v / total * area }));
    const results = [];

    function worstRatio(row, side) {
      const s = row.reduce((a, b) => a + b, 0);
      const rmax = Math.max(...row), rmin = Math.min(...row);
      return Math.max(side*side*rmax/(s*s), s*s/(side*side*rmin));
    }

    function placeRow(row, items, isH, rx, ry, rw, rh) {
      const s = row.reduce((a, b) => a + b, 0);
      const rowDim = isH ? s / rh : s / rw;
      let pos = isH ? ry : rx;
      items.forEach((item, i) => {
        const dim = isH ? row[i] / rowDim : row[i] / rowDim;
        results.push({
          idx: item.idx,
          x: isH ? rx : pos,
          y: isH ? pos : ry,
          w: isH ? rowDim : dim,
          h: isH ? dim   : rowDim,
        });
        pos += isH ? row[i] / rowDim : row[i] / rowDim;
      });
      return isH ? { rx: rx+rowDim, ry, rw: rw-rowDim, rh } : { rx, ry: ry+rowDim, rw, rh: rh-rowDim };
    }

    function recurse(remaining, rx, ry, rw, rh) {
      if (!remaining.length) return;
      const isH = rw <= rh;
      const side = isH ? rw : rh;
      let row = [], rowItems = [], best = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const testRow = [...row, remaining[i].v];
        const ratio = worstRatio(testRow, side);
        if (ratio > best && row.length) break;
        best = ratio;
        row = testRow;
        rowItems = remaining.slice(0, i+1);
      }
      const next = placeRow(row, rowItems, isH, rx, ry, rw, rh);
      recurse(remaining.slice(rowItems.length), next.rx, next.ry, next.rw, next.rh);
    }

    recurse(normed.map((d, i) => ({ ...d, idx: i })), x, y, w, h);
    return results;
  }

  const rects = squarify(items.map((d, i) => ({ v: d.value, idx: i })), 0, 0, W, H);

  return (
    <div ref={containerRef} style={{ width:"100%" }}>
      <svg width={W} height={H} style={{ display:"block", borderRadius:10, overflow:"hidden" }}>
        <defs>
          <linearGradient id="tmShine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
          </linearGradient>
        </defs>
        {rects.map((r, i) => {
          const item = items[r.idx];
          if (!item) return null;
          const rx = r.x + GAP/2, ry = r.y + GAP/2;
          const rw = r.w - GAP,   rh = r.h - GAP;
          if (rw < 4 || rh < 4) return null;

          const pct = (item.value / total * 100).toFixed(1);
          // Taille de fonte adaptative
          const fs = Math.min(Math.max(Math.min(rw/item.code.length*1.1, rh*0.32), 9), 36);
          const showSym = rw > 24 && rh > 16;
          const showPct = rw > 40 && rh > fs*2.6 && fs >= 10;
          const showVal = rw > 60 && rh > fs*4.2 && fs >= 12;

          // Centrage vertical du groupe de textes
          const lineH  = fs * 1.35;
          const nLines = (showSym?1:0)+(showPct?1:0)+(showVal?1:0);
          const blockH = nLines * lineH;
          let ty = ry + rh/2 - blockH/2 + lineH*0.55;

          return (
            <g key={item.code}>
              <rect x={rx} y={ry} width={rw} height={rh} rx={4} fill={item.color} fillOpacity={0.9} />
              <rect x={rx} y={ry} width={rw} height={rh} rx={4} fill="url(#tmShine)" />
              {showSym && (
                <text x={rx+rw/2} y={ty}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.97)" fontWeight="800"
                  fontSize={fs} fontFamily="'Syne','DM Sans',sans-serif">
                  {item.code}
                </text>
              )}
              {showPct && (
                <text x={rx+rw/2} y={ty + lineH}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.62)" fontSize={Math.max(8, fs*0.50)}
                  fontFamily="'DM Sans',sans-serif">
                  {pct}%
                </text>
              )}
              {showVal && (
                <text x={rx+rw/2} y={ty + lineH*2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.38)" fontSize={Math.max(7, fs*0.40)}
                  fontFamily="'DM Sans',sans-serif">
                  {fmt(item.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}


function CryptoView({ cryptoData, setCryptoData, cryptoPrices, loading, history, cryptoHistory, cryptoHistory24h, cryptoHistory7d }) {
  const [editingCode, setEditingCode] = useState(null);
  const [editQty, setEditQty] = useState("");

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [addQty, setAddQty] = useState("");

  const totalEur = cryptoData.reduce((s, c) => s + (cryptoPrices[c.code]?.eur || 0) * c.qty, 0);
  const total = totalEur;

  const saveEdit = (code) => {
    setCryptoData(prev => prev.map(c => c.code === code ? { ...c, qty: parseFloat(editQty) || c.qty } : c));
    setEditingCode(null);
  };

  const removeToken = (code) => {
    setCryptoData(prev => prev.filter(c => c.code !== code));
  };

  // Search via CoinGecko /search
  const searchCoins = async (q) => {
    if (!q || q.trim().length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await cgFetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      const coins = (data.coins || []).slice(0, 8).map(c => ({
        code: c.symbol.toUpperCase(),
        name: c.name,
        cgId: c.id,
        logo: c.large || c.thumb,
        rank: c.market_cap_rank,
      }));
      setSearchResults(coins);
    } catch { setSearchError("Erreur réseau"); }
    finally { setSearchLoading(false); }
  };

  // Debounce search
  const searchTimeout = useState(null);
  const handleSearchInput = (val) => {
    setSearchQuery(val);
    setSelectedCoin(null);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    searchTimeout[0] = setTimeout(() => searchCoins(val), 400);
  };

  const selectCoin = (coin) => {
    setSelectedCoin(coin);
    setSearchResults([]);
    setSearchQuery(coin.name + " (" + coin.code + ")");
  };

  const addCoin = () => {
    if (!selectedCoin || !addQty) return;
    const qty = parseFloat(addQty);
    if (!qty || qty <= 0) return;
    // Already exists → just update qty
    if (cryptoData.find(c => c.code === selectedCoin.code)) {
      setCryptoData(prev => prev.map(c => c.code === selectedCoin.code ? { ...c, qty: c.qty + qty } : c));
    } else {
      const colors = ["#E879F9","#FB7185","#FDBA74","#A3E635","#22D3EE","#818CF8","#F472B6","#34D399"];
      const color = colors[cryptoData.length % colors.length];
      setCryptoData(prev => [...prev, { code: selectedCoin.code, symbol: selectedCoin.code, qty, color }]);
    }
    setShowSearch(false);
    setSearchQuery("");
    setSelectedCoin(null);
    setAddQty("");
  };

  const sorted = [...cryptoData]
    .filter(c => c.qty > 0)
    .sort((a, b) => (cryptoPrices[b.code]?.eur || 0) * b.qty - (cryptoPrices[a.code]?.eur || 0) * a.qty);

  return (
    <div>
      <SectionTitle sub={`Total : ${fmt(totalEur)} · ${loading ? "⏳ sync…" : "✓ CoinGecko live · EUR direct"}`}>
        Cryptomonnaies
      </SectionTitle>

      {/* Stats crypto */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatCard label="Valeur totale" value={fmt(totalEur)} sub={`${cryptoData.length} actifs`} color="#818CF8" icon="₿" />
        <StatCard label="Top position" value={(() => { const top = [...cryptoData].sort((a,b) => (cryptoPrices[b.code]?.eur||0)*b.qty - (cryptoPrices[a.code]?.eur||0)*a.qty)[0]; return top ? top.symbol : "—"; })()} sub={(() => { const top = [...cryptoData].sort((a,b) => (cryptoPrices[b.code]?.eur||0)*b.qty - (cryptoPrices[a.code]?.eur||0)*a.qty)[0]; return top ? fmt((cryptoPrices[top.code]?.eur||0)*top.qty) : ""; })()} color="#A78BFA" icon="🏆" />
        <StatCard label="Stablecoins" value={fmt((cryptoPrices["USDC"]?.eur || 1) * (cryptoData.find(c => c.code === "USDC")?.qty || 0))} sub="USDC · liquidités sûres" color="#2775CA" icon="🔒" />
        <StatCard label="Nb positions" value={cryptoData.length} sub="Tokens différents" color="#6366F1" icon="🎯" />
      </div>

      {/* Treemap répartition */}
      <Card style={{ marginBottom: 14, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, fontWeight:600, color:"#94A3B8", marginBottom:10 }}>Répartition du portefeuille</div>
        <CryptoTreemap cryptoData={cryptoData} cryptoPrices={cryptoPrices} />
      </Card>

      {/* Graphique évolution */}
      <Card style={{ marginBottom: 14, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Évolution Crypto (€) — ETH via CoinGecko</div>
        {cryptoHistory && cryptoHistory.length > 1
          ? <MiniAreaChart data={cryptoHistory} dataKey="crypto" color="#818CF8" height={220} showPeriodSelector={true} intradayData={{ "24h": cryptoHistory24h, "7d": cryptoHistory7d }} />
          : <><Variation history={history} dataKey="crypto" color="#818CF8" /><MiniAreaChart data={history} dataKey="crypto" color="#818CF8" height={220} showPeriodSelector={true} intradayData={{ "24h": cryptoHistory24h, "7d": cryptoHistory7d }} /></>
        }
      </Card>

      {/* Add crypto panel */}
      {showSearch ? (
        <Card style={{ marginBottom: 16, padding: "16px 20px", border: "1px solid rgba(99,102,241,0.4)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>
            🔍 Rechercher une cryptomonnaie
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="Tape un nom ou ticker : Bitcoin, ETH, SOL…"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "10px", padding: "9px 14px", color: "#F1F5F9", fontSize: 14 }}
            />
            {searchLoading && (
              <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#64748B" }}>⏳</div>
            )}
            {/* Dropdown results */}
            {searchResults.length > 0 && (
              <div style={{ position: "absolute", top: "110%", left: 0, right: 0, background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", zIndex: 100, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                {searchResults.map(coin => (
                  <div key={coin.code} onClick={() => selectCoin(coin)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.15)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {coin.png32 && <img src={coin.png32} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />}
                      <div>
                        <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 13 }}>{coin.name}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{coin.code} · Rang #{coin.rank}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#64748B" }}>{coin.rate ? fmt(coin.rate, "USD") : "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected coin confirmation */}
          {selectedCoin && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "10px 14px", background: "rgba(99,102,241,0.1)", borderRadius: "10px", border: "1px solid rgba(99,102,241,0.3)" }}>
              {selectedCoin.png32 && <img src={selectedCoin.png32} alt="" style={{ width: 28, height: 28, borderRadius: "6px" }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#F1F5F9" }}>{selectedCoin.name} <span style={{ color: "#64748B", fontWeight: 400 }}>({selectedCoin.code})</span></div>
                <div style={{ fontSize: 12, color: "#64748B" }}>Prix actuel : {selectedCoin.rate ? fmt(selectedCoin.rate, "USD") : "—"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#64748B", marginBottom: 3 }}>Quantité</div>
                  <input
                    value={addQty}
                    onChange={e => setAddQty(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCoin()}
                    placeholder="0.00"
                    autoFocus
                    style={{ width: 100, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "5px 10px", color: "#F1F5F9", fontSize: 13 }}
                  />
                </div>
                <button onClick={addCoin}
                  style={{ marginTop: 16, background: "#4F46E5", border: "none", borderRadius: "10px", color: "#fff", padding: "7px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  ＋ Ajouter
                </button>
              </div>
            </div>
          )}

          {searchError && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8 }}>⚠ {searchError}</div>}

          <button onClick={() => { setShowSearch(false); setSearchQuery(""); setSelectedCoin(null); setAddQty(""); setSearchResults([]); }}
            style={{ background: "transparent", border: "1px solid #334155", borderRadius: "10px", color: "#64748B", padding: "6px 16px", cursor: "pointer", fontSize: 12 }}>
            Annuler
          </button>
        </Card>
      ) : (
        <button onClick={() => setShowSearch(true)}
          style={{ width: "100%", marginBottom: 14, background: "rgba(99,102,241,0.08)", border: "1px dashed rgba(99,102,241,0.4)", borderRadius: "10px", color: "#818CF8", padding: "10px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ＋ Ajouter une crypto
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map(c => {
          const price = cryptoPrices[c.code]?.eur || 0;
          const value = price * c.qty;
          const pct = cryptoPrices[c.code]?.eur_24h_change || 0;
          const share = total > 0 ? (value / total) * 100 : 0;

          return (
            <Card key={c.code} style={{ padding: "12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "10px", background: c.color + "28", border: `2px solid ${c.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: c.color, flexShrink: 0 }}>
                  {c.symbol.slice(0, 4)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 14 }}>{c.symbol}</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>
                    {editingCode === c.code ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input value={editQty} onChange={e => setEditQty(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveEdit(c.code)}
                          autoFocus
                          style={{ width: 90, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "2px 6px", color: "#F1F5F9", fontSize: 12 }} />
                        <button onClick={() => saveEdit(c.code)} style={{ background: "#4F46E5", border: "none", borderRadius: 4, color: "#fff", padding: "2px 7px", cursor: "pointer", fontSize: 11 }}>✓</button>
                        <button onClick={() => setEditingCode(null)} style={{ background: "transparent", border: "none", color: "#64748B", cursor: "pointer", fontSize: 11 }}>✕</button>
                      </span>
                    ) : (
                      <span onClick={() => { setEditingCode(c.code); setEditQty(String(c.qty)); }}
                        style={{ cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                        {c.qty >= 1 ? c.qty.toFixed(4) : c.qty.toFixed(6)} unités
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{price > 0 ? fmt(value) : "—"}</div>
                  <div style={{ display:"flex", gap:6, justifyContent:"flex-end", fontSize: 11 }}>
                    <span style={{ color: "#64748B" }}>{share.toFixed(1)}%</span>
                    <span style={{ color: pctColor(pct), fontWeight: 600 }}>{fmtPct(pct)}</span>
                  </div>
                </div>
                <button onClick={() => removeToken(c.code)}
                  title="Supprimer"
                  style={{ background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: 16, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                  onMouseLeave={e => e.currentTarget.style.color = "#334155"}
                >✕</button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── STOCKS VIEW ──────────────────────────────────────────────────────────────

// ─── STOCK SEARCH BAR ────────────────────────────────────────────────────────
function StockSearchBar({ onAdd, workerUrl = "https://ora-proxy.rybble.workers.dev" }) {
  const [query, setQuery]             = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [account, setAccount]         = useState("ct");
  const [qty, setQty]                 = useState("");
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [livePrice, setLivePrice]     = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setSuggestions([]); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback(async (q) => {
    if (q.length < 1) { setSuggestions([]); return; }
    setSearchLoading(true);
    try {
      // Recherche via le Worker Cloudflare (évite les problèmes CORS)
      const res = await fetch(`${workerUrl}?mode=search&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("search failed");
      const data = await res.json();
      const items = (data.quotes || [])
        .filter(s => s.symbol && ["EQUITY","ETF","MUTUALFUND","INDEX","FUTURE"].includes(s.quoteType))
        .slice(0, 8)
        .map(s => ({
          ticker:   s.symbol,
          name:     s.longname || s.shortname || s.symbol,
          exchange: s.exchDisp || s.exchange || "",
          type:     s.quoteType || "",
          yahooTicker: s.symbol,
        }));
      setSuggestions(items);
    } catch (e) {
      console.warn("Search error:", e.message);
      setSuggestions([]);
    } finally { setSearchLoading(false); }
  }, [workerUrl]);

  const handleInput = (e) => {
    const v = e.target.value;
    setQuery(v);
    setSelected(null);
    setLivePrice(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  const pickSuggestion = async (item) => {
    setSelected(item);
    setQuery(`${item.ticker} — ${item.name}`);
    setSuggestions([]);
    setLoadingPrice(true);
    setLivePrice(null);
    try {
      const res = await fetch(`${workerUrl}?symbol=${encodeURIComponent(item.yahooTicker)}`, { cache: "no-store" });
      const data = await res.json();
      const price    = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      const currency = data?.chart?.result?.[0]?.meta?.currency || "EUR";
      if (price && price > 0) setLivePrice({ price, currency });
    } catch {}
    setLoadingPrice(false);
  };

  const toEur = (lp) => {
    if (!lp) return 0;
    if (lp.currency === "USD") return lp.price * 0.92;
    if (lp.currency === "GBp") return lp.price / 100 * 1.18;
    return lp.price;
  };

  const handleAdd = () => {
    if (!selected || !qty) return;
    const qtyNum = parseFloat(qty.replace(",", "."));
    if (!qtyNum || qtyNum <= 0) return;
    onAdd({ symbol: selected.ticker, name: selected.name, qty: qtyNum, price: toEur(livePrice), isin: "", account });
    setQuery(""); setSelected(null); setQty(""); setLivePrice(null); setAccount("ct");
  };

  const inp = { background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#F1F5F9", fontSize: 13, outline: "none" };

  const btnAcc = (id, label, rgb) => (
    <button onClick={() => setAccount(id)} style={{
      background: account === id ? `rgba(${rgb},0.15)` : "transparent",
      border: `1px solid ${account === id ? `rgba(${rgb},0.5)` : "rgba(255,255,255,0.1)"}`,
      borderRadius: 8, color: account === id ? `rgb(${rgb})` : "#64748B",
      padding: "7px 16px", fontSize: 13, fontWeight: account === id ? 700 : 400, cursor: "pointer", transition: "all 0.15s",
    }}>{label}</button>
  );

  return (
    <Card style={{ padding: "16px 18px", background: "rgba(99,102,241,0.05)", border: "1px dashed rgba(99,102,241,0.35)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#818CF8", marginBottom: 14 }}>＋ Ajouter une valeur</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>

        {/* Champ recherche */}
        <div ref={dropdownRef} style={{ position: "relative", flex: "1 1 260px" }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Rechercher une valeur</div>
          <div style={{ position: "relative" }}>
            <input value={query} onChange={handleInput} placeholder="ex: AAPL, Tesla, ORA.PA, Air Liquide…"
              style={{ ...inp, width: "100%", paddingRight: 32 }} />
            {searchLoading && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#64748B", fontSize:12 }}>⏳</span>}
          </div>
          {suggestions.length > 0 && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:999,
              background:"#1E293B", border:"1px solid #334155", borderRadius:10, boxShadow:"0 8px 32px rgba(0,0,0,0.5)", overflow:"hidden" }}>
              {suggestions.map((s, i) => (
                <div key={i} onClick={() => pickSuggestion(s)}
                  style={{ padding:"9px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10,
                    borderBottom: i < suggestions.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(99,102,241,0.12)"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                  <div style={{ width:36, height:36, borderRadius:8, background:"rgba(99,102,241,0.15)", display:"flex", alignItems:"center",
                    justifyContent:"center", fontSize:10, fontWeight:800, color:"#818CF8", flexShrink:0 }}>
                    {s.ticker.replace(/[^A-Z0-9]/gi,"").slice(0,4).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:"#F1F5F9", fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</div>
                    <div style={{ fontSize:11, color:"#64748B" }}>{s.ticker} · {s.exchange} · {s.type}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!searchLoading && query.length > 1 && suggestions.length === 0 && !selected && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:999,
              background:"#1E293B", border:"1px solid #334155", borderRadius:10, padding:"12px 14px",
              fontSize:12, color:"#64748B" }}>
              Aucun résultat — essayez le ticker exact (ex: "AI.PA" pour Air Liquide)
            </div>
          )}
        </div>

        {/* Compte */}
        <div style={{ flexShrink:0 }}>
          <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Compte</div>
          <div style={{ display:"flex", gap:6 }}>
            {btnAcc("ct",  "📋 Compte-Titres", "96,165,250")}
            {btnAcc("pea", "🇫🇷 PEA",          "167,139,250")}
          </div>
        </div>

        {/* Quantité */}
        <div style={{ width:110, flexShrink:0 }}>
          <div style={{ fontSize:11, color:"#64748B", marginBottom:4 }}>Quantité</div>
          <input value={qty} onChange={e => setQty(e.target.value)} placeholder="0.00" style={{ ...inp, width:"100%" }} />
        </div>
      </div>

      {/* Prix + bouton */}
      <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <div style={{ flex:1, minHeight:32, display:"flex", alignItems:"center" }}>
          {loadingPrice && <span style={{ fontSize:12, color:"#64748B" }}>⏳ Récupération du cours…</span>}
          {!loadingPrice && livePrice && (() => {
            const eur = toEur(livePrice);
            const qtyNum = parseFloat(qty.replace(",",".")) || 0;
            return (
              <div style={{ fontSize:13, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ color:"#34D399", fontWeight:700 }}>✓ {livePrice.price.toFixed(2)} {livePrice.currency}</span>
                {livePrice.currency !== "EUR" && <span style={{ color:"#64748B", fontSize:11 }}>≈ {eur.toFixed(2)} €</span>}
                {qtyNum > 0 && <span style={{ color:"#94A3B8", fontSize:12 }}>→ total ≈ {fmt(eur * qtyNum)}</span>}
              </div>
            );
          })()}
          {!loadingPrice && selected && !livePrice && (
            <span style={{ fontSize:12, color:"#F87171" }}>⚠ Cours indisponible via Yahoo Finance</span>
          )}
        </div>
        <button onClick={handleAdd} disabled={!selected || !qty || !livePrice}
          style={{ background: selected && qty && livePrice ? "linear-gradient(135deg,#6366F1,#4F46E5)" : "rgba(99,102,241,0.2)",
            border:"none", borderRadius:10, color: selected && qty && livePrice ? "#fff" : "#4F46E5",
            padding:"8px 20px", cursor: selected && qty && livePrice ? "pointer" : "not-allowed",
            fontWeight:700, fontSize:13, transition:"all 0.15s" }}>
          Ajouter
        </button>
      </div>
    </Card>
  );
}

function StocksView({ stocks, setStocks, history, marketHistory, stocksHistory24h, stocksHistory7d, peaValue, nonCoteValue }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [importStatus, setImportStatus] = useState("");

  const total = stocks.reduce((s, st) => s + st.price * st.qty, 0);

  // Parse Trade Republic CSV export
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split("\n").filter(l => l.trim());
        if (lines.length < 2) { setImportStatus("❌ Fichier vide ou invalide"); return; }
        const sep = lines[0].includes(";") ? ";" : ",";
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, "").toLowerCase());
        const col = (names) => { for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; } return -1; };
        const iSymbol = col(["ticker","symbol","isin","wkn","bezeichnung","name","titre","libellé"]);
        const iName   = col(["name","bezeichnung","titre","libellé","security name","instrument"]);
        const iQty    = col(["shares","quantity","anzahl","quantité","qté","nombre","units"]);
        const iPrice  = col(["price","kurs","cours","prix","current price","last price","valeur unitaire"]);
        const iIsin   = col(["isin"]);
        if (iQty < 0 || iPrice < 0) { setImportStatus("❌ Colonnes quantité/prix introuvables."); return; }
        const updated = [...stocks];
        let count = 0;
        lines.slice(1).forEach(line => {
          const cols = line.split(sep).map(c => c.trim().replace(/"/g, ""));
          const symbol = iSymbol >= 0 ? cols[iSymbol]?.toUpperCase() : "";
          const name   = iName   >= 0 ? cols[iName] : symbol;
          const qty    = parseFloat(cols[iQty]?.replace(",", ".")) || 0;
          const price  = parseFloat(cols[iPrice]?.replace(",", ".")) || 0;
          const isin   = iIsin >= 0 ? cols[iIsin] : "";
          if (!symbol || qty === 0) return;
          const idx = updated.findIndex(s => s.symbol === symbol || (isin && s.isin === isin));
          if (idx >= 0) { updated[idx] = { ...updated[idx], qty, price }; }
          else { updated.push({ symbol, name: name || symbol, qty, price, isin }); }
          count++;
        });
        setStocks(updated);
        setImportStatus(`✅ ${count} ligne(s) importée(s)`);
        setTimeout(() => setImportStatus(""), 4000);
      } catch (err) { setImportStatus("❌ Erreur : " + err.message); }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  // Catégorisation — basée sur champ account ou liste statique par défaut
  const CT_DEFAULT     = ["AAPL", "TSLA", "BYD", "CSPX"];
  const NON_COTE       = ["APOLLO", "EQTF"];
  const stocksCT       = stocks.filter(s => !NON_COTE.includes(s.symbol) && (s.account === "ct"  || (!s.account && CT_DEFAULT.includes(s.symbol))));
  const stocksPEA      = stocks.filter(s => s.account === "pea");
  const stocksNonCote  = stocks.filter(s => NON_COTE.includes(s.symbol));
  const totalCT        = stocksCT.reduce((s, st) => s + st.price * st.qty, 0);
  const totalPEA       = stocksPEA.reduce((s, st) => s + st.price * st.qty, 0);
  const PEA_MANUAL     = stocksPEA.length === 0 ? 549.89 : 0;
  const PEA_VALUE      = totalPEA + PEA_MANUAL;
  const totalNonCote   = stocksNonCote.reduce((s, st) => s + st.price * st.qty, 0);

  const renderStockCard = (st) => {
    const value = st.price * st.qty;
    const isEditing = editing === st.symbol + (st.account || "");
    return (
      <Card key={st.symbol + (st.account||"")} style={{ padding: "13px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: "10px", background: "rgba(52,211,153,0.1)", border: "2px solid rgba(52,211,153,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#34D399", flexShrink: 0 }}>
            {st.symbol.slice(0, 4)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 14 }}>{st.name}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{st.isin}</div>
            {isEditing ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["Qté", "qty", 80], ["Prix €", "price", 90]].map(([label, key, w]) => (
                  <div key={key}>
                    <div style={{ fontSize: 10, color: "#64748B" }}>{label}</div>
                    <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: w, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "4px 8px", color: "#F1F5F9", fontSize: 12 }} />
                  </div>
                ))}
                <button onClick={() => { setStocks(p => p.map(s => (s.symbol === st.symbol && (s.account||"") === (st.account||"")) ? { ...s, qty: parseFloat(form.qty)||s.qty, price: parseFloat(form.price)||s.price } : s)); setEditing(null); }}
                  style={{ alignSelf: "flex-end", background: "#4F46E5", border: "none", borderRadius: "6px", color: "#fff", padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✓ Sauver</button>
                <button onClick={() => setEditing(null)}
                  style={{ alignSelf: "flex-end", background: "transparent", border: "1px solid #334155", borderRadius: "6px", color: "#64748B", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Annuler</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {st.qty} titres · {fmt(st.price)} / titre
                <button onClick={() => { setEditing(st.symbol + (st.account||"")); setForm({ qty: String(st.qty), price: String(st.price) }); }}
                  style={{ marginLeft: 10, background: "transparent", border: "none", color: "#6366F1", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>modifier</button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#34D399", minWidth: 90, textAlign: "right" }}>{fmt(value)}</div>
            <button onClick={() => setStocks(p => p.filter(s => !(s.symbol === st.symbol && (s.account||"") === (st.account||""))))} title="Supprimer"
              style={{ background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: 16, padding: "0 2px" }}
              onMouseEnter={e => e.currentTarget.style.color="#F87171"}
              onMouseLeave={e => e.currentTarget.style.color="#334155"}>✕</button>
          </div>
        </div>
      </Card>
    );
  };

  const SubSectionHeader = ({ title, subtitle, total: sTotal, color = "#34D399" }) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, marginTop:4 }}>
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:3, height:18, borderRadius:2, background:color }} />
          <span style={{ fontWeight:700, fontSize:15, color:"#F1F5F9" }}>{title}</span>
        </div>
        {subtitle && <div style={{ fontSize:12, color:"#64748B", marginLeft:11 }}>{subtitle}</div>}
      </div>
      <div style={{ fontSize:17, fontWeight:700, color }}>{fmt(sTotal)}</div>
    </div>
  );

  return (
    <div>
      <SectionTitle sub={`Trade Republic · Total ${fmt(total + PEA_VALUE)}`}>Bourse</SectionTitle>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <StatCard label="Total bourse" value={fmt(total + PEA_VALUE)} sub={`${stocks.length} positions`} color="#34D399" icon="📈" />
        <StatCard label="Compte-Titres" value={fmt(totalCT)} sub={`${stocksCT.length} lignes`} color="#60A5FA" icon="📋" />
        <StatCard label="PEA" value={fmt(PEA_VALUE)} sub={stocksPEA.length > 0 ? `${stocksPEA.length} lignes` : "Trade Republic"} color="#A78BFA" icon="🇫🇷" />
        <StatCard label="Non cotés" value={fmt(totalNonCote)} sub="APOLLO · EQTF" color="#FBBF24" icon="🔒" />
      </div>

      <Card style={{ marginBottom: 18, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Évolution Bourse (€) — positions cotées + PEA + non cotés</div>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
          Cotées (AAPL·TSLA·BYD·CSPX) + PEA {fmt(peaValue)} + Non cotés {fmt(nonCoteValue)} · Intraday : AAPL+TSLA uniquement
        </div>
        {(() => {
          // Enrichir les données intraday avec PEA + non-cotés (constantes)
          const staticBourse = (peaValue || 0) + (nonCoteValue || 0);
          // Daily : déjà AAPL+TSLA+BYD+CSPX, on ajoute les constantes
          const enrichedDaily = marketHistory?.map(p => ({ ...p, stocks: parseFloat((p.stocks + staticBourse).toFixed(2)) }));
          const enriched24h   = stocksHistory24h?.map(p => ({ ...p, stocks: parseFloat((p.stocks + staticBourse).toFixed(2)) }));
          const enriched7d    = stocksHistory7d?.map(p  => ({ ...p, stocks: parseFloat((p.stocks + staticBourse).toFixed(2)) }));
          const hasData = enrichedDaily && enrichedDaily.length > 1;
          return hasData
            ? <MiniAreaChart data={enrichedDaily} dataKey="stocks" color="#34D399" height={220} showPeriodSelector={true} intradayData={{ "24h": enriched24h, "7d": enriched7d }} />
            : <><Variation history={history} dataKey="stocks" color="#34D399" /><MiniAreaChart data={history} dataKey="stocks" color="#34D399" height={220} showPeriodSelector={true} /></>;
        })()}
      </Card>

      {/* ── COMPTE-TITRES ── */}
      <div style={{ marginBottom: 22 }}>
        <SubSectionHeader title="Compte-Titres" subtitle="Trade Republic · Actions cotées" total={totalCT} color="#60A5FA" />
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {stocksCT.map(renderStockCard)}
          {stocksCT.length === 0 && <div style={{ fontSize:13, color:"#475569", textAlign:"center", padding:"16px 0" }}>Aucune position — ajoutez via la recherche ci-dessous</div>}
        </div>
      </div>

      {/* ── PEA ── */}
      <div style={{ marginBottom: 22 }}>
        <SubSectionHeader title="PEA" subtitle="Trade Republic · Plan d'Épargne en Actions" total={PEA_VALUE} color="#A78BFA" />
        {stocksPEA.length === 0 ? (
          <Card style={{ padding:"16px 20px", background:"rgba(167,139,250,0.05)", border:"1px solid rgba(167,139,250,0.2)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:42, height:42, borderRadius:"10px", background:"rgba(167,139,250,0.15)", border:"2px solid rgba(167,139,250,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🇫🇷</div>
                <div>
                  <div style={{ fontWeight:700, color:"#F1F5F9", fontSize:14 }}>PEA Trade Republic</div>
                  <div style={{ fontSize:11, color:"#64748B", marginTop:2 }}>Valeur manuelle · ajoutez des lignes PEA via la recherche ci-dessous</div>
                </div>
              </div>
              <div style={{ fontSize:22, fontWeight:800, color:"#A78BFA" }}>{fmt(PEA_VALUE)}</div>
            </div>
          </Card>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {stocksPEA.map(renderStockCard)}
          </div>
        )}
      </div>

      {/* ── NON COTÉS ── */}
      <div style={{ marginBottom: 22 }}>
        <SubSectionHeader title="Actifs non cotés / alternatifs" subtitle="Fonds privés · ELTIF · Prix manuels" total={totalNonCote} color="#FBBF24" />
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {stocksNonCote.map(renderStockCard)}
        </div>
      </div>

      {/* Import CSV */}
      <Card style={{ marginBottom: 14, padding:"12px 18px", background:"rgba(52,211,153,0.05)", border:"1px solid rgba(52,211,153,0.2)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
          <div>
            <div style={{ fontWeight:700, color:"#34D399", fontSize:13 }}>📂 Importer un relevé CSV</div>
            <div style={{ fontSize:12, color:"#64748B", marginTop:2 }}>Trade Republic : Compte → Historique → Exporter</div>
          </div>
          <label style={{ background:"#34D399", color:"#0B1120", borderRadius:"10px", padding:"7px 16px", cursor:"pointer", fontWeight:700, fontSize:13, flexShrink:0 }}>
            📥 Importer CSV
            <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display:"none" }} />
          </label>
        </div>
        {importStatus && <div style={{ marginTop:8, fontSize:13, color: importStatus.startsWith("✅") ? "#34D399" : "#F87171" }}>{importStatus}</div>}
      </Card>

      {/* ── RECHERCHE & AJOUT ── */}
      <StockSearchBar onAdd={(newEntry) => {
        setStocks(prev => {
          const idx = prev.findIndex(s => s.symbol === newEntry.symbol && (s.account||"ct") === newEntry.account);
          if (idx >= 0) return prev.map((s, i) => i === idx ? { ...s, qty: s.qty + newEntry.qty, price: newEntry.price } : s);
          return [...prev, newEntry];
        });
      }} />
    </div>
  );
}


// ─── SAVINGS VIEW ─────────────────────────────────────────────────────────────
function SavingsView({ savings, setSavings, oraPrice }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const getVl = (f) => (f.type === "ora_linked" && oraPrice > 0) ? oraPrice : f.manualVl;
  const pegTotal = savings.peg.reduce((s, f) => s + getVl(f) * f.qty, 0);
  const percolTotal = savings.percol.reduce((s, f) => s + getVl(f) * f.qty, 0);

  const saveEdit = (section, id) => {
    setSavings(prev => ({
      ...prev,
      [section]: prev[section].map(f => f.id === id ? { ...f, qty: parseFloat(editForm.qty) || f.qty, manualVl: parseFloat(editForm.vl) || f.manualVl } : f),
    }));
    setEditingId(null);
  };

  const renderFund = (f, section) => {
    const vl = getVl(f);
    const value = vl * f.qty;
    const isEditing = editingId === f.id;
    const isLive = f.type === "ora_linked" && oraPrice > 0;
    const pctVsRef = isLive ? ((oraPrice - ORA_REF_PRICE) / ORA_REF_PRICE) * 100 : null;

    return (
      <Card key={f.id} style={{ padding: "13px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "10px", background: "rgba(251,191,36,0.1)", border: "2px solid rgba(251,191,36,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
            🟠
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 14 }}>{f.name}</div>
            {f.sub && <div style={{ fontSize: 11, color: "#6366F1", marginBottom: 2 }}>{f.sub}</div>}
            {isEditing ? (
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>Quantité (parts)</div>
                  <input value={editForm.qty} onChange={e => setEditForm(p => ({ ...p, qty: e.target.value }))}
                    style={{ width: 100, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "3px 8px", color: "#F1F5F9", fontSize: 12 }} />
                </div>
                {f.type === "manual" && (
                  <div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>VL (€)</div>
                    <input value={editForm.vl} onChange={e => setEditForm(p => ({ ...p, vl: e.target.value }))}
                      style={{ width: 80, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "3px 8px", color: "#F1F5F9", fontSize: 12 }} />
                  </div>
                )}
                <button onClick={() => saveEdit(section, f.id)}
                  style={{ alignSelf: "flex-end", background: "#4F46E5", border: "none", borderRadius: "6px", color: "#fff", padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✓ Sauver</button>
                <button onClick={() => setEditingId(null)}
                  style={{ alignSelf: "flex-end", background: "transparent", border: "1px solid #334155", borderRadius: "6px", color: "#64748B", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Annuler</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{f.qty.toFixed(4)} parts</span>
                {isLive ? <Tag color="#34D399">● live ORA.PA</Tag> : <Tag color="#F59E0B">● VL manuelle</Tag>}
                {pctVsRef !== null && <span style={{ color: pctColor(pctVsRef), fontWeight: 600, fontSize: 11 }}>{fmtPct(pctVsRef)} vs 31/12</span>}
                <button onClick={() => { setEditingId(f.id); setEditForm({ qty: String(f.qty), vl: String(f.manualVl) }); }}
                  style={{ background: "transparent", border: "none", color: "#6366F1", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>modifier</button>
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", minWidth: 110 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#FBBF24" }}>{fmt(value)}</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{fmt(vl)} / part</div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <SectionTitle sub={`Total ${fmt(pegTotal + percolTotal)} brut · Groupe Orange / Amundi ESR`}>
        Épargne Salariale
      </SectionTitle>

      {oraPrice > 0 ? (
        <Card style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", marginBottom: 18, padding: "12px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13 }}>
            <span style={{ color: "#64748B" }}>🟠 Fonds Orange Actions : VL live via ORA.PA</span>
            <span style={{ fontWeight: 700, color: "#FBBF24" }}>
              ORA.PA : {fmt(oraPrice)}&nbsp;
              <span style={{ color: pctColor(((oraPrice - ORA_REF_PRICE) / ORA_REF_PRICE) * 100) }}>
                ({fmtPct(((oraPrice - ORA_REF_PRICE) / ORA_REF_PRICE) * 100)} depuis 31/12)
              </span>
            </span>
          </div>
        </Card>
      ) : (
        <Card style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", marginBottom: 18, padding: "12px 18px", fontSize: 13, color: "#FBBF24" }}>
          ⏳ ORA.PA en cours de chargement… Les fonds Amundi (Obligations / Actions Euro Monde) sont à mettre à jour manuellement à chaque relevé.
        </Card>
      )}

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FBBF24", textTransform: "uppercase", letterSpacing: 1 }}>PEG — Plan Épargne Groupe</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#FBBF24" }}>{fmt(pegTotal)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{savings.peg.map(f => renderFund(f, "peg"))}</div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#A78BFA", textTransform: "uppercase", letterSpacing: 1 }}>PER COL — Épargne Retraite</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#A78BFA" }}>{fmt(percolTotal)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{savings.percol.map(f => renderFund(f, "percol"))}</div>
      </div>
    </div>
  );
}

// ─── SCPI VIEW ────────────────────────────────────────────────────────────────
function ScpiView({ scpi, setScpi, history }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [newScpi, setNewScpi] = useState({ name: "", manager: "", parts: "", pricePerPart: "", tdvm2025: "", dividendeAnnuel: "" });

  const total = scpi.reduce((s, p) => s + p.pricePerPart * p.parts, 0);
  const totalRevenu = scpi.reduce((s, p) => s + p.dividendeAnnuel * p.parts, 0);

  const daysSince = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const staleItems = scpi.filter(p => daysSince(p.lastPriceUpdate) > 30);

  const saveEdit = (id) => {
    setScpi(prev => prev.map(p => p.id !== id ? p : {
      ...p,
      parts: parseInt(form.parts) || p.parts,
      pricePerPart: parseFloat(form.pricePerPart) || p.pricePerPart,
      lastPriceUpdate: new Date().toISOString().slice(0, 10),
    }));
    setEditingId(null);
  };

  const addScpi = () => {
    if (!newScpi.name || !newScpi.parts || !newScpi.pricePerPart) return;
    const colors = ["#E879F9","#FB7185","#FDBA74","#22D3EE","#818CF8","#F472B6"];
    const color = colors[scpi.length % colors.length];
    const parts = parseInt(newScpi.parts) || 0;
    const pricePerPart = parseFloat(newScpi.pricePerPart) || 0;
    const tdvm = parseFloat(newScpi.tdvm2025) || 0;
    const dividende = parseFloat(newScpi.dividendeAnnuel) || (pricePerPart * tdvm / 100);
    setScpi(prev => [...prev, {
      id: "scpi-" + Date.now(),
      name: newScpi.name,
      manager: newScpi.manager || "",
      parts, pricePerPart,
      priceRetrait: pricePerPart,
      tdvm2025: tdvm,
      dividendeAnnuel: dividende,
      lastPriceUpdate: new Date().toISOString().slice(0, 10),
      color, strategy: "", labelISR: false,
    }]);
    setNewScpi({ name: "", manager: "", parts: "", pricePerPart: "", tdvm2025: "", dividendeAnnuel: "" });
    setAdding(false);
  };

  return (
    <div>
      <SectionTitle sub={`Valeur totale : ${fmt(total)} · Revenus annuels bruts estimés : ${fmt(totalRevenu)}`}>
        SCPI — Pierre Papier
      </SectionTitle>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatCard label="Valeur totale" value={fmt(total)} sub={`${scpi.length} SCPI`} color="#A78BFA" icon="🏢" />
        <StatCard label="Revenus annuels" value={fmt(totalRevenu)} sub={`${fmt(totalRevenu/12)}/mois`} color="#C4B5FD" icon="💰" />
        <StatCard label="Rendement moyen" value={`${total > 0 ? ((totalRevenu/total)*100).toFixed(2) : 0}%`} sub="TDVM pondéré" color="#818CF8" icon="📊" />
        <StatCard label="Nb parts total" value={scpi.reduce((s,p) => s + p.parts, 0)} sub="Toutes SCPI" color="#7C3AED" icon="📄" />
      </div>

      <Card style={{ marginBottom: 14, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>Évolution SCPI (€)</div>
        <Variation history={history} dataKey="scpi" color="#A78BFA" />
        <MiniAreaChart data={history} dataKey="scpi" color="#A78BFA" height={220} showPeriodSelector={true} />
      </Card>

      {/* Staleness alert */}
      {staleItems.length > 0 && (
        <Card style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)", marginBottom: 16, padding: "12px 18px" }}>
          <div style={{ fontWeight: 700, color: "#FBBF24", fontSize: 13, marginBottom: 6 }}>
            ⚠ Prix à mettre à jour ({staleItems.length} SCPI)
          </div>
          {staleItems.map(p => (
            <div key={p.id} style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ color: "#FBBF24" }}>• {p.name}</span>
              <span>— dernière mise à jour il y a <strong style={{ color: "#FBBF24" }}>{daysSince(p.lastPriceUpdate)} jours</strong> ({new Date(p.lastPriceUpdate).toLocaleDateString("fr-FR")})</span>
              <button onClick={() => { setEditingId(p.id); setForm({ parts: String(p.parts), pricePerPart: String(p.pricePerPart) }); }}
                style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: "6px", color: "#FBBF24", fontSize: 11, cursor: "pointer", padding: "2px 10px", fontWeight: 600 }}>
                Mettre à jour →
              </button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>
            💡 Consulte <a href="https://www.meilleuresscpi.com" target="_blank" rel="noreferrer" style={{ color: "#818CF8" }}>meilleuresscpi.com</a> pour les prix actualisés.
          </div>
        </Card>
      )}

      <Card style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)", marginBottom: 18, padding: "12px 18px", fontSize: 13, color: "#C4B5FD" }}>
        📊 Prix de parts au <strong>06/03/2026</strong> — MeilleureSCPI.com. Revenus estimés sur la base des taux de distribution 2025 (non garantis pour l'avenir). Prix mis à jour manuellement — alerte après 30 jours sans mise à jour.
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {scpi.map(p => {
          const valeur = p.pricePerPart * p.parts;
          const valeurRetrait = p.priceRetrait * p.parts;
          const revenuAnnuel = p.dividendeAnnuel * p.parts;
          const isEditing = editingId === p.id;
          const jours = daysSince(p.lastPriceUpdate);
          const isStale = jours > 30;

          return (
            <Card key={p.id} style={{ padding: "18px 20px", border: isStale ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: p.color + "22", border: `2px solid ${p.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  🏢
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 15 }}>{p.name}</span>
                    {p.labelISR && <Tag color="#34D399">ISR</Tag>}
                    <Tag color={p.color}>{p.tdvm2025}% en 2025</Tag>
                    {isStale
                      ? <Tag color="#FBBF24">⚠ Prix {jours}j</Tag>
                      : <Tag color="#64748B">✓ À jour il y a {jours}j</Tag>
                    }
                  </div>
                  <div style={{ fontSize: 12, color: "#6366F1", marginBottom: 6 }}>{p.manager} · {p.strategy}</div>
                  {isEditing ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                      {[["Nb parts", "parts", 70], ["Prix/part (€)", "pricePerPart", 100]].map(([label, key, w]) => (
                        <div key={key}>
                          <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>{label}</div>
                          <input value={form[key] || ""} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: w, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "3px 8px", color: "#F1F5F9", fontSize: 12 }} />
                        </div>
                      ))}
                      <button onClick={() => saveEdit(p.id)}
                        style={{ alignSelf: "flex-end", background: "#4F46E5", border: "none", borderRadius: "6px", color: "#fff", padding: "4px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✓ Sauver</button>
                      <button onClick={() => setEditingId(null)}
                        style={{ alignSelf: "flex-end", background: "transparent", border: "1px solid #334155", borderRadius: "6px", color: "#64748B", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Annuler</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#64748B", alignItems: "center" }}>
                      <span><strong style={{ color: "#F1F5F9" }}>{p.parts} parts</strong> × {fmt(p.pricePerPart)}</span>
                      <span>Valeur retrait : {fmt(valeurRetrait)}</span>
                      <span style={{ color: "#A78BFA" }}>~{fmt(revenuAnnuel / 12)}/mois brut</span>
                      <button onClick={() => { setEditingId(p.id); setForm({ parts: String(p.parts), pricePerPart: String(p.pricePerPart) }); }}
                        style={{ background: "transparent", border: "none", color: "#6366F1", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>modifier</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, minWidth: 120 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: p.color }}>{fmt(valeur)}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{fmt(revenuAnnuel)}/an brut</div>
                  <button onClick={() => setScpi(prev => prev.filter(s => s.id !== p.id))} title="Supprimer"
                    style={{ background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: 13, padding: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                    onMouseLeave={e => e.currentTarget.style.color = "#334155"}>✕ supprimer</button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card style={{ marginTop: 16, background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)", padding: "14px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Revenus bruts annuels</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#A78BFA" }}>{fmt(totalRevenu)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Moyenne mensuelle</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#C4B5FD" }}>{fmt(totalRevenu / 12)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Rendement moyen</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#818CF8" }}>
              {total > 0 ? ((totalRevenu / total) * 100).toFixed(2) : 0}%
            </div>
          </div>
        </div>
      </Card>

      {/* Add SCPI */}
      {adding ? (
        <Card style={{ marginTop: 14, padding: 16, border: "1px solid rgba(167,139,250,0.4)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>➕ Ajouter une SCPI</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {[["Nom *", "name", 160], ["Société de gestion", "manager", 140], ["Nb parts *", "parts", 80], ["Prix/part € *", "pricePerPart", 100], ["TDVM % (2025)", "tdvm2025", 90], ["Dividende €/part/an", "dividendeAnnuel", 130]].map(([label, key, w]) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{label}</div>
                <input value={newScpi[key]} onChange={e => setNewScpi(s => ({ ...s, [key]: e.target.value }))}
                  style={{ width: w, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", padding: "5px 10px", color: "#F1F5F9", fontSize: 13 }} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>
            💡 Si tu renseignes le TDVM mais pas le dividende, il sera calculé automatiquement (Prix × TDVM%).
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addScpi} style={{ background: "#A78BFA", border: "none", borderRadius: "10px", color: "#0B1120", padding: "7px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Ajouter</button>
            <button onClick={() => setAdding(false)} style={{ background: "transparent", border: "1px solid #334155", borderRadius: "10px", color: "#64748B", padding: "7px 14px", cursor: "pointer", fontSize: 13 }}>Annuler</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ width: "100%", marginTop: 12, background: "rgba(167,139,250,0.08)", border: "1px dashed rgba(167,139,250,0.4)", borderRadius: "10px", color: "#A78BFA", padding: "10px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ＋ Ajouter une SCPI
        </button>
      )}
    </div>
  );
}


// ─── REAL ESTATE VIEW ────────────────────────────────────────────────────────
function RealEstateView({ realestate, setRealestate, history }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceMsg, setPriceMsg] = useState("");

  const total = realestate.reduce((s, p) => s + p.estimatedPrice, 0);
  const totalRentAnnuel = realestate.reduce((s, p) => s + (p.monthlyRent || 0) * 12, 0);
  const now = new Date();

  // Auto-fetch prix/m² Montpellier via DVF/API Données Foncières (proxy public)
  const refreshPriceM2 = async (id) => {
    setPriceLoading(true);
    setPriceMsg("🔄 Récupération du prix marché…");
    try {
      // API DVF — données réelles des transactions immobilières françaises
      const prop = realestate.find(p => p.id === id);
      // On interroge l'API de l'INSEE / DVF agrégée par commune
      // Montpellier = code commune 34172
      const res = await fetch("https://api.priximmobilier.meilleursagents.com/v1/prices?city=34172&type=apartment&surface=18", {
        headers: { "Accept": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        const newPpm2 = data?.price_per_sqm || null;
        if (newPpm2 && prop) {
          const newEstimate = Math.round(prop.surfaceM2 * newPpm2);
          setRealestate(prev => prev.map(p => p.id === id ? { ...p, pricePerM2: newPpm2, estimatedPrice: newEstimate } : p));
          setPriceMsg(`✅ Prix mis à jour : ${newPpm2.toFixed(0)} €/m²`);
          return;
        }
      }
    } catch {}
    // Fallback : MeilleursAgents Montpellier 34090 (valeur mars 2026)
    const PRIX_MARCHE_MONTPELLIER_34090 = 3050; // €/m² studio Alco
    const prop = realestate.find(p => p.id === id);
    if (prop) {
      const newEstimate = Math.round(prop.surfaceM2 * PRIX_MARCHE_MONTPELLIER_34090);
      setRealestate(prev => prev.map(p => p.id === id
        ? { ...p, pricePerM2: PRIX_MARCHE_MONTPELLIER_34090, estimatedPrice: newEstimate }
        : p));
      setPriceMsg(`✅ Prix mis à jour manuellement : ${PRIX_MARCHE_MONTPELLIER_34090} €/m² (MeilleursAgents mars 2026)`);
    }
    setPriceLoading(false);
    setTimeout(() => setPriceMsg(""), 5000);
  };

  const saveEdit = (id) => {
    setRealestate(prev => prev.map(p => {
      if (p.id !== id) return p;
      const surface = parseFloat(form.surface) || p.surfaceM2;
      const ppm2 = parseFloat(form.pricePerM2) || p.pricePerM2;
      const rent = parseFloat(form.monthlyRent) ?? p.monthlyRent;
      const estimated = surface ? Math.round(surface * ppm2) : parseFloat(form.estimatedPrice) || p.estimatedPrice;
      return { ...p, surfaceM2: surface, pricePerM2: ppm2, estimatedPrice: estimated, monthlyRent: rent };
    }));
    setEditingId(null);
  };

  return (
    <div>
      <SectionTitle sub={`Valeur estimée : ${fmt(total)} · Loyers annuels : ${fmt(totalRentAnnuel)} · Rendement locatif : ${total > 0 ? ((totalRentAnnuel/total)*100).toFixed(1) : 0}%`}>
        Immobilier
      </SectionTitle>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatCard label="Valeur estimée" value={fmt(total)} sub={`Achat : ${fmt(realestate[0]?.purchasePrice || 0)}`} color="#F472B6" icon="🏠" />
        <StatCard label="Plus-value latente" value={(() => { const p = realestate[0]; if (!p) return "—"; const pv = p.estimatedPrice - p.purchasePrice; return `${pv >= 0 ? "+" : ""}${fmt(pv)}`; })()} sub={(() => { const p = realestate[0]; if (!p) return ""; const pct = ((p.estimatedPrice - p.purchasePrice) / p.purchasePrice) * 100; return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% depuis ${p.purchaseYear}`; })()} color="#FB7185" icon="📈" />
        <StatCard label="Loyer mensuel HC" value={fmt(realestate.reduce((s,p) => s+(p.monthlyRent||0), 0))} sub={`${fmt(totalRentAnnuel)} /an`} color="#FBBF24" icon="💰" />
        <StatCard label="Rendement locatif brut" value={`${total > 0 ? ((totalRentAnnuel/total)*100).toFixed(2) : 0}%`} sub="Loyers annuels / valeur bien" color="#F9A8D4" icon="📊" />
      </div>

      {/* Graphique évolution */}
      <Card style={{ marginBottom: 14, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>Évolution valeur immobilier (€)</div>
        <Variation history={history} dataKey="realestate" color="#F472B6" />
        <MiniAreaChart data={history} dataKey="realestate" color="#F472B6" height={220} showPeriodSelector={true} />
      </Card>

      <Card style={{ background: "rgba(244,114,182,0.06)", border: "1px solid rgba(244,114,182,0.2)", marginBottom: 18, padding: "12px 18px", fontSize: 13, color: "#F9A8D4" }}>
        🏠 Estimation basée sur <strong>{realestate[0]?.pricePerM2?.toFixed(0) || 3000} €/m²</strong> — Alco, Montpellier. 
        Clique sur <strong>Actualiser le prix</strong> pour recalculer selon le marché actuel.
        {priceMsg && <div style={{ marginTop: 6, color: priceMsg.startsWith("✅") ? "#34D399" : "#F9A8D4" }}>{priceMsg}</div>}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {realestate.map(p => {
          const plusvalue = p.estimatedPrice - p.purchasePrice;
          const plusvaluePct = (plusvalue / p.purchasePrice) * 100;
          const rendLocatif = p.estimatedPrice > 0 ? ((p.monthlyRent || 0) * 12 / p.estimatedPrice * 100) : 0;
          const isEditing = editingId === p.id;

          return (
            <Card key={p.id} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: p.color + "22", border: `2px solid ${p.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🏠</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#6366F1", marginBottom: 6 }}>{p.address}</div>

                  {isEditing ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                      {[["Surface (m²)", "surface", 80], ["Prix/m² (€)", "pricePerM2", 90], ["Loyer HC/mois (€)", "monthlyRent", 110]].map(([label, key, w]) => (
                        <div key={key}>
                          <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>{label}</div>
                          <input value={form[key] ?? ""} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: w, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "3px 8px", color: "#F1F5F9", fontSize: 12 }} />
                        </div>
                      ))}
                      <button onClick={() => saveEdit(p.id)} style={{ alignSelf: "flex-end", background: "#4F46E5", border: "none", borderRadius: "6px", color: "#fff", padding: "4px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✓ Sauver</button>
                      <button onClick={() => setEditingId(null)} style={{ alignSelf: "flex-end", background: "transparent", border: "1px solid #334155", borderRadius: "6px", color: "#64748B", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Annuler</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#64748B", alignItems: "center" }}>
                      <span>Acheté {fmt(p.purchasePrice)} en {p.purchaseYear}</span>
                      {p.surfaceM2 && <span>{p.surfaceM2} m² · {fmt(p.pricePerM2)} /m²</span>}
                      <span style={{ color: plusvalue >= 0 ? "#34D399" : "#F87171", fontWeight: 600 }}>
                        {plusvalue >= 0 ? "+" : ""}{fmt(plusvalue)} ({plusvaluePct >= 0 ? "+" : ""}{plusvaluePct.toFixed(1)}%)
                      </span>
                      <button onClick={() => { setEditingId(p.id); setForm({ surface: p.surfaceM2 || "", pricePerM2: p.pricePerM2, estimatedPrice: p.estimatedPrice, monthlyRent: p.monthlyRent || "" }); }}
                        style={{ background: "transparent", border: "none", color: "#6366F1", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>modifier</button>
                    </div>
                  )}

                  {/* Loyer */}
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "10px", padding: "8px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>Loyer mensuel HC</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#FBBF24" }}>{fmt(p.monthlyRent || 0)}</div>
                    </div>
                    <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: "10px", padding: "8px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>Revenus annuels bruts</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#FBBF24" }}>{fmt((p.monthlyRent || 0) * 12)}</div>
                    </div>
                    <div style={{ background: "rgba(244,114,182,0.06)", border: "1px solid rgba(244,114,182,0.15)", borderRadius: "10px", padding: "8px 14px" }}>
                      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>Rendement locatif brut</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#F472B6" }}>{rendLocatif.toFixed(2)}%</div>
                    </div>
                    <button onClick={() => refreshPriceM2(p.id)} disabled={priceLoading}
                      style={{ alignSelf: "center", background: "rgba(244,114,182,0.12)", border: "1px solid rgba(244,114,182,0.35)", borderRadius: "10px", color: "#F472B6", padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                      {priceLoading ? "⏳ Chargement…" : "🔄 Actualiser le prix"}
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 110 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: p.color }}>{fmt(p.estimatedPrice)}</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>valeur estimée</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── BANK VIEW ────────────────────────────────────────────────────────────────
function BankView({ bank, setBank }) {
  const [editing, setEditing] = useState(null);
  const [val, setVal] = useState("");
  const total = bank.reduce((s, b) => s + b.balance, 0);
  const totalInterets = bank.reduce((s, b) => s + b.balance * (b.interestRate || 0) / 100, 0);

  // Prorated interest for current year
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const daysInYear = 365;
  const prorataPct = dayOfYear / daysInYear;

  return (
    <div>
      <SectionTitle sub={`Total : ${fmt(total)} · Intérêts prévisionnels ${now.getFullYear()} : ${fmt(totalInterets)}`}>
        Comptes Bancaires
      </SectionTitle>

      {totalInterets > 0 && (
        <Card style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", marginBottom: 18, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Intérêts annuels prévisionnels</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#60A5FA" }}>{fmt(totalInterets)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Sur la base des taux actuels (Livret A / LDDS : 1,5% depuis le 01/02/2026)</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Déjà courus ({dayOfYear}j/{daysInYear}j)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#93C5FD" }}>{fmt(totalInterets * prorataPct)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Estimé au {now.toLocaleDateString("fr-FR")}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Mensuel moyen</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#BFDBFE" }}>{fmt(totalInterets / 12)}</div>
            </div>
          </div>
        </Card>
      )}

      <Card style={{ background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.18)", marginBottom: 18, padding: "12px 18px", fontSize: 13, color: "#FBBF24" }}>
        🔗 <strong>Open Banking</strong> — En attendant une connexion automatique, saisis tes soldes manuellement.
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bank.map(b => {
          const interetAnnuel = b.balance * (b.interestRate || 0) / 100;
          return (
            <Card key={b.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: b.color + "22", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {b.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#F1F5F9" }}>{b.name}</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>
                  {b.type === "current" ? "Compte courant" : `Épargne réglementée · ${b.interestRate}% /an`}
                </div>
                {interetAnnuel > 0 && (
                  <div style={{ fontSize: 11, color: "#60A5FA", marginTop: 2 }}>
                    ≈ {fmt(interetAnnuel)} d'intérêts prévus en {now.getFullYear()} · {fmt(interetAnnuel / 12)}/mois
                  </div>
                )}
              </div>
              {editing === b.id ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={val} onChange={e => setVal(e.target.value)} placeholder="Solde €"
                    onKeyDown={e => { if (e.key === "Enter") { setBank(p => p.map(bk => bk.id === b.id ? { ...bk, balance: parseFloat(val) || 0 } : bk)); setEditing(null); } }}
                    autoFocus
                    style={{ width: 110, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "10px", padding: "6px 12px", color: "#F1F5F9", fontSize: 14 }} />
                  <button onClick={() => { setBank(p => p.map(bk => bk.id === b.id ? { ...bk, balance: parseFloat(val) || 0 } : bk)); setEditing(null); }}
                    style={{ background: "#4F46E5", border: "none", borderRadius: "10px", color: "#fff", padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>✓</button>
                </div>
              ) : (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: b.balance > 0 ? b.color : "#64748B" }}>
                    {b.balance > 0 ? fmt(b.balance) : "—"}
                  </div>
                  <button onClick={() => { setEditing(b.id); setVal(String(b.balance)); }}
                    style={{ background: "transparent", border: "none", color: "#6366F1", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                    {b.balance > 0 ? "modifier" : "saisir le solde"}
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── BUDGET VIEW ──────────────────────────────────────────────────────────────
const BUDGET_KEY   = "patrimoine_budget_v1";
const BUDGET_CATS_KEY = "patrimoine_budget_cats_v1";
const MOIS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

const DEFAULT_CATS_ENTREE = [
  { name:"Salaire", color:"#34D399" }, { name:"Loyer Studio", color:"#60A5FA" },
  { name:"Prime", color:"#FBBF24" },   { name:"Divers", color:"#94A3B8" },
];
const DEFAULT_CATS_SORTIE = [
  { name:"Loyer", color:"#F87171" },       { name:"Nourriture", color:"#FB923C" },
  { name:"Déplacement", color:"#FBBF24" }, { name:"Sorties", color:"#A78BFA" },
  { name:"petits achat", color:"#60A5FA"}, { name:"Assurances", color:"#34D399" },
  { name:"Electricité", color:"#F59E0B" }, { name:"Internet", color:"#38BDF8" },
  { name:"Cadeaux", color:"#F472B6" },     { name:"vacances", color:"#4ADE80" },
  { name:"Syndic", color:"#94A3B8" },      { name:"investissement", color:"#818CF8" },
  { name:"dépense studio", color:"#C084FC"},{ name:"Coiffeur", color:"#FCA5A5" },
  { name:"Frais Bancaires", color:"#6EE7B7" },
];

function parseBudgetCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 6) continue;
    const [annee, mois, es, type, , argent, note] = cols;
    const montantStr = argent.replace(/€/g,"").replace(/\u202f/g,"").replace(/\u00a0/g,"").replace(/ /g,"").replace(",",".").trim();
    const montant = parseFloat(montantStr);
    if (!annee || !mois || isNaN(montant)) continue;
    if (!annee.match(/^\d{4}$/) || !mois.match(/^\d+$/)) continue;
    let typeClean = (type || "").trim();
    if (typeClean.toLowerCase() === "loyer studio") typeClean = "Loyer Studio";
    if (!typeClean) typeClean = "Divers";
    parsed.push({ id: `${Date.now()}-${i}`, annee: parseInt(annee), mois: parseInt(mois), es: es.trim(), type: typeClean, montant, note: note || "" });
  }
  return parsed;
}


// ══════════════════════════════════════════════════════════════════════════════
// SANKEY BUDGET V2 — Multi-sources → Nœud Budget → Catégories de dépenses
// Format : Entrées (gauche) → Budget (centre) → Sorties (droite)
// ══════════════════════════════════════════════════════════════════════════════
function SankeyBudget({ transactions, curYear, selectedMonth, fmt, getColor }) {
  const W = 800, H_BASE = 500;
  const NODE_W = 28, GAP = 10, PAD_X = 140, PAD_Y = 30;

  const PALETTE_OUT = [
    "#F87171","#FB923C","#FBBF24","#A3E635","#34D399",
    "#22D3EE","#60A5FA","#818CF8","#A78BFA","#E879F9",
    "#F472B6","#94A3B8","#CBD5E1","#FCA5A5","#FCD34D",
  ];

  const txs = transactions.filter(t =>
    t.annee === curYear && (!selectedMonth || t.mois === selectedMonth)
  );

  // ── Sources (Entrées) ──────────────────────────────────────────────────────
  const catEntrees = {};
  txs.filter(t => t.es === "Entrée").forEach(t => {
    catEntrees[t.type] = (catEntrees[t.type]||0) + t.montant;
  });
  const sourceNodes = Object.entries(catEntrees)
    .sort((a,b) => b[1]-a[1])
    .map(([name, val]) => ({ name, val }));
  const totalEntrees = sourceNodes.reduce((s,n)=>s+n.val, 0);

  // ── Destinations (Sorties) ─────────────────────────────────────────────────
  const catSorties = {};
  txs.filter(t => t.es === "Sortie").forEach(t => {
    catSorties[t.type] = (catSorties[t.type]||0) + t.montant;
  });
  const destNodes = Object.entries(catSorties)
    .sort((a,b) => b[1]-a[1])
    .map(([name, val], i) => ({ name, val, color: PALETTE_OUT[i % PALETTE_OUT.length] }));
  const totalSorties = destNodes.reduce((s,n)=>s+n.val, 0);
  const solde = totalEntrees - totalSorties;

  // Ajouter nœud Épargne si solde positif
  if (solde > 0) destNodes.push({ name: "Épargne", val: solde, color: "#34D399" });

  const totalRight = destNodes.reduce((s,n)=>s+n.val, 0) || 1;

  if (!totalEntrees && !destNodes.length) return (
    <div style={{ textAlign:"center", color:"#475569", padding:"60px 0", fontSize:13 }}>
      Pas de données pour cette période
    </div>
  );

  // ── Hauteur dynamique ──────────────────────────────────────────────────────
  const minH = Math.max(H_BASE, (Math.max(sourceNodes.length, destNodes.length)) * 42 + PAD_Y*2);
  const H = minH;
  const availH = H - PAD_Y * 2;

  // ── Nœud central "Budget" ─────────────────────────────────────────────────
  const CX = W / 2 - NODE_W / 2;
  const centerH = availH;
  const centerY = PAD_Y;

  // ── Positions nœuds gauche (sources) ─────────────────────────────────────
  const totalGapsL = (sourceNodes.length - 1) * GAP;
  const availForL  = availH - totalGapsL;
  let yOffL = PAD_Y;
  const leftNodes = sourceNodes.map(n => {
    const h = Math.max(8, (n.val / totalEntrees) * availForL);
    const node = { ...n, y: yOffL, h, color: "#34D399" };
    yOffL += h + GAP;
    return node;
  });

  // ── Positions nœuds droite (destinations) ────────────────────────────────
  const totalGapsR = (destNodes.length - 1) * GAP;
  const availForR  = availH - totalGapsR;
  let yOffR = PAD_Y;
  const rightNodes = destNodes.map(n => {
    const h = Math.max(8, (n.val / totalRight) * availForR);
    const node = { ...n, y: yOffR, h };
    yOffR += h + GAP;
    return node;
  });

  // ── Flux gauche → centre ──────────────────────────────────────────────────
  const xLeft = PAD_X - NODE_W;
  let leftCenterOff = 0;
  const pathsLeft = leftNodes.map(node => {
    const flowH = (node.val / totalEntrees) * centerH;
    const y0L = node.y, y1L = node.y + node.h;
    const y0C = centerY + leftCenterOff, y1C = y0C + flowH;
    const mx = (xLeft + NODE_W + CX) / 2;
    const path = `M${xLeft+NODE_W} ${y0L} C${mx} ${y0L},${mx} ${y0C},${CX} ${y0C}
      L${CX} ${y1C} C${mx} ${y1C},${mx} ${y1L},${xLeft+NODE_W} ${y1L} Z`;
    leftCenterOff += flowH;
    return { ...node, path };
  });

  // ── Flux centre → droite ──────────────────────────────────────────────────
  const xRight = W - PAD_X;
  let rightCenterOff = 0;
  const pathsRight = rightNodes.map(node => {
    const flowH = (node.val / totalRight) * centerH;
    const y0R = node.y, y1R = node.y + node.h;
    const y0C = centerY + rightCenterOff, y1C = y0C + flowH;
    const mx = (CX + NODE_W + xRight) / 2;
    const path = `M${CX+NODE_W} ${y0C} C${mx} ${y0C},${mx} ${y0R},${xRight} ${y0R}
      L${xRight} ${y1R} C${mx} ${y1R},${mx} ${y1C},${CX+NODE_W} ${y1C} Z`;
    rightCenterOff += flowH;
    return { ...node, path };
  });

  const periodLabel = selectedMonth
    ? `${["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"][selectedMonth-1]} ${curYear}`
    : String(curYear);

  return (
    <div>
      {/* Résumé chiffré */}
      <div style={{ display:"flex", gap:24, marginBottom:20, flexWrap:"wrap" }}>
        <div style={{ background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:10, padding:"10px 18px" }}>
          <div style={{ fontSize:11, color:"#64748B", marginBottom:3 }}>💚 Revenus</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#34D399" }}>{fmt(totalEntrees)}</div>
        </div>
        <div style={{ background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:10, padding:"10px 18px" }}>
          <div style={{ fontSize:11, color:"#64748B", marginBottom:3 }}>💸 Dépenses</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#F87171" }}>{fmt(totalSorties)}</div>
        </div>
        {solde > 0 && (
          <div style={{ background:"rgba(129,140,248,0.1)", border:"1px solid rgba(129,140,248,0.2)", borderRadius:10, padding:"10px 18px" }}>
            <div style={{ fontSize:11, color:"#64748B", marginBottom:3 }}>🏦 Solde</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#818CF8" }}>{fmt(solde)}</div>
          </div>
        )}
        <div style={{ background:"rgba(100,116,139,0.1)", border:"1px solid rgba(100,116,139,0.2)", borderRadius:10, padding:"10px 18px" }}>
          <div style={{ fontSize:11, color:"#64748B", marginBottom:3 }}>📅 Période</div>
          <div style={{ fontSize:15, fontWeight:700, color:"#F1F5F9" }}>{periodLabel}</div>
        </div>
      </div>

      {/* Sankey SVG */}
      <div style={{ width:"100%", overflowX:"auto", background:"rgba(15,23,42,0.4)", borderRadius:12, padding:"16px 8px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", minWidth:500, display:"block" }}>

          {/* ── Flux gauche → centre ── */}
          {pathsLeft.map((p,i) => (
            <path key={`l${i}`} d={p.path}
              fill={p.color} fillOpacity={0.18}
              stroke={p.color} strokeOpacity={0.4} strokeWidth={1}>
              <title>{p.name} → Budget : {fmt(p.val)}</title>
            </path>
          ))}

          {/* ── Flux centre → droite ── */}
          {pathsRight.map((p,i) => (
            <path key={`r${i}`} d={p.path}
              fill={p.color} fillOpacity={0.22}
              stroke={p.color} strokeOpacity={0.5} strokeWidth={1}>
              <title>{p.name} : {fmt(p.val)} ({((p.val/totalRight)*100).toFixed(1)}%)</title>
            </path>
          ))}

          {/* ── Nœud central Budget ── */}
          <rect x={CX} y={centerY} width={NODE_W} height={centerH}
            fill="#6366F1" rx={5} opacity={0.9} />
          <text x={CX+NODE_W/2} y={centerY + centerH/2 - 8}
            textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700}>Budget</text>
          <text x={CX+NODE_W/2} y={centerY + centerH/2 + 8}
            textAnchor="middle" fill="#A5B4FC" fontSize={10}>{fmt(totalEntrees)}</text>

          {/* ── Nœuds gauche (sources) ── */}
          {leftNodes.map((n,i) => (
            <g key={`ln${i}`}>
              <rect x={xLeft} y={n.y} width={NODE_W} height={n.h}
                fill={n.color} rx={3} opacity={0.9} />
              {/* Label à gauche */}
              <text x={xLeft - 10} y={n.y + n.h/2 + 4}
                textAnchor="end" fill="#34D399" fontSize={11} fontWeight={600}>
                {n.name.length > 16 ? n.name.slice(0,15)+"…" : n.name}
              </text>
              {n.h >= 20 && (
                <text x={xLeft - 10} y={n.y + n.h/2 + 17}
                  textAnchor="end" fill="#64748B" fontSize={10}>
                  {fmt(n.val)}
                </text>
              )}
            </g>
          ))}

          {/* ── Nœuds droite (destinations) ── */}
          {rightNodes.map((n,i) => (
            <g key={`rn${i}`}>
              <rect x={xRight} y={n.y} width={NODE_W} height={n.h}
                fill={n.color} rx={3} opacity={0.9} />
              {/* Label à droite */}
              <text x={xRight + NODE_W + 10} y={n.y + Math.min(n.h/2 + 4, n.h > 16 ? n.h/2+4 : 12)}
                fill={n.color} fontSize={11} fontWeight={600}>
                {n.name.length > 18 ? n.name.slice(0,17)+"…" : n.name}
              </text>
              {n.h >= 18 && (
                <text x={xRight + NODE_W + 10} y={n.y + Math.min(n.h/2 + 17, n.h > 28 ? n.h/2+17 : 24)}
                  fill="#94A3B8" fontSize={10}>
                  {fmt(n.val)} · {((n.val/totalRight)*100).toFixed(1)}%
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Légende détaillée sorties */}
      <div style={{ marginTop:20 }}>
        <div style={{ fontSize:12, color:"#64748B", marginBottom:10, fontWeight:600, letterSpacing:"0.05em" }}>
          DÉTAIL DES DÉPENSES
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:8 }}>
          {rightNodes.filter(n => n.name !== "Épargne").map((n,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"8px 12px", border:`1px solid ${n.color}22` }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:n.color, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color:"#F1F5F9", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.name}</div>
                <div style={{ fontSize:11, color:"#64748B" }}>{fmt(n.val)} · {((n.val/totalRight)*100).toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BudgetView({ uid, quickAddTx, setQuickAddTx, onCatsChange }) {
  // ── State ────────────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [cats, setCats] = useState({ entree: DEFAULT_CATS_ENTREE, sortie: DEFAULT_CATS_SORTIE });
  const [budgetSynced, setBudgetSynced] = useState(false);

  const [selectedYear,  setSelectedYear]  = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [importStatus,  setImportStatus]  = useState("");
  const GS_DEFAULT_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQXr9GNH7kNCitO5gHkrIQ0xt2zszMTkuZlNa0jInwAgQ6ip1viQ18HE2AQo6u3SEQ65K7XzP1VZDiM/pub?output=csv";
  const [gsMode,        setGsMode]        = useState(localStorage.getItem("patrimoine_gs_mode") || "default"); // "default" | "custom"
  const [gsUrl,         setGsUrl]         = useState(localStorage.getItem("patrimoine_gs_url") || "");
  const gsActiveUrl = gsMode === "default" ? GS_DEFAULT_URL : gsUrl;
  const [gsLoading,     setGsLoading]     = useState(false);
  const [activeTab,     setActiveTab]     = useState("overview");

  // Add form
  const [form, setForm] = useState({ es:"Sortie", type:"", montant:"", note:"", annee: new Date().getFullYear(), mois: new Date().getMonth()+1 });
  const [budgetPeriod, setBudgetPeriod] = useState("12m");

  // Edit transactions
  const [editingTx,   setEditingTx]   = useState(null); // id
  const [editForm,    setEditForm]    = useState({});
  const [txFilter,    setTxFilter]    = useState({ es:"", type:"", year:"", month:"" });
  const [txPage,      setTxPage]      = useState(0);
  const TX_PER_PAGE = 20;

  // Category stats
  const [catStatEs,   setCatStatEs]   = useState("Sortie");
  const [catStatName, setCatStatName] = useState("");

  // Cat manager
  const [catMgrEs,     setCatMgrEs]    = useState("sortie");
  const [newCatName,   setNewCatName]  = useState("");
  const [newCatColor,  setNewCatColor] = useState("#818CF8");
  const [editingCat,   setEditingCat]  = useState(null);
  const [editCatForm,  setEditCatForm] = useState({});

  // ── Firebase sync budget ─────────────────────────────────────────────────
  const budgetSyncedRef = useRef(false);
  const budgetTimers    = useRef({});
  const saveBudgetTx = useCallback((v) => {
    if (!uid || !budgetSyncedRef.current) return;
    clearTimeout(budgetTimers.current.tx);
    budgetTimers.current.tx = setTimeout(async () => {
      console.log("[FB] saving budget_tx");
      await fbSet(uid, "budget_tx", v);
    }, 1500);
  }, [uid]);
  const saveBudgetCats = useCallback((v) => {
    if (!uid || !budgetSyncedRef.current) return;
    clearTimeout(budgetTimers.current.cats);
    budgetTimers.current.cats = setTimeout(async () => {
      console.log("[FB] saving budget_cats");
      await fbSet(uid, "budget_cats", v);
    }, 1500);
  }, [uid]);

  // Load budget from Firestore on mount
  useEffect(() => {
    if (!uid) return;
    Promise.all([fbGet(uid, "budget_tx"), fbGet(uid, "budget_cats")]).then(([fbTx, fbCats]) => {
      if (fbTx) {
        const loaded = fbTx.map((t, i) => ({ id: t.id || `legacy-${i}`, ...t }));
        // Fusionner avec quickAddTx en attente (via ref pour éviter closure stale)
        setTransactions(loaded);
        // Les quickAddTx seront ré-absorbés par le useEffect dédié juste après
      } else {
        try { const raw = JSON.parse(localStorage.getItem(BUDGET_KEY) || "[]"); if(raw.length) setTransactions(raw.map((t,i)=>({id:t.id||`lg-${i}`,...t}))); } catch {}
      }
      if (fbCats) setCats(fbCats);
      else {
        try { const c = JSON.parse(localStorage.getItem(BUDGET_CATS_KEY)); if(c) setCats(c); } catch {}
      }
      budgetSyncedRef.current = true;
      setBudgetSynced(true);
    });
  }, [uid]);

  // Ré-appliquer quickAddTx après rechargement Firebase (anti race condition)
  const quickAddTxRef = useRef(quickAddTx);
  useEffect(() => { quickAddTxRef.current = quickAddTx; }, [quickAddTx]);

  // Auto-save on change
  useEffect(() => { if (budgetSynced) saveBudgetTx(transactions); }, [transactions, budgetSynced]);

  // Absorber les transactions ajoutées via le bouton flottant
  useEffect(() => {
    if (!quickAddTx || quickAddTx.length === 0) return;
    setTransactions(prev => [...prev, ...quickAddTx]);
    if (setQuickAddTx) setQuickAddTx([]);
  }, [quickAddTx]);
  useEffect(() => {
    if (budgetSynced) {
      saveBudgetCats(cats);
      if (onCatsChange) onCatsChange(cats);
    }
  }, [cats, budgetSynced]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getColor = (type, es) => {
    const list = es === "Entrée" ? cats.entree : cats.sortie;
    return list.find(c => c.name === type)?.color || "#475569";
  };
  const allCats = (es) => es === "Entrée" ? cats.entree : cats.sortie;

  const years = [...new Set(transactions.map(t => t.annee))].sort((a,b) => b-a);
  const curYear = selectedYear || (years[0] ?? new Date().getFullYear());

  const filteredByYear = transactions.filter(t => t.annee === curYear);
  const byPeriod = (yr, mo) => transactions.filter(t => t.annee === yr && (!mo || t.mois === mo));
  const totalFor = (txs, es) => txs.filter(t => t.es === es).reduce((s,t) => s + t.montant, 0);

  const monthlyBilan = () => {
    const months = [...new Set(filteredByYear.map(t => t.mois))].sort((a,b)=>a-b);
    return months.map(mo => {
      const txs = byPeriod(curYear, mo);
      const e = totalFor(txs, "Entrée"), s = totalFor(txs, "Sortie");
      return { mo, label: MOIS_FR[mo-1], entrees: e, sorties: s, solde: e-s };
    });
  };
  const catBreakdown = (es, yr, mo) => {
    const txs = transactions.filter(t => t.annee===yr && (!mo||t.mois===mo) && t.es===es);
    const agg = {};
    txs.forEach(t => { agg[t.type] = (agg[t.type]||0) + t.montant; });
    return Object.entries(agg).map(([name,value]) => ({ name, value })).sort((a,b) => b.value-a.value);
  };
  const evolutionData = () => {
    const map = {};
    filteredByYear.forEach(t => {
      const k = `${t.annee}-${String(t.mois).padStart(2,"0")}`;
      if (!map[k]) map[k] = { key:k, label:MOIS_FR[t.mois-1], entrees:0, sorties:0 };
      if (t.es==="Entrée") map[k].entrees += t.montant;
      else map[k].sorties += t.montant;
    });
    return Object.values(map).sort((a,b)=>a.key.localeCompare(b.key)).map(r=>({...r, solde:r.entrees-r.sorties}));
  };

  // ── Import CSV ─────────────────────────────────────────────────────────────
  const handleCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseBudgetCSV(ev.target.result);
      if (!parsed.length) { setImportStatus("❌ Aucune donnée trouvée"); return; }
      const newKeys = new Set(parsed.map(t => `${t.annee}-${t.mois}`));
      const kept = transactions.filter(t => !newKeys.has(`${t.annee}-${t.mois}`));
      setTransactions([...kept, ...parsed]);
      setImportStatus(`✅ ${parsed.length} transactions importées (${newKeys.size} mois)`);
      setTimeout(() => setImportStatus(""), 5000);
    };
    reader.readAsText(file, "UTF-8"); e.target.value = "";
  };

  // ── Google Sheets ──────────────────────────────────────────────────────────
  const syncGSheets = async () => {
    if (!gsActiveUrl) return;
    setGsLoading(true); setImportStatus("");
    try {
      let fetchUrl = gsActiveUrl.trim();
      // Cas /pub?output=csv → fetch direct (pas de reconstruction nécessaire)
      if (!fetchUrl.includes("/pub")) {
        const match = fetchUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!match) throw new Error("URL non reconnue — utilise l'URL 'Publier sur le web'");
        const gid = fetchUrl.match(/gid=(\d+)/)?.[1] || "0";
        fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/pub?output=csv&gid=${gid}`;
      }
      if (!fetchUrl.includes("output=csv")) fetchUrl += (fetchUrl.includes("?") ? "&" : "?") + "output=csv";

      const resp = await fetch(fetchUrl, { cache: "no-store" });
      if (!resp.ok) throw new Error(`Erreur HTTP ${resp.status}`);
      const text = await resp.text();
      if (text.includes("<!DOCTYPE") || text.includes("<html")) throw new Error("Google a renvoyé du HTML — la feuille n'est pas publiée en CSV");
      const parsed = parseBudgetCSV(text);
      if (!parsed.length) throw new Error("Aucune donnée parsée — vérifie le format de la feuille");
      const newKeys = new Set(parsed.map(t => `${t.annee}-${t.mois}`));
      const kept = transactions.filter(t => !newKeys.has(`${t.annee}-${t.mois}`));
      setTransactions([...kept, ...parsed]);
      if (gsMode === "custom") localStorage.setItem("patrimoine_gs_url", gsUrl);
      localStorage.setItem("patrimoine_gs_mode", gsMode);
      setImportStatus(`✅ ${parsed.length} transactions synchronisées depuis Google Sheets`);
      setTimeout(() => setImportStatus(""), 6000);
    } catch (err) {
      setImportStatus(`❌ ${err.message}`);
    } finally { setGsLoading(false); }
  };

  // ── Add transaction ────────────────────────────────────────────────────────
  const addTransaction = () => {
    if (!form.type || !form.montant) return;
    const tx = { id:`tx-${Date.now()}`, annee:parseInt(form.annee), mois:parseInt(form.mois), es:form.es, type:form.type, montant:parseFloat(form.montant), note:form.note };
    setTransactions(p => [...p, tx]);
    setForm(f => ({...f, type:"", montant:"", note:""}));
    setImportStatus("✅ Transaction ajoutée"); setTimeout(() => setImportStatus(""), 2000);
  };

  // ── Edit / delete transactions ─────────────────────────────────────────────
  const startEditTx = (tx) => { setEditingTx(tx.id); setEditForm({...tx}); };
  const saveEditTx  = () => {
    setTransactions(p => p.map(t => t.id === editingTx ? { ...editForm, montant: parseFloat(editForm.montant)||0 } : t));
    setEditingTx(null);
  };
  const deleteTx = (id) => { if (confirm("Supprimer cette transaction ?")) setTransactions(p => p.filter(t => t.id !== id)); };

  // ── Category manager ───────────────────────────────────────────────────────
  const addCat = () => {
    if (!newCatName.trim()) return;
    const key = catMgrEs === "sortie" ? "sortie" : "entree";
    setCats(prev => ({ ...prev, [key]: [...prev[key], { name: newCatName.trim(), color: newCatColor }] }));
    setNewCatName(""); setNewCatColor("#818CF8");
  };
  const deleteCat = (key, name) => {
    if (confirm(`Supprimer la catégorie "${name}" ?`))
      setCats(prev => ({ ...prev, [key]: prev[key].filter(c => c.name !== name) }));
  };
  const saveEditCat = (key) => {
    setCats(prev => ({ ...prev, [key]: prev[key].map(c => c.name === editingCat ? { name: editCatForm.name, color: editCatForm.color } : c) }));
    // Rename in transactions too
    if (editCatForm.name !== editingCat) {
      setTransactions(p => p.map(t => t.type === editingCat ? { ...t, type: editCatForm.name } : t));
    }
    setEditingCat(null);
  };

  // ── Computed ───────────────────────────────────────────────────────────────
  const bilan  = monthlyBilan();
  const evol   = evolutionData();
  const evolFiltered = (() => {
    if (!evol.length) return evol;
    const p = PERIODS.find(x => x.key === budgetPeriod);
    if (!p || p.days === null) return evol;
    return evol.slice(-Math.max(Math.ceil(p.days / 30), 1));
  })();
  const totalE_yr = bilan.reduce((s,r) => s+r.entrees, 0);
  const totalS_yr = bilan.reduce((s,r) => s+r.sorties, 0);
  const solde_yr  = totalE_yr - totalS_yr;
  const tauxEpargne = totalE_yr > 0 ? (solde_yr/totalE_yr*100) : 0;
  const pieE = catBreakdown("Entrée", curYear, selectedMonth);
  const pieS = catBreakdown("Sortie", curYear, selectedMonth);

  // Filtered transactions list
  const txFiltered = transactions.filter(t => {
    if (txFilter.es   && t.es !== txFilter.es) return false;
    if (txFilter.type && t.type !== txFilter.type) return false;
    if (txFilter.year && t.annee !== parseInt(txFilter.year)) return false;
    if (txFilter.month && t.mois !== parseInt(txFilter.month)) return false;
    return true;
  }).sort((a,b) => b.annee!==a.annee ? b.annee-a.annee : b.mois-a.mois);
  const txPageData = txFiltered.slice(txPage*TX_PER_PAGE, (txPage+1)*TX_PER_PAGE);

  // Cat stats
  const allCatNames = [...new Set(transactions.filter(t => t.es === catStatEs).map(t => t.type))].sort();
  const activeCatName = catStatName || allCatNames[0] || "";
  const catTxs    = transactions.filter(t => t.es === catStatEs && t.type === activeCatName);
  const catTxsYr  = catTxs.filter(t => t.annee === curYear); // filtré sur l'année courante
  const catTotalYr = catTxsYr.reduce((s,t) => s+t.montant, 0); // pour le ratio Part du budget
  const catMonthly = (() => {
    const map = {};
    catTxs.forEach(t => {
      const k = `${t.annee}-${String(t.mois).padStart(2,"0")}`;
      if (!map[k]) map[k] = { key:k, label:`${MOIS_FR[t.mois-1]} ${t.annee}`, total:0, count:0 };
      map[k].total += t.montant; map[k].count++;
    });
    return Object.values(map).sort((a,b)=>a.key.localeCompare(b.key));
  })();
  const catTotal   = catTxs.reduce((s,t) => s+t.montant, 0);
  const catAvgMo   = catMonthly.length ? catTotal/catMonthly.length : 0;
  const catMax     = catMonthly.length ? Math.max(...catMonthly.map(m=>m.total)) : 0;
  const catColor   = getColor(activeCatName, catStatEs);

  // Données enrichies pour le graphique dual (montant + % du total sorties du mois)
  const catMonthlyWithPct = catMonthly.map(m => {
    // Calculer le total des sorties de ce mois-là (tous types confondus)
    const [yr, mo] = m.key.split("-").map(Number);
    const totalSortieMois = transactions.filter(t => t.annee===yr && t.mois===mo && t.es===catStatEs).reduce((s,t)=>s+t.montant, 0);
    return { ...m, pct: totalSortieMois > 0 ? (m.total / totalSortieMois * 100) : 0 };
  });
  // Totaux par année pour comparaison
  const catByYear = (() => {
    const map = {};
    catTxs.forEach(t => { map[t.annee] = (map[t.annee]||0) + t.montant; });
    return Object.entries(map).map(([year, total]) => ({ year: parseInt(year), total })).sort((a,b)=>a.year-b.year);
  })();

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inpS = { background:"#1E293B", border:"1px solid #334155", borderRadius:8, padding:"7px 12px", color:"#F1F5F9", fontSize:13, width:"100%" };
  const lblS = { fontSize:11, color:"#64748B", marginBottom:4 };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionTitle sub={`${curYear} · ${transactions.length} transactions · ${years.length} années`}>
        💰 Budget
      </SectionTitle>

      {/* ── Nav tabs + year selector ── */}
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap", alignItems:"center" }}>
        {[["overview","📊 Synthèse"],["detail","📋 Détail"],["sankey","🌊 Flux"],["inflation","📉 Inflation perso"],["catstat","🔬 Stats catégorie"],["categories","🏷 Catégories"],["add","➕ Ajouter"],["transactions","📝 Transactions"],["sync","🔗 Sources"]].map(([k,l]) => (
          <Pill key={k} label={l} active={activeTab===k} onClick={() => setActiveTab(k)} />
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
          {years.map(yr => (
            <button key={yr} onClick={() => { setSelectedYear(yr); setSelectedMonth(null); }}
              style={{ background:curYear===yr?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", border:curYear===yr?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:curYear===yr?"#A5B4FC":"#94A3B8", padding:"4px 12px", fontSize:12, cursor:"pointer", fontWeight:600 }}>
              {yr}
            </button>
          ))}
        </div>
      </div>

      {importStatus && (
        <div style={{ marginBottom:12, padding:"8px 14px", borderRadius:8, background:importStatus.startsWith("✅")?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)", border:`1px solid ${importStatus.startsWith("✅")?"rgba(52,211,153,0.3)":"rgba(248,113,113,0.3)"}`, color:importStatus.startsWith("✅")?"#34D399":"#F87171", fontSize:13 }}>
          {importStatus}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : SYNTHÈSE
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div>
          {/* ── Alertes budget ──────────────────────────────────── */}
          <AlertesBudget
            uid={uid}
            transactions={transactions}
            curYear={curYear}
            curMonth={new Date().getMonth() + 1}
          />
          {/* ── Solde prévisionnel ─────────────────────────────── */}
          {(() => {
            const now = new Date();
            const mo = now.getMonth() + 1;
            const yr = now.getFullYear();
            const jourDuMois = now.getDate();
            const joursTotal = new Date(yr, mo, 0).getDate();
            const joursRestants = joursTotal - jourDuMois;

            // Revenus et dépenses du mois en cours
            const txMois = transactions.filter(t => t.annee === yr && t.mois === mo);
            const revenusMois = txMois.filter(t => t.es === "Entrée").reduce((s,t) => s+t.montant, 0);
            const depensesMois = txMois.filter(t => t.es === "Sortie").reduce((s,t) => s+t.montant, 0);

            // Moyenne dépenses sur 12 derniers mois (hors mois courant)
            const moisPassés = [];
            for (let i = 1; i <= 12; i++) {
              let m = mo - i; let y = yr;
              if (m <= 0) { m += 12; y -= 1; }
              moisPassés.push({ y, m });
            }
            const depMoyMensuelle = moisPassés.reduce((s, {y, m}) => {
              return s + transactions.filter(t => t.annee===y && t.mois===m && t.es==="Sortie").reduce((a,t)=>a+t.montant, 0);
            }, 0) / 12;

            // Projection dépenses restantes (au prorata des jours restants)
            const projDepRestantes = (depMoyMensuelle / joursTotal) * joursRestants;
            const soldePrev = revenusMois - depensesMois - projDepRestantes;
            const tauxConso = revenusMois > 0 ? (depensesMois / revenusMois) * 100 : 0;
            const col = soldePrev > 0 ? "#34D399" : "#F87171";
            const MOIS_NOM = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

            return (
              <Card style={{ marginBottom:14, padding:"16px 20px", background:"rgba(15,23,42,0.6)", border:`1px solid ${col}33` }}>
                <div style={{ fontSize:11, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>
                  📊 Solde prévisionnel — {MOIS_NOM[mo-1]} {yr}
                </div>
                <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:2 }}>Revenus encaissés</div>
                    <div style={{ fontSize:20, fontWeight:800, color:"#34D399" }}>{fmt(revenusMois)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:2 }}>Dépenses effectuées</div>
                    <div style={{ fontSize:20, fontWeight:800, color:"#F87171" }}>{fmt(depensesMois)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:2 }}>Projection restante</div>
                    <div style={{ fontSize:20, fontWeight:800, color:"#FBBF24" }}>−{fmt(projDepRestantes)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748B", marginBottom:2 }}>Solde prévu fin de mois</div>
                    <div style={{ fontSize:24, fontWeight:800, color:col }}>{soldePrev >= 0 ? "+" : ""}{fmt(soldePrev)}</div>
                  </div>
                </div>
                {/* Barre de consommation du budget */}
                <div style={{ marginBottom:6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:11, color:"#64748B" }}>Consommation budget</span>
                    <span style={{ fontSize:11, color: tauxConso > 90 ? "#F87171" : tauxConso > 70 ? "#FBBF24" : "#34D399", fontWeight:600 }}>{tauxConso.toFixed(0)}%</span>
                  </div>
                  <div style={{ height:8, background:"rgba(255,255,255,0.08)", borderRadius:4, overflow:"hidden" }}>
                    <div style={{ width:`${Math.min(100,tauxConso)}%`, height:"100%", borderRadius:4,
                      background: tauxConso > 90 ? "#F87171" : tauxConso > 70 ? "#FBBF24" : "#34D399",
                      transition:"width 0.5s" }} />
                  </div>
                </div>
                <div style={{ fontSize:11, color:"#475569" }}>
                  Jour {jourDuMois}/{joursTotal} · {joursRestants} jours restants · Moy. dép. historique : {fmt(depMoyMensuelle)}/mois
                </div>
              </Card>
            );
          })()}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
            <StatCard label="Entrées" value={fmt(totalE_yr)} sub={`${curYear} · ${bilan.length} mois`} color="#34D399" icon="📥" />
            <StatCard label="Sorties" value={fmt(totalS_yr)} sub={`Moy. ${fmt(totalS_yr/(bilan.length||1))}/mois`} color="#F87171" icon="📤" />
            <StatCard label="Solde net" value={fmt(solde_yr)} sub={solde_yr>=0?"Bilan positif ✓":"Bilan négatif ⚠"} color={solde_yr>=0?"#34D399":"#F87171"} icon="⚖️" />
            <StatCard label="Taux d'épargne" value={`${tauxEpargne.toFixed(1)}%`} sub="(Entrées−Sorties)/Entrées" color="#818CF8" icon="🎯" />
          </div>

          <Card style={{ marginBottom:14, padding:"16px 20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9" }}>Évolution mensuelle</div>
              <PeriodSelector value={budgetPeriod} onChange={setBudgetPeriod} />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={evolFiltered} barGap={2} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill:"#64748B", fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:12 }} formatter={(v,n)=>[fmt(v),n]} />
                <Legend wrapperStyle={{ fontSize:12, color:"#94A3B8" }} />
                <Bar dataKey="entrees" name="Entrées" fill="#34D399" radius={[4,4,0,0]} />
                <Bar dataKey="sorties" name="Sorties" fill="#F87171" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card style={{ marginBottom:14, padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9", marginBottom:12 }}>Solde mensuel</div>
            {(() => {
              const soldes = evolFiltered.map(d => d.solde).filter(Boolean);
              const minS = Math.min(...soldes), maxS = Math.max(...soldes);
              const padS = (maxS - minS) * 0.15 || 50;
              return (
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={evolFiltered}>
                    <defs>
                      <linearGradient id="soldeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill:"#64748B", fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[Math.floor(minS-padS), Math.ceil(maxS+padS)]} tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`} />
                    <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:12 }} formatter={v=>[fmt(v),"Solde"]} />
                    <Area type="monotone" dataKey="solde" stroke="#818CF8" strokeWidth={2} fill="url(#soldeGrad)" dot={{ fill:"#818CF8", r:3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              );
            })()}
          </Card>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            {[["📤 Répartition des sorties", pieS, "Sortie"], ["📥 Répartition des entrées", pieE, "Entrée"]].map(([title, data, es]) => (
              <Card key={es} style={{ padding:"16px 20px" }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9", marginBottom:10 }}>
                  {title} {selectedMonth ? `— ${MOIS_FR[selectedMonth-1]}` : curYear}
                </div>
                {data.length > 0 ? (
                  <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                    <ResponsiveContainer width={130} height={130}>
                      <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                          {data.map((entry,i) => <Cell key={i} fill={getColor(entry.name, es)} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:11 }} formatter={v=>[fmt(v)]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                      {data.slice(0,7).map(d => (
                        <div key={d.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:getColor(d.name, es), flexShrink:0 }} />
                            <span style={{ fontSize:11, color:"#94A3B8" }}>{d.name}</span>
                          </div>
                          <span style={{ fontSize:11, fontWeight:600, color:"#F1F5F9" }}>{fmt(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <div style={{ fontSize:13, color:"#475569", textAlign:"center", padding:"30px 0" }}>Aucune donnée</div>}
              </Card>
            ))}
          </div>

          {/* Tableau bilan mensuel */}
          <Card style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13, fontWeight:600, color:"#F1F5F9" }}>
              Bilan par mois — {curYear}
              <span style={{ fontSize:11, color:"#64748B", marginLeft:8 }}>Cliquer un mois filtre les camemberts</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                    {["Mois","Entrées","Sorties","Solde","Taux épargne"].map(h => (
                      <th key={h} style={{ padding:"10px 16px", textAlign:h==="Mois"?"left":"right", fontSize:11, color:"#64748B", fontWeight:600, borderBottom:"1px solid rgba(255,255,255,0.06)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bilan.map((row,i) => {
                    const taux = row.entrees>0 ? ((row.entrees-row.sorties)/row.entrees*100) : 0;
                    const isSel = selectedMonth===row.mo;
                    return (
                      <tr key={row.mo} onClick={() => setSelectedMonth(isSel ? null : row.mo)}
                        style={{ background:isSel?"rgba(99,102,241,0.1)":i%2===0?"transparent":"rgba(255,255,255,0.02)", cursor:"pointer" }}
                        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="rgba(255,255,255,0.04)";}}
                        onMouseLeave={e=>{e.currentTarget.style.background=isSel?"rgba(99,102,241,0.1)":i%2===0?"transparent":"rgba(255,255,255,0.02)";}}>
                        <td style={{ padding:"10px 16px", fontSize:13, fontWeight:600, color:isSel?"#A5B4FC":"#F1F5F9", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{row.label}</td>
                        <td style={{ padding:"10px 16px", textAlign:"right", fontSize:13, color:"#34D399", fontWeight:600, borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(row.entrees)}</td>
                        <td style={{ padding:"10px 16px", textAlign:"right", fontSize:13, color:"#F87171", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(row.sorties)}</td>
                        <td style={{ padding:"10px 16px", textAlign:"right", fontSize:13, fontWeight:700, color:row.solde>=0?"#34D399":"#F87171", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(row.solde)}</td>
                        <td style={{ padding:"10px 16px", textAlign:"right", fontSize:13, color:taux>=10?"#34D399":taux>=0?"#FBBF24":"#F87171", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{taux.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background:"rgba(99,102,241,0.08)", fontWeight:700 }}>
                    <td style={{ padding:"11px 16px", fontSize:13, color:"#F1F5F9" }}>TOTAL {curYear}</td>
                    <td style={{ padding:"11px 16px", textAlign:"right", fontSize:13, color:"#34D399" }}>{fmt(totalE_yr)}</td>
                    <td style={{ padding:"11px 16px", textAlign:"right", fontSize:13, color:"#F87171" }}>{fmt(totalS_yr)}</td>
                    <td style={{ padding:"11px 16px", textAlign:"right", fontSize:13, color:solde_yr>=0?"#34D399":"#F87171" }}>{fmt(solde_yr)}</td>
                    <td style={{ padding:"11px 16px", textAlign:"right", fontSize:13, color:"#818CF8" }}>{tauxEpargne.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : DÉTAIL PAR CATÉGORIE (agrégé)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "detail" && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
            <button onClick={()=>setSelectedMonth(null)} style={{ background:!selectedMonth?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", border:!selectedMonth?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:!selectedMonth?"#A5B4FC":"#94A3B8", padding:"5px 14px", fontSize:12, cursor:"pointer", fontWeight:600 }}>Tous</button>
            {bilan.map(row => (
              <button key={row.mo} onClick={()=>setSelectedMonth(selectedMonth===row.mo ? null : row.mo)}
                style={{ background:selectedMonth===row.mo?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", border:selectedMonth===row.mo?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:selectedMonth===row.mo?"#A5B4FC":"#94A3B8", padding:"5px 14px", fontSize:12, cursor:"pointer", fontWeight:600 }}>{row.label}</button>
            ))}
          </div>
          {["Sortie","Entrée"].map(es => {
            const cats2 = catBreakdown(es, curYear, selectedMonth);
            if (!cats2.length) return null;
            const total = cats2.reduce((s,c)=>s+c.value,0);
            return (
              <Card key={es} style={{ marginBottom:14, padding:0, overflow:"hidden" }}>
                <div style={{ padding:"12px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:es==="Sortie"?"#F87171":"#34D399" }}>{es==="Sortie"?"📤 Sorties":"📥 Entrées"} par catégorie</span>
                  <span style={{ fontSize:14, fontWeight:700, color:es==="Sortie"?"#F87171":"#34D399" }}>{fmt(total)}</span>
                </div>
                {cats2.map((cat,i) => {
                  const pct = cat.value/total*100;
                  const col = getColor(cat.name, es);
                  return (
                    <div key={cat.name} style={{ padding:"10px 18px", borderBottom:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.02)", cursor:"pointer" }}
                      onClick={()=>{ setCatStatEs(es); setCatStatName(cat.name); setActiveTab("catstat"); }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:10, height:10, borderRadius:"50%", background:col }} />
                          <span style={{ fontSize:13, color:"#F1F5F9" }}>{cat.name}</span>
                          <span style={{ fontSize:10, color:"#475569" }}>→ voir stats</span>
                        </div>
                        <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                          <span style={{ fontSize:12, color:"#64748B" }}>{pct.toFixed(1)}%</span>
                          <span style={{ fontSize:13, fontWeight:700, color:col }}>{fmt(cat.value)}</span>
                        </div>
                      </div>
                      <div style={{ height:4, background:"rgba(255,255,255,0.08)", borderRadius:2 }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:2 }} />
                      </div>
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : STATS PAR CATÉGORIE
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "sankey" && (
        <div>
          {/* Filtre mois */}
          <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
            <button onClick={()=>setSelectedMonth(null)}
              style={{ background:!selectedMonth?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", border:!selectedMonth?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:!selectedMonth?"#A5B4FC":"#94A3B8", padding:"5px 14px", fontSize:12, cursor:"pointer", fontWeight:600 }}>
              Année entière
            </button>
            {bilan.map(row => (
              <button key={row.mo} onClick={()=>setSelectedMonth(selectedMonth===row.mo ? null : row.mo)}
                style={{ background:selectedMonth===row.mo?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", border:selectedMonth===row.mo?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:selectedMonth===row.mo?"#A5B4FC":"#94A3B8", padding:"5px 14px", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                {row.label}
              </button>
            ))}
          </div>
          <SankeyBudget
            transactions={transactions}
            curYear={curYear}
            selectedMonth={selectedMonth}
            fmt={fmt}
            getColor={getColor}
          />
        </div>
      )}


      {/* ══════════════════════════════════════════════════════════════════════
          TAB : INFLATION PERSONNELLE
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "inflation" && (() => {
        const MOIS_LABELS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
        const allYears = [...new Set(transactions.map(t => t.annee))].sort((a,b)=>a-b);

        // Pour chaque mois (1–12) et chaque paire d'années consécutives, calculer la variation
        // Données : pour chaque mois, entrées et sorties par année
        const dataByMonth = MOIS_LABELS.map((label, mi) => {
          const mo = mi + 1;
          const point = { mois: label, mo };
          allYears.forEach(yr => {
            point[`ent_${yr}`]  = transactions.filter(t => t.annee===yr && t.mois===mo && t.es==="Entrée").reduce((s,t)=>s+t.montant,0);
            point[`sor_${yr}`]  = transactions.filter(t => t.annee===yr && t.mois===mo && t.es==="Sortie").reduce((s,t)=>s+t.montant,0);
          });
          return point;
        });

        // Paires d'années disponibles (ex: 2024→2025, 2025→2026)
        const pairs = [];
        for (let i = 0; i < allYears.length - 1; i++) pairs.push([allYears[i], allYears[i+1]]);

        // Couleurs par paire
        const PAIR_COLORS_ENT = ["#34D399","#60A5FA","#A78BFA","#FBBF24"];
        const PAIR_COLORS_SOR = ["#F87171","#FB923C","#FCD34D","#86EFAC"];

        // Données variation % pour chaque mois et chaque paire
        const evolutionPct = dataByMonth.map(d => {
          const pt = { mois: d.mois };
          pairs.forEach(([yr1, yr2], pi) => {
            const e1 = d[`ent_${yr1}`] || 0, e2 = d[`ent_${yr2}`] || 0;
            const s1 = d[`sor_${yr1}`] || 0, s2 = d[`sor_${yr2}`] || 0;
            pt[`pct_ent_${yr1}_${yr2}`] = e1 > 0 ? Math.round((e2-e1)/e1*1000)/10 : null;
            pt[`pct_sor_${yr1}_${yr2}`] = s1 > 0 ? Math.round((s2-s1)/s1*1000)/10 : null;
          });
          return pt;
        });

        // Tableau récap par mois pour la paire sélectionnée
        // KPIs globaux : variation entrées et sorties entre 2 années complètes
        const annualKpis = pairs.map(([yr1, yr2]) => {
          const totE1 = transactions.filter(t=>t.annee===yr1&&t.es==="Entrée").reduce((s,t)=>s+t.montant,0);
          const totE2 = transactions.filter(t=>t.annee===yr2&&t.es==="Entrée").reduce((s,t)=>s+t.montant,0);
          const totS1 = transactions.filter(t=>t.annee===yr1&&t.es==="Sortie").reduce((s,t)=>s+t.montant,0);
          const totS2 = transactions.filter(t=>t.annee===yr2&&t.es==="Sortie").reduce((s,t)=>s+t.montant,0);
          const pctE = totE1 > 0 ? (totE2-totE1)/totE1*100 : null;
          const pctS = totS1 > 0 ? (totS2-totS1)/totS1*100 : null;
          return { yr1, yr2, totE1, totE2, totS1, totS2, pctE, pctS, delta: totS2-totS1 };
        });

        const CustomTooltipInflation = ({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          return (
            <div style={{ background:"#0F1929", border:"1px solid #1E3050", borderRadius:10, padding:"10px 16px", fontSize:12, color:"#E2E8F0", boxShadow:"0 4px 20px rgba(0,0,0,0.5)", minWidth:200 }}>
              <div style={{ color:"#64748B", marginBottom:6, fontWeight:700 }}>{label}</div>
              {payload.filter(p => p.value != null).map((p, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:16, marginBottom:3 }}>
                  <span style={{ color: p.color }}>{p.name}</span>
                  <span style={{ fontWeight:700, color: p.value > 0 ? "#F87171" : p.value < 0 ? "#34D399" : "#94A3B8" }}>
                    {p.value > 0 ? "+" : ""}{p.value != null ? p.value.toFixed(1) : "—"}%
                  </span>
                </div>
              ))}
            </div>
          );
        };

        const CustomTooltipAbs = ({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          return (
            <div style={{ background:"#0F1929", border:"1px solid #1E3050", borderRadius:10, padding:"10px 16px", fontSize:12, color:"#E2E8F0", boxShadow:"0 4px 20px rgba(0,0,0,0.5)", minWidth:200 }}>
              <div style={{ color:"#64748B", marginBottom:6, fontWeight:700 }}>{label}</div>
              {payload.map((p, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:16, marginBottom:2 }}>
                  <span style={{ color: p.color }}>{p.name}</span>
                  <span style={{ fontWeight:700, color:"#F1F5F9" }}>{fmt(p.value)}</span>
                </div>
              ))}
            </div>
          );
        };

        if (allYears.length < 2) return (
          <Card style={{ padding:"32px 24px", textAlign:"center" }}>
            <div style={{ fontSize:15, color:"#64748B" }}>⚠️ Il faut au moins 2 années de données pour afficher l'inflation personnelle.</div>
          </Card>
        );

        return (
          <div>
            {/* ── KPIs annuels ── */}
            {annualKpis.map(({ yr1, yr2, totE1, totE2, totS1, totS2, pctE, pctS, delta }) => (
              <Card key={`${yr1}-${yr2}`} style={{ marginBottom:14, padding:"16px 20px", border:"1px solid rgba(251,191,36,0.15)", background:"rgba(15,23,42,0.7)" }}>
                <div style={{ fontSize:11, color:"#FBBF24", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12, fontWeight:700 }}>
                  📉 {yr1} → {yr2} · Évolution annuelle
                </div>
                <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                  {[
                    { label:`Entrées ${yr1}`, val:totE1, color:"#34D399", icon:"📥" },
                    { label:`Entrées ${yr2}`, val:totE2, color:"#34D399", icon:"📥" },
                    { label:"Δ Entrées", val:totE2-totE1, pct:pctE, color: (totE2-totE1)>=0?"#34D399":"#F87171", icon:"📊" },
                    { label:`Dépenses ${yr1}`, val:totS1, color:"#F87171", icon:"📤" },
                    { label:`Dépenses ${yr2}`, val:totS2, color:"#F87171", icon:"📤" },
                    { label:"Δ Dépenses", val:delta, pct:pctS, color: delta<=0?"#34D399":"#F87171", icon:"🔥" },
                  ].map(({ label, val, pct, color, icon }) => (
                    <div key={label} style={{ background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"10px 14px", minWidth:120, border:"1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize:10, color:"#64748B", marginBottom:4 }}>{icon} {label}</div>
                      <div style={{ fontSize:17, fontWeight:800, color }}>{val>=0?"+":""}{fmt(val)}</div>
                      {pct != null && (
                        <div style={{ fontSize:11, color: pct<=0?"#34D399":"#F87171", marginTop:2, fontWeight:700 }}>
                          {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            {/* ── Graphique % variation dépenses par mois ── */}
            <Card style={{ marginBottom:14, padding:"16px 20px" }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:4 }}>Variation des dépenses mois par mois (N vs N-1)</div>
              <div style={{ fontSize:12, color:"#64748B", marginBottom:14 }}>
                En %, comparaison du même mois d'une année à l'autre. Rouge = inflation, vert = économies.
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={evolutionPct} margin={{ top:8, right:24, bottom:4, left:0 }} barGap={4} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize:11, fill:"#475569" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize:10, fill:"#475569" }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                  <Tooltip content={<CustomTooltipInflation />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                  <Legend wrapperStyle={{ fontSize:11, color:"#64748B" }} />
                  {pairs.map(([yr1, yr2], pi) => (
                    <Bar key={`pct_sor_${yr1}_${yr2}`}
                      dataKey={`pct_sor_${yr1}_${yr2}`}
                      name={`Dép. ${yr1}→${yr2}`}
                      radius={[3,3,0,0]}
                      fill={PAIR_COLORS_SOR[pi % PAIR_COLORS_SOR.length]}
                      opacity={0.9}>
                      {evolutionPct.map((entry, index) => {
                        const v = entry[`pct_sor_${yr1}_${yr2}`];
                        return <Cell key={index} fill={v == null ? "transparent" : v > 0 ? "#F87171" : "#34D399"} />;
                      })}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* ── Graphique % variation entrées par mois ── */}
            <Card style={{ marginBottom:14, padding:"16px 20px" }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:4 }}>Variation des entrées mois par mois (N vs N-1)</div>
              <div style={{ fontSize:12, color:"#64748B", marginBottom:14 }}>
                En %, comparaison du même mois d'une année à l'autre. Vert = hausse des revenus, rouge = baisse.
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={evolutionPct} margin={{ top:8, right:24, bottom:4, left:0 }} barGap={4} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize:11, fill:"#475569" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize:10, fill:"#475569" }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                  <Tooltip content={<CustomTooltipInflation />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                  <Legend wrapperStyle={{ fontSize:11, color:"#64748B" }} />
                  {pairs.map(([yr1, yr2], pi) => (
                    <Bar key={`pct_ent_${yr1}_${yr2}`}
                      dataKey={`pct_ent_${yr1}_${yr2}`}
                      name={`Rev. ${yr1}→${yr2}`}
                      radius={[3,3,0,0]}
                      fill={PAIR_COLORS_ENT[pi % PAIR_COLORS_ENT.length]}
                      opacity={0.9}>
                      {evolutionPct.map((entry, index) => {
                        const v = entry[`pct_ent_${yr1}_${yr2}`];
                        return <Cell key={index} fill={v == null ? "transparent" : v >= 0 ? "#34D399" : "#F87171"} />;
                      })}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* ── Graphique montants absolus superposés ── */}
            <Card style={{ marginBottom:14, padding:"16px 20px" }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:4 }}>Dépenses absolues — même mois, années superposées</div>
              <div style={{ fontSize:12, color:"#64748B", marginBottom:14 }}>Montant en € par mois pour comparer directement le niveau de dépenses.</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dataByMonth} margin={{ top:8, right:24, bottom:4, left:0 }} barGap={2} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize:11, fill:"#475569" }} tickLine={false} axisLine={false} />
                  <YAxis orientation="right" tick={{ fontSize:10, fill:"#475569" }} tickLine={false} axisLine={false}
                    tickFormatter={v => v>=1000?`${(v/1000).toFixed(1)}k`:v.toFixed(0)} width={48} />
                  <Tooltip content={<CustomTooltipAbs />} />
                  <Legend wrapperStyle={{ fontSize:11, color:"#64748B" }} />
                  {allYears.map((yr, i) => (
                    <Bar key={`sor_${yr}`} dataKey={`sor_${yr}`} name={`Dép. ${yr}`}
                      fill={PAIR_COLORS_SOR[i % PAIR_COLORS_SOR.length]}
                      radius={[3,3,0,0]} opacity={0.85} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* ── Tableau récapitulatif mois par mois ── */}
            {pairs.map(([yr1, yr2]) => (
              <Card key={`tbl-${yr1}-${yr2}`} style={{ padding:0, overflow:"hidden", marginBottom:14 }}>
                <div style={{ padding:"12px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13, fontWeight:700, color:"#F1F5F9" }}>
                  Tableau comparatif {yr1} → {yr2}
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                        {["Mois","Entrées "+yr1,"Entrées "+yr2,"Δ Entrées","Dép. "+yr1,"Dép. "+yr2,"Δ Dépenses","Solde "+yr1,"Solde "+yr2].map(h => (
                          <th key={h} style={{ padding:"10px 14px", textAlign:"right", color:"#64748B", fontWeight:600, fontSize:11, whiteSpace:"nowrap", borderBottom:"1px solid rgba(255,255,255,0.08)" }}
                            {...(h==="Mois"?{style:{padding:"10px 14px",textAlign:"left",color:"#64748B",fontWeight:600,fontSize:11,whiteSpace:"nowrap",borderBottom:"1px solid rgba(255,255,255,0.08)"}}:{})}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MOIS_LABELS.map((label, mi) => {
                        const mo = mi + 1;
                        const e1 = transactions.filter(t=>t.annee===yr1&&t.mois===mo&&t.es==="Entrée").reduce((s,t)=>s+t.montant,0);
                        const e2 = transactions.filter(t=>t.annee===yr2&&t.mois===mo&&t.es==="Entrée").reduce((s,t)=>s+t.montant,0);
                        const s1 = transactions.filter(t=>t.annee===yr1&&t.mois===mo&&t.es==="Sortie").reduce((s,t)=>s+t.montant,0);
                        const s2 = transactions.filter(t=>t.annee===yr2&&t.mois===mo&&t.es==="Sortie").reduce((s,t)=>s+t.montant,0);
                        const hasData = e1>0||e2>0||s1>0||s2>0;
                        if (!hasData) return null;
                        const deltaE = e2 - e1;
                        const deltaS = s2 - s1;
                        const pctS = s1 > 0 ? (deltaS/s1*100) : null;
                        return (
                          <tr key={mo} style={{ background: mi%2===0?"transparent":"rgba(255,255,255,0.02)", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding:"9px 14px", color:"#F1F5F9", fontWeight:600 }}>{label}</td>
                            <td style={{ padding:"9px 14px", textAlign:"right", color:"#34D399" }}>{e1>0?fmt(e1):"—"}</td>
                            <td style={{ padding:"9px 14px", textAlign:"right", color:"#34D399" }}>{e2>0?fmt(e2):"—"}</td>
                            <td style={{ padding:"9px 14px", textAlign:"right", fontWeight:700, color:deltaE>=0?"#34D399":"#F87171" }}>{e1>0||e2>0?(deltaE>=0?"+":"")+fmt(deltaE):"—"}</td>
                            <td style={{ padding:"9px 14px", textAlign:"right", color:"#F87171" }}>{s1>0?fmt(s1):"—"}</td>
                            <td style={{ padding:"9px 14px", textAlign:"right", color:"#F87171" }}>{s2>0?fmt(s2):"—"}</td>
                            <td style={{ padding:"9px 14px", textAlign:"right" }}>
                              {(s1>0||s2>0) ? (
                                <span style={{ fontWeight:700, color:deltaS<=0?"#34D399":"#F87171" }}>
                                  {deltaS>=0?"+":""}{fmt(deltaS)}
                                  {pctS!=null && <span style={{ fontSize:10, marginLeft:4, opacity:0.8 }}>({pctS>=0?"+":""}{pctS.toFixed(1)}%)</span>}
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding:"9px 14px", textAlign:"right", color:(e1-s1)>=0?"#34D399":"#F87171", fontWeight:600 }}>{(e1>0||s1>0)?fmt(e1-s1):"—"}</td>
                            <td style={{ padding:"9px 14px", textAlign:"right", color:(e2-s2)>=0?"#34D399":"#F87171", fontWeight:600 }}>{(e2>0||s2>0)?fmt(e2-s2):"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        );
      })()}

      {activeTab === "catstat" && (
        <div>
          {/* ── Filtre entête ── */}
          <Card style={{ padding:"14px 18px", marginBottom:14 }}>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
              <div>
                <div style={lblS}>Type</div>
                <select value={catStatEs} onChange={e=>{setCatStatEs(e.target.value); setCatStatName("");}} style={{...inpS, width:130}}>
                  <option value="Sortie">📤 Sorties</option>
                  <option value="Entrée">📥 Entrées</option>
                </select>
              </div>
              <div style={{ flex:1, minWidth:220 }}>
                <div style={lblS}>Catégorie</div>
                <select value={activeCatName} onChange={e=>setCatStatName(e.target.value)} style={inpS}>
                  {allCatNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {activeCatName && (
                <div style={{ display:"flex", gap:16, padding:"8px 16px", background:"rgba(255,255,255,0.04)", borderRadius:10, border:"1px solid rgba(255,255,255,0.08)", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:catColor }} />
                    <span style={{ fontSize:12, color:"#94A3B8" }}>Total</span>
                    <span style={{ fontSize:14, fontWeight:700, color:catColor }}>{fmt(catTotal)}</span>
                  </div>
                  <div style={{ width:1, height:20, background:"rgba(255,255,255,0.1)" }} />
                  <div>
                    <span style={{ fontSize:12, color:"#94A3B8" }}>Moy/mois </span>
                    <span style={{ fontSize:14, fontWeight:700, color:"#F1F5F9" }}>{fmt(catAvgMo)}</span>
                  </div>
                  <div style={{ width:1, height:20, background:"rgba(255,255,255,0.1)" }} />
                  <div>
                    <span style={{ fontSize:12, color:"#94A3B8" }}>% budget sortie </span>
                    <span style={{ fontSize:14, fontWeight:700, color:"#FBBF24" }}>
                      {totalS_yr > 0 ? (catTotalYr/totalS_yr*100).toFixed(1) : "—"}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {activeCatName && (
            <>
              {/* KPIs */}
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
                <StatCard label="Total cumulé" value={fmt(catTotal)} sub={`${catTxs.length} transaction${catTxs.length>1?"s":""}`} color={catColor} icon="💳" />
                <StatCard label="Moy. mensuelle" value={fmt(catAvgMo)} sub={`sur ${catMonthly.length} mois actifs`} color={catColor} icon="📅" />
                <StatCard label="Mois max" value={fmt(catMax)} sub={catMonthly.find(m=>m.total===catMax)?.label||""} color={catColor} icon="📈" />
                <StatCard label="Part du budget" value={`${totalS_yr>0?(catTotalYr/totalS_yr*100).toFixed(1):"0"}%`} sub={`des sorties ${curYear}`} color="#FBBF24" icon="🎯" />
              </div>

              {/* Graphique dual : valeur mensuelle + % budget global */}
              <Card style={{ marginBottom:14, padding:"16px 20px" }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9", marginBottom:4 }}>
                  Évolution mensuelle — {activeCatName}
                </div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:12, display:"flex", gap:16 }}>
                  <span><span style={{ color:catColor }}>━━</span> Montant mensuel (€)</span>
                  <span><span style={{ color:"#FBBF24" }}>╌╌</span> % des sorties du mois</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={catMonthlyWithPct} margin={{ right:40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false}
                      tickFormatter={v=>`${v.toFixed(0)}€`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false}
                      tickFormatter={v=>`${v.toFixed(0)}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:12 }}
                      formatter={(v,n) => n==="pct" ? [`${v.toFixed(1)}%`, "% sorties mois"] : [fmt(v), "Montant"]} />
                    <Line yAxisId="left" type="monotone" dataKey="total" stroke={catColor} strokeWidth={2.5}
                      dot={{ fill:catColor, r:4, strokeWidth:0 }} activeDot={{ r:6 }} name="montant" />
                    <Line yAxisId="right" type="monotone" dataKey="pct" stroke="#FBBF24" strokeWidth={1.5}
                      strokeDasharray="5 3" dot={{ fill:"#FBBF24", r:3, strokeWidth:0 }} activeDot={{ r:5 }} name="pct" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              {/* Répartition par année */}
              {catByYear.length > 1 && (
                <Card style={{ marginBottom:14, padding:"16px 20px" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9", marginBottom:12 }}>Comparaison annuelle</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={catByYear} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="year" tick={{ fill:"#64748B", fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`} />
                      <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:12 }} formatter={v=>[fmt(v)]} />
                      <Bar dataKey="total" fill={catColor} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Détail des transactions */}
              <Card style={{ padding:0, overflow:"hidden" }}>
                <div style={{ padding:"12px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13, fontWeight:600, color:"#F1F5F9", display:"flex", justifyContent:"space-between" }}>
                  <span>Toutes les transactions — {activeCatName}</span>
                  <span style={{ color:"#64748B", fontWeight:400 }}>{catTxs.length} entrées</span>
                </div>
                <div style={{ maxHeight:320, overflowY:"auto" }}>
                  {[...catTxs].sort((a,b)=>b.annee!==a.annee?b.annee-a.annee:b.mois-a.mois).map((tx,i) => (
                    <div key={tx.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 18px", borderBottom:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.02)" }}>
                      <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                        <span style={{ fontSize:12, color:"#64748B", minWidth:72 }}>{MOIS_FR[tx.mois-1]} {tx.annee}</span>
                        {tx.note && <span style={{ fontSize:12, color:"#475569", fontStyle:"italic" }}>{tx.note}</span>}
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color:catColor }}>{fmt(tx.montant)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      )}


      {/* ══════════════════════════════════════════════════════════════════════
          TAB : GESTION DES CATÉGORIES
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "categories" && (
        <div>
          {/* Switcher Entrée/Sortie */}
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {[["sortie","📤 Sorties"],["entree","📥 Entrées"]].map(([k,l]) => (
              <button key={k} onClick={()=>setCatMgrEs(k)}
                style={{ background:catMgrEs===k?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)", border:catMgrEs===k?"1px solid rgba(99,102,241,0.5)":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:catMgrEs===k?"#A5B4FC":"#94A3B8", padding:"6px 18px", fontSize:13, cursor:"pointer", fontWeight:600 }}>
                {l}
              </button>
            ))}
          </div>

          {/* Ajouter catégorie */}
          <Card style={{ padding:16, marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:12 }}>➕ Nouvelle catégorie</div>
            <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={lblS}>Nom</div>
                <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="Ex: Sport, Santé…" style={inpS} />
              </div>
              <div>
                <div style={lblS}>Couleur</div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <input type="color" value={newCatColor} onChange={e=>setNewCatColor(e.target.value)}
                    style={{ width:40, height:34, border:"1px solid #334155", borderRadius:8, background:"#1E293B", cursor:"pointer", padding:2 }} />
                  {["#F87171","#FB923C","#FBBF24","#34D399","#60A5FA","#A78BFA","#F472B6","#38BDF8","#818CF8","#4ADE80"].map(c => (
                    <div key={c} onClick={()=>setNewCatColor(c)} style={{ width:18, height:18, borderRadius:"50%", background:c, cursor:"pointer", border:newCatColor===c?"2px solid #fff":"2px solid transparent", flexShrink:0 }} />
                  ))}
                </div>
              </div>
              <button onClick={addCat} disabled={!newCatName.trim()}
                style={{ background:"#4F46E5", border:"none", borderRadius:8, color:"#fff", padding:"8px 20px", cursor:"pointer", fontWeight:700, fontSize:13, opacity:!newCatName.trim()?0.5:1 }}>
                Ajouter
              </button>
            </div>
          </Card>

          {/* Liste catégories */}
          <Card style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13, fontWeight:600, color:"#F1F5F9" }}>
              {catMgrEs==="sortie" ? "📤 Catégories de sorties" : "📥 Catégories d'entrées"}
              <span style={{ fontSize:11, color:"#64748B", marginLeft:8 }}>{cats[catMgrEs].length} catégories</span>
            </div>
            {cats[catMgrEs].map((cat,i) => {
              const usageCount = transactions.filter(t => t.type === cat.name && t.es === (catMgrEs==="sortie"?"Sortie":"Entrée")).length;
              const isEditing  = editingCat === cat.name;
              return (
                <div key={cat.name} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 18px", borderBottom:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.02)" }}>
                  {isEditing ? (
                    <>
                      <input type="color" value={editCatForm.color} onChange={e=>setEditCatForm(f=>({...f,color:e.target.value}))}
                        style={{ width:32, height:32, border:"1px solid #334155", borderRadius:6, background:"#1E293B", cursor:"pointer", padding:1, flexShrink:0 }} />
                      <input value={editCatForm.name} onChange={e=>setEditCatForm(f=>({...f,name:e.target.value}))}
                        style={{ flex:1, background:"#1E293B", border:"1px solid #4F46E5", borderRadius:6, padding:"5px 10px", color:"#F1F5F9", fontSize:13 }} />
                      <button onClick={()=>saveEditCat(catMgrEs)}
                        style={{ background:"#4F46E5", border:"none", borderRadius:6, color:"#fff", padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:600 }}>✓ Sauver</button>
                      <button onClick={()=>setEditingCat(null)}
                        style={{ background:"transparent", border:"1px solid #334155", borderRadius:6, color:"#64748B", padding:"5px 10px", cursor:"pointer", fontSize:12 }}>Annuler</button>
                    </>
                  ) : (
                    <>
                      <div style={{ width:16, height:16, borderRadius:"50%", background:cat.color, flexShrink:0 }} />
                      <span style={{ flex:1, fontSize:13, color:"#F1F5F9" }}>{cat.name}</span>
                      <span style={{ fontSize:11, color:"#475569" }}>{usageCount} transaction{usageCount>1?"s":""}</span>
                      <button onClick={()=>{ setEditingCat(cat.name); setEditCatForm({name:cat.name, color:cat.color}); }}
                        style={{ background:"transparent", border:"1px solid #334155", borderRadius:6, color:"#818CF8", padding:"3px 10px", cursor:"pointer", fontSize:11 }}>✏ Modifier</button>
                      <button onClick={()=>deleteCat(catMgrEs, cat.name)}
                        style={{ background:"transparent", border:"1px solid rgba(248,113,113,0.3)", borderRadius:6, color:"#F87171", padding:"3px 10px", cursor:"pointer", fontSize:11 }}>✕</button>
                    </>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : AJOUTER UNE TRANSACTION
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "add" && (
        <Card style={{ padding:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:16 }}>➕ Nouvelle transaction</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
            <div>
              <div style={lblS}>Type</div>
              <select value={form.es} onChange={e=>setForm(f=>({...f,es:e.target.value,type:""}))} style={inpS}>
                <option value="Sortie">📤 Sortie</option>
                <option value="Entrée">📥 Entrée</option>
              </select>
            </div>
            <div>
              <div style={lblS}>Catégorie</div>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={inpS}>
                <option value="">— Sélectionner —</option>
                {allCats(form.es).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={lblS}>Montant (€)</div>
              <input type="number" step="0.01" value={form.montant} onChange={e=>setForm(f=>({...f,montant:e.target.value}))} placeholder="0.00" style={inpS}
                onKeyDown={e=>e.key==="Enter" && addTransaction()} />
            </div>
            <div>
              <div style={lblS}>Année</div>
              <select value={form.annee} onChange={e=>setForm(f=>({...f,annee:e.target.value}))} style={inpS}>
                {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <div style={lblS}>Mois</div>
              <select value={form.mois} onChange={e=>setForm(f=>({...f,mois:e.target.value}))} style={inpS}>
                {MOIS_FR.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={lblS}>Note (optionnel)</div>
              <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Lidl, Amazon…" style={inpS}
                onKeyDown={e=>e.key==="Enter" && addTransaction()} />
            </div>
          </div>
          <button onClick={addTransaction} disabled={!form.type || !form.montant}
            style={{ background:"#4F46E5", border:"none", borderRadius:10, color:"#fff", padding:"10px 28px", fontSize:14, fontWeight:700, cursor:"pointer", opacity:(!form.type||!form.montant)?0.5:1 }}>
            ✓ Ajouter
          </button>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : TRANSACTIONS (liste éditable)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "transactions" && (
        <div>
          {/* Filtres */}
          <Card style={{ padding:"14px 18px", marginBottom:14 }}>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
              <div>
                <div style={lblS}>Type</div>
                <select value={txFilter.es} onChange={e=>{setTxFilter(f=>({...f,es:e.target.value,type:""})); setTxPage(0);}} style={{...inpS,width:130}}>
                  <option value="">Tous</option>
                  <option value="Sortie">📤 Sorties</option>
                  <option value="Entrée">📥 Entrées</option>
                </select>
              </div>
              <div style={{ minWidth:160 }}>
                <div style={lblS}>Catégorie</div>
                <select value={txFilter.type} onChange={e=>{setTxFilter(f=>({...f,type:e.target.value})); setTxPage(0);}} style={inpS}>
                  <option value="">Toutes</option>
                  {[...new Set(transactions.filter(t=>!txFilter.es||t.es===txFilter.es).map(t=>t.type))].sort().map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <div style={lblS}>Année</div>
                <select value={txFilter.year} onChange={e=>{setTxFilter(f=>({...f,year:e.target.value,month:""})); setTxPage(0);}} style={{...inpS,width:100}}>
                  <option value="">Toutes</option>
                  {years.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <div style={lblS}>Mois</div>
                <select value={txFilter.month} onChange={e=>{setTxFilter(f=>({...f,month:e.target.value})); setTxPage(0);}} style={{...inpS,width:100}}>
                  <option value="">Tous</option>
                  {MOIS_FR.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div style={{ marginLeft:"auto", fontSize:12, color:"#64748B", alignSelf:"center" }}>
                {txFiltered.length} transaction{txFiltered.length>1?"s":""} · {fmt(txFiltered.reduce((s,t)=>s+(t.es==="Entrée"?t.montant:0),0))} entrées / {fmt(txFiltered.reduce((s,t)=>s+(t.es==="Sortie"?t.montant:0),0))} sorties
              </div>
            </div>
          </Card>

          {/* Transactions — cartes mobiles */}
          <Card style={{ padding:"14px 18px" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {txPageData.map((tx,i) => {
                  const isEd = editingTx === tx.id;
                  const col  = getColor(tx.type, tx.es);
                  return (
                    <div key={tx.id} style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, border:"1px solid rgba(255,255,255,0.06)", padding:"12px 14px" }}>
                      {isEd ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            <select value={editForm.annee} onChange={e=>setEditForm(f=>({...f,annee:parseInt(e.target.value)}))} style={{...inpS,width:80,padding:"5px 8px",fontSize:12}}>
                              {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
                            </select>
                            <select value={editForm.mois} onChange={e=>setEditForm(f=>({...f,mois:parseInt(e.target.value)}))} style={{...inpS,width:72,padding:"5px 8px",fontSize:12}}>
                              {MOIS_FR.map((m,idx)=><option key={idx+1} value={idx+1}>{m}</option>)}
                            </select>
                            <select value={editForm.es} onChange={e=>setEditForm(f=>({...f,es:e.target.value}))} style={{...inpS,padding:"5px 8px",fontSize:12}}>
                              <option value="Sortie">Sortie</option>
                              <option value="Entrée">Entrée</option>
                            </select>
                          </div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            <select value={editForm.type} onChange={e=>setEditForm(f=>({...f,type:e.target.value}))} style={{...inpS,flex:1,padding:"5px 8px",fontSize:12}}>
                              {allCats(editForm.es).map(c=><option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                            <input type="number" step="0.01" value={editForm.montant} onChange={e=>setEditForm(f=>({...f,montant:e.target.value}))} style={{...inpS,width:100,padding:"5px 8px",fontSize:12,textAlign:"right"}} />
                          </div>
                          <input value={editForm.note||""} onChange={e=>setEditForm(f=>({...f,note:e.target.value}))} placeholder="Note…" style={{...inpS,padding:"5px 8px",fontSize:12}} />
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={saveEditTx} style={{ background:"#4F46E5", border:"none", borderRadius:6, color:"#fff", padding:"6px 16px", cursor:"pointer", fontSize:12, fontWeight:600 }}>✓ Sauvegarder</button>
                            <button onClick={()=>setEditingTx(null)} style={{ background:"transparent", border:"1px solid #334155", borderRadius:6, color:"#64748B", padding:"6px 12px", cursor:"pointer", fontSize:12 }}>Annuler</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                              <span style={{ fontSize:11, padding:"2px 7px", borderRadius:4, background:tx.es==="Sortie"?"rgba(248,113,113,0.15)":"rgba(52,211,153,0.15)", color:tx.es==="Sortie"?"#F87171":"#34D399", fontWeight:600, flexShrink:0 }}>{tx.es}</span>
                              <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                                <div style={{ width:8, height:8, borderRadius:"50%", background:col, flexShrink:0 }} />
                                <span style={{ fontSize:13, color:"#F1F5F9", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.type}</span>
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:8, fontSize:11, color:"#64748B" }}>
                              <span>{MOIS_FR[tx.mois-1]} {tx.annee}</span>
                              {tx.note && <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>· {tx.note}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign:"right", flexShrink:0 }}>
                            <div style={{ fontSize:15, fontWeight:700, color:col }}>{fmt(tx.montant)}</div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                            <button onClick={()=>startEditTx(tx)} style={{ background:"transparent", border:"1px solid #334155", borderRadius:6, color:"#818CF8", padding:"3px 8px", cursor:"pointer", fontSize:11 }}>✏</button>
                            <button onClick={()=>deleteTx(tx.id)} style={{ background:"transparent", border:"1px solid rgba(248,113,113,0.3)", borderRadius:6, color:"#F87171", padding:"3px 8px", cursor:"pointer", fontSize:11 }}>✕</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            {/* Pagination */}
            {txFiltered.length > TX_PER_PAGE && (
              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:"12px 18px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                <button onClick={()=>setTxPage(p=>Math.max(0,p-1))} disabled={txPage===0}
                  style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:"#94A3B8", padding:"4px 12px", cursor:"pointer", fontSize:12, opacity:txPage===0?0.4:1 }}>← Préc.</button>
                <span style={{ fontSize:12, color:"#64748B" }}>{txPage+1} / {Math.ceil(txFiltered.length/TX_PER_PAGE)}</span>
                <button onClick={()=>setTxPage(p=>Math.min(Math.ceil(txFiltered.length/TX_PER_PAGE)-1,p+1))} disabled={txPage>=Math.ceil(txFiltered.length/TX_PER_PAGE)-1}
                  style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:"#94A3B8", padding:"4px 12px", cursor:"pointer", fontSize:12, opacity:txPage>=Math.ceil(txFiltered.length/TX_PER_PAGE)-1?0.4:1 }}>Suiv. →</button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB : SOURCES
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "sync" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Card style={{ padding:20 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:6 }}>📂 Import CSV</div>
            <div style={{ fontSize:12, color:"#64748B", marginBottom:14 }}>
              Format : <code style={{ background:"rgba(255,255,255,0.06)", padding:"1px 6px", borderRadius:4 }}>Année, Mois, Entrées/sorties, Type, Sous-type, Argent, Notes</code><br/>
              L'import fusionne les données : les mois importés écrasent les anciens, les autres sont conservés.
            </div>
            <label style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#34D399", color:"#0B1120", borderRadius:10, padding:"9px 20px", cursor:"pointer", fontWeight:700, fontSize:13 }}>
              📥 Choisir un fichier CSV
              <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display:"none" }} />
            </label>
          </Card>

          <Card style={{ padding:20 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:14 }}>🔗 Google Sheets (sync live)</div>

            {/* Choix de la source */}
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <button onClick={()=>{ setGsMode("default"); localStorage.setItem("patrimoine_gs_mode","default"); }}
                style={{ flex:1, padding:"10px 14px", borderRadius:10, cursor:"pointer", fontWeight:600, fontSize:13, border:"none",
                  background: gsMode==="default" ? "linear-gradient(135deg,#6366F1,#4F46E5)" : "rgba(255,255,255,0.04)",
                  color: gsMode==="default" ? "#fff" : "#64748B",
                  outline: gsMode==="default" ? "none" : "1px solid rgba(255,255,255,0.08)" }}>
                📌 Lien par défaut
              </button>
              <button onClick={()=>{ setGsMode("custom"); localStorage.setItem("patrimoine_gs_mode","custom"); }}
                style={{ flex:1, padding:"10px 14px", borderRadius:10, cursor:"pointer", fontWeight:600, fontSize:13, border:"none",
                  background: gsMode==="custom" ? "linear-gradient(135deg,#6366F1,#4F46E5)" : "rgba(255,255,255,0.04)",
                  color: gsMode==="custom" ? "#fff" : "#64748B",
                  outline: gsMode==="custom" ? "none" : "1px solid rgba(255,255,255,0.08)" }}>
                ✏️ Lien personnalisé
              </button>
            </div>

            {/* Lien par défaut */}
            {gsMode === "default" && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:"#64748B", marginBottom:8 }}>Feuille configurée :</div>
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:10 }}>
                  <span style={{ fontSize:18 }}>📊</span>
                  <div style={{ flex:1, overflow:"hidden" }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9" }}>Budget personnel</div>
                    <div style={{ fontSize:10, color:"#475569", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {GS_DEFAULT_URL.slice(0, 60)}…
                    </div>
                  </div>
                  <span style={{ fontSize:11, color:"#34D399", fontWeight:600, flexShrink:0 }}>✓ Prêt</span>
                </div>
              </div>
            )}

            {/* Lien personnalisé */}
            {gsMode === "custom" && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:"#64748B", marginBottom:6 }}>
                  <strong style={{color:"#F1F5F9"}}>Fichier → Partager → Publier sur le web → CSV</strong> puis colle l'URL :
                </div>
                <input value={gsUrl} onChange={e=>setGsUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv"
                  style={{ width:"100%", boxSizing:"border-box", background:"#1E293B", border:"1px solid #334155", borderRadius:8, padding:"9px 12px", color:"#F1F5F9", fontSize:13, marginBottom:6 }} />
                {gsUrl && <div style={{ fontSize:11, color:"#475569" }}>URL personnalisée enregistrée ✓</div>}
              </div>
            )}

            <button onClick={syncGSheets} disabled={!gsActiveUrl || gsLoading}
              style={{ width:"100%", background:"linear-gradient(135deg,#059669,#34D399)", border:"none", borderRadius:10, color:"#fff", padding:"11px", cursor:"pointer", fontWeight:700, fontSize:14, opacity:(!gsActiveUrl||gsLoading)?0.6:1 }}>
              {gsLoading ? "⏳ Synchronisation…" : "🔄 Synchroniser depuis Google Sheets"}
            </button>
          </Card>

          <Card style={{ padding:16, background:"rgba(99,102,241,0.05)", border:"1px solid rgba(99,102,241,0.2)" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#818CF8", marginBottom:10 }}>📊 Données chargées</div>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap", fontSize:13, color:"#94A3B8" }}>
              <span><strong style={{color:"#F1F5F9"}}>{transactions.length}</strong> transactions</span>
              <span><strong style={{color:"#F1F5F9"}}>{years.length}</strong> années ({years.join(", ")})</span>
              <span><strong style={{color:"#F1F5F9"}}>{[...new Set(transactions.map(t=>`${t.annee}-${t.mois}`))].length}</strong> mois</span>
            </div>
            {transactions.length > 0 && (
              <button onClick={()=>{ if(confirm("Effacer toutes les données budget ?")){ setTransactions([]); localStorage.removeItem(BUDGET_KEY); }}}
                style={{ marginTop:12, background:"transparent", border:"1px solid rgba(248,113,113,0.3)", borderRadius:6, color:"#F87171", padding:"4px 12px", fontSize:11, cursor:"pointer" }}>
                🗑 Effacer toutes les données
              </button>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
// ─── AUTHENTIFICATION FIREBASE ────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email,    setEmail]    = useState("");
  const [pwd,      setPwd]      = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [shake,    setShake]    = useState(false);

  const doShake = () => { setShake(true); setTimeout(() => setShake(false), 450); };

  const tryLogin = async () => {
    if (!email || !pwd) { setError("Email et mot de passe requis"); doShake(); return; }
    setLoading(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pwd);
      onLogin();
    } catch (e) {
      const msg = {
        "auth/user-not-found":   "Utilisateur introuvable",
        "auth/wrong-password":   "Mot de passe incorrect",
        "auth/invalid-email":    "Email invalide",
        "auth/too-many-requests":"Trop de tentatives — réessaie plus tard",
        "auth/invalid-credential": "Email ou mot de passe incorrect",
      }[e.code] || "Erreur de connexion";
      setError(msg); doShake();
    } finally { setLoading(false); }
  };

  const inpStyle = {
    width:"100%", boxSizing:"border-box", background:"#1E293B",
    border:`1px solid ${error ? "#F87171" : "#334155"}`, borderRadius:10,
    padding:"11px 14px", color:"#F1F5F9", fontSize:14, outline:"none",
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0B1120", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-8px)} 80%{transform:translateX(8px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none" }}>
        <div style={{ position:"absolute", top:-200, right:-100, width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)" }} />
        <div style={{ position:"absolute", bottom:-100, left:-100, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)" }} />
      </div>
      <div style={{ position:"relative", zIndex:1, width:360, padding:36,
        background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:24, backdropFilter:"blur(12px)",
        animation: shake ? "shake 0.4s ease" : "fadeIn 0.4s ease" }}>

        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontFamily:"'Syne', sans-serif", fontSize:28, fontWeight:800, background:"linear-gradient(135deg, #818CF8, #34D399)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:4 }}>
            Patrimoine
          </div>
          <div style={{ fontSize:12, color:"#64748B" }}>Accès sécurisé · Synchronisé sur tous vos appareils</div>
        </div>

        {error && (
          <div style={{ marginBottom:14, padding:"9px 13px", borderRadius:8, background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", color:"#F87171", fontSize:13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:"#64748B", marginBottom:6 }}>Email</div>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&tryLogin()} autoFocus placeholder="votre@email.com" style={inpStyle} />
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:"#64748B", marginBottom:6 }}>Mot de passe</div>
          <input type="password" value={pwd} onChange={e=>{setPwd(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="••••••••••••" style={inpStyle} />
        </div>

        <button onClick={tryLogin} disabled={loading}
          style={{ width:"100%", background:"linear-gradient(135deg,#6366F1,#4F46E5)", border:"none", borderRadius:10, color:"#fff", padding:"12px", cursor:"pointer", fontWeight:700, fontSize:15, opacity:loading?0.7:1 }}>
          {loading ? "⏳ Connexion…" : "Accéder →"}
        </button>

        <div style={{ marginTop:20, textAlign:"center", fontSize:11, color:"#334155" }}>
          🔒 Données chiffrées · Firebase Europe
        </div>
      </div>
    </div>
  );
}

// ─── QUICK ADD MODAL ──────────────────────────────────────────────────────────
function QuickAddModal({ onClose, onAdd, cats }) {
  const now = new Date();
  const [es,      setEs]      = useState("Sortie");
  const [cat,     setCat]     = useState("");
  const [montant, setMontant] = useState("");
  const [note,    setNote]    = useState("");
  const [annee,   setAnnee]   = useState(now.getFullYear());
  const [mois,    setMois]    = useState(now.getMonth() + 1);
  const [saved,   setSaved]   = useState(false);

  const catList = es === "Entrée" ? (cats?.entree || []) : (cats?.sortie || []);

  // Sélection auto de la première catégorie quand on change de type
  useEffect(() => { if (catList.length) setCat(catList[0].name); }, [es]);

  const doAdd = () => {
    if (!cat || !montant) return;
    onAdd({ id:`tx-${Date.now()}`, annee:parseInt(annee), mois:parseInt(mois), es, type:cat, montant:parseFloat(montant), note });
    setMontant(""); setNote("");
    setSaved(true); setTimeout(() => setSaved(false), 1200);
  };

  const inp = { background:"#1E293B", border:"1px solid #334155", borderRadius:8,
    padding:"10px 14px", color:"#F1F5F9", fontSize:15, outline:"none", width:"100%", boxSizing:"border-box" };

  // Raccourcis clavier
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Backdrop */}
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }} onClick={onClose} />

      {/* Panel bas de page */}
      <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:520,
        background:"#0F172A", border:"1px solid rgba(255,255,255,0.1)", borderBottom:"none",
        borderRadius:"24px 24px 0 0", padding:"20px 20px 32px",
        animation:"slideUp 0.25s ease" }}>
        <style>{`@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }`}</style>

        {/* Handle */}
        <div style={{ width:40, height:4, background:"#334155", borderRadius:2, margin:"0 auto 18px" }} />

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:700, color:"#F1F5F9" }}>Nouvelle transaction</div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.06)", border:"none", borderRadius:8,
            color:"#64748B", width:32, height:32, cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        {/* Toggle Sortie / Entrée */}
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          {["Sortie","Entrée"].map(t => (
            <button key={t} onClick={() => setEs(t)}
              style={{ flex:1, padding:"9px 0", borderRadius:10, border:"none", cursor:"pointer", fontWeight:700, fontSize:14,
                background: es===t ? (t==="Sortie"?"#F87171":"#34D399") : "rgba(255,255,255,0.06)",
                color: es===t ? "#0B1120" : "#64748B" }}>
              {t === "Sortie" ? "📤 Dépense" : "📥 Entrée"}
            </button>
          ))}
        </div>

        {/* Montant — gros et centré */}
        <div style={{ marginBottom:14, textAlign:"center" }}>
          <div style={{ position:"relative", display:"inline-flex", alignItems:"center", width:"100%" }}>
            <span style={{ position:"absolute", left:14, fontSize:20, color:"#64748B", pointerEvents:"none" }}>€</span>
            <input type="number" step="0.01" autoFocus value={montant}
              onChange={e => setMontant(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doAdd()}
              placeholder="0.00"
              style={{ ...inp, fontSize:24, fontWeight:700, textAlign:"center", paddingLeft:32,
                color: es==="Sortie" ? "#F87171" : "#34D399",
                border:`1px solid ${es==="Sortie" ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.3)"}` }} />
          </div>
        </div>

        {/* Catégorie — scroll horizontal sur mobile */}
        <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:12, paddingBottom:4 }}>
          {catList.map(c => (
            <button key={c.name} onClick={() => setCat(c.name)}
              style={{ flexShrink:0, padding:"6px 12px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                background: cat===c.name ? c.color : "rgba(255,255,255,0.06)",
                color: cat===c.name ? "#0B1120" : "#94A3B8" }}>
              {c.name}
            </button>
          ))}
        </div>

        {/* Ligne date + note */}
        <div style={{ display:"grid", gridTemplateColumns:"80px 80px 1fr", gap:8, marginBottom:16 }}>
          <select value={mois} onChange={e=>setMois(e.target.value)}
            style={{ ...inp, fontSize:13, padding:"8px 10px" }}>
            {["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"].map((m,i)=>
              <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={annee} onChange={e=>setAnnee(e.target.value)}
            style={{ ...inp, fontSize:13, padding:"8px 10px" }}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <input value={note} onChange={e=>setNote(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doAdd()}
            placeholder="Note (Carrefour, Amazon…)" style={{ ...inp, fontSize:13 }} />
        </div>

        {/* Bouton valider */}
        <button onClick={doAdd} disabled={!cat || !montant}
          style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", cursor:"pointer",
            background: !cat||!montant ? "#1E293B" : "linear-gradient(135deg,#6366F1,#4F46E5)",
            color: !cat||!montant ? "#475569" : "#fff", fontSize:15, fontWeight:700,
            transition:"all 0.2s" }}>
          {saved ? "✅ Ajouté !" : "✓ Ajouter"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user,          setUser]          = useState(null);
  const [authChecked,   setAuthChecked]   = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  if (!authChecked) return (
    <div style={{ minHeight:"100vh", background:"#0B1120", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:13, color:"#64748B" }}>⏳ Vérification…</div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={() => {}} />;
  return <AppContent user={user} />;
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
async function exportSimulationPDF(params, computed, tableauAnnuel, tableauMensuel) {
  // Charger jsPDF dynamiquement
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  if (!window.jspdf?.jsPDF) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });

  // Helvetica built-in ne supporte pas les accents — on les remplace
  const a = (str) => (str||"")
    .replace(/[àâä]/g,"a").replace(/[ÀÂÄÁ]/g,"A")
    .replace(/[éèêë]/g,"e").replace(/[ÉÈÊË]/g,"E")
    .replace(/[îï]/g,"i").replace(/[ÎÏ]/g,"I")
    .replace(/[ôö]/g,"o").replace(/[ÔÖÓ]/g,"O")
    .replace(/[ùûü]/g,"u").replace(/[ÙÛÜ]/g,"U")
    .replace(/[ç]/g,"c").replace(/[Ç]/g,"C")
    .replace(/[œ]/g,"oe").replace(/[æ]/g,"ae")
    .replace(/[–—]/g,"-").replace(/[«»]/g,'"')
    .replace(/['']/g,"'").replace(/[""]/g,'"');

  const W = 210, ML = 14, MR = 196;
  const fmtE = (n) => new Intl.NumberFormat("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(n||0).replace(/\s/g," ");
  const fmtP = (n) => `${(n||0).toFixed(2)} %`;

  // ── Palette couleurs
  const C = { indigo:[99,102,241], green:[52,211,153], red:[248,113,113], amber:[251,191,36], blue:[96,165,250], bg:[15,23,42], card:[22,27,39], text:[241,245,249], muted:[100,116,139] };

  // ── Header page 1
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, W, 297, "F");
  doc.setFillColor(...C.card);
  doc.roundedRect(ML-2, 8, W-ML*2+4, 28, 3, 3, "F");
  doc.setTextColor(...C.indigo);
  doc.setFontSize(18); doc.setFont("helvetica","bold");
  doc.text(a("Simulation de Credit Immobilier"), ML+2, 19);
  doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(...C.muted);
  doc.text(a(`${params.nomSimulation}  ·  Contexte : ${params.contexteLabel}  ·  Genere le ${new Date().toLocaleDateString("fr-FR")}`), ML+2, 26);
  doc.setTextColor(...C.text);
  doc.setFontSize(8); doc.text(a(`Duree ${params.duree} ans · Taux ${fmtP(params.taux)} · Assurance ${fmtP(params.assurance)} · Frais notaire ${fmtP(params.fraisNotaire)}`), ML+2, 33);

  // ── Section KPIs principaux
  let y = 44;
  const kpiCols = [
    { label:a("Mensualite totale"),    val:fmtE(computed.mensualiteTotale),  col:C.indigo },
    { label:a("Montant emprunte"),     val:fmtE(computed.montantEmprunte),   col:C.blue },
    { label:a("Cout total credit"),    val:fmtE(computed.coutTotalCredit),   col:C.red },
    { label:a("TAEG estime"),          val:fmtP(computed.taeg),              col:C.amber },
    { label:a("Frais de notaire"),     val:fmtE(computed.fraisNotaireMontant), col:C.blue },
    { label:a("Cout total operation"), val:fmtE(computed.coutTotalOperation),col:[167,139,250] },
  ];
  const kW = (W - ML*2 - 5*3) / 6;
  kpiCols.forEach((k, i) => {
    const x = ML + i*(kW+3);
    doc.setFillColor(...C.card); doc.roundedRect(x, y, kW, 18, 2, 2, "F");
    doc.setDrawColor(...k.col); doc.setLineWidth(0.5); doc.line(x, y+18, x+kW, y+18);
    doc.setFontSize(6.5); doc.setTextColor(...C.muted); doc.setFont("helvetica","normal");
    doc.text(k.label, x+2, y+6);
    doc.setFontSize(9); doc.setTextColor(...k.col); doc.setFont("helvetica","bold");
    doc.text(k.val, x+2, y+14, { maxWidth: kW-2 });
  });

  // ── Section décomposition mensualité
  y += 24;
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...C.text);
  doc.text(a("Decomposition de la mensualite (1er mois)"), ML, y); y += 5;
  const decomp = [
    { label:a("Capital rembourse"),    val:computed.capitalMois1, pct:computed.capitalMois1/computed.mensualiteTotale*100, col:C.indigo },
    { label:a("Interets"),             val:computed.interetsMois1, pct:computed.interetsMois1/computed.mensualiteTotale*100, col:C.red },
    { label:a("Assurance"),            val:computed.assuranceMensuelle, pct:computed.assuranceMensuelle/computed.mensualiteTotale*100, col:C.amber },
  ];
  decomp.forEach(d => {
    doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(...C.muted);
    doc.text(d.label, ML, y+4);
    doc.setTextColor(...d.col); doc.setFont("helvetica","bold");
    doc.text(`${fmtE(d.val)}  (${d.pct.toFixed(1)}%)`, ML+50, y+4);
    doc.setFillColor(40,50,70); doc.roundedRect(ML+100, y+1, 80, 4, 1, 1, "F");
    doc.setFillColor(...d.col); doc.roundedRect(ML+100, y+1, 80*d.pct/100, 4, 1, 1, "F");
    y += 8;
  });
  doc.setDrawColor(...C.indigo); doc.setLineWidth(0.3);
  doc.line(ML, y, MR, y); y += 5;
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...C.indigo);
  doc.text(a(`Total mensualite : ${fmtE(computed.mensualiteTotale)}`), ML, y); y += 8;

  // ── Répartition coût total (texte)
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...C.text);
  doc.text(a("Repartition du cout total"), ML, y); y += 5;
  const repartition = [
    { label:a("Capital (montant emprunte)"), val:computed.montantEmprunte, col:C.indigo },
    { label:a("Interets totaux"),            val:computed.coutInterets,    col:C.red },
    { label:a("Assurance totale"),           val:computed.coutAssurance,   col:C.amber },
    { label:a("Frais de notaire"),           val:computed.fraisNotaireMontant, col:C.blue },
  ];
  const totalPie = repartition.reduce((s,r)=>s+r.val,0);
  repartition.forEach(r => {
    const pct = totalPie>0 ? r.val/totalPie*100 : 0;
    doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(...C.muted);
    doc.text(r.label, ML, y+4);
    doc.setTextColor(...r.col); doc.setFont("helvetica","bold");
    doc.text(`${fmtE(r.val)}  (${pct.toFixed(1)}%)`, ML+70, y+4);
    doc.setFillColor(40,50,70); doc.roundedRect(ML+120, y+1, 72, 4, 1, 1, "F");
    doc.setFillColor(...r.col); doc.roundedRect(ML+120, y+1, 72*pct/100, 4, 1, 1, "F");
    y += 8;
  });
  y += 4;

  // ── Comparatif durées
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...C.text);
  doc.text(a("Comparatif selon la duree"), ML, y); y += 5;
  const cmpHeaders = [a("Duree"), a("Mensualite"), a("Interets"), a("Assurance"), a("Cout total")];
  const cmpColW = [22, 36, 36, 36, 46];
  let cx = ML;
  doc.setFillColor(...C.card);
  doc.rect(ML, y, MR-ML, 7, "F");
  cmpHeaders.forEach((h,i) => {
    doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(...C.muted);
    doc.text(h, cx+1, y+5);
    cx += cmpColW[i];
  });
  y += 7;
  [10,15,20,25,30].forEach((d, ri) => {
    const tm = params.taux/100/12, nd=d*12;
    const mens = tm>0 ? computed.montantEmprunte*(tm*Math.pow(1+tm,nd))/(Math.pow(1+tm,nd)-1) : computed.montantEmprunte/nd;
    const assM = computed.montantEmprunte*params.assurance/100/12;
    const interets = Math.max(0, mens*nd - computed.montantEmprunte);
    const assTotal = assM*nd;
    const isActive = params.duree === d;
    if (ri%2===0) { doc.setFillColor(22,27,39); doc.rect(ML, y, MR-ML, 6, "F"); }
    if (isActive) { doc.setFillColor(30,35,60); doc.rect(ML, y, MR-ML, 6, "F"); }
    cx = ML;
    const row = [`${d} ans${isActive?" *":""}`, fmtE(mens+assM), fmtE(interets), fmtE(assTotal), fmtE(computed.montantEmprunte+interets+assTotal)];
    row.forEach((v,i) => {
      doc.setFontSize(7.5); doc.setFont("helvetica", i===0&&isActive?"bold":"normal");
      doc.setTextColor(i===0&&isActive?C.indigo[0]:C.text[0], i===0&&isActive?C.indigo[1]:C.text[1], i===0&&isActive?C.indigo[2]:C.text[2]);
      doc.text(v, cx+1, y+4.5);
      cx += cmpColW[i];
    });
    y += 6;
  });
  y += 6;

  // ── PAGE 2 : Tableau d'amortissement annuel
  doc.addPage();
  doc.setFillColor(...C.bg); doc.rect(0, 0, W, 297, "F");
  y = 14;
  doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.setTextColor(...C.indigo);
  doc.text(a("Tableau d'amortissement annuel"), ML, y); y += 4;
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(...C.muted);
  doc.text(a(`Simulation : ${params.nomSimulation}  ·  ${params.duree} ans  ·  ${fmtE(computed.montantEmprunte)} empruntes`), ML, y); y += 7;

  const amHeaders = [a("Annee"), a("Mensualites"), a("Capital"), a("Interets"), a("Assurance"), a("Capital restant"), a("% rembourse")];
  const amColW   = [18,30,28,28,26,32,26];
  cx = ML;
  doc.setFillColor(...C.card); doc.rect(ML, y, MR-ML, 7, "F");
  amHeaders.forEach((h,i) => {
    doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(...C.muted);
    doc.text(h, cx+1, y+5); cx += amColW[i];
  });
  y += 7;
  tableauAnnuel.forEach((r, ri) => {
    if (y > 280) { doc.addPage(); doc.setFillColor(...C.bg); doc.rect(0, 0, W, 297, "F"); y = 14; }
    const pct = computed.montantEmprunte > 0 ? (1 - r.capitalRestant/computed.montantEmprunte)*100 : 100;
    if (ri%2===0) { doc.setFillColor(22,27,39); doc.rect(ML, y, MR-ML, 6, "F"); }
    cx = ML;
    const row = [a(`Annee ${r.annee}`), fmtE(r.mensualite), fmtE(r.principal), fmtE(r.interets), fmtE(r.assurMo), fmtE(r.capitalRestant), `${pct.toFixed(1)}%`];
    const cols = [C.text, C.indigo, C.blue, C.red, C.amber, C.muted, C.green];
    row.forEach((v,i) => {
      doc.setFontSize(7.5); doc.setFont("helvetica","normal");
      doc.setTextColor(...cols[i]);
      doc.text(v, cx+1, y+4.5); cx += amColW[i];
    });
    y += 6;
  });

  // ── PAGE 3 : Tableau mensuel (24 premiers mois)
  doc.addPage();
  doc.setFillColor(...C.bg); doc.rect(0, 0, W, 297, "F");
  y = 14;
  doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.setTextColor(...C.indigo);
  doc.text(a("Tableau d'amortissement mensuel (24 premiers mois)"), ML, y); y += 4;
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(...C.muted);
  doc.text(a(`Simulation : ${params.nomSimulation}`), ML, y); y += 7;

  const mHeaders = ["Mois", a("Annee"), a("Mensualite"), "Capital", a("Interets"), "Assurance", a("Capital restant")];
  const mColW    = [14,14,30,28,28,26,34];
  cx = ML;
  doc.setFillColor(...C.card); doc.rect(ML, y, MR-ML, 7, "F");
  mHeaders.forEach((h,i) => {
    doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(...C.muted);
    doc.text(h, cx+1, y+5); cx += mColW[i];
  });
  y += 7;
  tableauMensuel.slice(0, 24).forEach((r, ri) => {
    if (ri%2===0) { doc.setFillColor(22,27,39); doc.rect(ML, y, MR-ML, 6, "F"); }
    cx = ML;
    const row = [`${r.mo}`, `${r.annee}`, fmtE(r.mensualite), fmtE(r.principal), fmtE(r.interets), fmtE(r.assurMo), fmtE(r.capitalRestant)];
    const cols = [C.muted, C.muted, C.indigo, C.blue, C.red, C.amber, C.muted];
    row.forEach((v,i) => {
      doc.setFontSize(7.5); doc.setFont("helvetica","normal");
      doc.setTextColor(...cols[i]);
      doc.text(v, cx+1, y+4.5); cx += mColW[i];
    });
    y += 6;
  });
  if (tableauMensuel.length > 24) {
    y += 4;
    doc.setFontSize(8); doc.setTextColor(...C.muted);
    doc.text(a(`... et ${tableauMensuel.length - 24} mois supplementaires (voir tableau annuel)`), ML, y);
  }

  // ── Footer toutes les pages
  const totalPages = doc.getNumberOfPages();
  for (let p=1; p<=totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setTextColor(...C.muted);
    doc.text(a(`Mon Patrimoine · Simulateur de credit · Page ${p}/${totalPages}`), ML, 292);
    doc.text(a(`Simulation : ${params.nomSimulation}`), MR, 292, { align:"right" });
  }

  doc.save(`simulation-credit-${a(params.nomSimulation).replace(/\s+/g,"-").toLowerCase()}.pdf`);
}

function SimulateurCredit({ cryptoTotal, stocksTotal, savingsTotal, bankTotal, realestateTotal, scpiTotal, grandTotal, uid }) {
  const [transactions, setTransactions] = useState([]);
  useEffect(() => {
    if (uid) {
      fbGet(uid, "budget_tx").then(d => { if (d) setTransactions(d); });
    } else {
      try { const r = JSON.parse(localStorage.getItem("patrimoine_budget_v1")||"[]"); if(r.length) setTransactions(r); } catch {}
    }
  }, [uid]);

  // ── Simulations sauvegardées
  const [simulations, setSimulations] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [nomSim, setNomSim] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // Charger simulations depuis Firebase
  useEffect(() => {
    if (!uid) return;
    fbGet(uid, "credit_simulations").then(d => { if (Array.isArray(d)) setSimulations(d); });
  }, [uid]);

  const saveSimulations = async (list) => {
    setSimulations(list);
    if (uid) await fbSet(uid, "credit_simulations", list);
  };

  const CONTEXTES = [
    { key: "rp",      label: "🏠 Résidence principale" },
    { key: "locatif", label: "🏢 Investissement locatif" },
    { key: "rachat",  label: "🔄 Rachat de crédit" },
    { key: "general", label: "📋 Usage général" },
  ];

  const inpS = { background:"#1E293B", border:"1px solid #334155", borderRadius:8, padding:"8px 12px", color:"#F1F5F9", fontSize:13, width:"100%", outline:"none" };
  const lblS = { fontSize:11, color:"#64748B", marginBottom:5, display:"block" };
  const rangeS = { width:"100%", accentColor:"#818CF8", cursor:"pointer" };

  // ── État principal
  const [contexte, setContexte] = useState("rp");
  const [activeSection, setActiveSection] = useState("mensualite");

  // ── Params crédit communs
  const [montantBien, setMontantBien]   = useState(300000);
  const [apport,      setApport]        = useState(30000);
  const [duree,       setDuree]         = useState(20);
  const [taux,        setTaux]          = useState(3.5);
  const [assurance,   setAssurance]     = useState(0.35);
  const [fraisNotaire, setFraisNotaire] = useState(7.5); // % du prix pour RP (neuf=3%)
  const [differe,     setDiffere]       = useState(0); // mois de différé
  const [tauxEndet,   setTauxEndet]     = useState(35); // % max endettement

  // ── Tableau amortissement
  const [amortView,   setAmortView]     = useState("annuel"); // "mensuel" | "annuel"
  const [amortPage,   setAmortPage]     = useState(0);
  const AMORT_PER_PAGE = 24; // mois par page

  // ── Capacité d'emprunt
  const [revenuMode,  setRevenuMode]    = useState("manuel"); // "manuel" | "budget"
  const [revenuManuel, setRevenuManuel] = useState(3000);
  const [chargesExistantes, setChargesExistantes] = useState(0);

  // Sources patrimoine pour apport
  const SOURCES = [
    { key: "bank",       label: "🏦 Banque",        val: bankTotal },
    { key: "savings",    label: "🟠 Épargne sal.",   val: savingsTotal },
    { key: "crypto",     label: "₿ Crypto",          val: cryptoTotal },
    { key: "stocks",     label: "📈 Bourse",         val: stocksTotal },
    { key: "scpi",       label: "🏢 SCPI",           val: scpiTotal },
    { key: "realestate", label: "🏠 Immobilier",     val: realestateTotal },
  ];
  const [selectedSources, setSelectedSources] = useState(["bank"]);
  const toggleSource = (key) => setSelectedSources(prev =>
    prev.includes(key) ? prev.filter(k=>k!==key) : [...prev, key]
  );
  const apportPatrimoine = SOURCES.filter(s => selectedSources.includes(s.key)).reduce((s,x) => s+x.val, 0);

  // ── Revenus budget auto (moyenne 12 derniers mois)
  const revenuBudgetAuto = (() => {
    if (!transactions || !transactions.length) return 0;
    const now = new Date();
    const mo = now.getMonth()+1, yr = now.getFullYear();
    const moisPassés = [];
    for (let i=1; i<=12; i++) { let m=mo-i, y=yr; if(m<=0){m+=12;y-=1;} moisPassés.push({y,m}); }
    const total = moisPassés.reduce((s,{y,m}) =>
      s + transactions.filter(t=>t.annee===y&&t.mois===m&&t.es==="Entrée").reduce((a,t)=>a+t.montant,0), 0);
    const nonZero = moisPassés.filter(({y,m}) => transactions.some(t=>t.annee===y&&t.mois===m&&t.es==="Entrée")).length;
    return nonZero > 0 ? total/nonZero : 0;
  })();

  const revenuNet = revenuMode === "budget" ? revenuBudgetAuto : revenuManuel;

  // ── Calculs de base
  const fraisNotaireMontant = montantBien * fraisNotaire / 100;
  const coutTotal_bien = montantBien + fraisNotaireMontant;
  const montantEmprunte = Math.max(0, coutTotal_bien - apport);

  // Mensualité (formule annuité constante) + assurance
  const tauxMensuel = taux / 100 / 12;
  const n = duree * 12;
  const mensualiteHorsAssurance = tauxMensuel > 0
    ? montantEmprunte * (tauxMensuel * Math.pow(1+tauxMensuel, n)) / (Math.pow(1+tauxMensuel, n) - 1)
    : montantEmprunte / n;
  const assuranceMensuelle = montantEmprunte * assurance / 100 / 12;
  const mensualiteTotale = mensualiteHorsAssurance + assuranceMensuelle;
  const coutInterets = mensualiteHorsAssurance * n - montantEmprunte;
  const coutAssurance = assuranceMensuelle * n;
  const coutTotalCredit = montantEmprunte + coutInterets + coutAssurance;
  const taeg = (() => {
    if (montantEmprunte <= 0 || mensualiteTotale <= 0) return 0;
    // Bisection sur le taux mensuel — borne basse toujours > 0, jamais de TAEG négatif
    let lo = 0.000001, hi = (taux + assurance + 5) / 100 / 12;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      const va = mensualiteTotale * (1 - Math.pow(1 + mid, -n)) / mid;
      if (va > montantEmprunte) lo = mid; else hi = mid;
    }
    // Taux mensuel → taux annuel effectif : (1+r)^12 - 1
    return (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100;
  })();

  // ── Tableau d'amortissement
  const tableauMensuel = (() => {
    const rows = [];
    let capital = montantEmprunte;
    for (let mo=1; mo<=n; mo++) {
      const interets = capital * tauxMensuel;
      const principal = mensualiteHorsAssurance - interets;
      const assurMo = assuranceMensuelle;
      capital = Math.max(0, capital - principal);
      rows.push({ mo, annee: Math.ceil(mo/12), interets, principal, assurMo, mensualite: mensualiteHorsAssurance+assurMo, capitalRestant: capital });
    }
    return rows;
  })();

  const tableauAnnuel = (() => {
    const map = {};
    tableauMensuel.forEach(r => {
      if (!map[r.annee]) map[r.annee] = { annee:r.annee, interets:0, principal:0, assurMo:0, capitalRestant:0, mensualite:0 };
      map[r.annee].interets    += r.interets;
      map[r.annee].principal   += r.principal;
      map[r.annee].assurMo     += r.assurMo;
      map[r.annee].mensualite  += r.mensualite;
      map[r.annee].capitalRestant = r.capitalRestant;
    });
    return Object.values(map);
  })();

  // ── Capacité d'emprunt
  const mensualiteMax = (revenuNet - chargesExistantes) * tauxEndet / 100;
  const capaciteEmprunter = mensualiteMax > 0 && tauxMensuel > 0
    ? mensualiteMax / (tauxMensuel * Math.pow(1+tauxMensuel,n) / (Math.pow(1+tauxMensuel,n)-1) + assurance/100/12)
    : 0;
  const prixMaxSansPatrimoine = capaciteEmprunter + apport;
  const prixMaxAvecPatrimoine = capaciteEmprunter + apportPatrimoine;

  // ── Données graphique répartition coût
  const pieData = [
    { name:"Capital", value: Math.round(montantEmprunte), color:"#818CF8" },
    { name:"Intérêts", value: Math.round(coutInterets),   color:"#F87171" },
    { name:"Assurance", value: Math.round(coutAssurance), color:"#FBBF24" },
    { name:"Notaire",   value: Math.round(fraisNotaireMontant), color:"#60A5FA" },
  ];

  // ── Données graphique évolution capital restant dû
  const evolData = tableauAnnuel.map(r => ({
    annee: `An ${r.annee}`,
    capital: Math.round(r.capitalRestant),
    interets: Math.round(r.interets),
    principal: Math.round(r.principal),
  }));

  const sectionTabs = [
    { key:"mensualite",    label:"💶 Mensualité" },
    { key:"capacite",      label:"📊 Capacité" },
    { key:"amortissement", label:"📋 Amortissement" },
    { key:"apport",        label:"💼 Impact apport" },
    { key:"sauvegardes",   label:`💾 Mes simulations${simulations.length>0?" ("+simulations.length+")":""}` },
  ];

  // ── Snapshot des paramètres courants
  const snapshotParams = () => ({
    contexte, contexteLabel: CONTEXTES.find(c=>c.key===contexte)?.label || contexte,
    montantBien, apport, duree, taux, assurance, fraisNotaire, differe, tauxEndet,
    revenuMode, revenuManuel, chargesExistantes, selectedSources,
  });

  const snapshotComputed = () => ({
    mensualiteTotale, montantEmprunte, coutTotalCredit, taeg,
    fraisNotaireMontant, coutTotalOperation: apport + coutTotalCredit + fraisNotaireMontant,
    coutInterets, coutAssurance, assuranceMensuelle,
    capitalMois1: mensualiteHorsAssurance - montantEmprunte * tauxMensuel,
    interetsMois1: montantEmprunte * tauxMensuel,
  });

  const handleSave = async () => {
    if (!nomSim.trim()) { setSaveStatus("❌ Donne un nom à la simulation"); return; }
    const sim = {
      id: `sim-${Date.now()}`,
      nom: nomSim.trim(),
      date: new Date().toLocaleDateString("fr-FR"),
      params: snapshotParams(),
      computed: snapshotComputed(),
    };
    const updated = [...simulations, sim];
    await saveSimulations(updated);
    setSaveModal(false); setNomSim(""); setSaveStatus("✅ Simulation sauvegardée !");
    setTimeout(() => setSaveStatus(""), 3000);
    setActiveSection("sauvegardes");
  };

  const handleLoad = (sim) => {
    const p = sim.params;
    setContexte(p.contexte);
    setMontantBien(p.montantBien); setApport(p.apport); setDuree(p.duree);
    setTaux(p.taux); setAssurance(p.assurance); setFraisNotaire(p.fraisNotaire);
    setDiffere(p.differe || 0); setTauxEndet(p.tauxEndet || 35);
    setRevenuMode(p.revenuMode || "manuel"); setRevenuManuel(p.revenuManuel || 3000);
    setChargesExistantes(p.chargesExistantes || 0);
    setSelectedSources(p.selectedSources || ["bank"]);
    setActiveSection("mensualite");
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette simulation ?")) return;
    const updated = simulations.filter(s => s.id !== id);
    await saveSimulations(updated);
  };

  const handleExportPDF = async (sim) => {
    setPdfLoading(true);
    try {
      await exportSimulationPDF(
        { ...sim.params, nomSimulation: sim.nom },
        sim.computed,
        tableauAnnuel,
        tableauMensuel
      );
    } finally { setPdfLoading(false); }
  };

  const handleExportCurrentPDF = async () => {
    setPdfLoading(true);
    try {
      await exportSimulationPDF(
        { ...snapshotParams(), nomSimulation: "Simulation en cours" },
        snapshotComputed(),
        tableauAnnuel,
        tableauMensuel
      );
    } finally { setPdfLoading(false); }
  };

  const CustomTooltipPie = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const total = pieData.reduce((s,d)=>s+d.value,0);
    return (
      <div style={{ background:"#0F1929", border:"1px solid #1E3050", borderRadius:8, padding:"8px 14px", fontSize:12 }}>
        <div style={{ color:payload[0].payload.color, fontWeight:700 }}>{payload[0].name}</div>
        <div style={{ color:"#F1F5F9" }}>{fmt(payload[0].value)}</div>
        <div style={{ color:"#64748B" }}>{total>0?(payload[0].value/total*100).toFixed(1):0}%</div>
      </div>
    );
  };

  return (
    <div>
      <SectionTitle sub="Simulation · tous paramètres ajustables">🏦 Simulateur de crédit</SectionTitle>

      {/* ── Contexte ── */}
      <Card style={{ marginBottom:14, padding:"14px 18px" }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ fontSize:12, color:"#64748B", fontWeight:600, marginRight:4 }}>Contexte :</span>
          {CONTEXTES.map(c => (
            <button key={c.key} onClick={()=>setContexte(c.key)} style={{
              background: contexte===c.key ? "rgba(129,140,248,0.2)" : "transparent",
              border: `1px solid ${contexte===c.key ? "#818CF8" : "rgba(255,255,255,0.08)"}`,
              borderRadius:20, color: contexte===c.key ? "#A5B4FC" : "#64748B",
              padding:"5px 14px", fontSize:12, cursor:"pointer", fontWeight: contexte===c.key?700:400,
              transition:"all 0.15s"
            }}>{c.label}</button>
          ))}
        </div>
      </Card>

      {/* ── Params globaux ── */}
      <Card style={{ marginBottom:14, padding:"16px 20px" }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:14 }}>⚙️ Paramètres du prêt</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px,1fr))", gap:16 }}>
          {/* Prix du bien */}
          <div>
            <label style={lblS}>Prix du bien — <strong style={{ color:"#F1F5F9" }}>{fmt(montantBien)}</strong></label>
            <input type="range" min={50000} max={1500000} step={5000} value={montantBien} onChange={e=>setMontantBien(+e.target.value)} style={rangeS} />
            <input type="number" value={montantBien} onChange={e=>setMontantBien(+e.target.value)} style={{...inpS, marginTop:6}} />
          </div>
          {/* Apport */}
          <div>
            <label style={lblS}>Apport personnel — <strong style={{ color:"#34D399" }}>{fmt(apport)}</strong></label>
            <input type="range" min={0} max={montantBien} step={1000} value={apport} onChange={e=>setApport(+e.target.value)} style={rangeS} />
            <input type="number" value={apport} onChange={e=>setApport(+e.target.value)} style={{...inpS, marginTop:6}} />
          </div>
          {/* Durée */}
          <div>
            <label style={lblS}>Durée — <strong style={{ color:"#F1F5F9" }}>{duree} ans</strong></label>
            <input type="range" min={5} max={30} step={1} value={duree} onChange={e=>setDuree(+e.target.value)} style={rangeS} />
            <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
              {[10,15,20,25,30].map(d => (
                <button key={d} onClick={()=>setDuree(d)} style={{ background:duree===d?"rgba(129,140,248,0.2)":"rgba(255,255,255,0.04)", border:duree===d?"1px solid #818CF8":"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:duree===d?"#A5B4FC":"#94A3B8", padding:"3px 10px", fontSize:11, cursor:"pointer" }}>{d}a</button>
              ))}
            </div>
          </div>
          {/* Taux */}
          <div>
            <label style={lblS}>Taux nominal — <strong style={{ color:"#F1F5F9" }}>{taux}%</strong></label>
            <input type="range" min={0.5} max={8} step={0.05} value={taux} onChange={e=>setTaux(+e.target.value)} style={rangeS} />
            <input type="number" step={0.05} value={taux} onChange={e=>setTaux(+e.target.value)} style={{...inpS, marginTop:6}} />
          </div>
          {/* Assurance */}
          <div>
            <label style={lblS}>Assurance (TAEA) — <strong style={{ color:"#F1F5F9" }}>{assurance}%</strong></label>
            <input type="range" min={0} max={1} step={0.01} value={assurance} onChange={e=>setAssurance(+e.target.value)} style={rangeS} />
            <input type="number" step={0.01} value={assurance} onChange={e=>setAssurance(+e.target.value)} style={{...inpS, marginTop:6}} />
          </div>
          {/* Frais de notaire */}
          <div>
            <label style={lblS}>Frais de notaire — <strong style={{ color:"#F1F5F9" }}>{fraisNotaire}%</strong> ({fmt(fraisNotaireMontant)})</label>
            <input type="range" min={0} max={12} step={0.1} value={fraisNotaire} onChange={e=>setFraisNotaire(+e.target.value)} style={rangeS} />
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              {[{l:"Neuf 3%",v:3},{l:"Ancien 7.5%",v:7.5},{l:"Max 10%",v:10}].map(({l,v}) => (
                <button key={v} onClick={()=>setFraisNotaire(v)} style={{ background:fraisNotaire===v?"rgba(96,165,250,0.2)":"rgba(255,255,255,0.04)", border:fraisNotaire===v?"1px solid #60A5FA":"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:fraisNotaire===v?"#93C5FD":"#94A3B8", padding:"3px 8px", fontSize:10, cursor:"pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          {/* Différé */}
          <div>
            <label style={lblS}>Différé — <strong style={{ color:"#F1F5F9" }}>{differe} mois</strong></label>
            <input type="range" min={0} max={24} step={1} value={differe} onChange={e=>setDiffere(+e.target.value)} style={rangeS} />
            <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>
              {differe > 0 ? `Remboursement commence en mois ${differe+1}` : "Pas de différé"}
            </div>
          </div>
        </div>
      </Card>

      {/* ── KPIs résumé ── */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <StatCard label="Mensualité totale" value={fmt(mensualiteTotale)} sub={`dont assurance ${fmt(assuranceMensuelle)}/mois`} color="#818CF8" icon="💶" />
        <StatCard label="Montant emprunté" value={fmt(montantEmprunte)} sub={`Bien ${fmt(montantBien)} − Apport ${fmt(apport)}`} color="#60A5FA" icon="🏦" />
        <StatCard label="Coût total du crédit" value={fmt(coutTotalCredit)} sub={`Intérêts ${fmt(coutInterets)}`} color="#F87171" icon="💸" />
        <StatCard label="TAEG estimé" value={`${taeg.toFixed(2)}%`} sub={`Taux + assurance`} color="#FBBF24" icon="📊" />
        <StatCard label="Frais de notaire" value={fmt(fraisNotaireMontant)} sub={`${fraisNotaire}% du prix d'achat`} color="#60A5FA" icon="📜" />
        <StatCard label="Coût total opération" value={fmt(apport + coutTotalCredit + fraisNotaireMontant)} sub="Apport + crédit + notaire" color="#A78BFA" icon="🧾" />
      </div>

      {/* ── Nav sections + boutons actions ── */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        {sectionTabs.map(s => (
          <Pill key={s.key} label={s.label} active={activeSection===s.key} onClick={()=>setActiveSection(s.key)} />
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button onClick={()=>setSaveModal(true)} style={{ background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.3)", borderRadius:8, color:"#34D399", padding:"6px 14px", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
            💾 Sauvegarder
          </button>
          <button onClick={handleExportCurrentPDF} disabled={pdfLoading} style={{ background:"rgba(129,140,248,0.1)", border:"1px solid rgba(129,140,248,0.3)", borderRadius:8, color:"#818CF8", padding:"6px 14px", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:6, opacity:pdfLoading?0.6:1 }}>
            {pdfLoading ? "⏳ Génération…" : "📄 Exporter PDF"}
          </button>
        </div>
      </div>

      {/* ── Modal sauvegarde ── */}
      {saveModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#161B27", border:"1px solid #334155", borderRadius:16, padding:"28px 32px", minWidth:380, maxWidth:460, boxShadow:"0 24px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#F1F5F9", marginBottom:6 }}>💾 Sauvegarder la simulation</div>
            <div style={{ fontSize:12, color:"#64748B", marginBottom:18 }}>Donne un nom pour retrouver cette simulation plus tard.</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:"#64748B", display:"block", marginBottom:6 }}>Nom de la simulation</label>
              <input
                autoFocus
                value={nomSim}
                onChange={e=>setNomSim(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSave()}
                placeholder="Ex : RP 300k – 20 ans – 3.5%"
                style={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, padding:"10px 14px", color:"#F1F5F9", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box" }}
              />
            </div>
            {/* Résumé rapide */}
            <div style={{ background:"rgba(129,140,248,0.08)", border:"1px solid rgba(129,140,248,0.15)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#94A3B8" }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span>Mensualité</span><strong style={{ color:"#818CF8" }}>{fmt(mensualiteTotale)}</strong>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span>Montant emprunté</span><strong style={{ color:"#60A5FA" }}>{fmt(montantEmprunte)}</strong>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span>Durée / Taux</span><strong style={{ color:"#F1F5F9" }}>{duree} ans · {taux}%</strong>
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{ setSaveModal(false); setNomSim(""); }} style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#94A3B8", padding:"10px", fontSize:13, cursor:"pointer" }}>Annuler</button>
              <button onClick={handleSave} style={{ flex:2, background:"linear-gradient(135deg,#34D399,#059669)", border:"none", borderRadius:8, color:"#fff", padding:"10px", fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MENSUALITÉ ════════ */}
      {activeSection === "mensualite" && (
        <div>
          {/* Graphique répartition coût */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <Card style={{ padding:"16px 20px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:12 }}>Répartition du coût total</div>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={36} outerRadius={58} paddingAngle={3} dataKey="value">
                      {pieData.map((e,i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltipPie />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {pieData.map(d => (
                    <div key={d.name} style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:8, height:8, borderRadius:2, background:d.color, flexShrink:0 }} />
                      <span style={{ fontSize:12, color:"#64748B", minWidth:64 }}>{d.name}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:d.color }}>{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card style={{ padding:"16px 20px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:12 }}>Évolution du capital restant dû</div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={evolData} margin={{ top:4, right:8, bottom:0, left:0 }}>
                  <defs>
                    <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818CF8" stopOpacity={0.25}/>
                      <stop offset="100%" stopColor="#818CF8" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="annee" tick={{ fontSize:9, fill:"#475569" }} tickLine={false} axisLine={false} interval={Math.floor(duree/6)} />
                  <YAxis tick={{ fontSize:9, fill:"#475569" }} tickLine={false} axisLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} width={36} />
                  <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:11 }} formatter={v=>[fmt(v),"Capital restant"]} />
                  <Area type="monotone" dataKey="capital" stroke="#818CF8" strokeWidth={2} fill="url(#capGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Barres mensualité décomposée + taux endettement */}
          <Card style={{ padding:"16px 20px", marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:14 }}>Décomposition mensualité</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[
                { label:"Capital remboursé (mois 1)", val:mensualiteHorsAssurance - montantEmprunte * tauxMensuel, color:"#818CF8" },
                { label:"Intérêts (mois 1)",           val:montantEmprunte * tauxMensuel,                         color:"#F87171" },
                { label:"Assurance",                   val:assuranceMensuelle,                                    color:"#FBBF24" },
              ].map(r => {
                const pct = mensualiteTotale > 0 ? r.val/mensualiteTotale*100 : 0;
                return (
                  <div key={r.label}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, color:"#94A3B8" }}>{r.label}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:r.color }}>{fmt(r.val)} <span style={{ color:"#475569", fontWeight:400 }}>({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div style={{ height:6, background:"rgba(255,255,255,0.07)", borderRadius:3 }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:r.color, borderRadius:3, transition:"width 0.4s" }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop:8, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#F1F5F9" }}>Total mensualité</span>
                <span style={{ fontSize:16, fontWeight:800, color:"#818CF8" }}>{fmt(mensualiteTotale)}</span>
              </div>
            </div>
          </Card>

          {/* Comparateur durées */}
          <Card style={{ padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:12 }}>Comparatif selon la durée</div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                    {["Durée","Mensualité","Coût intérêts","Coût assurance","Coût total crédit","TAEG"].map(h => (
                      <th key={h} style={{ padding:"9px 14px", textAlign:"right", color:"#64748B", fontWeight:600, fontSize:11, borderBottom:"1px solid rgba(255,255,255,0.08)", whiteSpace:"nowrap",
                        ...(h==="Durée"?{textAlign:"left"}:{}) }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[10,15,20,25,30].map(d => {
                    const tm = taux/100/12, nd = d*12;
                    const mens = tm > 0 ? montantEmprunte*(tm*Math.pow(1+tm,nd))/(Math.pow(1+tm,nd)-1) : montantEmprunte/nd;
                    const ass = assuranceMensuelle;
                    const interets = mens*nd - montantEmprunte;
                    const assTotal = ass*nd;
                    const total = montantEmprunte + interets + assTotal;
                    const isActive = duree === d;
                    return (
                      <tr key={d} onClick={()=>setDuree(d)} style={{ cursor:"pointer", background:isActive?"rgba(129,140,248,0.1)":"transparent", transition:"background 0.15s" }}>
                        <td style={{ padding:"9px 14px", color:isActive?"#A5B4FC":"#F1F5F9", fontWeight:isActive?700:400, borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{d} ans {isActive?"✓":""}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#818CF8", fontWeight:700, borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(mens+ass)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#F87171", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(interets)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#FBBF24", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(assTotal)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#60A5FA", fontWeight:600, borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(total)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#94A3B8", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{(taux + assurance).toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ════════ CAPACITÉ D'EMPRUNT ════════ */}
      {activeSection === "capacite" && (
        <div>
          <Card style={{ marginBottom:14, padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:14 }}>Revenus & charges</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px,1fr))", gap:16, marginBottom:16 }}>
              <div>
                <label style={lblS}>Source des revenus</label>
                <div style={{ display:"flex", gap:8 }}>
                  {[["manuel","✏️ Manuel"],["budget","📊 Budget auto"]].map(([k,l]) => (
                    <button key={k} onClick={()=>setRevenuMode(k)} style={{ flex:1, background:revenuMode===k?"rgba(129,140,248,0.2)":"rgba(255,255,255,0.04)", border:revenuMode===k?"1px solid #818CF8":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:revenuMode===k?"#A5B4FC":"#94A3B8", padding:"8px", fontSize:12, cursor:"pointer", fontWeight:revenuMode===k?700:400 }}>{l}</button>
                  ))}
                </div>
                {revenuMode === "budget" && revenuBudgetAuto > 0 && (
                  <div style={{ marginTop:8, fontSize:11, color:"#34D399" }}>
                    Moyenne détectée : {fmt(revenuBudgetAuto)}/mois (12 derniers mois)
                  </div>
                )}
                {revenuMode === "budget" && revenuBudgetAuto === 0 && (
                  <div style={{ marginTop:8, fontSize:11, color:"#F87171" }}>Pas de données budget disponibles</div>
                )}
              </div>
              {revenuMode === "manuel" && (
                <div>
                  <label style={lblS}>Revenus nets mensuels — <strong style={{ color:"#F1F5F9" }}>{fmt(revenuManuel)}</strong></label>
                  <input type="range" min={500} max={20000} step={100} value={revenuManuel} onChange={e=>setRevenuManuel(+e.target.value)} style={rangeS} />
                  <input type="number" value={revenuManuel} onChange={e=>setRevenuManuel(+e.target.value)} style={{...inpS, marginTop:6}} />
                </div>
              )}
              <div>
                <label style={lblS}>Charges mensuelles existantes — <strong style={{ color:"#F1F5F9" }}>{fmt(chargesExistantes)}</strong></label>
                <input type="range" min={0} max={5000} step={50} value={chargesExistantes} onChange={e=>setChargesExistantes(+e.target.value)} style={rangeS} />
                <input type="number" value={chargesExistantes} onChange={e=>setChargesExistantes(+e.target.value)} style={{...inpS, marginTop:6}} />
              </div>
              <div>
                <label style={lblS}>Taux d'endettement max — <strong style={{ color:"#F1F5F9" }}>{tauxEndet}%</strong></label>
                <input type="range" min={20} max={40} step={1} value={tauxEndet} onChange={e=>setTauxEndet(+e.target.value)} style={rangeS} />
                <div style={{ display:"flex", gap:6, marginTop:6 }}>
                  {[33, 35, 40].map(v => (
                    <button key={v} onClick={()=>setTauxEndet(v)} style={{ background:tauxEndet===v?"rgba(129,140,248,0.2)":"rgba(255,255,255,0.04)", border:tauxEndet===v?"1px solid #818CF8":"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:tauxEndet===v?"#A5B4FC":"#94A3B8", padding:"3px 10px", fontSize:11, cursor:"pointer" }}>{v}%</button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Sources patrimoine */}
          <Card style={{ marginBottom:14, padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:4 }}>Sources d'apport depuis mon patrimoine</div>
            <div style={{ fontSize:11, color:"#64748B", marginBottom:12 }}>Sélectionne les poches que tu peux mobiliser pour l'apport</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
              {SOURCES.map(s => (
                <button key={s.key} onClick={()=>toggleSource(s.key)} style={{
                  background: selectedSources.includes(s.key) ? "rgba(129,140,248,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selectedSources.includes(s.key) ? "#818CF8" : "rgba(255,255,255,0.08)"}`,
                  borderRadius:20, color: selectedSources.includes(s.key) ? "#A5B4FC" : "#64748B",
                  padding:"5px 14px", fontSize:12, cursor:"pointer", fontWeight: selectedSources.includes(s.key)?700:400,
                  transition:"all 0.15s"
                }}>
                  {s.label} · {fmt(s.val)}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, padding:"12px 16px", background:"rgba(129,140,248,0.08)", borderRadius:10, border:"1px solid rgba(129,140,248,0.2)", alignItems:"center" }}>
              <span style={{ fontSize:12, color:"#64748B" }}>Apport sélectionné :</span>
              <span style={{ fontSize:18, fontWeight:800, color:"#818CF8" }}>{fmt(apportPatrimoine)}</span>
              <span style={{ fontSize:11, color:"#64748B" }}>soit {grandTotal>0?(apportPatrimoine/grandTotal*100).toFixed(1):0}% du patrimoine total</span>
            </div>
          </Card>

          {/* Résultats capacité */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <Card style={{ padding:"16px 20px", border:"1px solid rgba(52,211,153,0.2)" }}>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:6 }}>CAPACITÉ D'EMPRUNT</div>
              <div style={{ fontSize:28, fontWeight:800, color:"#34D399", marginBottom:4 }}>{fmt(capaciteEmprunter)}</div>
              <div style={{ fontSize:12, color:"#64748B" }}>Mensualité max : {fmt(mensualiteMax)}/mois</div>
              <div style={{ fontSize:12, color:"#64748B" }}>Taux endettement : {tauxEndet}% de {fmt(revenuNet)}</div>
            </Card>
            <Card style={{ padding:"16px 20px", border:"1px solid rgba(167,139,250,0.2)" }}>
              <div style={{ fontSize:11, color:"#64748B", marginBottom:6 }}>PRIX MAX ACCESSIBLE</div>
              <div>
                <div style={{ fontSize:12, color:"#94A3B8", marginBottom:2 }}>Sans patrimoine (apport manuel {fmt(apport)})</div>
                <div style={{ fontSize:20, fontWeight:800, color:"#818CF8", marginBottom:8 }}>{fmt(prixMaxSansPatrimoine)}</div>
                <div style={{ fontSize:12, color:"#94A3B8", marginBottom:2 }}>Avec apport patrimoine ({fmt(apportPatrimoine)})</div>
                <div style={{ fontSize:20, fontWeight:800, color:"#A78BFA" }}>{fmt(prixMaxAvecPatrimoine)}</div>
              </div>
            </Card>
          </div>

          {/* Gauge taux endettement */}
          <Card style={{ padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:12 }}>Taux d'endettement simulé</div>
            {(() => {
              const txActuel = revenuNet > 0 ? (mensualiteTotale + chargesExistantes) / revenuNet * 100 : 0;
              const col = txActuel > 40 ? "#F87171" : txActuel > 35 ? "#FBBF24" : "#34D399";
              return (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:12, color:"#94A3B8" }}>Endettement avec ce crédit</span>
                    <span style={{ fontSize:16, fontWeight:800, color:col }}>{txActuel.toFixed(1)}%</span>
                  </div>
                  <div style={{ height:14, background:"rgba(255,255,255,0.07)", borderRadius:7, overflow:"hidden", position:"relative" }}>
                    <div style={{ position:"absolute", left:`${tauxEndet}%`, top:0, bottom:0, width:2, background:"rgba(255,255,255,0.3)", zIndex:1 }} title={`Limite ${tauxEndet}%`} />
                    <div style={{ width:`${Math.min(100,txActuel)}%`, height:"100%", background:col, borderRadius:7, transition:"width 0.4s" }} />
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                    <span style={{ fontSize:10, color:"#475569" }}>0%</span>
                    <span style={{ fontSize:10, color:"#FBBF24" }}>Limite {tauxEndet}%</span>
                    <span style={{ fontSize:10, color:"#475569" }}>100%</span>
                  </div>
                  {txActuel > tauxEndet && (
                    <div style={{ marginTop:10, padding:"8px 14px", background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:8, fontSize:12, color:"#F87171" }}>
                      ⚠️ Taux d'endettement dépassé. Augmente l'apport ou réduis le montant emprunté.
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* ════════ TABLEAU D'AMORTISSEMENT ════════ */}
      {activeSection === "amortissement" && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
            <button onClick={()=>{ setAmortView("annuel"); setAmortPage(0); }} style={{ background:amortView==="annuel"?"rgba(129,140,248,0.2)":"rgba(255,255,255,0.04)", border:amortView==="annuel"?"1px solid #818CF8":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:amortView==="annuel"?"#A5B4FC":"#94A3B8", padding:"6px 16px", fontSize:12, cursor:"pointer", fontWeight:amortView==="annuel"?700:400 }}>📅 Résumé annuel</button>
            <button onClick={()=>{ setAmortView("mensuel"); setAmortPage(0); }} style={{ background:amortView==="mensuel"?"rgba(129,140,248,0.2)":"rgba(255,255,255,0.04)", border:amortView==="mensuel"?"1px solid #818CF8":"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:amortView==="mensuel"?"#A5B4FC":"#94A3B8", padding:"6px 16px", fontSize:12, cursor:"pointer", fontWeight:amortView==="mensuel"?700:400 }}>🗓 Détail mensuel</button>
            <span style={{ fontSize:11, color:"#475569", marginLeft:8 }}>{amortView==="annuel"?`${duree} lignes`:`${n} mois · page ${amortPage+1}/${Math.ceil(n/AMORT_PER_PAGE)}`}</span>
          </div>

          {amortView === "annuel" && (
            <Card style={{ padding:0, overflow:"hidden" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                      {["Année","Mensualités payées","dont Capital","dont Intérêts","dont Assurance","Capital restant dû","% remboursé"].map(h => (
                        <th key={h} style={{ padding:"10px 14px", textAlign:"right", color:"#64748B", fontWeight:600, fontSize:11, borderBottom:"1px solid rgba(255,255,255,0.08)", whiteSpace:"nowrap",
                          ...(h==="Année"?{textAlign:"left"}:{}) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableauAnnuel.map((r, i) => {
                      const pct = montantEmprunte > 0 ? (1 - r.capitalRestant/montantEmprunte)*100 : 100;
                      return (
                        <tr key={r.annee} style={{ background:i%2===0?"transparent":"rgba(255,255,255,0.02)", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"9px 14px", color:"#F1F5F9", fontWeight:600 }}>Année {r.annee}</td>
                          <td style={{ padding:"9px 14px", textAlign:"right", color:"#818CF8" }}>{fmt(r.mensualite)}</td>
                          <td style={{ padding:"9px 14px", textAlign:"right", color:"#60A5FA" }}>{fmt(r.principal)}</td>
                          <td style={{ padding:"9px 14px", textAlign:"right", color:"#F87171" }}>{fmt(r.interets)}</td>
                          <td style={{ padding:"9px 14px", textAlign:"right", color:"#FBBF24" }}>{fmt(r.assurMo)}</td>
                          <td style={{ padding:"9px 14px", textAlign:"right", color:"#94A3B8" }}>{fmt(r.capitalRestant)}</td>
                          <td style={{ padding:"9px 14px", textAlign:"right" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end" }}>
                              <div style={{ width:48, height:5, background:"rgba(255,255,255,0.08)", borderRadius:3 }}>
                                <div style={{ width:`${pct}%`, height:"100%", background:"#34D399", borderRadius:3 }} />
                              </div>
                              <span style={{ color:"#34D399", fontWeight:600 }}>{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {amortView === "mensuel" && (
            <Card style={{ padding:0, overflow:"hidden" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                      {["Mois","Mensualité","Capital","Intérêts","Assurance","Capital restant"].map(h => (
                        <th key={h} style={{ padding:"9px 14px", textAlign:"right", color:"#64748B", fontWeight:600, fontSize:11, borderBottom:"1px solid rgba(255,255,255,0.08)",
                          ...(h==="Mois"?{textAlign:"left"}:{}) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableauMensuel.slice(amortPage*AMORT_PER_PAGE, (amortPage+1)*AMORT_PER_PAGE).map((r, i) => (
                      <tr key={r.mo} style={{ background:i%2===0?"transparent":"rgba(255,255,255,0.02)", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding:"8px 14px", color:"#94A3B8", fontWeight:600 }}>Mois {r.mo} <span style={{ color:"#475569", fontSize:10 }}>(An {r.annee})</span></td>
                        <td style={{ padding:"8px 14px", textAlign:"right", color:"#818CF8" }}>{fmt(r.mensualite)}</td>
                        <td style={{ padding:"8px 14px", textAlign:"right", color:"#60A5FA" }}>{fmt(r.principal)}</td>
                        <td style={{ padding:"8px 14px", textAlign:"right", color:"#F87171" }}>{fmt(r.interets)}</td>
                        <td style={{ padding:"8px 14px", textAlign:"right", color:"#FBBF24" }}>{fmt(r.assurMo)}</td>
                        <td style={{ padding:"8px 14px", textAlign:"right", color:"#94A3B8" }}>{fmt(r.capitalRestant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"flex", gap:8, padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.06)", alignItems:"center" }}>
                <button onClick={()=>setAmortPage(p=>Math.max(0,p-1))} disabled={amortPage===0} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:amortPage===0?"#334155":"#94A3B8", padding:"5px 14px", fontSize:12, cursor:amortPage===0?"not-allowed":"pointer" }}>← Préc.</button>
                <span style={{ fontSize:12, color:"#64748B" }}>Page {amortPage+1} / {Math.ceil(n/AMORT_PER_PAGE)}</span>
                <button onClick={()=>setAmortPage(p=>Math.min(Math.ceil(n/AMORT_PER_PAGE)-1,p+1))} disabled={amortPage>=Math.ceil(n/AMORT_PER_PAGE)-1} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:amortPage>=Math.ceil(n/AMORT_PER_PAGE)-1?"#334155":"#94A3B8", padding:"5px 14px", fontSize:12, cursor:amortPage>=Math.ceil(n/AMORT_PER_PAGE)-1?"not-allowed":"pointer" }}>Suiv. →</button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ════════ IMPACT APPORT ════════ */}
      {activeSection === "apport" && (
        <div>
          <Card style={{ marginBottom:14, padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9", marginBottom:4 }}>Impact de l'apport sur le coût du crédit</div>
            <div style={{ fontSize:12, color:"#64748B", marginBottom:16 }}>Comparatif pour différents niveaux d'apport, à durée et taux constants.</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart margin={{ top:8, right:24, bottom:4, left:0 }}
                data={[0, 5, 10, 15, 20, 25, 30, 40, 50].map(pct => {
                  const ap = montantBien * pct / 100;
                  const emp = Math.max(0, coutTotal_bien - ap);
                  const tm = taux/100/12;
                  const mens = tm>0 ? emp*(tm*Math.pow(1+tm,n))/(Math.pow(1+tm,n)-1) : emp/n;
                  const assM = emp*assurance/100/12;
                  const interets = Math.max(0, mens*n - emp);
                  return { apportPct:`${pct}%`, mensualite: Math.round(mens+assM), coutTotal: Math.round(emp+interets+assM*n), interets: Math.round(interets) };
                })}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="apportPct" tick={{ fontSize:11, fill:"#475569" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize:10, fill:"#475569" }} tickLine={false} axisLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize:10, fill:"#475569" }} tickLine={false} axisLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} width={40} />
                <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:12 }} formatter={(v,n)=>[fmt(v), n==="mensualite"?"Mensualité":n==="coutTotal"?"Coût total":"Intérêts"]} />
                <Legend wrapperStyle={{ fontSize:11, color:"#94A3B8" }} />
                <Line yAxisId="left"  type="monotone" dataKey="mensualite" stroke="#818CF8" strokeWidth={2} dot={{ r:3, fill:"#818CF8" }} name="mensualite" />
                <Line yAxisId="right" type="monotone" dataKey="interets"   stroke="#F87171" strokeWidth={2} dot={{ r:3, fill:"#F87171" }} name="interets"   strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13, fontWeight:700, color:"#F1F5F9" }}>
              Tableau comparatif apport
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                    {["Apport","Montant","Emprunté","Mensualité","Intérêts","Coût total"].map(h => (
                      <th key={h} style={{ padding:"9px 14px", textAlign:"right", color:"#64748B", fontWeight:600, fontSize:11, borderBottom:"1px solid rgba(255,255,255,0.08)",
                        ...(h==="Apport"?{textAlign:"left"}:{}) }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 5, 10, 15, 20, 25, 30, 40, 50].map((pct, i) => {
                    const ap = montantBien * pct / 100;
                    const emp = Math.max(0, coutTotal_bien - ap);
                    const tm = taux/100/12;
                    const mens = tm>0 ? emp*(tm*Math.pow(1+tm,n))/(Math.pow(1+tm,n)-1) : emp/n;
                    const assM = emp*assurance/100/12;
                    const interets = Math.max(0, mens*n - emp);
                    const isActive = Math.abs(ap - apport) < 500;
                    return (
                      <tr key={pct} onClick={()=>setApport(Math.round(ap))} style={{ cursor:"pointer", background:isActive?"rgba(129,140,248,0.1)":i%2===0?"transparent":"rgba(255,255,255,0.02)", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding:"9px 14px", color:isActive?"#A5B4FC":"#F1F5F9", fontWeight:isActive?700:400 }}>{pct}% {isActive?"✓":""}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#60A5FA" }}>{fmt(ap)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#94A3B8" }}>{fmt(emp)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#818CF8", fontWeight:700 }}>{fmt(mens+assM)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#F87171" }}>{fmt(interets)}</td>
                        <td style={{ padding:"9px 14px", textAlign:"right", color:"#FBBF24", fontWeight:600 }}>{fmt(emp+interets+assM*n)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      {/* ════════ MES SIMULATIONS ════════ */}
      {activeSection === "sauvegardes" && (
        <div>
          {saveStatus && (
            <div style={{ marginBottom:12, padding:"8px 14px", borderRadius:8, background:saveStatus.startsWith("✅")?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)", border:`1px solid ${saveStatus.startsWith("✅")?"rgba(52,211,153,0.3)":"rgba(248,113,113,0.3)"}`, color:saveStatus.startsWith("✅")?"#34D399":"#F87171", fontSize:13 }}>
              {saveStatus}
            </div>
          )}

          {simulations.length === 0 ? (
            <Card style={{ padding:"40px 24px", textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:10 }}>💾</div>
              <div style={{ fontSize:15, color:"#64748B", marginBottom:6 }}>Aucune simulation sauvegardée</div>
              <div style={{ fontSize:12, color:"#475569" }}>Configure une simulation puis clique sur "Sauvegarder" pour la retrouver ici.</div>
            </Card>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {[...simulations].reverse().map(sim => (
                <Card key={sim.id} style={{ padding:"16px 20px", border:"1px solid rgba(129,140,248,0.1)", transition:"border 0.2s" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:16, fontWeight:800, color:"#F1F5F9" }}>{sim.nom}</span>
                        <span style={{ fontSize:10, color:"#475569", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:5, padding:"2px 8px" }}>{sim.date}</span>
                        <span style={{ fontSize:10, color:"#64748B", background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:5, padding:"2px 8px" }}>{sim.params.contexteLabel}</span>
                      </div>
                      {/* KPIs snapshot */}
                      <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                        {[
                          { label:"Mensualité",    val:fmt(sim.computed.mensualiteTotale),  color:"#818CF8" },
                          { label:"Emprunté",      val:fmt(sim.computed.montantEmprunte),   color:"#60A5FA" },
                          { label:"Durée",         val:`${sim.params.duree} ans`,           color:"#F1F5F9" },
                          { label:"Taux",          val:`${sim.params.taux}%`,               color:"#FBBF24" },
                          { label:"Coût total",    val:fmt(sim.computed.coutTotalCredit),   color:"#F87171" },
                          { label:"TAEG",          val:`${(sim.computed.taeg||0).toFixed(2)}%`, color:"#A78BFA" },
                        ].map(k => (
                          <div key={k.label}>
                            <div style={{ fontSize:10, color:"#64748B" }}>{k.label}</div>
                            <div style={{ fontSize:13, fontWeight:700, color:k.color }}>{k.val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
                      <button onClick={()=>handleLoad(sim)} style={{ background:"rgba(129,140,248,0.15)", border:"1px solid rgba(129,140,248,0.3)", borderRadius:8, color:"#A5B4FC", padding:"7px 14px", fontSize:12, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>
                        ↩ Charger
                      </button>
                      <button onClick={()=>handleExportPDF(sim)} disabled={pdfLoading} style={{ background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:8, color:"#34D399", padding:"7px 14px", fontSize:12, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap", opacity:pdfLoading?0.6:1 }}>
                        📄 PDF
                      </button>
                      <button onClick={()=>handleDelete(sim.id)} style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:8, color:"#F87171", padding:"7px 14px", fontSize:12, cursor:"pointer", fontWeight:700 }}>
                        🗑 Sup.
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AppContent({ user }) {
  const [view, setView] = useState("overview");
  const [cryptoData, setCryptoData] = useState(INITIAL_CRYPTO);
  const [cryptoPrices, setCryptoPrices] = useState({});
  const [stocks, setStocks] = useState(INITIAL_STOCKS);
  const [bank, setBank] = useState(INITIAL_BANK);
  const [realestate, setRealestate] = useState(INITIAL_REALESTATE);
  const [scpi, setScpi] = useState(INITIAL_SCPI);
  const [savings, setSavings] = useState(INITIAL_SAVINGS);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [oraPrice, setOraPrice] = useState(0);
  const [history, setHistory] = useState(() => loadHistory());
  const [marketHistory, setMarketHistory] = useState({ stocks: [], crypto: [], total: [], crypto24h: [], crypto7d: [], stocks24h: [], stocks7d: [] });
  const [fbSynced, setFbSynced] = useState(false);
  const [fbStatus, setFbStatus] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddCats, setQuickAddCats] = useState({ entree: DEFAULT_CATS_ENTREE, sortie: DEFAULT_CATS_SORTIE });
  const [quickAddTx,   setQuickAddTx]   = useState([]); // "", "saving", "saved", "error"

  // ── Firebase sync ─────────────────────────────────────────────────────────
  const uid = user?.uid;

  // Refs stables pour uid et fbSynced — accessibles dans les timers sans closure stale
  const uidRef      = useRef(uid);
  const syncedRef   = useRef(false);
  const saveTimers  = useRef({});
  useEffect(() => { uidRef.current = uid; }, [uid]);

  // Sauvegarde directe (pas de debounce) — appelle fbSet immediatement
  const saveToFb = useCallback(async (key, value) => {
    const currentUid = uidRef.current;
    if (!currentUid || !syncedRef.current) {
      console.log("[FB] saveToFb skipped — uid:", currentUid, "synced:", syncedRef.current);
      return;
    }
    console.log("[FB] saving", key);
    setFbStatus("saving");
    try {
      await fbSet(currentUid, key, value);
      setFbStatus("saved");
      console.log("[FB] saved", key);
      setTimeout(() => setFbStatus(""), 2000);
    } catch(e) {
      console.error("[FB] save error", key, e);
      setFbStatus("error");
    }
  }, []);

  // Debounce wrapper — evite les ecritures trop frequentes
  const debouncedSave = useCallback((key, value) => {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => saveToFb(key, value), 1500);
  }, [saveToFb]);

  // Load all data from Firestore on mount
  useEffect(() => {
    if (!uid) return;
    const loadAll = async () => {
      console.log("[FB] loading all for uid:", uid);
      try {
        const [fbCrypto, fbStocks, fbBank, fbRealestate, fbScpi, fbSavings, fbHist] = await Promise.all([
          fbGet(uid, "crypto"),
          fbGet(uid, "stocks"),
          fbGet(uid, "bank"),
          fbGet(uid, "realestate"),
          fbGet(uid, "scpi"),
          fbGet(uid, "savings"),
          fbGet(uid, "history"),
        ]);
        console.log("[FB] loaded — crypto:", !!fbCrypto, "stocks:", !!fbStocks);
        if (fbCrypto)     setCryptoData(fbCrypto);
        if (fbStocks)     setStocks(fbStocks);
        if (fbBank)       setBank(fbBank);
        if (fbRealestate) setRealestate(fbRealestate);
        if (fbScpi)       setScpi(fbScpi);
        if (fbSavings)    setSavings(fbSavings);
        if (fbHist)       setHistory(fbHist);
        syncedRef.current = true;
        setFbSynced(true);
        console.log("[FB] sync ready");
      } catch(e) {
        console.error("[FB] load error:", e);
        syncedRef.current = true;
        setFbSynced(true);
      }
    };
    loadAll();
  }, [uid]);

  // Auto-save des qu'une donnee change (seulement apres chargement initial)
  useEffect(() => { if (fbSynced) debouncedSave("crypto",     cryptoData);  }, [cryptoData]);
  useEffect(() => { if (fbSynced) debouncedSave("stocks",     stocks);      }, [stocks]);
  useEffect(() => { if (fbSynced) debouncedSave("bank",       bank);        }, [bank]);
  useEffect(() => { if (fbSynced) debouncedSave("realestate", realestate);  }, [realestate]);
  useEffect(() => { if (fbSynced) debouncedSave("scpi",       scpi);        }, [scpi]);
  useEffect(() => { if (fbSynced) debouncedSave("savings",    savings);     }, [savings]);
  useEffect(() => { if (fbSynced) debouncedSave("history",    history);     }, [history]);

  // Fetch historical prices to build performance charts based on actual cotations
  // Helper: construire une série de points de valeur pour un ensemble de positions
  const buildStockSeries = useCallback((responses, positions, usdToEur, hkdToEur, dateKey="date") => {
    const byDate = {};
    for (const pos of positions) {
      const result = pos.data?.chart?.result?.[0];
      if (!result?.timestamp) continue;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const fx = pos.currency === "USD" ? usdToEur : pos.currency === "HKD" ? hkdToEur : 1;
      result.timestamp.forEach((ts, i) => {
        const d = new Date(ts * 1000);
        const key = dateKey === "datetime"
          ? d.toISOString().slice(0, 16) // "2024-03-18T14:30"
          : d.toISOString().slice(0, 10); // "2024-03-18"
        if (!byDate[key]) byDate[key] = 0;
        byDate[key] += (closes[i] || 0) * pos.qty * fx;
      });
    }
    return Object.entries(byDate)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, stocks: parseFloat(v.toFixed(2)) }));
  }, []);

  useEffect(() => {
    const WORKER = "https://ora-proxy.rybble.workers.dev";
    const positions_daily = [
      { qty: 0.0466,   currency: "USD", symbol: "AAPL"   },
      { qty: 0.012771, currency: "USD", symbol: "TSLA"   },
      { qty: 0.463606, currency: "HKD", symbol: "0285.HK" },
      { qty: 0.211707, currency: "USD", symbol: "CSPX.L" },
    ];
    const usdToEur = 0.92, hkdToEur = 0.118;
    const ethQty = 1.0258;

    const fetchMarketHistory = async () => {
      // ── Crypto daily (90j) ─────────────────────────────────────────────────
      try {
        const ethRes = await cgFetch("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=eur&days=90&interval=daily");
        const ethData = await ethRes.json();
        if (ethData.prices) {
          const pts = ethData.prices.map(([ts, price]) => ({
            date: new Date(ts).toISOString().slice(0, 10),
            crypto: parseFloat((price * ethQty).toFixed(2)),
          }));
          setMarketHistory(prev => ({ ...prev, crypto: pts }));
        }
      } catch (e) { console.error("Crypto daily error:", e); }

      // ── Crypto intraday 24h (horaire = ~24 points) ────────────────────────
      try {
        const r24 = await cgFetch("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=eur&days=1");
        const d24 = await r24.json();
        if (d24.prices) {
          const pts = d24.prices.map(([ts, price]) => ({
            date: new Date(ts).toISOString().slice(0, 16),
            crypto: parseFloat((price * ethQty).toFixed(2)),
          }));
          setMarketHistory(prev => ({ ...prev, crypto24h: pts }));
        }
      } catch (e) { console.error("Crypto 24h error:", e); }

      // ── Crypto intraday 7j (horaire) ───────────────────────────────────────
      try {
        const r7 = await cgFetch("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=eur&days=7&interval=hourly");
        const d7 = await r7.json();
        if (d7.prices) {
          const pts = d7.prices.map(([ts, price]) => ({
            date: new Date(ts).toISOString().slice(0, 16),
            crypto: parseFloat((price * ethQty).toFixed(2)),
          }));
          setMarketHistory(prev => ({ ...prev, crypto7d: pts }));
        }
      } catch (e) { console.error("Crypto 7d error:", e); }

      // ── Bourse daily (3 mois) ──────────────────────────────────────────────
      try {
        const resps = await Promise.all(positions_daily.map(p =>
          fetch(`${WORKER}?symbol=${p.symbol}&interval=1d&range=3mo`, { cache:"no-store" }).then(r => r.json())
        ));
        const posWithData = positions_daily.map((p, i) => ({ ...p, data: resps[i] }));
        const pts = posWithData.reduce((byDate, pos) => {
          const result = pos.data?.chart?.result?.[0];
          if (!result?.timestamp) return byDate;
          const closes = result.indicators?.quote?.[0]?.close || [];
          const fx = pos.currency === "USD" ? usdToEur : pos.currency === "HKD" ? hkdToEur : 1;
          result.timestamp.forEach((ts, i) => {
            const date = new Date(ts * 1000).toISOString().slice(0, 10);
            byDate[date] = (byDate[date] || 0) + (closes[i] || 0) * pos.qty * fx;
          });
          return byDate;
        }, {});
        const stockPoints = Object.entries(pts).filter(([,v])=>v>0).sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({ date, stocks: parseFloat(v.toFixed(2)) }));
        if (stockPoints.length > 0) setMarketHistory(prev => ({ ...prev, stocks: stockPoints }));
        console.log(`Stock daily: ${stockPoints.length} points`);
      } catch (e) { console.error("Stock daily error:", e); }

      // ── Bourse intraday 24h + 7j : AAPL + TSLA uniquement (même timezone NY)
      //    PEA et non-cotés ajoutés comme constantes dans le merge total
      const positions_intraday = [
        { qty: 0.0466,   currency: "USD", symbol: "AAPL" },
        { qty: 0.012771, currency: "USD", symbol: "TSLA" },
      ];

      // Bourse intraday 24h (horaire = ~24 points)
      try {
        const resps24 = await Promise.all(positions_intraday.map(p =>
          fetch(`${WORKER}?symbol=${p.symbol}&interval=1h&range=1d`, { cache:"no-store" }).then(r => r.json())
        ));
        const byDate = {};
        positions_intraday.forEach((pos, i) => {
          const result = resps24[i]?.chart?.result?.[0];
          if (!result?.timestamp) return;
          const closes = result.indicators?.quote?.[0]?.close || [];
          result.timestamp.forEach((ts, j) => {
            if (!closes[j]) return;
            const date = new Date(ts * 1000).toISOString().slice(0, 16);
            byDate[date] = (byDate[date] || 0) + closes[j] * pos.qty * usdToEur;
          });
        });
        const pts24 = Object.entries(byDate).filter(([,v])=>v>0).sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({ date, stocks: parseFloat(v.toFixed(2)) }));
        if (pts24.length > 0) setMarketHistory(prev => ({ ...prev, stocks24h: pts24 }));
        console.log(`Stock 24h: ${pts24.length} points (AAPL+TSLA NY)`);
      } catch (e) { console.error("Stock 24h error:", e); }

      // Bourse intraday 7j (horaire)
      try {
        const resps7 = await Promise.all(positions_intraday.map(p =>
          fetch(`${WORKER}?symbol=${p.symbol}&interval=1h&range=5d`, { cache:"no-store" }).then(r => r.json())
        ));
        const byDate = {};
        positions_intraday.forEach((pos, i) => {
          const result = resps7[i]?.chart?.result?.[0];
          if (!result?.timestamp) return;
          const closes = result.indicators?.quote?.[0]?.close || [];
          result.timestamp.forEach((ts, j) => {
            if (!closes[j]) return;
            const date = new Date(ts * 1000).toISOString().slice(0, 16);
            byDate[date] = (byDate[date] || 0) + closes[j] * pos.qty * usdToEur;
          });
        });
        const pts7 = Object.entries(byDate).filter(([,v])=>v>0).sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({ date, stocks: parseFloat(v.toFixed(2)) }));
        if (pts7.length > 0) setMarketHistory(prev => ({ ...prev, stocks7d: pts7 }));
        console.log(`Stock 7d: ${pts7.length} points (AAPL+TSLA NY)`);
      } catch (e) { console.error("Stock 7d error:", e); }
    };
    fetchMarketHistory();
  }, []);

  // Calcul du total global historique (crypto + stocks + actifs non cotés)
  useEffect(() => {
    if (!marketHistory.crypto?.length || !marketHistory.stocks?.length) return;
    const savTot = [...savings.peg, ...savings.percol].reduce((s, f) => {
      const vl = (f.type === "ora_linked" && oraPrice > 0) ? oraPrice : f.manualVl;
      return s + vl * f.qty;
    }, 0);
    const bkTot  = bank.reduce((s, b) => s + b.balance, 0);
    const scTot  = scpi.reduce((s, p) => s + p.pricePerPart * p.parts, 0);
    const reTot  = realestate.reduce((s, p) => s + p.estimatedPrice, 0);
    const staticTotal = savTot + bkTot + scTot + reTot;

    // Helper: arrondir datetime à l'heure (pour aligner CoinGecko et Yahoo)
    const roundToHour = (dateStr) => {
      if (dateStr.length <= 10) return dateStr;
      return dateStr.slice(0, 13) + ":00"; // "2024-03-18T14:00"
    };

    // Helper: fusionner deux séries par date (arrondie à l'heure pour intraday)
    const merge = (cryptoPts, stocksPts, cryptoKey, stocksKey, roundHour = false) => {
      const sMap = {};
      stocksPts.forEach(p => {
        const key = roundHour ? roundToHour(p.date) : p.date;
        sMap[key] = p[stocksKey];
      });
      const result = [];
      cryptoPts.forEach(p => {
        const key = roundHour ? roundToHour(p.date) : p.date;
        if (sMap[key] !== undefined) {
          result.push({ date: p.date, total: parseFloat((p[cryptoKey] + (sMap[key] || 0) + staticTotal).toFixed(2)) });
        }
      });
      return result;
    };

    // Daily
    const dailyPts = merge(marketHistory.crypto, marketHistory.stocks, "crypto", "stocks", false);
    if (dailyPts.length > 0) setMarketHistory(prev => ({ ...prev, total: dailyPts }));

    // 24h intraday — aligner à l'heure
    if (marketHistory.crypto24h?.length && marketHistory.stocks24h?.length) {
      const pts24 = merge(marketHistory.crypto24h, marketHistory.stocks24h, "crypto", "stocks", true);
      if (pts24.length > 0) setMarketHistory(prev => ({ ...prev, total24h: pts24 }));
      else {
        // Fallback: utiliser crypto24h seul + staticTotal + stocks actuel
        const lastStocks = marketHistory.stocks[marketHistory.stocks.length - 1]?.stocks || 0;
        const fb = marketHistory.crypto24h.map(p => ({ date: p.date, total: parseFloat((p.crypto + lastStocks + staticTotal).toFixed(2)) }));
        if (fb.length > 0) setMarketHistory(prev => ({ ...prev, total24h: fb }));
      }
    }

    // 7d intraday — aligner à l'heure
    if (marketHistory.crypto7d?.length && marketHistory.stocks7d?.length) {
      const pts7 = merge(marketHistory.crypto7d, marketHistory.stocks7d, "crypto", "stocks", true);
      if (pts7.length > 0) setMarketHistory(prev => ({ ...prev, total7d: pts7 }));
      else {
        const lastStocks = marketHistory.stocks[marketHistory.stocks.length - 1]?.stocks || 0;
        const fb = marketHistory.crypto7d.map(p => ({ date: p.date, total: parseFloat((p.crypto + lastStocks + staticTotal).toFixed(2)) }));
        if (fb.length > 0) setMarketHistory(prev => ({ ...prev, total7d: fb }));
      }
    }
  }, [marketHistory.crypto, marketHistory.stocks, marketHistory.crypto24h, marketHistory.crypto7d,
      marketHistory.stocks24h, marketHistory.stocks7d, savings, bank, scpi, realestate, oraPrice]);

  // ── Worker universel Cloudflare pour toutes les cotations ───────────────────
  // Un seul Worker gère tous les symboles via Yahoo Finance
  // Usage: https://ora-proxy.rybble.workers.dev?symbol=ORA.PA
  const fetchWorkerPrice = useCallback(async (yahooSymbol) => {
    try {
      const res = await fetch(
        `https://ora-proxy.rybble.workers.dev?symbol=${encodeURIComponent(yahooSymbol)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      const currency = data?.chart?.result?.[0]?.meta?.currency;
      if (price && price > 0) return { price, currency };
    } catch(e) { console.warn("Worker price error:", yahooSymbol, e.message); }
    return null;
  }, []);

  const fetchOraPrice = useCallback(async () => {
    const result = await fetchWorkerPrice("ORA.PA");
    if (result && result.price > 5 && result.price < 100) {
      console.log("ORA.PA:", result.price.toFixed(2), "€ via Worker");
      setOraPrice(result.price);
    } else {
      console.warn("ORA.PA unavailable");
    }
  }, [fetchWorkerPrice]);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all crypto prices in EUR via CoinGecko /simple/price
      const cgIds = cryptoData.map(c => CG_IDS[c.code]).filter(Boolean);
      const uniqueIds = [...new Set(cgIds)];
      const priceRes = await cgFetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(",")}&vs_currencies=eur&include_24hr_change=true`
      );
      const priceData = await priceRes.json();

      const pricesMap = {};
      cryptoData.forEach(c => {
        const cgId = CG_IDS[c.code];
        if (cgId && priceData[cgId]) {
          pricesMap[c.code] = {
            eur: priceData[cgId].eur || 0,
            eur_24h_change: priceData[cgId].eur_24h_change || 0,
          };
        }
      });
      setCryptoPrices(pricesMap);

      // 2. Stocks via Finnhub (USD → EUR via taux BCE)
      const fxRes = await cgFetch("https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=eur");
      const fxData = await fxRes.json();
      const usdToEur = fxData?.usd?.eur || 0.92;

      // ── Stocks via Worker Cloudflare universel ──────────────────────────────────
      // Le Worker fetch Yahoo Finance avec le symbole passé en paramètre
      // Symboles Yahoo: AAPL, TSLA (USD→EUR), 1211.HK (HKD→EUR), CSPX.AS (EUR)
      const workerStocks = {
        "AAPL": { yahooSym: "AAPL",    currency: "USD" },
        "TSLA": { yahooSym: "TSLA",    currency: "USD" },
        "BYD":  { yahooSym: "1211.HK", currency: "HKD" },
        "CSPX": { yahooSym: "CSPX.AS", currency: "EUR" },
      };

      // Taux HKD→EUR via CoinGecko
      let hkdToEur = 0.12;
      try {
        const fxExtra = await cgFetch("https://api.coingecko.com/api/v3/simple/price?ids=hkd&vs_currencies=eur");
        const fxExtra2 = await fxExtra.json();
        if (fxExtra2?.hkd?.eur) hkdToEur = fxExtra2.hkd.eur;
      } catch {}

      const stockUpdates = {};

      // Fetch en parallèle via le Worker
      await Promise.all(
        Object.entries(workerStocks).map(async ([sym, { yahooSym, currency }]) => {
          const result = await fetchWorkerPrice(yahooSym);
          if (!result) return;
          // Le Worker retourne la devise réelle — on peut aussi utiliser currency param
          const rawPrice = result.price;
          let priceEur;
          if (currency === "USD") priceEur = rawPrice * usdToEur;
          else if (currency === "HKD") priceEur = rawPrice * hkdToEur;
          else priceEur = rawPrice;
          if (priceEur > 0) {
            stockUpdates[sym] = priceEur;
            console.log(`${sym}: ${priceEur.toFixed(2)}€ via Worker (raw: ${rawPrice} ${currency})`);
          }
        })
      );

      // Fallback Finnhub pour les actions US si Worker non disponible
      const finnhubFallbacks = [
        ["AAPL", "AAPL", "USD"],
        ["TSLA", "TSLA", "USD"],
      ];
      await Promise.all(finnhubFallbacks.map(async ([sym, ticker, currency]) => {
        if (stockUpdates[sym]) return; // déjà récupéré via Worker
        try {
          const res  = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
          const data = await res.json();
          if (data.c && data.c > 0) {
            // Finnhub retourne en USD — convertir en EUR
            const priceEur = currency === "USD" ? data.c * usdToEur : data.c;
            stockUpdates[sym] = priceEur;
            console.log(`${sym} fallback Finnhub: ${priceEur.toFixed(2)}€ (${data.c} USD)`);
          }
        } catch {}
      }));

      if (Object.keys(stockUpdates).length > 0) {
        setStocks(prev => prev.map(st => stockUpdates[st.symbol] ? { ...st, price: stockUpdates[st.symbol] } : st));
      }

      await fetchOraPrice();
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [cryptoData, fetchOraPrice]);

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const getVlSaving = (f) => (f.type === "ora_linked" && oraPrice > 0) ? oraPrice : f.manualVl;
  const cryptoTotal = cryptoData.reduce((s, c) => s + (cryptoPrices[c.code]?.eur || 0) * c.qty, 0);
  const stocksTotal = stocks.reduce((s, st) => s + st.price * st.qty, 0);
  const savingsTotal = [...savings.peg, ...savings.percol].reduce((s, f) => s + getVlSaving(f) * f.qty, 0);
  const bankTotal = bank.reduce((s, b) => s + b.balance, 0);
  const realestateTotal = realestate.reduce((s, p) => s + p.estimatedPrice, 0);
  const scpiTotal = scpi.reduce((s, p) => s + p.pricePerPart * p.parts, 0);
  const grandTotal = cryptoTotal + stocksTotal + savingsTotal + bankTotal + realestateTotal + scpiTotal;

  // Push history point whenever totals are meaningful
  useEffect(() => {
    if (grandTotal > 0 && cryptoPrices && Object.keys(cryptoPrices).length > 0) {
      const newHistory = pushHistoryPoint({
        total: Math.round(grandTotal),
        crypto: Math.round(cryptoTotal),
        stocks: Math.round(stocksTotal),
        savings: Math.round(savingsTotal),
        bank: Math.round(bankTotal),
        scpi: Math.round(scpiTotal),
        realestate: Math.round(realestateTotal),
      });
      setHistory(newHistory);
    }
  }, [grandTotal]);

  const navItems = [
    { key: "overview",    icon: "◈", label: "Vue globale" },
    { key: "crypto",      icon: "₿", label: "Crypto" },
    { key: "stocks",      icon: "📈", label: "Bourse" },
    { key: "savings",     icon: "🟠", label: "Épargne" },
    { key: "scpi",        icon: "🏢", label: "SCPI" },
    { key: "realestate",  icon: "🏠", label: "Immobilier" },
    { key: "bank",        icon: "🏦", label: "Banque" },
    { key: "budget",      icon: "💰", label: "Budget" },
    { key: "simulateur",  icon: "🏦", label: "Simulateur crédit" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: "#F1F5F9", width: "100%" }}>
      <style>{`

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100%; min-height: 100vh; background: #0B1120; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 1400, margin: "0 auto", padding: "0 40px 80px", boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ padding: "28px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-0.5px" }}>
              Mon Patrimoine
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 3, display:"flex", alignItems:"center", gap:8 }}>
              <span>{lastUpdate ? `Actualisé à ${lastUpdate.toLocaleTimeString("fr-FR")}` : "Chargement…"} · toutes les 5 min</span>
              {fbStatus === "saving" && <span style={{ color:"#818CF8" }}>☁ Sauvegarde…</span>}
              {fbStatus === "saved"  && <span style={{ color:"#34D399" }}>☁ Sauvegardé</span>}
              {fbStatus === "error"  && <span style={{ color:"#F87171" }}>☁ Erreur sync</span>}
              {!fbSynced             && <span style={{ color:"#FBBF24" }}>⏳ Chargement Firebase…</span>}
            </div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
              {user?.email} · <button onClick={() => signOut(auth)} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:11, padding:0, textDecoration:"underline" }}>Déconnexion</button>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-1px" }}>{fmt(grandTotal)}</div>
            <button onClick={fetchPrices} disabled={loading} style={{
              marginTop: 6, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)",
              borderRadius: 20, color: "#34D399", padding: "4px 16px",
              fontSize: 12, cursor: "pointer", fontWeight: 600, opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "⏳ Sync…" : "↻ Actualiser"}
            </button>
          </div>
        </div>

        {/* Nav tabs + bouton ajout rapide */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          {navItems.map(n => <Pill key={n.key} label={`${n.icon} ${n.label}`} active={view === n.key} onClick={() => setView(n.key)} />)}
          <button onClick={() => setShowQuickAdd(true)}
            style={{ marginLeft:"auto", flexShrink:0,
              background:"linear-gradient(135deg,#6366F1,#4F46E5)",
              border:"none", borderRadius:20, color:"#fff",
              padding:"6px 16px", fontSize:13, fontWeight:700,
              cursor:"pointer", display:"flex", alignItems:"center", gap:6,
              boxShadow:"0 2px 12px rgba(99,102,241,0.4)" }}>
            <span style={{ fontSize:16, lineHeight:1 }}>+</span> Ajouter
          </button>
        </div>

        {/* ORA.PA status bar */}
        {oraPrice > 0 && (
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#64748B" }}>
            <span style={{ color: "#34D399" }}>●</span>
            <span>ORA.PA : <strong style={{ color: "#FBBF24" }}>{fmt(oraPrice)}</strong></span>
            <span style={{ color: pctColor((oraPrice - ORA_REF_PRICE) / ORA_REF_PRICE * 100) }}>
              ({fmtPct((oraPrice - ORA_REF_PRICE) / ORA_REF_PRICE * 100)} vs 31/12/2025)
            </span>
          </div>
        )}

        {/* Views */}
        {view === "overview"   && <Overview cryptoData={cryptoData} cryptoPrices={cryptoPrices} stocks={stocks} bank={bank} savings={savings} oraPrice={oraPrice} realestateTotal={realestateTotal} scpiTotal={scpiTotal} onNavigate={setView} history={history} marketHistoryTotal={marketHistory.total} marketHistoryIntraday={marketHistory} uid={user?.uid} />}
        {view === "crypto"     && <CryptoView cryptoData={cryptoData} setCryptoData={setCryptoData} cryptoPrices={cryptoPrices} loading={loading} history={history} cryptoHistory={marketHistory.crypto} cryptoHistory24h={marketHistory.crypto24h} cryptoHistory7d={marketHistory.crypto7d} />}
        {view === "stocks"     && <StocksView stocks={stocks} setStocks={setStocks} history={history} marketHistory={marketHistory.stocks} stocksHistory24h={marketHistory.stocks24h} stocksHistory7d={marketHistory.stocks7d} peaValue={(() => { const pea = stocks.filter(s=>s.account==="pea").reduce((s,st)=>s+st.price*st.qty,0); return pea || 549.89; })()} nonCoteValue={stocks.filter(s=>["APOLLO","EQTF"].includes(s.symbol)).reduce((s,st)=>s+st.price*st.qty,0)} />}
        {view === "savings"    && <SavingsView savings={savings} setSavings={setSavings} oraPrice={oraPrice} />}
        {view === "scpi"       && <ScpiView scpi={scpi} setScpi={setScpi} history={history} />}
        {view === "realestate" && <RealEstateView realestate={realestate} setRealestate={setRealestate} history={history} />}
        {view === "bank"       && <BankView bank={bank} setBank={setBank} />}
        {view === "budget"     && <BudgetView uid={user?.uid} onOpenQuickAdd={() => setShowQuickAdd(true)} quickAddTx={quickAddTx} setQuickAddTx={setQuickAddTx} onCatsChange={setQuickAddCats} />}
        {view === "simulateur" && <SimulateurCredit cryptoTotal={cryptoTotal} stocksTotal={stocksTotal} savingsTotal={savingsTotal} bankTotal={bankTotal} realestateTotal={realestateTotal} scpiTotal={scpiTotal} grandTotal={grandTotal} uid={user?.uid} />}
      </div>

      {/* Bouton ajout intégré dans la nav — supprimé du bas de page */}

      {/* ── Modal saisie rapide ───────────────────────────────── */}
      {showQuickAdd && (
        <QuickAddModal
          cats={quickAddCats}
          onClose={() => setShowQuickAdd(false)}
          onAdd={async (tx) => {
            // 1. Mettre à jour l'état local pour BudgetView si monté
            setQuickAddTx(prev => [...prev, tx]);
            // 2. Sauvegarder directement en Firebase sans dépendre du montage de BudgetView
            if (user?.uid) {
              try {
                const snap = await fbGet(user.uid, "budget_tx");
                const existing = Array.isArray(snap) ? snap : [];
                await fbSet(user.uid, "budget_tx", [...existing, tx]);
                console.log("[QuickAdd] Sauvegardé directement en Firebase ✅");
              } catch(e) {
                console.warn("[QuickAdd] Erreur Firebase:", e);
              }
            }
            window.dispatchEvent(new CustomEvent("patrimoine:quickadd", { detail: tx }));
          }}
        />
      )}
    </div>
  );
}
