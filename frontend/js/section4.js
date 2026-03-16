/**
 * section4.js - 성적 로그 섹션 (📊 score)
 * 시험 결과를 서버에서 조회해 요약 카드 + SVG 그래프 + 테이블로 표시
 * 사용 페이지: app.html (id="page-score")
 * 외부 의존: apiFetch (app.js)
 */

// ─── 성적 로드 및 렌더링 ────────────────────────────────────────

/**
 * 시험 결과 목록 로드 (GET /api/exam/results)
 * goPage("score") 진입 시 호출
 */
async function loadScoreLog() {
  const card = document.getElementById("score-log-card");
  if (!card) return;

  card.innerHTML = '<p style="color:#999; padding:10px;">로딩 중...</p>';

  try {
    const res = await apiFetch("/api/exam/results");
    const data = await res.json();
    renderScoreLog(card, data.results || []);
  } catch (e) {
    console.error("성적 데이터 로드 실패", e);
    card.innerHTML = '<p style="color:#c00; padding:10px;">성적 데이터를 불러오는데 실패했습니다.</p>';
  }
}

/**
 * 시험 결과 배열을 화면에 렌더링 (요약 카드 + SVG 그래프 + 기록 테이블)
 * @param {HTMLElement} card    - 컨테이너 요소
 * @param {Array}       results - 시험 결과 배열
 */
function renderScoreLog(card, results) {
  if (results.length === 0) {
    card.innerHTML = `
      <div class="score-dashboard">
        <p style="color:#999; font-size:18px; text-align:center; padding:40px 0;">
          아직 시험 기록이 없어요.<br>
          <strong>시험</strong> 메뉴에서 시험을 치면 여기에 기록이 쌓여요!
        </p>
      </div>`;
    return;
  }

  const scores = results.map(r => convertScoreTo100(r.score, r.total_questions));
  const latest = results[results.length - 1];
  const latestScore100 = convertScoreTo100(latest.score, latest.total_questions);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  card.innerHTML = `
    <div class="score-dashboard">

      <h2>시험 기록 요약</h2>
      <div class="score-summary" style="display:grid; grid-template-columns:1.8fr 1fr 1fr; gap:20px;">
        <div class="summary-card">
          <div class="summary-label">최근 시험 단원</div>
          <div class="summary-value">${escapeHtmlScore(latest.unit)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">최근 점수</div>
          <div class="summary-value">${latestScore100}점 / 100점</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">평균 점수</div>
          <div class="summary-value">${avgScore}점 / 100점</div>
        </div>
      </div>

      <h2>점수 변화 그래프</h2>
      <div class="graph-card graph-scroll">
        ${buildScoreGraphSvg(scores)}
      </div>

      <h2>시험 기록 목록</h2>
      <div class="log-card">
        <table class="score-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>단원</th>
              <th>점수</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(r => buildScoreRow(r)).join("")}
          </tbody>
        </table>
      </div>

    </div>
  `;
}

// ─── 점수 계산 유틸 ─────────────────────────────────────────────

/**
 * 서버 점수를 100점 만점으로 환산
 * @param {number} score          - 서버 점수 (0~100 기준)
 * @param {number} totalQuestions - 총 문제 수 (없으면 기본 10)
 * @returns {number} 100점 만점 환산 점수
 */
function convertScoreTo100(score, totalQuestions) {
  const total = totalQuestions || 10;
  const eachPoint = 100 / total;
  const correctCount = Math.round((score / 100) * total);
  return Math.round(correctCount * eachPoint);
}

// ─── SVG 그래프 ─────────────────────────────────────────────────

/**
 * 점수 변화 꺾은선 그래프 SVG 생성
 * - Y축: 0~100, 20 간격 눈금선
 * - X축: 1회, 2회... 회차 표시
 * - 색상: 80점 이상 빨강, 50점 이하 파랑, 그 외 초록
 * @param {Array<number>} scores - 100점 만점 점수 배열 (시간 순)
 * @returns {string} SVG HTML 문자열
 */
