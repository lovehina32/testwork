/* ─── LogiScan · app.js ─────────────────────────────────── */
'use strict';

// ── State ────────────────────────────────────────────────
let uploadedData = null;
let uploadedFileName = '';

// ── DOM refs ─────────────────────────────────────────────
const dropzone   = document.getElementById('dropzone');
const fileInput  = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const fileInfoEl = document.getElementById('fileInfo');
const errorEl    = document.getElementById('errorMsg');
const loadingEl  = document.getElementById('loadingDiv');
const resultsEl  = document.getElementById('resultsDiv');
const progressFill = document.getElementById('progressFill');
const loadingText  = document.getElementById('loadingText');
const apiKeyInput  = document.getElementById('apiKey');

// Restore saved API key
if (localStorage.getItem('logiscan_apikey')) {
  apiKeyInput.value = localStorage.getItem('logiscan_apikey');
}
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('logiscan_apikey', apiKeyInput.value.trim());
});

// ── Upload handlers ──────────────────────────────────────
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

document.getElementById('removeFile').addEventListener('click', () => {
  uploadedData = null; uploadedFileName = '';
  fileInfoEl.style.display = 'none';
  analyzeBtn.textContent = '選擇檔案後開始分析';
  analyzeBtn.disabled = true;
  resultsEl.style.display = 'none';
  fileInput.value = '';
  hideError();
});

function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) {
    showError('請上傳 CSV 或 Excel（XLSX/XLS）格式的檔案。'); return;
  }
  uploadedFileName = file.name;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatSize(file.size);
  document.getElementById('fileIcon').textContent = ext === 'csv' ? '📄' : '📊';
  fileInfoEl.style.display = 'flex';
  analyzeBtn.textContent = '開始分析';
  analyzeBtn.disabled = false;
  hideError();

  const reader = new FileReader();
  reader.onload = e => {
    if (ext === 'csv') {
      uploadedData = e.target.result;
    } else {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      uploadedData = XLSX.utils.sheet_to_csv(ws);
    }
  };
  reader.onerror = () => showError('檔案讀取失敗，請重試。');
  if (ext === 'csv') reader.readAsText(file, 'UTF-8');
  else reader.readAsBinaryString(file);
}

function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

// ── Tab switching ────────────────────────────────────────
document.getElementById('resultTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const target = document.getElementById('tab-' + id);
  if (target) target.classList.add('active');
}

// ── Error helpers ────────────────────────────────────────
function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
function hideError()    { errorEl.style.display = 'none'; }

