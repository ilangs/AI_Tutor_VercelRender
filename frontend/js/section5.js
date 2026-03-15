/**
 * section5.js  -  토큰 로그 섹션
 *
 * LLM API 토큰 사용 통계(총 토큰, 비용, 최근 호출 기록)를 대시보드로 표시합니다.
 * 외부 의존: apiFetch (app.js)
 */

/**
 * renderTokenPage()
 * ─────────────────────────────────────
 * [역할] 토큰 사용 통계 대시보드를 화면에 렌더링합니다.
 *        goPage("token") 호출 시 실행됩니다.
 *
 * [API 호출]
 *   엔드포인트: GET /api/token/logs
 *   응답 예시: {
 *     prompt_tokens:     5000,    // 입력 토큰 누적 합계
 *     completion_tokens: 2000,    // 출력 토큰 누적 합계
 *     total_tokens:      7000,    // 전체 토큰 (입력 + 출력)
 *     call_count:        42,      // 총 API 호출 횟수
 *     total_cost_usd:    0.0105,  // 예상 비용 (달러)
 *     total_cost_krw:    14.28,   // 예상 비용 (원화)
 *     history: [
 *       { action: "explain", total: 350, ts: "2026-03-12 14:30" },
 *       ...
 *     ]
 *   }
 *
 * [입력/출력 비율 막대]
 *   입력 + 출력 토큰의 합을 100%로 하여
 *   각각의 비율을 CSS width(%)로 표현합니다.
 *   - 파란색 막대: 입력 토큰 비율 (#5b7cff)
 *   - 주황색 막대: 출력 토큰 비율 (#f28c52)
 */
async function renderTokenPage() {
  const container = document.getElementById("page-token");

  // 페이지 초기 HTML 뼈대와 로딩 중 표시
  container.innerHTML = `
    <h1 style="margin-bottom:20px;">⚡ 토큰 로그</h1>

    <div style="
      background:#f8f9fb;
      border:1px solid #e5e7eb;
      border-radius:16px;
      padding:24px;
      box-shadow:0 4px 12px rgba(0,0,0,0.06);
      max-width:1000px;
    ">
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:20px;
      ">
        <div style="font-size:20px; font-weight:700;">토큰 사용 대시보드</div>
      </div>

      <div id="token-card">불러오는 중...</div>
    </div>
  `;

  try {
    // GET /api/token/logs: 토큰 사용 통계 요청
    const res = await apiFetch("/api/token/logs");
    if (!res.ok) throw new Error("토큰 로그 조회 실패");

    const data = await res.json();

    // 서버 응답 데이터 추출 (없으면 0 처리)
    const inputTokens  = Number(data.prompt_tokens     || 0);
    const outputTokens = Number(data.completion_tokens || 0);
    const totalTokens  = Number(data.total_tokens      || 0);
    const callCount    = Number(data.call_count        || 0);
    const costUsd      = data.total_cost_usd           || 0;
    const costKrw      = data.total_cost_krw           || 0;

    // 입력/출력 토큰 비율 계산 (막대 그래프 width% 용)
    // 0으로 나누기 방지: 합이 0이면 1로 대체
    const totalForBar  = inputTokens + outputTokens || 1;
    const inputWidth   = (inputTokens  / totalForBar) * 100;
    const outputWidth  = (outputTokens / totalForBar) * 100;

    // 최근 API 호출 기록 목록 HTML 생성
    const history = (data.history || []).map(h => `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:10px 12px;
        margin-bottom:8px;
        background:#ffffff;
        border:1px solid #e5e7eb;
        border-radius:10px;
      ">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="
            background:#4f7cff;
            color:#fff;
            font-size:12px;
            font-weight:700;
            padding:4px 10px;
            border-radius:8px;
          ">${h.action}</span>
          <span style="font-weight:600;">${h.total} tok</span>
        </div>
        <span style="color:#666; font-size:14px;">${h.ts}</span>
      </div>
    `).join("");

    // 대시보드 전체 내용 삽입
    document.getElementById("token-card").innerHTML = `

      <!-- 요약 카드: 총 토큰, API 호출 횟수 -->
      <div style="display:flex; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
        <div style="
          flex:1;
          min-width:180px;
          background:#ffffff;
          border:1px solid #e5e7eb;
          border-radius:12px;
          padding:18px;
          text-align:center;
        ">
          <div style="font-size:13px; color:#777; margin-bottom:8px;">총 토큰</div>
          <div style="font-size:32px; font-weight:800;">${totalTokens.toLocaleString()}</div>
        </div>

        <div style="
          flex:1;
          min-width:180px;
          background:#ffffff;
          border:1px solid #e5e7eb;
          border-radius:12px;
          padding:18px;
          text-align:center;
        ">
          <div style="font-size:13px; color:#777; margin-bottom:8px;">API 호출</div>
          <div style="font-size:32px; font-weight:800;">${callCount}</div>
        </div>
      </div>

      <!-- 입력/출력 토큰 비율 레이블 -->
      <div style="
        display:flex;
        justify-content:space-between;
        font-size:14px;
        font-weight:600;
        margin-bottom:8px;
      ">
        <span>입력 ${inputTokens.toLocaleString()}</span>
        <span>출력 ${outputTokens.toLocaleString()}</span>
      </div>

      <!-- 입력/출력 비율 막대 그래프 (파란색: 입력, 주황색: 출력) -->
      <div style="
        display:flex;
        width:100%;
        height:14px;
        overflow:hidden;
        border-radius:999px;
        background:#e5e7eb;
        margin-bottom:16px;
      ">
        <div style="width:${inputWidth}%; background:#5b7cff;"></div>
        <div style="width:${outputWidth}%; background:#f28c52;"></div>
      </div>

      <!-- 예상 비용 표시 (USD + KRW) -->
      <div style="
        background:#fffaf0;
        border:1px solid #f2d6a2;
        border-radius:12px;
        padding:14px 16px;
        font-size:16px;
        font-weight:700;
        margin-bottom:20px;
      ">
        💰 예상 비용 : $ ${costUsd} (₩ ${Number(costKrw).toLocaleString()})
      </div>

      <!-- 최근 API 호출 기록 -->
      <div style="
        font-size:20px;
        font-weight:800;
        margin-bottom:12px;
      ">최근 기록</div>

      ${history || `<div style="color:#666;">기록 없음</div>`}
    `;
  } catch (err) {
    // 오류 발생 시 오류 메시지 표시
    document.getElementById("token-card").innerHTML = `
      <div style="
        background:#fff5f5;
        border:1px solid #f5c2c7;
        color:#b02a37;
        border-radius:12px;
        padding:16px;
        font-weight:600;
      ">
        토큰 로그 불러오기 실패
      </div>
    `;
    console.error(err);
  }
}
