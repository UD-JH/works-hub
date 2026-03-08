// tools/index.json 과 workflows/index.json 을 읽어서 카드를 동적으로 생성합니다

async function loadTools() {
  const res = await fetch('/tools/index.json');
  const data = await res.json();

  const grid = document.getElementById('toolGrid');
  grid.innerHTML = data.tools.map(tool => `
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
  const res = await fetch('/workflows/index.json');
  const data = await res.json();

  const grid = document.getElementById('workflowGrid');
  grid.innerHTML = data.workflows.map(wf => `
    <div class="card">
      <div class="card-stripe" style="background:${wf.color}"></div>
      <div class="card-body">
        <div class="card-name">${wf.name}</div>
        <div class="card-desc">${wf.desc}</div>
        <div class="card-footer">
          <span class="card-tag">workflow</span>
          <span class="card-meta">${wf.updatedAt}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// 페이지 로드 시 실행
loadTools();
loadWorkflows();