// ── Analyze ──────────────────────────────────────────────
analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!uploadedData) { showError('請先選擇檔案。'); return; }
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) { showError('請輸入 Anthropic API Key。'); return; }
  const checks = [1,2,3,4,5,6].map(i => document.getElementById('chk'+i).checked);
  if (!checks.some(Boolean)) { showError('請至少選擇一個分析項目。'); return; }

  hideError();
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '分析中...';
  loadingEl.style.display = 'block';
  resultsEl.style.display = 'none';

  startProgress();

  const sampleData = uploadedData.substring(0, 8000);

  const prompt = `你是一位資深物流營運數據分析專家。以下是物流客服報表 CSV（可能為部分內容，檔名：${uploadedFileName}）：

\`\`\`
${sampleData}
\`\`\`

請完整分析並只輸出 JSON，格式如下（不要任何說明文字或 markdown 標記）：
{
  "summary": {
    "totalRows": 數字,
    "dateRange": "字串，如 2024-01-01 ~ 2024-03-31（若無法判斷請填 '無法判斷'）",
    "storeCount": 數字（無則null）,
    "routeCount": 數字（無則null）,
    "warehouseCount": 數字（無則null）,
    "mainDistribution": [{"label":"類別名","count":數字}],
    "missingFields": ["缺失欄位名稱"]
  },
  "top3": [
    {"rank":1,"title":"問題標題","count":數字,"percentage":"xx.x%","description":"具體說明"},
    {"rank":2,"title":"...","count":0,"percentage":"0%","description":"..."},
    {"rank":3,"title":"...","count":0,"percentage":"0%","description":"..."}
  ],
  "categoryStats": {
    "major": [{"name":"類別","count":數字,"pct":小數}],
    "mid":   [{"name":"類別","count":數字,"pct":小數}],
    "minor": [{"name":"類別","count":數字,"pct":小數}]
  },
  "qualityStats": {
    "firstTimeResolutionY": 數字,
    "firstTimeResolutionN": 數字,
    "firstTimeResolutionNA": 數字,
    "statusDist": [{"status":"狀態","count":數字}],
    "unresolved": [{"id":"案件編號或說明","issue":"問題描述"}]
  },
  "warnings": [
    {"type":"store","target":"名稱","count":數字,"issue":"問題說明","severity":"high"}
  ],
  "suggestions": [
    {"title":"建議標題","detail":"具體行動步驟","priority":"高"}
  ]
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const raw  = (data.content || []).map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    renderResults(parsed, checks);
  } catch (err) {
    stopProgress();
    loadingEl.style.display = 'none';
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '重新分析';
    showError('分析失敗：' + err.message + '。請確認 API Key 正確且資料格式有效。');
  }
}

// ── Progress animation ───────────────────────────────────
let _progressTimer = null;
function startProgress() {
  const msgs = ['正在解析資料結構...','識別欄位與維度...','執行語意分析...','產出洞察報告...'];
  let i = 0; let w = 0;
  progressFill.style.width = '0%';
  loadingText.textContent = msgs[0];
  _progressTimer = setInterval(() => {
    w = Math.min(w + Math.random() * 16, 88);
    progressFill.style.width = Math.round(w) + '%';
    if (i < msgs.length - 1) loadingText.textContent = msgs[++i];
  }, 900);
}
function stopProgress() {
  clearInterval(_progressTimer);
  progressFill.style.width = '100%';
}

// ── Render results ───────────────────────────────────────
function renderResults(d, checks) {
  stopProgress();
  setTimeout(() => {
    loadingEl.style.display = 'none';
    resultsEl.style.display = 'block';
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '重新分析';

    if (checks[0]) renderSummary(d.summary);
    if (checks[1]) renderTop3(d.top3);
    if (checks[4]) renderWarnings(d.warnings);
    if (checks[5]) renderSuggestions(d.suggestions);
    if (checks[2] || checks[3]) renderStats(d.categoryStats, d.qualityStats, checks);
    renderQuickAsks(d);
    switchTab('summary');
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 400);
}

function renderSummary(s) {
  if (!s) return;
  document.getElementById('tab-summary').innerHTML = `
    <div class="metric-grid">
      <div class="metric-card"><div class="metric-label">總資料筆數</div><div class="metric-value">${(s.totalRows || 0).toLocaleString()}</div></div>
      <div class="metric-card"><div class="metric-label">涉及店舖數</div><div class="metric-value">${s.storeCount ?? '—'}</div></div>
      <div class="metric-card"><div class="metric-label">路線數</div><div class="metric-value">${s.routeCount ?? '—'}</div></div>
      <div class="metric-card"><div class="metric-label">倉別數</div><div class="metric-value">${s.warehouseCount ?? '—'}</div></div>
    </div>
    <div class="r-card">
      <h3>日期範圍</h3>
      <p style="font-size:14px;color:var(--ink)">${s.dateRange || '無法判斷'}</p>
    </div>
    ${s.mainDistribution?.length ? `
    <div class="r-card">
      <h3>主要案件分布</h3>
      ${s.mainDistribution.map(x => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(14,14,14,0.06)">
          <span style="font-size:13px;flex:1;color:var(--ink)">${x.label}</span>
          <span style="font-size:13px;font-weight:500;font-family:var(--font-mono);color:var(--ink)">${x.count}</span>
        </div>`).join('')}
    </div>` : ''}
    ${s.missingFields?.length ? `
    <div class="r-card">
      <h3>缺失欄位 <span class="badge badge-warn">需注意</span></h3>
      ${s.missingFields.map(f => `<span class="tag">${f}</span>`).join('')}
    </div>` : ''}
  `;
}

