// ═══════════════════════════════════════════
//  SHEETS.JS — 공통 데이터 모듈
// ═══════════════════════════════════════════

// CONFIG — API 키는 서버에서 관리

// STATE
let FX         = 9.5;
let RAW        = [];
let MONTHS     = [];
let CUR_MON    = null;
let WORKS_META = {};
let ACCT_META  = {};
let AGG        = {};
let RAW_IDX    = {}; // wid -> { month -> [rows] }

// 라이프사이클 전용 상태
let WORK_SERIES  = {};   // wid -> [{age, rev, sales, estimated?}, ...]  (age 오름차순)
let AGE_PROFILE  = [];   // [age] -> {avgFrac, n}   — 참조 작품 기반 감쇠 프로파일
let LIFECYCLE_WIDS = []; // 라이프사이클 분석 대상 (닉 있음)
let DAILY_AGG = {};     // 월별 일간 집계 { dates, byAcct, total }

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
function rowRevenueJPY(r) {
  const revenueDoD = parseNum(r.revenue_DoD);
  return revenueDoD !== 0 ? revenueDoD : parseNum(r.LF_revenue);
}
function krw(yen)    { return Math.round(yen * FX); }
function fmtKRW(won) {
  if (won >= 100000000) return `₩${(won / 100000000).toFixed(1)}억`;
  if (won >= 10000)     return `₩${(won / 10000).toFixed(1)}만`;
  return `₩${Math.round(won).toLocaleString()}`;
}
function fmtJPY(yen) {
  if (yen >= 10000) return `¥${(yen / 10000).toFixed(1)}万`;
  return `¥${Math.round(yen).toLocaleString()}`;
}
function fmtJPYFull(yen) { return `¥${Math.round(yen).toLocaleString()}`; }
function fmtKRWFull(won) { return `₩${Math.round(won).toLocaleString()}`; }
// #rrggbb 색을 percent만큼 밝게(+) 또는 어둡게(-) 시프트
function shadeHex(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  if (percent >= 0) {
    r = Math.round(r + (255 - r) * percent);
    g = Math.round(g + (255 - g) * percent);
    b = Math.round(b + (255 - b) * percent);
  } else {
    r = Math.round(r * (1 + percent));
    g = Math.round(g * (1 + percent));
    b = Math.round(b * (1 + percent));
  }
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function pct(a, b)   { return b === 0 ? 0 : Math.round((a - b) / b * 100); }
function prevMon(m)  {
  const idx = MONTHS.indexOf(m);
  return idx > 0 ? MONTHS[idx - 1] : null;
}

// ── 데이터 집계 ──
// gross = revenue_DoD (총매출), net = LF_revenue (순매출), sales = sales_count_DoD
function buildAgg() {
  AGG = {}; WORKS_META = {}; ACCT_META = {}; RAW_IDX = {};

  const fanLatestDate = {};
  const wLatest       = {};
  const monthYear     = {};

  for (const r of RAW) {
    const m   = String(r.month);
    const wid = r.work_id;
    const aid = r.account_id;

    // crawl_Date_2 파싱 — 루프당 1회
    const rawD    = String(r.crawl_Date_2 || '').trim();
    const dParts  = rawD.split(/\.\s*/).filter(p => p.trim());
    const has3    = dParts.length === 3;
    const dateStr = has3
      ? `${dParts[0].padStart(4,'0')}-${dParts[1].padStart(2,'0')}-${dParts[2].padStart(2,'0')}`
      : rawD.slice(0, 10);
    const dk = has3
      ? dParts[0].padStart(4,'0') + dParts[1].padStart(2,'0') + dParts[2].padStart(2,'0')
      : rawD;

    // AGG — 매출/판매량
    if (!AGG[m]) AGG[m] = { works: {}, accounts: {} };
    if (!AGG[m].works[wid]) AGG[m].works[wid] = { gross: 0, net: 0, sales: 0 };
    AGG[m].works[wid].gross += parseNum(r.revenue_DoD);
    AGG[m].works[wid].net   += parseNum(r.LF_revenue);
    AGG[m].works[wid].sales += parseNum(r.sales_count_DoD);

    // 팬수 — fanza only, 월 내 최신 기준
    if (r.platform === 'fanza' && dateStr) {
      const key = `${m}__${aid}`;
      if (!fanLatestDate[key] || dateStr > fanLatestDate[key]) {
        fanLatestDate[key] = dateStr;
        AGG[m].accounts[aid] = parseInt(r.fans) || 0;
      }
    }

    // WORKS_META
    if (!WORKS_META[wid]) {
      const rawUp   = String(r.upload_date || '').trim();
      const upParts = rawUp.split(/\.\s*/).filter(p => p.trim());
      let upload_date = null;
      if (upParts.length === 3) {
        upload_date = upParts[0].padStart(4,'0') + '-' + upParts[1].padStart(2,'0') + '-' + upParts[2].padStart(2,'0');
      } else if (rawUp.length >= 10) {
        upload_date = rawUp.slice(0, 10);
      }
      WORKS_META[wid] = {
        account_id: aid,
        platform:   r.platform,
        title:      r.title,
        nick:       r.nickname || '',
        nick_name:  r.work_nick || r.nickname || r.title.slice(0, 14),
        color:      NICK_COLORS[r.nickname] || NICK_COLORS[''],
        upload_date,
      };
    }

    // ACCT_META
    if (!ACCT_META[aid]) {
      ACCT_META[aid] = {
        name:     r.account_name || aid,
        platform: r.platform,
        color:    ACCT_COLOR[aid] || '#52546e',
      };
    }

    // 최신 누적값 (total_revenue, favorites)
    if (!wLatest[wid] || dk > wLatest[wid]) {
      wLatest[wid] = dk;
      WORKS_META[wid].total_revenue = parseNum(r.revenue);
      WORKS_META[wid].favorites     = parseNum(r.favorites);
    }

    // monthYear
    if (monthYear[m] === undefined && has3) monthYear[m] = parseInt(dParts[0]);

    // RAW_IDX — wid × month 인덱스 (모달 주간 추이용)
    if (!RAW_IDX[wid])    RAW_IDX[wid] = {};
    if (!RAW_IDX[wid][m]) RAW_IDX[wid][m] = [];
    RAW_IDX[wid][m].push(r);
  }

  // 월 정렬 — 연도 포함 시간순 (2025-12 → 2026-01 → 2026-04 등)
  MONTHS = Object.keys(AGG).sort((a, b) => {
    const ya = monthYear[a] || 2025, yb = monthYear[b] || 2025;
    if (ya !== yb) return ya - yb;
    return parseInt(a) - parseInt(b);
  });
  CUR_MON = MONTHS[MONTHS.length - 1];
}

// ═══════════════════════════════════════════
//  라이프사이클 (age 기반 데이터)
// ═══════════════════════════════════════════
//
// 목적:
//   각 작품의 "출시 후 경과일(age)" 대비 일일 매출 곡선을 만들어
//   초기 매출·감소 속도·추가 spike 등을 비교할 수 있게 한다.
//
// 데이터 이슈:
//   크롤러는 2025-12-17부터 돌기 시작했고, 이후에도 매일 돌지 않은 구간이 있음.
//   그래서 일부 작품은 첫 관측 시점의 age가 0이 아니라 g(>0)이고,
//   그 첫 행의 revenue_DoD 값은 "0~g일간의 누적 매출"이다 (진짜 일일값 아님).
//
// 해결:
//   1) minAge=0으로 관측된 작품(=참조 풀)에서 age별 평균 매출 비중 프로파일을 만들고
//   2) minAge>0인 작품의 누적 첫 값을 이 프로파일에 비례해 0..g-1에 역산 분배한다.
//   3) 역산된 지점은 {estimated:true}로 표시해서 차트에서 시각적으로 구분한다.
//
// 제외:
//   닉이 없는 작품은 라이프사이클 비교에서 제외 (사용자 결정).

function buildLifecycle() {
  // STEP 1: 작품별 raw 시계열 수집 (닉 있는 작품만)
  WORK_SERIES = {};
  for (const r of RAW) {
    const wid = r.work_id;
    if (!WORKS_META[wid] || !r.nickname) continue;
    const age = parseInt(r.age);
    if (isNaN(age) || age < 0) continue;
    if (!WORK_SERIES[wid]) WORK_SERIES[wid] = [];
    WORK_SERIES[wid].push({
      age,
      rev:   parseNum(r.revenue_DoD),
      sales: parseNum(r.sales_count_DoD),
    });
  }
  // age 오름차순 정렬 + 같은 age 중복 행은 첫 번째만 채택
  for (const wid in WORK_SERIES) {
    const seen = new Set();
    WORK_SERIES[wid] = WORK_SERIES[wid]
      .sort((a, b) => a.age - b.age)
      .filter(p => { if (seen.has(p.age)) return false; seen.add(p.age); return true; });
  }

  LIFECYCLE_WIDS = Object.keys(WORK_SERIES);

  // STEP 2: 참조 프로파일 빌드 — minAge=0 작품만 사용
  //   각 age a에 대해 "해당 작품의 age a 매출 / 해당 작품 관측 총매출" 비율 평균.
  //   n = 그 age에 기여한 작품 수 (가드용)
  const cleanWids = LIFECYCLE_WIDS.filter(wid => WORK_SERIES[wid][0]?.age === 0);
  const maxAge = cleanWids.reduce((mx, wid) => {
    const last = WORK_SERIES[wid][WORK_SERIES[wid].length - 1];
    return Math.max(mx, last?.age || 0);
  }, 0);

  // 작품별 age Map & 총매출 사전 계산 — 내부 루프를 O(S) 탐색에서 O(1)로
  const workMaps   = {};
  const workTotals = {};
  for (const wid of cleanWids) {
    const series    = WORK_SERIES[wid];
    workMaps[wid]   = new Map(series.map(p => [p.age, p]));
    workTotals[wid] = series.reduce((s, p) => s + p.rev, 0);
  }

  AGE_PROFILE = [];
  for (let a = 0; a <= maxAge; a++) {
    const fracs = [];
    for (const wid of cleanWids) {
      const series  = WORK_SERIES[wid];
      const lastAge = series[series.length - 1].age;
      if (lastAge < a) continue;
      const pt    = workMaps[wid].get(a);
      if (!pt) continue;
      const total = workTotals[wid];
      if (total > 0) fracs.push(pt.rev / total);
    }
    AGE_PROFILE[a] = {
      avgFrac: fracs.length ? fracs.reduce((s, v) => s + v, 0) / fracs.length : 0,
      n: fracs.length,
    };
  }

  // STEP 3: minAge>0 작품 역산
  //   첫 행의 rev(=누적)를 0..gap 구간에 프로파일 비율로 분배.
  //   프로파일 샘플이 n<3 인 age는 가드 — 해당 구간만 균등분배 fallback.
  for (const wid of LIFECYCLE_WIDS) {
    const series = WORK_SERIES[wid];
    if (!series.length) continue;
    const gap = series[0].age;
    if (gap === 0) continue;

    const cumulative = series[0].rev;

    // 0..gap (gap+1개 bin)에 분배 — gap일 자체도 추정 대상에 포함
    const weights = [];
    for (let a = 0; a <= gap; a++) {
      const p = AGE_PROFILE[a];
      weights.push(p && p.n >= 3 ? p.avgFrac : 0);
    }
    let sumW = weights.reduce((s, v) => s + v, 0);
    // 프로파일 데이터가 전무하면 균등분배 fallback
    if (sumW === 0) {
      for (let a = 0; a <= gap; a++) weights[a] = 1;
      sumW = weights.length;
    }

    const estimated = [];
    for (let a = 0; a <= gap; a++) {
      estimated.push({
        age: a,
        rev: cumulative * weights[a] / sumW,
        sales: 0, // 판매량 역산은 이번 버전에선 생략
        estimated: true,
      });
    }

    // 원본 첫 행(누적)은 제거하고 추정치로 교체
    series.shift();
    WORK_SERIES[wid] = estimated.concat(series);
  }
}

// ── 일별 집계 (월간 추이 탭용) ──
function buildDailyAgg() {
  DAILY_AGG = {};
  const bucket = {}; // m -> { year, mo, data: { dateStr -> { aid -> rev } } }

  for (const r of RAW) {
    const m    = String(r.month);
    const rawD = String(r.crawl_Date_2 || '').trim();
    const parts = rawD.split(/\.\s*/).filter(p => p.trim());
    if (parts.length !== 3) continue;
    const year = parseInt(parts[0]), mo = parseInt(parts[1]), day = parseInt(parts[2]);
    if (isNaN(year) || isNaN(mo) || isNaN(day)) continue;
    const dateStr = `${year}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const aid = r.account_id;
    const rev = parseNum(r.revenue_DoD);
    if (!bucket[m]) bucket[m] = { year, mo, data: {} };
    if (!bucket[m].data[dateStr]) bucket[m].data[dateStr] = {};
    bucket[m].data[dateStr][aid] = (bucket[m].data[dateStr][aid] || 0) + rev;
  }

  for (const m in bucket) {
    const { year, mo, data } = bucket[m];
    const daysInMonth = new Date(year, mo, 0).getDate();
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++)
      dates.push(`${year}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`);

    const allAids = [...new Set(Object.values(data).flatMap(x => Object.keys(x)))];
    const byAcct  = {};
    allAids.forEach(aid => { byAcct[aid] = dates.map(d => data[d]?.[aid] || 0); });
    const total   = dates.map((_, i) => allAids.reduce((s, aid) => s + (byAcct[aid][i] || 0), 0));
    DAILY_AGG[m]  = { year, mo, dates, byAcct, total };
  }
}

// 라이프사이클 유틸 — 누적 매출 시계열
function cumulativeSeries(series) {
  let acc = 0;
  return series.map(p => ({ age: p.age, rev: (acc += p.rev), estimated: p.estimated }));
}

// 트레일링 이동평균 (window=7) — 슬라이딩 윈도우 O(N)
function movingAverage(series, window = 7) {
  let sum = 0;
  return series.map((p, i) => {
    sum += p.rev;
    if (i >= window) sum -= series[i - window].rev;
    return { age: p.age, rev: sum / Math.min(i + 1, window), estimated: p.estimated };
  });
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
function totalGross(wids, mon) {
  if (!AGG[mon]) return 0;
  return wids.reduce((s, wid) => s + (AGG[mon].works[wid]?.gross || 0), 0);
}
function totalNet(wids, mon) {
  if (!AGG[mon]) return 0;
  return wids.reduce((s, wid) => s + (AGG[mon].works[wid]?.net || 0), 0);
}
// 하위 호환 — 기존 totalLF 호출부가 있으면 gross 반환
function totalLF(wids, mon) { return totalGross(wids, mon); }
function totalSales(wids, mon) {
  if (!AGG[mon]) return 0;
  return wids.reduce((s, wid) => s + (AGG[mon].works[wid]?.sales || 0), 0);
}

// ── 데이터 로드 ──
// loadSheetData({ force, onSuccess, onError, onLoading })
//   force=true면 캐시 무시하고 무조건 fetch.
//   캐시는 sessionStorage(탭 단위) — 같은 탭 안에서는 페이지 이동(예: index ↔ report)에도
//   네트워크를 다시 타지 않는다. 탭을 닫으면 자동 만료되므로 TTL은 두지 않는다.
const SHEETS_CACHE_KEY = 'works-hub:sheets_raw:v1';

function _readSheetsCache() {
  try {
    const s = sessionStorage.getItem(SHEETS_CACHE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}
function _writeSheetsCache(raw) {
  try {
    sessionStorage.setItem(SHEETS_CACHE_KEY, JSON.stringify(raw));
  } catch (_) {
    // 용량 초과 등은 무시 — 캐시는 베스트 에포트
  }
}

async function loadSheetData(opts = {}) {
  const { force = false, onSuccess, onError, onLoading } = opts;

  // 캐시 히트 — 즉시 적용 (로딩 오버레이도 띄우지 않음)
  if (!force) {
    const cached = _readSheetsCache();
    if (cached) {
      RAW = cached;
      buildAgg();
      buildLifecycle();
      buildDailyAgg();
      if (onSuccess) onSuccess(RAW.length, /*fromCache=*/true);
      return;
    }
  }

  if (onLoading) onLoading(true);
  try {
    const res  = await fetch('/api/sheets');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && !contentType.includes('json')) {
      throw new Error('세션이 만료됐습니다. 페이지를 새로고침하고 다시 로그인해주세요.');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.values) throw new Error(json.error || '시트 데이터를 받지 못했습니다');
    const [header, ...dataRows] = json.values;
    RAW = dataRows.map(row => {
      const obj = {};
      header.forEach((col, i) => { obj[col] = row[i] ?? ''; });
      return obj;
    });
    _writeSheetsCache(RAW);
    buildAgg();
    buildLifecycle();
    buildDailyAgg();
    if (onSuccess) onSuccess(RAW.length, /*fromCache=*/false);
  } catch (e) {
    if (onError) onError(e);
    console.error('loadSheetData error:', e);
  } finally {
    if (onLoading) onLoading(false);
  }
}
