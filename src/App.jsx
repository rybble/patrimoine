import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, LineChart, Line, BarChart, Bar, Legend } from "recharts";

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
function MiniAreaChart({ data, dataKey, color, height = 60 }) {
  if (!data || data.length < 2) return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 12 }}>
      Pas encore assez de données historiques
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad_${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false}
          tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false}
          tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={36} />
        <Tooltip
          contentStyle={{ background: "#1E293B", border: `1px solid #334155`, borderRadius: "10px", color: "#F1F5F9", fontSize: 12 }}
          formatter={v => [fmt(v), "Valeur"]} labelFormatter={l => `📅 ${l}`}
        />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
          fill={`url(#grad_${dataKey})`} dot={false} activeDot={{ r: 4, fill: color }} />
      </AreaChart>
    </ResponsiveContainer>
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
function Overview({ cryptoData, cryptoPrices, stocks, bank, savings, oraPrice, realestateTotal, scpiTotal, onNavigate, history }) {
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
        <Variation history={history} dataKey="total" color="#818CF8" />
        <MiniAreaChart data={history} dataKey="total" color="#818CF8" height={80} />
      </Card>

      {/* Stats globales */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Revenus passifs /an" value={fmt(revenuPassifTotal)} sub="SCPI + loyer + intérêts" color="#34D399" icon="💰" />
        <StatCard label="Rendement global" value={`${tauxRendementGlobal.toFixed(2)}%`} sub="Sur patrimoine total" color="#FBBF24" icon="📈" />
        <StatCard label="Diversification" value={`${diversification}/6`} sub="Classes d'actifs actives" color="#818CF8" icon="🎯" />
        <StatCard label="Actifs liquides" value={fmt(cryptoTotal + stocksTotal + bankTotal)} sub="Crypto + Bourse + Banque" color="#60A5FA" icon="💧" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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

        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Répartition</div>
          <ResponsiveContainer width="100%" height={155}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", color: "#F1F5F9", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                  <span style={{ color: "#64748B" }}>{d.name}</span>
                </div>
                <span style={{ color: "#F1F5F9", fontWeight: 600 }}>{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── CRYPTO VIEW ──────────────────────────────────────────────────────────────
function CryptoView({ cryptoData, setCryptoData, cryptoPrices, loading, history, cryptoHistory }) {
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

      {/* Graphique évolution */}
      <Card style={{ marginBottom: 14, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Évolution Crypto (€) — 90 jours · ETH via CoinGecko</div>
        {cryptoHistory && cryptoHistory.length > 1
          ? <MiniAreaChart data={cryptoHistory} dataKey="crypto" color="#818CF8" height={100} />
          : <><Variation history={history} dataKey="crypto" color="#818CF8" /><MiniAreaChart data={history} dataKey="crypto" color="#818CF8" height={90} /></>
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
            <Card key={c.code} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px" }}>
              <div style={{ width: 38, height: 38, borderRadius: "10px", background: c.color + "28", border: `2px solid ${c.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: c.color, flexShrink: 0 }}>
                {c.symbol.slice(0, 4)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 14 }}>{c.symbol}</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>
                  {editingCode === c.code ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input value={editQty} onChange={e => setEditQty(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveEdit(c.code)}
                        autoFocus
                        style={{ width: 110, background: "#1E293B", border: "1px solid #4F46E5", borderRadius: "6px", padding: "2px 8px", color: "#F1F5F9", fontSize: 12 }} />
                      <button onClick={() => saveEdit(c.code)} style={{ background: "#4F46E5", border: "none", borderRadius: 4, color: "#fff", padding: "2px 8px", cursor: "pointer", fontSize: 11 }}>✓</button>
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
              <div style={{ textAlign: "right", minWidth: 80 }}>
                <div style={{ fontSize: 12, color: "#64748B" }}>{price > 0 ? fmt(price) : "—"}</div>
                <div style={{ fontSize: 12, color: pctColor(pct), fontWeight: 600 }}>{fmtPct(pct)}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 100 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{price > 0 ? fmt(value) : "—"}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>{share.toFixed(1)}%</div>
              </div>
              <button onClick={() => removeToken(c.code)}
                title="Supprimer"
                style={{ background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                onMouseLeave={e => e.currentTarget.style.color = "#334155"}
              >✕</button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── STOCKS VIEW ──────────────────────────────────────────────────────────────
function StocksView({ stocks, setStocks, history, marketHistory }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [newStock, setNewStock] = useState({ symbol: "", name: "", qty: "", price: "", isin: "" });
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
        // Try to detect separator
        const sep = lines[0].includes(";") ? ";" : ",";
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, "").toLowerCase());

        // Map common Trade Republic / generic CSV column names
        const col = (names) => { for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; } return -1; };
        const iSymbol = col(["ticker","symbol","isin","wkn","bezeichnung","name","titre","libellé"]);
        const iName   = col(["name","bezeichnung","titre","libellé","security name","instrument"]);
        const iQty    = col(["shares","quantity","anzahl","quantité","qté","nombre","units"]);
        const iPrice  = col(["price","kurs","cours","prix","current price","last price","valeur unitaire"]);
        const iIsin   = col(["isin"]);

        if (iQty < 0 || iPrice < 0) { setImportStatus("❌ Colonnes quantité/prix introuvables. Format attendu : Symbole, Nom, Quantité, Prix"); return; }

        const updated = [...stocks];
        let count = 0;
        lines.slice(1).forEach(line => {
          const cols = line.split(sep).map(c => c.trim().replace(/"/g, ""));
          const symbol = iSymbol >= 0 ? cols[iSymbol]?.toUpperCase() : "";
          const name   = iName >= 0 ? cols[iName] : symbol;
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
      } catch (err) { setImportStatus("❌ Erreur de lecture : " + err.message); }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  // Catégorisation des actifs
  const CT_SYMBOLS   = ["AAPL", "TSLA", "BYD", "CSPX"]; // cotés Trade Republic Compte-Titres
  const PEA_SYMBOLS  = [];                               // PEA Trade Republic (valeur manuelle)
  const NON_COTE_SYMBOLS = ["APOLLO", "EQTF"];           // fonds privés / ELTIF non cotés

  const stocksCT     = stocks.filter(s => CT_SYMBOLS.includes(s.symbol));
  const stocksNonCote = stocks.filter(s => NON_COTE_SYMBOLS.includes(s.symbol));
  const stocksOther  = stocks.filter(s => !CT_SYMBOLS.includes(s.symbol) && !NON_COTE_SYMBOLS.includes(s.symbol));

  const totalCT      = stocksCT.reduce((s, st) => s + st.price * st.qty, 0);
  const PEA_VALUE    = 549.89; // valeur PEA Trade Republic (manuelle)
  const totalNonCote = stocksNonCote.reduce((s, st) => s + st.price * st.qty, 0);
  const totalOther   = stocksOther.reduce((s, st) => s + st.price * st.qty, 0);

  const renderStockCard = (st) => {
    const value = st.price * st.qty;
    const isEditing = editing === st.symbol;
    return (
      <Card key={st.symbol} style={{ padding: "13px 18px" }}>
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
                <button onClick={() => { setStocks(p => p.map(s => s.symbol === st.symbol ? { ...s, qty: parseFloat(form.qty) || s.qty, price: parseFloat(form.price) || s.price } : s)); setEditing(null); }}
                  style={{ alignSelf: "flex-end", background: "#4F46E5", border: "none", borderRadius: "6px", color: "#fff", padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✓ Sauver</button>
                <button onClick={() => setEditing(null)}
                  style={{ alignSelf: "flex-end", background: "transparent", border: "1px solid #334155", borderRadius: "6px", color: "#64748B", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Annuler</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {st.qty} titres · {fmt(st.price)} / titre
                <button onClick={() => { setEditing(st.symbol); setForm({ qty: String(st.qty), price: String(st.price) }); }}
                  style={{ marginLeft: 10, background: "transparent", border: "none", color: "#6366F1", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>modifier</button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#34D399", minWidth: 90, textAlign: "right" }}>{fmt(value)}</div>
            <button onClick={() => setStocks(p => p.filter(s => s.symbol !== st.symbol))} title="Supprimer"
              style={{ background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: 16, padding: "0 2px" }}
              onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
              onMouseLeave={e => e.currentTarget.style.color = "#334155"}>✕</button>
          </div>
        </div>
      </Card>
    );
  };

  const SubSectionHeader = ({ title, subtitle, total: sTotal, color = "#34D399", badge }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: color }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: "#F1F5F9" }}>{title}</span>
          {badge && <span style={{ fontSize: 11, color: "#64748B", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "1px 8px" }}>{badge}</span>}
        </div>
        {subtitle && <div style={{ fontSize: 12, color: "#64748B", marginLeft: 11 }}>{subtitle}</div>}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color }}>{fmt(sTotal)}</div>
    </div>
  );

  return (
    <div>
      <SectionTitle sub={`Trade Republic · Total ${fmt(total + PEA_VALUE)}`}>Bourse</SectionTitle>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatCard label="Total bourse" value={fmt(total + PEA_VALUE)} sub={`${stocks.length} positions`} color="#34D399" icon="📈" />
        <StatCard label="Compte-Titres" value={fmt(totalCT)} sub="AAPL · TSLA · BYD · CSPX" color="#60A5FA" icon="📋" />
        <StatCard label="PEA" value={fmt(PEA_VALUE)} sub="Trade Republic" color="#A78BFA" icon="🇫🇷" />
        <StatCard label="Non cotés" value={fmt(totalNonCote)} sub="APOLLO · EQTF" color="#FBBF24" icon="🔒" />
      </div>

      <Card style={{ marginBottom: 18, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Évolution Bourse (€) — 6 mois · AAPL + TSLA via Finnhub</div>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>Courbe basée sur tes positions AAPL ({stocks.find(s=>s.symbol==="AAPL")?.qty} titres) et TSLA ({stocks.find(s=>s.symbol==="TSLA")?.qty} titres)</div>
        {marketHistory && marketHistory.length > 1
          ? <MiniAreaChart data={marketHistory} dataKey="stocks" color="#34D399" height={100} />
          : <><Variation history={history} dataKey="stocks" color="#34D399" /><MiniAreaChart data={history} dataKey="stocks" color="#34D399" height={90} /></>
        }
      </Card>

      {/* ── COMPTE-TITRES ── */}
      <div style={{ marginBottom: 22 }}>
        <SubSectionHeader title="Compte-Titres" subtitle="Trade Republic · Actions cotées" total={totalCT} color="#60A5FA" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stocksCT.map(renderStockCard)}
          {stocksOther.map(renderStockCard)}
        </div>
      </div>

      {/* ── PEA ── */}
      <div style={{ marginBottom: 22 }}>
        <SubSectionHeader title="PEA" subtitle="Trade Republic · Plan d'Épargne en Actions" total={PEA_VALUE} color="#A78BFA" />
        <Card style={{ padding: "16px 20px", background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: "10px", background: "rgba(167,139,250,0.15)", border: "2px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                🇫🇷
              </div>
              <div>
                <div style={{ fontWeight: 700, color: "#F1F5F9", fontSize: 14 }}>PEA Trade Republic</div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Valeur liquidative au dernier relevé</div>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#A78BFA" }}>{fmt(PEA_VALUE)}</div>
          </div>
        </Card>
      </div>

      {/* ── NON COTÉS ── */}
      <div style={{ marginBottom: 22 }}>
        <SubSectionHeader title="Actifs non cotés / alternatifs" subtitle="Fonds privés · ELTIF · Prix manuels" total={totalNonCote} color="#FBBF24" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stocksNonCote.map(renderStockCard)}
        </div>
      </div>

      {/* Import CSV banner */}
      <Card style={{ marginBottom: 14, padding: "12px 18px", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, color: "#34D399", fontSize: 13 }}>📂 Importer un relevé CSV</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              Trade Republic : Compte → Historique → Exporter · Colonnes attendues : Symbole, Nom, Quantité, Prix
            </div>
          </div>
          <label style={{ background: "#34D399", color: "#0B1120", borderRadius: "10px", padding: "7px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            📥 Importer CSV
            <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display: "none" }} />
          </label>
        </div>
        {importStatus && <div style={{ marginTop: 8, fontSize: 13, color: importStatus.startsWith("✅") ? "#34D399" : "#F87171" }}>{importStatus}</div>}
      </Card>

      {adding ? (
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9", marginBottom: 12 }}>➕ Ajouter une ligne manuellement</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Symbole *", "symbol", 80], ["Nom", "name", 160], ["ISIN", "isin", 130], ["Quantité *", "qty", 90], ["Prix € *", "price", 90]].map(([label, key, w]) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{label}</div>
                <input value={newStock[key]} onChange={e => setNewStock(s => ({ ...s, [key]: e.target.value }))}
                  style={{ width: w, background: "#1E293B", border: "1px solid #334155", borderRadius: "6px", padding: "5px 10px", color: "#F1F5F9", fontSize: 13 }} />
              </div>
            ))}
            <button onClick={() => {
              if (!newStock.symbol || !newStock.qty || !newStock.price) return;
              setStocks(p => [...p, { symbol: newStock.symbol.toUpperCase(), name: newStock.name || newStock.symbol, qty: parseFloat(newStock.qty) || 0, price: parseFloat(newStock.price) || 0, isin: newStock.isin }]);
              setNewStock({ symbol: "", name: "", qty: "", price: "", isin: "" });
              setAdding(false);
            }} style={{ alignSelf: "flex-end", background: "#4F46E5", border: "none", borderRadius: "10px", color: "#fff", padding: "7px 18px", cursor: "pointer", fontWeight: 600 }}>Ajouter</button>
            <button onClick={() => setAdding(false)}
              style={{ alignSelf: "flex-end", background: "transparent", border: "1px solid #334155", borderRadius: "10px", color: "#64748B", padding: "7px 14px", cursor: "pointer" }}>Annuler</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ width: "100%", background: "rgba(99,102,241,0.08)", border: "1px dashed rgba(99,102,241,0.4)", borderRadius: "10px", color: "#818CF8", padding: "10px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ＋ Ajouter une ligne manuellement
        </button>
      )}
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
        <MiniAreaChart data={history} dataKey="scpi" color="#A78BFA" height={90} />
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
        <MiniAreaChart data={history} dataKey="realestate" color="#F472B6" height={90} />
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

function BudgetView() {
  // ── State ────────────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(BUDGET_KEY) || "[]");
      // Ensure every tx has an id
      return raw.map((t, i) => ({ id: t.id || `legacy-${i}`, ...t }));
    } catch { return []; }
  });
  const [cats, setCats] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(BUDGET_CATS_KEY));
      return stored || { entree: DEFAULT_CATS_ENTREE, sortie: DEFAULT_CATS_SORTIE };
    } catch { return { entree: DEFAULT_CATS_ENTREE, sortie: DEFAULT_CATS_SORTIE }; }
  });

  const [selectedYear,  setSelectedYear]  = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [importStatus,  setImportStatus]  = useState("");
  const [gsUrl,         setGsUrl]         = useState(localStorage.getItem("patrimoine_gs_url") || "");
  const [gsLoading,     setGsLoading]     = useState(false);
  const [activeTab,     setActiveTab]     = useState("overview");

  // Add form
  const [form, setForm] = useState({ es:"Sortie", type:"", montant:"", note:"", annee: new Date().getFullYear(), mois: new Date().getMonth()+1 });

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

  // Persist
  useEffect(() => { localStorage.setItem(BUDGET_KEY, JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem(BUDGET_CATS_KEY, JSON.stringify(cats)); }, [cats]);

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
    if (!gsUrl) return;
    setGsLoading(true); setImportStatus("");
    try {
      // Extract sheet ID and build export URL
      const match = gsUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) throw new Error("URL Google Sheets invalide");
      const sheetId = match[1];
      const gid = gsUrl.match(/gid=(\d+)/)?.[1] || "0";
      // Use a CORS proxy to bypass browser restrictions
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      const proxyUrl  = `https://corsproxy.io/?${encodeURIComponent(exportUrl)}`;

      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`Erreur HTTP ${resp.status} — vérifie que la sheet est publique`);
      const text = await resp.text();
      const parsed = parseBudgetCSV(text);
      if (!parsed.length) throw new Error("Aucune donnée parsée — vérifie le format de ta sheet");
      setTransactions(parsed);
      localStorage.setItem("patrimoine_gs_url", gsUrl);
      setImportStatus(`✅ Google Sheets : ${parsed.length} transactions synchronisées`);
      setTimeout(() => setImportStatus(""), 5000);
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
  const catTxs = transactions.filter(t => t.es === catStatEs && t.type === activeCatName);
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
        {[["overview","📊 Synthèse"],["detail","📋 Détail"],["categories","🏷 Catégories"],["add","➕ Ajouter"],["transactions","📝 Transactions"],["sync","🔗 Sources"]].map(([k,l]) => (
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
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
            <StatCard label="Entrées" value={fmt(totalE_yr)} sub={`${curYear} · ${bilan.length} mois`} color="#34D399" icon="📥" />
            <StatCard label="Sorties" value={fmt(totalS_yr)} sub={`Moy. ${fmt(totalS_yr/(bilan.length||1))}/mois`} color="#F87171" icon="📤" />
            <StatCard label="Solde net" value={fmt(solde_yr)} sub={solde_yr>=0?"Bilan positif ✓":"Bilan négatif ⚠"} color={solde_yr>=0?"#34D399":"#F87171"} icon="⚖️" />
            <StatCard label="Taux d'épargne" value={`${tauxEpargne.toFixed(1)}%`} sub="(Entrées−Sorties)/Entrées" color="#818CF8" icon="🎯" />
          </div>

          <Card style={{ marginBottom:14, padding:"16px 20px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9", marginBottom:12 }}>Évolution mensuelle {curYear}</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={evol} barGap={2} barCategoryGap="25%">
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
            <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9", marginBottom:12 }}>Solde mensuel {curYear}</div>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={evol}>
                <defs>
                  <linearGradient id="soldeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill:"#64748B", fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`} />
                <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:12 }} formatter={v=>[fmt(v),"Solde"]} />
                <Area type="monotone" dataKey="solde" stroke="#818CF8" strokeWidth={2} fill="url(#soldeGrad)" dot={{ fill:"#818CF8", r:3 }} />
              </AreaChart>
            </ResponsiveContainer>
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
      {(activeTab === "catstat" || activeTab === "catstat") && activeTab === "catstat" && (
        <div>
          {/* Header filtre */}
          <Card style={{ padding:"14px 20px", marginBottom:14 }}>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
              <div>
                <div style={lblS}>Type</div>
                <select value={catStatEs} onChange={e=>{setCatStatEs(e.target.value); setCatStatName("");}} style={{...inpS, width:130}}>
                  <option value="Sortie">📤 Sorties</option>
                  <option value="Entrée">📥 Entrées</option>
                </select>
              </div>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={lblS}>Catégorie</div>
                <select value={activeCatName} onChange={e=>setCatStatName(e.target.value)} style={inpS}>
                  {allCatNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {activeCatName && (
            <>
              {/* KPIs catégorie */}
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
                <StatCard label="Total cumulé" value={fmt(catTotal)} sub={`${catTxs.length} transactions`} color={catColor} icon="💳" />
                <StatCard label="Moyenne mensuelle" value={fmt(catAvgMo)} sub={`sur ${catMonthly.length} mois actifs`} color={catColor} icon="📅" />
                <StatCard label="Mois le plus élevé" value={fmt(catMax)} sub={catMonthly.find(m=>m.total===catMax)?.label || ""} color={catColor} icon="📈" />
                <StatCard label="Nb transactions" value={catTxs.length} sub={`Moy. ${(catTxs.length/Math.max(catMonthly.length,1)).toFixed(1)}/mois`} color={catColor} icon="🧾" />
              </div>

              {/* Graphique évolution catégorie */}
              <Card style={{ marginBottom:14, padding:"16px 20px" }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#F1F5F9", marginBottom:12 }}>Évolution mensuelle — {activeCatName}</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={catMonthly}>
                    <defs>
                      <linearGradient id="catGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={catColor} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={catColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:"#64748B", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${v.toFixed(0)}€`} />
                    <Tooltip contentStyle={{ background:"#1E293B", border:"1px solid #334155", borderRadius:8, fontSize:12 }} formatter={v=>[fmt(v), activeCatName]} />
                    <Area type="monotone" dataKey="total" stroke={catColor} strokeWidth={2} fill="url(#catGrad)" dot={{ fill:catColor, r:3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              {/* Liste des transactions de cette catégorie */}
              <Card style={{ padding:0, overflow:"hidden" }}>
                <div style={{ padding:"12px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:13, fontWeight:600, color:"#F1F5F9" }}>
                  Toutes les transactions — {activeCatName}
                </div>
                {catTxs.sort((a,b)=>b.annee!==a.annee?b.annee-a.annee:b.mois-a.mois).slice(0,50).map((tx,i) => (
                  <div key={tx.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 18px", borderBottom:"1px solid rgba(255,255,255,0.04)", background:i%2===0?"transparent":"rgba(255,255,255,0.02)" }}>
                    <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                      <span style={{ fontSize:12, color:"#64748B", minWidth:60 }}>{MOIS_FR[tx.mois-1]} {tx.annee}</span>
                      {tx.note && <span style={{ fontSize:12, color:"#475569" }}>{tx.note}</span>}
                    </div>
                    <span style={{ fontSize:13, fontWeight:700, color:catColor }}>{fmt(tx.montant)}</span>
                  </div>
                ))}
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

          {/* Table */}
          <Card style={{ padding:0, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                  {["Période","Type","Catégorie","Montant","Note","Actions"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:["Montant"].includes(h)?"right":"left", fontSize:11, color:"#64748B", fontWeight:600, borderBottom:"1px solid rgba(255,255,255,0.06)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txPageData.map((tx,i) => {
                  const isEd = editingTx === tx.id;
                  const col  = getColor(tx.type, tx.es);
                  return (
                    <tr key={tx.id} style={{ background:i%2===0?"transparent":"rgba(255,255,255,0.02)" }}>
                      {isEd ? (
                        <>
                          <td style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ display:"flex", gap:4 }}>
                              <select value={editForm.annee} onChange={e=>setEditForm(f=>({...f,annee:parseInt(e.target.value)}))} style={{...inpS,width:72,padding:"4px 6px",fontSize:12}}>
                                {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
                              </select>
                              <select value={editForm.mois} onChange={e=>setEditForm(f=>({...f,mois:parseInt(e.target.value)}))} style={{...inpS,width:64,padding:"4px 6px",fontSize:12}}>
                                {MOIS_FR.map((m,idx)=><option key={idx+1} value={idx+1}>{m}</option>)}
                              </select>
                            </div>
                          </td>
                          <td style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <select value={editForm.es} onChange={e=>setEditForm(f=>({...f,es:e.target.value}))} style={{...inpS,padding:"4px 6px",fontSize:12}}>
                              <option value="Sortie">Sortie</option>
                              <option value="Entrée">Entrée</option>
                            </select>
                          </td>
                          <td style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <select value={editForm.type} onChange={e=>setEditForm(f=>({...f,type:e.target.value}))} style={{...inpS,padding:"4px 6px",fontSize:12}}>
                              {allCats(editForm.es).map(c=><option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                          </td>
                          <td style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <input type="number" step="0.01" value={editForm.montant} onChange={e=>setEditForm(f=>({...f,montant:e.target.value}))} style={{...inpS,width:90,padding:"4px 6px",fontSize:12,textAlign:"right"}} />
                          </td>
                          <td style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <input value={editForm.note||""} onChange={e=>setEditForm(f=>({...f,note:e.target.value}))} style={{...inpS,padding:"4px 6px",fontSize:12}} />
                          </td>
                          <td style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ display:"flex", gap:4 }}>
                              <button onClick={saveEditTx} style={{ background:"#4F46E5", border:"none", borderRadius:6, color:"#fff", padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:600 }}>✓</button>
                              <button onClick={()=>setEditingTx(null)} style={{ background:"transparent", border:"1px solid #334155", borderRadius:6, color:"#64748B", padding:"4px 8px", cursor:"pointer", fontSize:11 }}>✕</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding:"9px 14px", fontSize:12, color:"#94A3B8", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{MOIS_FR[tx.mois-1]} {tx.annee}</td>
                          <td style={{ padding:"9px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <span style={{ fontSize:11, padding:"2px 7px", borderRadius:4, background:tx.es==="Sortie"?"rgba(248,113,113,0.15)":"rgba(52,211,153,0.15)", color:tx.es==="Sortie"?"#F87171":"#34D399", fontWeight:600 }}>{tx.es}</span>
                          </td>
                          <td style={{ padding:"9px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <div style={{ width:8, height:8, borderRadius:"50%", background:col, flexShrink:0 }} />
                              <span style={{ fontSize:13, color:"#F1F5F9" }}>{tx.type}</span>
                            </div>
                          </td>
                          <td style={{ padding:"9px 14px", textAlign:"right", fontSize:13, fontWeight:700, color:col, borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{fmt(tx.montant)}</td>
                          <td style={{ padding:"9px 14px", fontSize:12, color:"#64748B", borderBottom:"1px solid rgba(255,255,255,0.04)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.note}</td>
                          <td style={{ padding:"9px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ display:"flex", gap:4 }}>
                              <button onClick={()=>startEditTx(tx)} style={{ background:"transparent", border:"1px solid #334155", borderRadius:6, color:"#818CF8", padding:"3px 8px", cursor:"pointer", fontSize:11 }}>✏</button>
                              <button onClick={()=>deleteTx(tx.id)}
                                style={{ background:"transparent", border:"1px solid rgba(248,113,113,0.3)", borderRadius:6, color:"#F87171", padding:"3px 8px", cursor:"pointer", fontSize:11 }}
                                onMouseEnter={e=>e.currentTarget.style.background="rgba(248,113,113,0.1)"}
                                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>✕</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            <div style={{ fontSize:14, fontWeight:700, color:"#F1F5F9", marginBottom:6 }}>🔗 Google Sheets (sync live)</div>
            <div style={{ fontSize:12, color:"#64748B", marginBottom:12 }}>
              <strong style={{color:"#F1F5F9"}}>1.</strong> Ouvre ta Google Sheet → <strong style={{color:"#F1F5F9"}}>Fichier → Partager → Publier sur le web → Feuille → CSV → Publier</strong><br/>
              <strong style={{color:"#F1F5F9"}}>2.</strong> Copie l'URL de publication (format <code style={{background:"rgba(255,255,255,0.06)",padding:"1px 5px",borderRadius:4}}>docs.google.com/spreadsheets/d/…/pub?…</code>)<br/>
              <strong style={{color:"#F1F5F9"}}>3.</strong> Colle-la ci-dessous et clique Synchroniser.
            </div>
            <div style={{ display:"flex", gap:10, marginBottom:10 }}>
              <input value={gsUrl} onChange={e=>setGsUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv"
                style={{ flex:1, background:"#1E293B", border:"1px solid #334155", borderRadius:8, padding:"8px 12px", color:"#F1F5F9", fontSize:13 }} />
              <button onClick={syncGSheets} disabled={!gsUrl||gsLoading}
                style={{ background:"#4F46E5", border:"none", borderRadius:8, color:"#fff", padding:"8px 20px", cursor:"pointer", fontWeight:700, fontSize:13, opacity:(!gsUrl||gsLoading)?0.6:1, whiteSpace:"nowrap" }}>
                {gsLoading ? "⏳ Sync…" : "🔄 Synchroniser"}
              </button>
            </div>
            {gsUrl && <div style={{ fontSize:11, color:"#475569" }}>URL enregistrée ✓</div>}
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
// ─── MOT DE PASSE ─────────────────────────────────────────────────────────────
const APP_PASSWORD_HASH = "8e5d3f2a1b9c6e4d7f0a2b5c8e1d4f7a"; // md5 de ton mot de passe

function hashSimple(str) {
  // Simple hash non-cryptographique — suffisant pour usage personnel
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// Change ce mot de passe ici :
const MOT_DE_PASSE = "patrimoine2026";

function LoginScreen({ onLogin }) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const tryLogin = () => {
    if (pwd === MOT_DE_PASSE) {
      sessionStorage.setItem("patrimoine_auth", hashSimple(MOT_DE_PASSE));
      onLogin();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-8px)} 80%{transform:translateX(8px)} }`}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -200, right: -100, width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)" }} />
      </div>
      <div style={{ position: "relative", zIndex: 1, width: 340, padding: 36, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, backdropFilter: "blur(12px)", animation: shake ? "shake 0.4s ease" : "none" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, background: "linear-gradient(135deg, #818CF8, #34D399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6 }}>
            Patrimoine
          </div>
          <div style={{ fontSize: 13, color: "#64748B" }}>Accès sécurisé · Usage privé</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>Mot de passe</div>
          <input
            type="password"
            value={pwd}
            onChange={e => { setPwd(e.target.value); setError(false); }}
            onKeyDown={e => e.key === "Enter" && tryLogin()}
            autoFocus
            placeholder="••••••••••••"
            style={{ width: "100%", boxSizing: "border-box", background: error ? "rgba(248,113,113,0.1)" : "#1E293B", border: error ? "1px solid #F87171" : "1px solid #334155", borderRadius: "10px", padding: "11px 14px", color: "#F1F5F9", fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
          />
          {error && <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>Mot de passe incorrect</div>}
        </div>
        <button onClick={tryLogin} style={{ width: "100%", background: "linear-gradient(135deg, #6366F1, #4F46E5)", border: "none", borderRadius: "10px", color: "#fff", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
          Accéder →
        </button>
        <div style={{ marginTop: 20, fontSize: 11, color: "#64748B", textAlign: "center" }}>
          🔒 Données stockées localement dans votre navigateur
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => {
    const stored = sessionStorage.getItem("patrimoine_auth");
    return stored === hashSimple(MOT_DE_PASSE);
  });

  if (!authenticated) return <LoginScreen onLogin={() => setAuthenticated(true)} />;

  return <AppContent />;
}

function AppContent() {
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
  const [marketHistory, setMarketHistory] = useState({ stocks: [], crypto: [] });

  // Fetch 90 days ETH history in EUR from CoinGecko for crypto chart
  // Fetch 180 days AAPL+TSLA from Finnhub for stocks chart
  useEffect(() => {
    const fetchMarketHistory = async () => {
      try {
        // Crypto: ETH 90 days in EUR — use as portfolio trend proxy
        const ethRes = await cgFetch("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=eur&days=90&interval=daily");
        const ethData = await ethRes.json();
        if (ethData.prices) {
          // Scale ETH price to portfolio equivalent (ETH qty * price)
          const ethQty = 1.0258;
          const cryptoPoints = ethData.prices.map(([ts, price]) => ({
            date: new Date(ts).toISOString().slice(0, 10),
            crypto: Math.round(price * ethQty),
          }));
          setMarketHistory(prev => ({ ...prev, crypto: cryptoPoints }));
        }
      } catch (e) { console.error("Crypto history error:", e); }

      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 180 * 24 * 3600;
        const [rAAPL, rTSLA] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/stock/candle?symbol=AAPL&resolution=W&from=${from}&to=${to}&token=${FINNHUB_KEY}`).then(r => r.json()),
          fetch(`https://finnhub.io/api/v1/stock/candle?symbol=TSLA&resolution=W&from=${from}&to=${to}&token=${FINNHUB_KEY}`).then(r => r.json()),
        ]);
        if (rAAPL.s === "ok" && rTSLA.s === "ok") {
          const aaplQty = 0.0466, tslaQty = 0.012771, usdToEur = 0.92;
          const points = rAAPL.t.map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().slice(0, 10),
            stocks: Math.round((rAAPL.c[i] * aaplQty + (rTSLA.c[i] || 0) * tslaQty) * usdToEur),
          }));
          setMarketHistory(prev => ({ ...prev, stocks: points }));
        }
      } catch (e) { console.error("Stock history error:", e); }
    };
    fetchMarketHistory();
  }, []);

  const fetchOraPrice = useCallback(async () => {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=EURONEXT:ORA&token=${FINNHUB_KEY}`);
      const data = await res.json();
      if (data.c && data.c > 0) setOraPrice(data.c);
    } catch (e) { console.error("Finnhub error:", e); }
  }, []);

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

      const stockSymbols = {
        "BYD":    { finnSym: null,   currency: "EUR" },
        "CSPX":   { finnSym: null,   currency: "EUR" },
        "APOLLO": { finnSym: null,   currency: "EUR" },
        "EQTF":   { finnSym: null,   currency: "EUR" },
        "AAPL":   { finnSym: "AAPL", currency: "USD" },
        "TSLA":   { finnSym: "TSLA", currency: "USD" },
      };
      const stockUpdates = {};
      await Promise.all(
        Object.entries(stockSymbols).map(async ([sym, { finnSym, currency }]) => {
          if (!finnSym) return;
          try {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${finnSym}&token=${FINNHUB_KEY}`);
            const q = await r.json();
            if (q.c && q.c > 0) {
              stockUpdates[sym] = currency === "USD" ? q.c * usdToEur : q.c;
            }
          } catch {}
        })
      );
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
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
              {lastUpdate ? `Actualisé à ${lastUpdate.toLocaleTimeString("fr-FR")}` : "Chargement…"} · toutes les 5 min
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

        {/* Nav tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {navItems.map(n => <Pill key={n.key} label={`${n.icon} ${n.label}`} active={view === n.key} onClick={() => setView(n.key)} />)}
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
        {view === "overview"   && <Overview cryptoData={cryptoData} cryptoPrices={cryptoPrices} stocks={stocks} bank={bank} savings={savings} oraPrice={oraPrice} realestateTotal={realestateTotal} scpiTotal={scpiTotal} onNavigate={setView} history={history} />}
        {view === "crypto"     && <CryptoView cryptoData={cryptoData} setCryptoData={setCryptoData} cryptoPrices={cryptoPrices} loading={loading} history={history} cryptoHistory={marketHistory.crypto} />}
        {view === "stocks"     && <StocksView stocks={stocks} setStocks={setStocks} history={history} marketHistory={marketHistory.stocks} />}
        {view === "savings"    && <SavingsView savings={savings} setSavings={setSavings} oraPrice={oraPrice} />}
        {view === "scpi"       && <ScpiView scpi={scpi} setScpi={setScpi} history={history} />}
        {view === "realestate" && <RealEstateView realestate={realestate} setRealestate={setRealestate} history={history} />}
        {view === "bank"       && <BankView bank={bank} setBank={setBank} />}
        {view === "budget"     && <BudgetView />}
      </div>
    </div>
  );
}