function renderTop3(top3) {
  if (!top3?.length) return;
  document.getElementById('tab-top3').innerHTML = `
    <div class="r-card">
      <h3>核心問題 TOP 3</h3>
      ${top3.map(t => `
        <div class="top3-item">
          <div class="rank-num">${t.rank}</div>
          <div class="rank-body">
            <div class="title">${t.title} <span class="badge badge-warn">${t.percentage || ''}</span></div>
            <div class="desc">${t.description}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderWarnings(ws) {
  const el = document.getElementById('tab-warning');
  if (!ws?.length) {
    el.innerHTML = '<div class="r-card"><p style="font-size:14px;color:var(--ink-3)">未偵測到明顯異常。</p></div>';
    return;
  }
  const typeLabel = { store:'店舖', route:'路線', warehouse:'倉別', staff:'人員' };
  const sevBadge  = { high:'badge-danger', mid:'badge-warn', low:'badge-info' };
  const sevLabel  = { high:'高風險', mid:'注意', low:'觀察' };
  el.innerHTML = `
    <div class="r-card">
      <h3>異常預警清單</h3>
      ${ws.map(w => `
        <div class="warn-item">
          <div class="wt">[${typeLabel[w.type] || w.type}] ${w.target} — ${w.count} 件
            <span class="badge ${sevBadge[w.severity] || 'badge-warn'}">${sevLabel[w.severity] || w.severity}</span>
          </div>
          <div class="wd">${w.issue}</div>
        </div>`).join('')}
    </div>`;
}

function renderSuggestions(sg) {
  if (!sg?.length) return;
  const priColor = { '高':'badge-danger','中':'badge-warn','低':'badge-info' };
  document.getElementById('tab-suggestion').innerHTML = `
    <div class="r-card">
      <h3>行動導向改善建議</h3>
      ${sg.map(s => `
        <div class="insight-item">
          <div class="it">${s.title} <span class="badge ${priColor[s.priority] || 'badge-info'}">優先度：${s.priority}</span></div>
          <div class="id">${s.detail}</div>
        </div>`).join('')}
    </div>`;
}

function renderStats(cs, qs, checks) {
  let html = '';

  if (checks[2] && cs) {
    const renderCatTable = (arr, label) => {
      if (!arr?.length) return '';
      const max = Math.max(...arr.map(x => x.count));
      return `
        <div class="r-card">
          <h3>${label}</h3>
          <table class="data-table">
            <thead><tr><th style="width:45%">類別</th><th style="width:18%">數量</th><th style="width:37%">佔比</th></tr></thead>
            <tbody>${arr.map(x => `
              <tr>
                <td>${x.name}</td>
                <td style="font-family:var(--font-mono)">${x.count}</td>
                <td><div class="bar-wrap">
                  <div class="bar" style="width:${Math.round(x.count / max * 80)}px"></div>
                  <span class="bar-pct">${(+x.pct).toFixed(1)}%</span>
                </div></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    };
    html += renderCatTable(cs.major, '大類別統計');
    html += renderCatTable(cs.mid,   '中類別統計');
    html += renderCatTable(cs.minor, '小類別統計');
  }

  if (checks[3] && qs) {
    const total = (qs.firstTimeResolutionY || 0) + (qs.firstTimeResolutionN || 0) + (qs.firstTimeResolutionNA || 0);
    const ftrPct = total > 0 ? Math.round(qs.firstTimeResolutionY / total * 100) : 0;
    html += `
      <div class="r-card">
        <h3>時效與品質評估</h3>
        <div class="metric-grid" style="margin-bottom:1rem">
          <div class="metric-card"><div class="metric-label">一次解決 (Y)</div><div class="metric-value">${qs.firstTimeResolutionY || 0}</div></div>
          <div class="metric-card"><div class="metric-label">非一次解決 (N)</div><div class="metric-value">${qs.firstTimeResolutionN || 0}</div></div>
          <div class="metric-card"><div class="metric-label">一次解決率</div><div class="metric-value">${ftrPct}%</div></div>
        </div>
        ${qs.statusDist?.length ? `
          <table class="data-table">
            <thead><tr><th>處理狀態</th><th>數量</th></tr></thead>
            <tbody>${qs.statusDist.map(s => `<tr><td>${s.status}</td><td style="font-family:var(--font-mono)">${s.count}</td></tr>`).join('')}</tbody>
          </table>` : ''}
        ${qs.unresolved?.length ? `
          <div style="margin-top:1rem">
            <p style="font-size:12px;font-family:var(--font-mono);color:var(--ink-3);margin-bottom:8px">未結案異常件</p>
            ${qs.unresolved.slice(0, 5).map(u => `
              <div class="warn-item" style="margin-top:6px">
                <div class="wt">${u.id}</div>
                <div class="wd">${u.issue}</div>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
  }

  document.getElementById('tab-stats').innerHTML = html || '<div class="r-card"><p style="font-size:14px;color:var(--ink-3)">統計項目未選擇或資料不足。</p></div>';
}

function renderQuickAsks(d) {
  const qs = [
    '一次解決率低的根本原因是什麼？',
    '請詳述排名第一問題的改善方案',
    '高頻異常店舖應採取哪些優先行動？',
    '如何建立預防性的配送監控機制？'
  ];
  document.getElementById('quickAsks').innerHTML = qs.map(q => `
    <button class="qa-btn" onclick="copyQuestion('${q.replace(/'/g,"\\'")}')">
      ${q}
    </button>`).join('');
}

function copyQuestion(q) {
  const full = `根據剛才分析的物流報表：${q}`;
  navigator.clipboard.writeText(full).then(() => {
    alert('已複製問題至剪貼簿，請前往 Claude.ai 貼上詢問。');
  }).catch(() => {
    prompt('複製以下問題：', full);
  });
}
