const express = require('express')
const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const AdmZip = require('adm-zip')

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname)))

// ── 설정 ──────────────────────────────────────────
const BASE_DIR = path.join(process.env.HOME, 'Desktop/mosaic_workspace')
const INBOX_DIR        = path.join(BASE_DIR, 'inbox')
const WORKSPACE_DIR    = path.join(BASE_DIR, 'workspace')
const OUTPUT_DIR       = path.join(BASE_DIR, 'output')
const LEARNING_DIR     = path.join(BASE_DIR, 'learning_data')
// ─────────────────────────────────────────────────

// 상태
let status = { logs: [], pairCount: 0, unpaired: [] }

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  status.logs.unshift(line)
  if (status.logs.length > 100) status.logs.pop()
  console.log(line)
}

// 최신 learning_data 폴더 찾기
function getLatestLearningDir() {
  const dirs = fs.readdirSync(LEARNING_DIR)
    .filter(d => /^\d+_model_learning_data$/.test(d))
    .sort()
  return dirs.length ? path.join(LEARNING_DIR, dirs[dirs.length - 1]) : null
}

// 다음 시작 번호 계산
function getNextNum(learningDir) {
  if (!learningDir || !fs.existsSync(learningDir)) return 1
  const files = fs.readdirSync(learningDir)
    .filter(f => /^\d+\.png$/.test(f))
    .map(f => parseInt(f))
    .sort((a, b) => a - b)
  return files.length ? files[files.length - 1] + 1 : 1
}

// 폴더명 날짜 갱신
function updateLearningDirDate(learningDir) {
  const today = new Date()
  const yy = String(today.getFullYear()).slice(2)
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const newName = `${yy}${mm}${dd}_model_learning_data`
  const newPath = path.join(LEARNING_DIR, newName)
  if (learningDir !== newPath) {
    fs.renameSync(learningDir, newPath)
    log(`폴더명 갱신: ${path.basename(learningDir)} → ${newName}`)
    return newPath
  }
  return learningDir
}

// inbox 감시 - ZIP 자동 해제
chokidar.watch(INBOX_DIR, { ignoreInitial: true }).on('add', (filePath) => {
  if (!filePath.endsWith('.zip')) return
  log(`ZIP 감지: ${path.basename(filePath)}`)
  try {
    const zip = new AdmZip(filePath)
    const baseName = path.basename(filePath, '.zip')
    const destDir = path.join(WORKSPACE_DIR, baseName)
    fs.mkdirSync(destDir, { recursive: true })
    zip.extractAllTo(destDir, true)
    fs.unlinkSync(filePath)
    log(`압축 해제 완료 → workspace/${baseName}`)
  } catch (e) {
    log(`오류: ${e.message}`)
  }
})

// output 감시 - 마스크 자동 페어링
chokidar.watch(OUTPUT_DIR, { ignoreInitial: true }).on('add', (filePath) => {
  if (!filePath.endsWith('.png')) return
  const fname = path.basename(filePath)
  const origFname = fname.replace('_mosaic.png', '.png')
  log(`마스크 감지: ${fname}`)

  // workspace에서 원본 찾기
  let origPath = null
  const workspaceDirs = fs.readdirSync(WORKSPACE_DIR)
  for (const dir of workspaceDirs) {
    const candidate = path.join(WORKSPACE_DIR, dir, origFname)
    if (fs.existsSync(candidate)) {
      origPath = candidate
      break
    }
  }

  if (!origPath) {
    log(`원본 없음: ${fname}`)
    status.unpaired.push(fname)
    return
  }

  // learning_data로 이동
  let learningDir = getLatestLearningDir()
  if (!learningDir) {
    const today = new Date()
    const yy = String(today.getFullYear()).slice(2)
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    learningDir = path.join(LEARNING_DIR, `${yy}${mm}${dd}_model_learning_data`)
    fs.mkdirSync(learningDir, { recursive: true })
  }

  const nextNum = getNextNum(learningDir)
  const numStr = String(nextNum).padStart(3, '0')

  fs.copyFileSync(origPath, path.join(learningDir, `${numStr}.png`))
  fs.copyFileSync(filePath, path.join(learningDir, `${numStr}_mosaic.png`))
  fs.unlinkSync(filePath)

  learningDir = updateLearningDirDate(learningDir)
  status.pairCount = getNextNum(learningDir) - 1

  log(`페어링 완료: ${numStr}.png + ${numStr}_mosaic.png`)
})

// API
app.get('/status', (req, res) => {
  const learningDir = getLatestLearningDir()
  status.pairCount = learningDir ? getNextNum(learningDir) - 1 : 0
  res.json({ ...status, learningDir: learningDir ? path.basename(learningDir) : '없음' })
})

app.post('/scan', (req, res) => {
  const learningDir = getLatestLearningDir()
  if (!learningDir) return res.json({ pairCount: 0 })
  const count = getNextNum(learningDir) - 1
  res.json({ pairCount: count, learningDir: path.basename(learningDir) })
})

app.listen(3001, () => console.log('Data Manager 서버 실행 중: http://localhost:3001'))