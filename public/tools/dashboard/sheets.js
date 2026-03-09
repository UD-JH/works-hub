// ═══════════════════════════════════════════
//  SHEETS.JS — 공통 데이터 모듈
// ═══════════════════════════════════════════

// CONFIG
const SHEET_ID  = '1HMGzUNOb0ltelHZzJanYnaNhQEg5R3p_3YNwtH_Fck8';
const SHEET_TAB = 'PREPARATION_DATA';
let API_KEY = '';

// STATE
let FX         = 9.5;
let RAW        = [];
let MONTHS     = [];
let CUR_MON    = null;
let WORKS_META = {};
let ACCT_META  = {};
let AGG        = {};

// 색상 상수
const PLATFORM_COLOR = { fanza:'#ff6b9d', dlsite:'#7c6af5' };
const ACCT_COLOR     = { '모코야츠':'#ff6b9d', '우바야츠':'#38bdf8' };
const NICK_COLORS    = {
  '레이':'#ff6b9d','하나':'#ff9f43','리나':'#7c6af5','아이코':'#3ecf8e',
  '유부녀':'#38bdf8','':'#52546e'
};

// ── 헬퍼 함수 ──
function parseNum(s) {
  if (!s || ['', 'X', '-'].includes(String(s).trim())) return 0;
  const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}
function krw(yen)    { return Math.round(yen * FX); }
function fmtKRW(won) {
  if (won >= 100000000) return `₩${(won / 100000000).toFixed(1)}억`;
  if (won >= 10000)     return `₩${(won / 10000).toFixed(1)}만`;
  return `₩${won.toLocaleString()}`;
}
function pct(a, b)   { return b === 0 ? 0 : Math.round((a - b) / b * 100); }
function prevMon(m)  {
  const idx = MONTHS.indexOf(m);
  return idx > 0 ? MONTHS[idx - 1] : null;
}

// ── 데이터 집계 ──
function buildAgg() {
  AGG = {};

  // 작품별 LF_revenue, sales_count_DoD 합산
  for (const r of RAW) {
    const m = String(r.month);
    if (!AGG[m]) AGG[m] = { works: {}, accounts: {} };
    const wid = r.work_id;
    if (!AGG[m].works[wid]) AGG[m].works[wid] = { lf: 0, sales: 0 };
    AGG[m].works[wid].lf    += parseNum(r.LF_revenue);
    AGG[m].works[wid].sales += parseNum(r.sales_count_DoD);
  }

  // 계정별 팬수 — 월 내 최신 crawl_date 기준
  const fanLatestDate = {};
  for (const r of RAW) {
    const m   = String(r.month);
    const aid = r.account_id;
    const key = `${m}__${aid}`;
    if (!fanLatestDate[key] || r.crawl_date > fanLatestDate[key]) {
      fanLatestDate[key] = r.crawl_date;
      if (!AGG[m]) AGG[m] = { works: {}, accounts: {} };
      AGG[m].accounts[aid] = parseInt(r.fans) || 0;
    }
  }

  // WORKS_META, ACCT_META 구성
  WORKS_META = {}; ACCT_META = {};
  for (const r of RAW) {
    if (!WORKS_META[r.work_id]) {
      WORKS_META[r.work_id] = {
        account_id: r.account_id,
        platform:   r.platform,
        title:      r.title,
        nick:       r.nick || '',
        color:      NICK_COLORS[r.nick] || NICK_COLORS[''],
      };
    }
    if (!ACCT_META[r.account_id]) {
      ACCT_META[r.account_id] = {
        name:     r.account_name || r.account_id,
        platform: r.platform,
        color:    ACCT_COLOR[r.account_id] || '#52546e',
      };
    }
  }

  // 월 정렬 — 시간순 (1월 → 12월)
  MONTHS = Object.keys(AGG).sort((a, b) => parseInt(a) - parseInt(b));
  CUR_MON = MONTHS[MONTHS.length - 1];
}

// ── 유틸 ──
function worksOfAcct(aid, platform = null) {
  return Object.entries(WORKS_META)
    .filter(([, m]) => m.account_id === aid && (!platform || m.platform === platform))
    .map(([wid]) => wid);
}
function worksOfPlatform(pl) {
  return Object.entries(WORKS_META)
    .filter(([, m]) => m.platform === pl)
    .map(([wid]) => wid);
}
function totalLF(wids, mon) {
  if (!AGG[mon]) return 0;
  return wids.reduce((s, wid) => s + (AGG[mon].works[wid]?.lf || 0), 0);
}
function totalSales(wids, mon) {
  if (!AGG[mon]) return 0;
  return wids.reduce((s, wid) => s + (AGG[mon].works[wid]?.sales || 0), 0);
}

// ── 데이터 로드 ──
// onSuccess(count), onError(e), onLoading(bool) 콜백 옵션
async function loadSheetData(onSuccess, onError, onLoading) {
  // API 키 서버에서 받아오기 (캐시됨)
  if (!API_KEY) {
    try {
      const cfg = await fetch('/api/config').then(r => r.json());
      API_KEY = cfg.apiKey;
    } catch (e) {
      if (onError) onError(new Error('API 키를 가져오지 못했어요'));
      return;
    }
  }

  if (onLoading) onLoading(true);

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB)}?key=${API_KEY}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const [header, ...dataRows] = json.values;
    RAW = dataRows.map(row => {
      const obj = {};
      header.forEach((col, i) => { obj[col] = row[i] ?? ''; });
      return obj;
    });
    buildAgg();
    if (onSuccess) onSuccess(RAW.length);
  } catch (e) {
    if (onError) onError(e);
    console.error('loadSheetData error:', e);
  } finally {
    if (onLoading) onLoading(false);
  }
}
