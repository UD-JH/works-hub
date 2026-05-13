const express = require('express')
const fs      = require('fs')
const path    = require('path')
const chokidar = require('chokidar')

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname)))

let config = {
  watchDir:      '',
  startNum:      1,
  outputPattern: '{n}_mosaic',
  seqRegex:      '_([0-9]+)$',
}

let status  = { logs: [], renamedCount: 0 }
let watcher = null

function log(msg, type = '') {
  const entry = { text: `[${new Date().toLocaleTimeString()}] ${msg}`, type }
  status.logs.unshift(entry)
  if (status.logs.length > 200) status.logs.pop()
  console.log(entry.text)
}

function extractSeq(basename, regexStr) {
  try {
    const m = basename.match(new RegExp(regexStr))
    return m ? parseInt(m[1]) : null
  } catch {
    return null
  }
}

function applyPattern(pattern, n) {
  return pattern.replace('{n}', n)
}

function startWatcher(dir) {
  if (watcher) { watcher.close(); watcher = null }

  if (!dir) { log('폴더 경로를 입력해주세요.', 'error'); return false }
  if (!fs.existsSync(dir)) { log(`폴더 없음: ${dir}`, 'error'); return false }

  watcher = chokidar.watch(dir, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 500 } })

  watcher.on('add', (filePath) => {
    const ext  = path.extname(filePath).toLowerCase()
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) return

    const fname    = path.basename(filePath)
    const base     = path.basename(filePath, ext)
    const seq      = extractSeq(base, config.seqRegex)

    if (seq === null) {
      log(`패턴 불일치 스킵: ${fname}`, 'error')
      return
    }

    const n       = config.startNum + seq - 1
    const newName = applyPattern(config.outputPattern, n) + ext
    const newPath = path.join(path.dirname(filePath), newName)

    try {
      fs.renameSync(filePath, newPath)
      status.renamedCount++
      log(`${fname}  →  ${newName}`, 'success')
    } catch (e) {
      log(`변경 실패: ${fname} — ${e.message}`, 'error')
    }
  })

  watcher.on('error', (e) => log(`감시 오류: ${e.message}`, 'error'))
  log(`감시 시작: ${dir}`, 'info')
  return true
}

// ── API ──────────────────────────────────────────

app.get('/status', (req, res) => {
  res.json({ ...status, config, watching: !!watcher })
})

app.post('/config', (req, res) => {
  const { watchDir, startNum, outputPattern, seqRegex } = req.body
  if (watchDir       !== undefined) config.watchDir      = watchDir.trim()
  if (startNum       !== undefined) config.startNum      = parseInt(startNum) || 1
  if (outputPattern  !== undefined) config.outputPattern = outputPattern.trim()
  if (seqRegex       !== undefined) config.seqRegex      = seqRegex.trim()

  const ok = startWatcher(config.watchDir)
  if (!ok) return res.json({ success: false })
  res.json({ success: true, config })
})

app.post('/stop', (req, res) => {
  if (watcher) { watcher.close(); watcher = null; log('감시 중지', 'info') }
  res.json({ success: true })
})

app.post('/clear', (req, res) => {
  status.logs = []
  status.renamedCount = 0
  res.json({ success: true })
})

app.listen(3001, () => console.log('파일명 변경 서버: http://localhost:3001'))