function buildScoreGraphSvg(scores) {
  if (!scores || scores.length === 0) return "<p>데이터가 없습니다.</p>";

  function getScoreColor(score) {
    if (score >= 80) return "#e53935";
    if (score <= 50) return "#1e88e5";
    return "#43a047";
  }

  const H = 300;
  const PAD_L = 80, PAD_R = 30, PAD_T = 35, PAD_B = 55;
  const stepX = 48;
  const START_OFFSET = stepX;
  const W = Math.max(800, PAD_L + PAD_R + START_OFFSET + stepX * (scores.length - 1));
  const graphW = W - PAD_L - PAD_R;
  const graphH = H - PAD_T - PAD_B;
  const yMin = 0, yMax = 100;
  const yScale = graphH / (yMax - yMin);

  const toX = (i) => PAD_L + START_OFFSET + (scores.length > 1 ? i * stepX : graphW / 2);
  const toY = (s) => PAD_T + graphH - (s - yMin) * yScale;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // 배경
  svg += `<rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="#fcfcfc"/>`;

  // Y축 / X축
  svg += `<line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + graphH}" stroke="#b0b0b0" stroke-width="2"/>`;
  svg += `<line x1="${PAD_L}" y1="${PAD_T + graphH}" x2="${PAD_L + graphW}" y2="${PAD_T + graphH}" stroke="#b0b0b0" stroke-width="2"/>`;

  // 눈금선
  [20, 40, 60, 80, 100].forEach(val => {
    const y = toY(val);
    svg += `<text x="${PAD_L - 10}" y="${y + 5}" font-size="13" text-anchor="end" fill="#666">${val}</text>`;
    svg += `<line x1="${PAD_L}" y1="${y}" x2="${PAD_L + graphW}" y2="${y}" stroke="#e9e9e9" stroke-width="1" stroke-dasharray="4 4"/>`;
  });

  // 구간별 선분 (점수에 따라 색상 분기)
  for (let i = 0; i < scores.length - 1; i++) {
    const x1 = toX(i), y1 = toY(scores[i]);
    const x2 = toX(i + 1), y2 = toY(scores[i + 1]);
    const lineColor = getScoreColor(scores[i + 1]);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineColor}" stroke-width="4" stroke-linecap="round" opacity="0.95"/>`;
  }

  // 각 점 + 점수 텍스트 + 회차 텍스트
  scores.forEach((s, i) => {
    const x = toX(i), y = toY(s);
    const color = getScoreColor(s);
    svg += `<circle cx="${x}" cy="${y}" r="10" fill="${color}" opacity="0.18"/>`;
    svg += `<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#fff" stroke-width="2"/>`;
    svg += `<text x="${x}" y="${y - 14}" font-size="12" font-weight="600" text-anchor="middle" fill="${color}">${s}</text>`;
    svg += `<text x="${x}" y="${PAD_T + graphH + 24}" font-size="13" text-anchor="middle" fill="#666">${i + 1}회</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// ─── 테이블 행 생성 유틸 ────────────────────────────────────────

/**
 * 시험 결과 하나를 테이블 행(<tr>)으로 변환
 * @param {object} record - { timestamp, unit, score, total_questions }
 * @returns {string} 테이블 행 HTML
 */
function buildScoreRow(record) {
  const date    = formatDateScore(record.timestamp);
  const unit    = escapeHtmlScore(record.unit);
  const score100 = convertScoreTo100(record.score, record.total_questions);
  const badge   = getStatusBadge(score100);
  return `<tr>
    <td>${date}</td>
    <td>${unit}</td>
    <td>${score100}점 / 100점</td>
    <td>${badge}</td>
  </tr>`;
}

/**
 * 점수 구간별 상태 뱃지 반환
 * 50↓ danger(빨강) / 70↓ up(노랑) / 90↓ good(초록) / 91+ stable(파랑)
 * @param {number} score - 100점 만점 점수
 * @returns {string} 뱃지 HTML
 */
function getStatusBadge(score) {
  if (score <= 50) return `<span class="status-badge danger">노력해야겠어요!</span>`;
  if (score <= 70) return `<span class="status-badge up">조금만 더 열심히 해보도록 해요!</span>`;
  if (score <= 90) return `<span class="status-badge good">정말 훌륭하네요!</span>`;
  return `<span class="status-badge stable">🏆 당신은 수학천재!</span>`;
}

/**
 * ISO 8601 타임스탬프 → "YYYY-MM-DD" 변환
 * @param {string} timestamp - ISO 형식 날짜
 * @returns {string} "YYYY-MM-DD" 또는 "-"
 */
function formatDateScore(timestamp) {
  if (!timestamp) return "-";
  return String(timestamp).slice(0, 10);
}

/** XSS 방지용 HTML 특수문자 이스케이프 */
function escapeHtmlScore(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
