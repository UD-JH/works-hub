// ═══════════════════════════════════════════
//  workflow-runner.js — 워크플로우 공통 실행 엔진
//  v2: 포트 기반 라우팅 실행 (4.5단계)
// ═══════════════════════════════════════════

window.WorkflowRunner = (function () {

  // ── 모듈 로더 ──
  async function loadModuleScript(modId) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-mod="${modId}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = `/modules/${modId}.js`;
      s.dataset.mod = modId;
      s.onload  = resolve;
      s.onerror = () => reject(new Error(`모듈 로드 실패: ${modId}`));
      document.head.appendChild(s);
    });
  }

  function getModuleObject(modId) {
    return window.WorksHubModules?.[modId] || null;
  }

  // ── 위상 정렬 (Kahn) ──
  // 용도: 빌더 UI 초기화 / 그래프 연결 검증
  // 실행 순서 결정에는 더 이상 사용하지 않음 (포트 라우팅으로 대체)
  function getExecutionOrder(nodes, edges) {
    const e = edges || [];
    if (!e.length && nodes.length === 1) return [nodes[0].id];
    const inDegree = {};
    nodes.forEach(n => { inDegree[n.id] = 0; });
    e.forEach(ed => { inDegree[ed.to] = (inDegree[ed.to] || 0) + 1; });
    const queue  = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const result = [];
    while (queue.length) {
      const cur = queue.shift();
      result.push(cur);
      e.filter(ed => ed.from === cur).forEach(ed => {
        inDegree[ed.to]--;
        if (inDegree[ed.to] === 0) queue.push(ed.to);
      });
    }
    return result.length === nodes.length ? result : null;
  }

  // ── 메인 러너 (포트 기반 BFS 라우팅) ──
  //
  // 실행 모델:
  //   1. 입력 엣지가 없는 노드(소스)부터 BFS 시작
  //   2. 각 노드 실행 후 output._port (없으면 'out') 로 활성 출력 포트 결정
  //   3. 해당 포트에 연결된 다음 노드를 큐에 추가
  //   4. _port는 다음 노드에 전달하지 않음 (passData에서 제거)
  //
  // 일반 모듈 (단일 포트):
  //   _port를 반환하지 않으면 자동으로 'out' 포트로 라우팅 → 기존 동작 그대로
  //
  // 분기 모듈 (5A 이후, ex. condition):
  //   { ...data, _port: 'true' } 또는 { ...data, _port: 'false' } 반환
  //   → 해당 포트에 연결된 경로만 실행
  //
  // callbacks: { onStepStart, onStepDone, onStepFail, onComplete }
  //   onStepStart(nodeId, { step, total, inputCount })
  //   onStepDone (nodeId, { step, total, duration, inputCount, outputCount })
  //   onStepFail (nodeId, { step, total, duration, inputCount, error })
  //   onComplete ({ success, ordered, steps, totalDuration, runAt,
  //                 lastSuccessNodeId, failedNodeId })
  async function run(wf, callbacks = {}) {
    const { onStepStart, onStepDone, onStepFail, onComplete } = callbacks;
    const nodes = wf.nodes || [];
    const edges = wf.edges || [];

    // 소스 노드 = 입력 엣지가 없는 노드
    const hasIncoming = new Set(edges.map(e => e.to));
    const sources     = nodes.filter(n => !hasIncoming.has(n.id));

    if (!nodes.length || !sources.length) {
      const result = {
        success: false, error: '시작 노드가 없습니다',
        steps: [], ordered: [], totalDuration: 0,
        runAt: new Date().toISOString(),
        lastSuccessNodeId: null, failedNodeId: null,
      };
      if (onComplete) onComplete(result);
      return result;
    }

    const runAt    = new Date().toISOString();
    const runStart = performance.now();
    const steps    = [];
    const ordered  = [];   // 실제로 실행된 노드 순서
    let failedNodeId = null;

    // 각 노드가 받을 입력 데이터 (포트 라우팅으로 채워짐)
    const nodeInputs = {};
    sources.forEach(n => { nodeInputs[n.id] = {}; });

    // BFS 큐
    const queue   = sources.map(n => n.id);
    const inQueue = new Set(queue);

    while (queue.length && !failedNodeId) {
      const nodeId = queue.shift();
      inQueue.delete(nodeId);
      ordered.push(nodeId);

      const node       = nodes.find(n => n.id === nodeId);
      const inputData  = nodeInputs[nodeId] || {};
      const inputCount = Array.isArray(inputData.files) ? inputData.files.length
                       : (typeof inputData.count === 'number' ? inputData.count : 0);
      const stepIdx   = steps.length;
      const stepStart = performance.now();

      if (onStepStart) onStepStart(nodeId, { step: stepIdx + 1, total: nodes.length, inputCount });

      try {
        await loadModuleScript(node.modId);
        const modObj = getModuleObject(node.modId);
        if (!modObj) throw new Error(`모듈을 찾을 수 없어요: ${node.modId}`);

        const output   = await modObj.run(inputData, node.params);
        const duration = Math.round(performance.now() - stepStart);
        const outputCount = Array.isArray(output.files) ? output.files.length
                          : (typeof output.count === 'number' ? output.count : 0);

        const log = { nodeId, modId: node.modId, status: 'done',
                      step: stepIdx + 1, duration, inputCount, outputCount };
        steps.push(log);
        if (onStepDone) onStepDone(nodeId, log);

        // 활성 출력 포트 결정 후 _port 제거
        const activePort = output._port || 'out';
        const { _port, ...passData } = output;

        // 활성 포트에 연결된 다음 노드를 큐에 추가
        edges
          .filter(e => e.from === nodeId && (e.fromPort || 'out') === activePort)
          .forEach(e => {
            nodeInputs[e.to] = passData;
            if (!inQueue.has(e.to) && !ordered.includes(e.to)) {
              queue.push(e.to);
              inQueue.add(e.to);
            }
          });

      } catch (err) {
        const duration = Math.round(performance.now() - stepStart);
        failedNodeId = nodeId;
        const log = { nodeId, modId: node.modId, status: 'fail',
                      step: stepIdx + 1, duration, inputCount, error: err.message };
        steps.push(log);
        if (onStepFail) onStepFail(nodeId, log);
      }
    }

    const totalDuration   = Math.round(performance.now() - runStart);
    const lastSuccessStep = [...steps].reverse().find(s => s.status === 'done');

    const result = {
      success:           !failedNodeId,
      ordered,           // 실제 실행된 노드 id 목록 (실행 순서)
      steps,
      totalDuration,
      runAt,
      lastSuccessNodeId: lastSuccessStep?.nodeId ?? null,
      failedNodeId:      failedNodeId ?? null,
    };
    if (onComplete) onComplete(result);
    return result;
  }

  return { run, getExecutionOrder, loadModuleScript, getModuleObject };
})();
