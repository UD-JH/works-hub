# works-hub 작업 노트

## 프로젝트 개요
- 작품(성인 동인지) 매출 대시보드 + 워크플로우 빌더
- `public/tools/dashboard/` — 작품 대시보드 (index.html, report.html, sheets.js)
- `public/builder.html` — 워크플로우 빌더
- `public/scripts/hub.js` — 허브 페이지 로직
- `public/scripts/workflow-runner.js` — 워크플로우 실행 엔진 (공통)
- `server/index.js` — Express 서버

---

## 다음 작업: 주간 보고서 템플릿 기능

### 목표
`public/tools/dashboard/report.html` 의 주간 보고서(`renderWeeklyReport`)에 아래 기능 추가

### 구현할 기능
1. **섹션 on/off** — 체크박스로 원하는 섹션만 표시
2. **섹션 순서 변경** — 위/아래 버튼으로 순서 조정
3. **템플릿 저장** — 섹션 구성을 localStorage에 JSON으로 저장 (매번 개선 가능)
4. **섹션별 자유 텍스트** — 자동 집계 아래 textarea 추가, 내용도 localStorage 임시 저장
5. **MD 내보내기 연동** — 기존 `buildWeeklyMd()` 확장, 자유텍스트 포함

### 시작 전 필요한 것
- 사용자가 현재 쓰는 보고서 양식(어떤 섹션 구성인지) 공유 후 설계 시작

### 현재 주간 보고서 섹션 구조 (자동 생성)
1. 핵심 요약 (KPI 4개 + 요약 텍스트)
2. 작품별 순매출 순위 (주간)
3. 플랫폼별 비교 (주간)
4. 계정별 팬수 (주간 최신 기준)

---

## 오늘 완료한 작업 (2026-04-16)

### 작품 대시보드
- 라이프사이클 작품 목록을 플랫폼별(fanza/dlsite)로 분리 표시
- "fanza만" / "dlsite만" 선택 버튼 추가 (`lcSelectPlatform()`)
- 라이프사이클 툴팁 미표시 버그 수정 — `_`-prefix 세그먼트도 이름 복원해서 표시
- 오버뷰 TOP10 테이블에 업로드일 컬럼 추가 (`crawl_date_2 - age` 역산)

### 워크플로우 (코드 리뷰 후 수정)
- `server/index.js`: 저장 시 `lastRunAt`/`lastRunStatus` 기존 값 보존
- `builder.html`: 저장 payload에서 `lastRunAt`/`lastRunStatus` 제거
- `builder.html`: 고립 노드를 warn → error로 격상 (실행 차단)
- `builder.html`: 동일 toPort 다중 입력을 error로 차단 (병합 미지원 명시)
- `builder.html`: `loadWorkflowFromUrl()` 끝에 `applyValidation()` 추가
- `hub.js`: 단계 UI를 `getExecutionOrder()` 기반으로 렌더링
