require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const path    = require('path');

const app  = express();
const PORT = 3000;

// 비밀번호 해시 생성
const PASSWORD_HASH = bcrypt.hashSync(process.env.PASSWORD, 10);

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8시간
}));

// 로그인 체크 미들웨어
function requireAuth(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/login.html');
}

// 로그인 페이지는 인증 없이 접근 가능
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Google Sheets 프록시 (API 키 서버에서만 사용)
app.get('/api/sheets', requireAuth, async (req, res) => {
  const SHEET_ID  = '1HMGzUNOb0ltelHZzJanYnaNhQEg5R3p_3YNwtH_Fck8';
  const SHEET_RANGE = 'PREPARATION_DATA!A1:AH10000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}?key=${process.env.GOOGLE_API_KEY}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Google API ${resp.status}`);
    const json = await resp.json();
    if (!json.values) {
      const msg = json.error?.message || JSON.stringify(json);
      throw new Error(`Google Sheets 응답에 values 없음: ${msg}`);
    }
    res.json(json);
  } catch (e) {
    console.error('Sheets proxy error:', e);
    res.status(502).json({ error: '구글 시트 데이터를 가져오지 못했어요' });
  }
});

// 로그인 처리
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (bcrypt.compareSync(password, PASSWORD_HASH)) {
    req.session.loggedIn = true;
    res.json({ ok: true });
  } else {
    res.json({ ok: false, message: '비밀번호가 틀렸어요' });
  }
});

// 로그아웃
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// 워크플로우 저장
const fs   = require('fs');

app.post('/api/workflow/save', requireAuth, (req, res) => {
  const wf       = req.body;
  const indexPath = path.join(__dirname, '../public/workflows/index.json');

  // 기존 index.json 읽기
  let data = { workflows: [] };
  if (fs.existsSync(indexPath)) {
    data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }

  // 같은 id면 업데이트(createdAt 보존), 없으면 추가
  const idx = data.workflows.findIndex(w => w.id === wf.id);
  if (idx >= 0) {
    const existing = data.workflows[idx];
    data.workflows[idx] = {
      ...wf,
      createdAt:     existing.createdAt     || wf.createdAt || new Date().toISOString(),
      lastRunAt:     existing.lastRunAt     ?? null,
      lastRunStatus: existing.lastRunStatus ?? null,
    };
  } else {
    if (!wf.createdAt) wf.createdAt = new Date().toISOString();
    data.workflows.push(wf);
  }

  fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

// 워크플로우 실행 결과 기록
app.post('/api/workflow/run-status', requireAuth, (req, res) => {
  const { id, lastRunAt, lastRunStatus } = req.body;
  if (!id) return res.status(400).json({ ok: false });

  const indexPath = path.join(__dirname, '../public/workflows/index.json');
  let data = { workflows: [] };
  if (fs.existsSync(indexPath)) {
    data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }
  const idx = data.workflows.findIndex(w => w.id === id);
  if (idx >= 0) {
    data.workflows[idx].lastRunAt     = lastRunAt;
    data.workflows[idx].lastRunStatus = lastRunStatus;
    fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
  }
  res.json({ ok: true });
});

// 나머지 정적 파일은 로그인 후에만
app.use(requireAuth, express.static(path.join(__dirname, '../public')));

// 서버 시작
app.listen(PORT, () => {
  console.log(`Works Hub 서버 실행 중 → http://localhost:${PORT}`);
});