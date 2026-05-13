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
          <span class="card-meta">${wf.updatedAt ? new Date(wf.updatedAt).toLocaleDateString('ko-KR') : ''}</span>
        </div>
      </div>
      <button class="card-menu-btn" onclick="editWorkflow(event,'${wf.id}')">...</button>
    </div>
  `).join('');
}

async function openRunModal(wfId) {
  const res  = await fetch('/workflows/index.json');
  const data = await res.json();
  const wf   = data.workflows.find(w => w.id === wfId);
  if (!wf) return;

  // 구 포맷 엣지 자동 승격
  currentWf = {
    ...wf,
    edges: (wf.edges || []).map(ed => ({
      from:     ed.from,
      fromPort: ed.fromPort || 'out',
      to:       ed.to,
      toPort:   ed.toPort   || 'in',
    })),
  };

  const modRes  = await fetch('/modules/index.json');
  const modData = await modRes.json();
  wfModules = modData.modules;

  document.getElementById('runModalTitle').textContent = wf.name;
  document.getElementById('runModalDesc').textContent  = wf.desc;
  document.getElementById('runModalSummary').textContent = '';
  document.getElementById('runModalSummary').className   = 'run-modal-summary';
  const execOrder = WorkflowRunner.getExecutionOrder(currentWf.nodes, currentWf.edges)
                    || currentWf.nodes.map(n => n.id);
  document.getElementById('runModalSteps').innerHTML = execOrder.map((nid, i) => {
    const n   = currentWf.nodes.find(n => n.id === nid);
    const mod = wfModules.find(m => m.id === n.modId);
    return `<div class="run-modal-step" id="rms_${n.id}">
      <div class="run-modal-step-ico">○</div>
      <div class="run-modal-step-body">
        <div class="run-modal-step-name">${i + 1}. ${mod?.name || n.modId}</div>
        <div class="run-modal-step-sub">대기 중</div>
        <div class="run-modal-step-meta" id="rmsm_${n.id}"></div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('runModalStart').style.display = 'block';
  document.getElementById('runModalCancel').textContent  = '닫기';
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

  document.getElementById('runModalStart').style.display = 'none';
  document.getElementById('runModalCancel').textContent  = '닫기';

  const summaryEl = document.getElementById('runModalSummary');
  summaryEl.textContent = '';
  summaryEl.className   = 'run-modal-summary';

  await WorkflowRunner.run(currentWf, {
    onStepStart(nodeId, { inputCount }) {
      const el = document.getElementById('rms_' + nodeId);
      el.className = 'run-modal-step active';
      el.querySelector('.run-modal-step-ico').textContent  = '↻';
      el.querySelector('.run-modal-step-sub').textContent  = '실행 중...';
      const meta = document.getElementById('rmsm_' + nodeId);
      meta.innerHTML = inputCount > 0 ? `<span>입력 ${inputCount}개</span>` : '';
    },
    onStepDone(nodeId, { duration, inputCount, outputCount }) {
      const el = document.getElementById('rms_' + nodeId);
      el.className = 'run-modal-step done';
      el.querySelector('.run-modal-step-ico').textContent = '✓';
      el.querySelector('.run-modal-step-sub').textContent = `${outputCount}개 처리됨`;
      document.getElementById('rmsm_' + nodeId).innerHTML =
        `<span>입력 ${inputCount}개</span><span>→ 출력 ${outputCount}개</span><span>${duration}ms</span>`;
    },
    onStepFail(nodeId, { duration, inputCount, error }) {
      const el = document.getElementById('rms_' + nodeId);
      el.className = 'run-modal-step fail';
      el.querySelector('.run-modal-step-ico').textContent = '✕';
      el.querySelector('.run-modal-step-sub').textContent = '실패';
      document.getElementById('rmsm_' + nodeId).innerHTML =
        `<span class="run-modal-step-err">${error}</span><span>${duration}ms</span>`;
    },
    onComplete({ success, steps, totalDuration, runAt, lastSuccessNodeId, failedNodeId }) {
      summaryEl.className = 'run-modal-summary ' + (success ? 'success' : 'fail');

      const modName = nid => {
        const n = currentWf.nodes.find(n => n.id === nid);
        if (!n) return nid;
        return wfModules.find(m => m.id === n.modId)?.name || n.modId;
      };

      if (success) {
        summaryEl.textContent =
          `✓ 완료 · ${steps.length}/${steps.length}단계 · 총 ${totalDuration}ms`;
      } else {
        const lastOk = lastSuccessNodeId ? modName(lastSuccessNodeId) : '없음';
        summaryEl.innerHTML =
          `✕ 실패 · <b>${modName(failedNodeId)}</b>에서 중단<br>` +
          `마지막 성공: ${lastOk} · 총 ${totalDuration}ms`;
      }

      // lastRunAt / lastRunStatus 저장
      fetch('/api/workflow/run-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentWf.id, lastRunAt: runAt, lastRunStatus: success ? 'success' : 'fail' })
      }).catch(() => {});
    }
  });
}

loadTools();
loadWorkflows();
