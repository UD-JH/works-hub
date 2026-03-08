let currentWf = null;
let wfModules = [];

async function loadTools() {
  const res  = await fetch('/tools/index.json');
  const data = await res.json();
  document.getElementById('toolGrid').innerHTML = data.tools.map(tool => `
    <div class="card" onclick="location.href='${tool.url}'">
      <div class="card-stripe" style="background:${tool.color}"></div>
      <div class="card-body">
        <div class="card-name">${tool.name}</div>
        <div class="card-desc">${tool.desc}</div>
        <div class="card-footer">
          <span class="card-tag">tool</span>
          <span class="card-meta">${tool.version}</span>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadWorkflows() {
  const res  = await fetch('/workflows/index.json');
  const data = await res.json();
  document.getElementById('workflowGrid').innerHTML = data.workflows.map(wf => `
    <div class="card" onclick="openRunModal('${wf.id}')">
      <div class="card-stripe" style="background:${wf.color}"></div>
      <div class="card-body">
        <div class="card-name">${wf.name}</div>
        <div class="card-desc">${wf.desc}</div>
        <div class="card-footer">
          <span class="card-tag">workflow</span>
          <span class="card-meta">${wf.updatedAt}</span>
        </div>
      </div>
      <button class="card-menu-btn" onclick="editWorkflow(event,'${wf.id}')">...</button>
    </div>
  `).join('');
}

async function openRunModal(wfId) {
  // workflows/index.json 에서 워크플로우 찾기
  const res  = await fetch('/workflows/index.json');
  const data = await res.json();
  const wf   = data.workflows.find(w => w.id === wfId);
  if (!wf) return;

  currentWf = wf;

  // 모듈 목록 로드
  const modRes  = await fetch('/modules/index.json');
  const modData = await modRes.json();
  wfModules = modData.modules;

  // 모달 내용 세팅
  document.getElementById('runModalTitle').textContent = wf.name;
  document.getElementById('runModalDesc').textContent  = wf.desc;
  document.getElementById('runModalSteps').innerHTML   = (wf.nodes || []).map(n => {
    const mod = wfModules.find(m => m.id === n.modId);
    return `<div class="run-modal-step" id="rms_${n.id}">
      <div class="run-modal-step-ico">○</div>
      <div>
        <div class="run-modal-step-name">${mod?.name || n.modId}</div>
        <div class="run-modal-step-sub">대기 중</div>
      </div>
    </div>`;
  }).join('');

  // 버튼 초기화
  document.getElementById('runModalStart').style.display  = 'block';
  document.getElementById('runModalCancel').textContent   = '닫기';

  document.getElementById('runModalBg').classList.add('show');
}

function closeRunModal() {
  document.getElementById('runModalBg').classList.remove('show');
  currentWf = null;
}

function editWorkflow(e, wfId) {
  e.stopPropagation();
  location.href = '/builder.html?wf=' + wfId;
}

async function startRun() {
  if (!currentWf) return;

  // 실행 버튼 숨기기
  document.getElementById('runModalStart').style.display = 'none';
  document.getElementById('runModalCancel').textContent  = '닫기';

  // 실행 순서 정렬
  const ordered = getExecutionOrder(currentWf.nodes, currentWf.edges);
  if (!ordered) {
    document.getElementById('runModalDesc').textContent = '노드가 연결되지 않았어요.';
    return;
  }

  let data = {};
  for (const nodeId of ordered) {
    const n      = currentWf.nodes.find(n => n.id === nodeId);
    const stepEl = document.getElementById('rms_' + nodeId);

    stepEl.className = 'run-modal-step active';
    stepEl.querySelector('.run-modal-step-ico').textContent = '↻';
    stepEl.querySelector('.run-modal-step-sub').textContent = '실행 중...';

    try {
      await loadModuleScript(n.modId);
      const modObj = getModuleObject(n.modId);
      data = await modObj.run(data, n.params);

      stepEl.className = 'run-modal-step done';
      stepEl.querySelector('.run-modal-step-ico').textContent = 'V';
      stepEl.querySelector('.run-modal-step-sub').textContent = `${data.count || 0}개 처리됨`;
    } catch(e) {
      stepEl.querySelector('.run-modal-step-sub').textContent = '오류: ' + e.message;
      break;
    }
  }
}

function getExecutionOrder(nodes, edges) {
  if (!edges.length && nodes.length === 1) return [nodes[0].id];
  const inDegree = {};
  nodes.forEach(n => { inDegree[n.id] = 0; });
  edges.forEach(e => { inDegree[e.to] = (inDegree[e.to] || 0) + 1; });
  const queue  = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const result = [];
  while (queue.length) {
    const cur = queue.shift();
    result.push(cur);
    edges.filter(e => e.from === cur).forEach(e => {
      inDegree[e.to]--;
      if (inDegree[e.to] === 0) queue.push(e.to);
    });
  }
  return result.length === nodes.length ? result : null;
}

async function loadModuleScript(modId) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-mod="${modId}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = `/modules/${modId}.js`;
    s.dataset.mod = modId;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function getModuleObject(modId) {
  const map = {
    'folder-open':  typeof FolderOpen  !== 'undefined' ? FolderOpen  : null,
    'image-select': typeof ImageSelect !== 'undefined' ? ImageSelect : null,
    'rename':       typeof Rename      !== 'undefined' ? Rename      : null,
    'download':     typeof Download    !== 'undefined' ? Download    : null,
  };
  return map[modId];
}

loadTools();
loadWorkflows();