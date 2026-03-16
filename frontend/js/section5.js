/**
 * section5.js - 토큰 로그 섹션 (🪙 token)
 * AI API 토큰 사용 통계와 예상 비용을 대시보드로 표시
 * 사용 페이지: app.html (id="page-token")
 * 외부 의존: apiFetch (app.js)
 *
 * [화면 구성]
 *   ① 요약 카드: 총 토큰, API 호출 횟수
 *   ② 입력/출력 토큰 비율 막대 그래프
 *   ③ 예상 비용 (USD / KRW)
 *   ④ 최근 API 호출 기록 목록
 */

/**
 * 토큰 사용 대시보드 렌더링 (GET /api/token/logs)
 * goPage("token") 진입 시 호출
 *
 * API 응답 형식:
 *   { prompt_tokens, completion_tokens, total_tokens, call_count,
 *     total_cost_usd, total_cost_krw, history: [{ action, total, ts }] }
 */
async function renderTokenPage() {
  const container = document.getElementById("page-token");

  container.innerHTML = `
    <h1 style="margin-bottom:20px;">🪙 Usage Log</h1>

    <div style="
      background:#f8f9f7;
      border:1px solid #e3e7df;
      border-radius:22px;
      padding:30px;
      box-shadow:0 8px 22px rgba(0,0,0,0.05);
      width:100%;
      box-sizing:border-box;
    ">
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:24px;
      ">
        <div style="font-size:26px; font-weight:800; color:#2f3a2f;">토큰 사용 대시보드</div>
      </div>

      <div id="token-card" style="font-size:18px; color:#666;">불러오는 중...</div>
    </div>
  `;

  try {
    const res = await apiFetch("/api/token/logs");
    if (!res.ok) throw new Error("토큰 로그 조회 실패");

    const data = await res.json();

    const inputTokens  = Number(data.prompt_tokens     || 0);
    const outputTokens = Number(data.completion_tokens || 0);
    const totalTokens  = Number(data.total_tokens      || 0);
    const callCount    = Number(data.call_count        || 0);
    const costUsd      = data.total_cost_usd           || 0;
    const costKrw      = data.total_cost_krw           || 0;

    // 입력/출력 비율 (막대 그래프 width%)
    const totalForBar  = inputTokens + outputTokens || 1;
    const inputWidth   = (inputTokens  / totalForBar) * 100;
    const outputWidth  = (outputTokens / totalForBar) * 100;

    /** action 키 → 한국어 레이블 */
    function getActionLabel(action) {
      const map = {
        explain: "개념설명", additional_explain: "추가설명", extra_explain: "추가설명",
        quiz: "문제풀이", solve: "문제풀이", grading: "채점", check: "채점",
        feedback: "피드백", free: "자유학습", free_chat: "자유학습",
        summary: "요약", report: "리포트", exam: "시험", evaluate: "이해도평가"
      };
      return map[action] || action || "기록";
    }

    /** 토큰 수 → 수준 텍스트 */
    function getTokenLevel(total) {
      const n = Number(total || 0);
      if (n >= 700) return "높음";
      if (n >= 400) return "보통";
      return "양호";
    }

    // 최근 호출 기록 HTML
    const history = (data.history || []).map(h => `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:16px 18px;
        margin-bottom:12px;
        background:#ffffff;
        border:1px solid #e6e9e2;
        border-radius:14px;
        box-shadow:0 3px 10px rgba(0,0,0,0.03);
      ">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="
            background:#6B8F71;
            color:#ffffff;
            font-size:15px;
            font-weight:700;
            padding:6px 14px;
            border-radius:999px;
            letter-spacing:-0.2px;
          ">${getActionLabel(h.action)}</span>
          <span style="font-weight:700; font-size:18px; color:#253042;">${Number(h.total || 0).toLocaleString()} tok</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="
            background:#f3f4f6;
            color:#4b5563;
            font-size:15px;
            font-weight:700;
            padding:6px 14px;
            border-radius:999px;
          ">${getTokenLevel(h.total)}</span>
          <span style="color:#7a7f87; font-size:17px; font-weight:500;">${h.ts || "-"}</span>
        </div>
      </div>
    `).join("");

    document.getElementById("token-card").innerHTML = `

      <!-- 요약 카드: 총 토큰 / API 호출 횟수 -->
      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:20px;
        margin-bottom:24px;
      ">
        <div style="
          background:#ffffff;
          border:1px solid #e3e7df;
          border-radius:16px;
          padding:24px 20px;
          text-align:center;
          box-shadow:0 3px 10px rgba(0,0,0,0.03);
        ">
          <div style="font-size:18px; color:#7b8078; margin-bottom:12px; font-weight:600;">총 토큰</div>
          <div style="font-size:42px; font-weight:800; color:#1f2937; letter-spacing:-1px;">${totalTokens.toLocaleString()}</div>
        </div>

        <div style="
          background:#ffffff;
          border:1px solid #e3e7df;
          border-radius:16px;
          padding:24px 20px;
          text-align:center;
          box-shadow:0 3px 10px rgba(0,0,0,0.03);
        ">
          <div style="font-size:18px; color:#7b8078; margin-bottom:12px; font-weight:600;">API 호출</div>
          <div style="font-size:42px; font-weight:800; color:#1f2937; letter-spacing:-1px;">${callCount}</div>
        </div>
      </div>

      <!-- 입력/출력 토큰 수치 -->
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        font-size:20px;
        font-weight:700;
        margin-bottom:10px;
      ">
        <span style="color:#465a80;">입력 ${inputTokens.toLocaleString()}</span>
        <span style="color:#7a8f63;">출력 ${outputTokens.toLocaleString()}</span>
      </div>

      <!-- 입력/출력 비율 막대 (네이비: 입력, 레드: 출력) -->
      <div style="
        display:flex;
        width:100%;
        height:18px;
        overflow:hidden;
        border-radius:999px;
        background:#e4e7e2;
        margin-bottom:22px;
        box-shadow:inset 0 1px 2px rgba(0,0,0,0.04);
      ">
        <div style="width:${inputWidth}%; background:#4F6DB3;"></div>
        <div style="width:${outputWidth}%; background:#B94A48;"></div>
      </div>

      <!-- 예상 비용 -->
      <div style="
        background:#FDECC8;
        border:1px solid #e6d5aa;
        border-radius:16px;
        padding:18px 20px;
        font-size:24px;
        font-weight:800;
        color:#5d4630;
        margin-bottom:26px;
      ">
        💰 예상 비용 : $ ${costUsd} (₩ ${Number(costKrw).toLocaleString()})
      </div>

      <!-- 최근 호출 기록 -->
      <div style="
        font-size:26px;
        font-weight:800;
        color:#2f3a2f;
        margin-bottom:14px;
      ">최근 기록</div>

      ${history || `<div style="color:#666; font-size:18px;">기록 없음</div>`}
    `;
  } catch (err) {
    document.getElementById("token-card").innerHTML = `
      <div style="
        background:#fff5f5;
        border:1px solid #f5c2c7;
        color:#b02a37;
        border-radius:12px;
        padding:16px;
        font-weight:600;
        font-size:18px;
      ">
        토큰 로그 불러오기 실패
      </div>
    `;
    console.error(err);
  }
}
