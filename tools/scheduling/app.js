/* ══════════════════════════════════════════════════════
   日翊客服排班工具 app.js  v3
   前端 → GCP Cloud Run API → LP 求解 → 下載排班結果 xlsx
══════════════════════════════════════════════════════ */

// ── GCP API 端點 ─────────────────────────────────────────
const API_URL = 'https://rz-scheduler-587734217935.asia-east1.run.app/api/schedule';

/* ── 上傳處理 ─────────────────────────────────────────── */
const zone = document.getElementById('zone');
const fi   = document.getElementById('fi');
let uploadedFile = null;

zone.addEventListener('click', () => fi.click());
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
zone.addEventListener('drop', e => {
  e.preventDefault(); zone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fi.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(f) {
  if (!f.name.match(/\.xlsx?$/i)) { showErr('請上傳 .xlsx 格式的 Excel 班表'); return; }
  uploadedFile = f;
  document.getElementById('fnm').textContent = f.name;
  document.getElementById('fsz').textContent = fmtSz(f.size);
  document.getElementById('fbar').style.display = 'flex';
  hideErr();
  document.getElementById('runBtn').disabled = false;
  document.getElementById('runBtn').textContent = '開始 LP 最佳化排班';
}

function clrFile() {
  uploadedFile = null;
  document.getElementById('fbar').style.display = 'none';
  fi.value = '';
  document.getElementById('runBtn').disabled = true;
  document.getElementById('runBtn').textContent = '請上傳班表後開始排班';
  document.getElementById('resultBlock').style.display = 'none';
  hideErr();
}

/* ── 主流程：呼叫 GCP API ─────────────────────────────── */
document.getElementById('runBtn').addEventListener('click', async () => {
  if (!uploadedFile) return;

  hideErr();
  setLoading(true);
  document.getElementById('runBtn').disabled = true;
  document.getElementById('runBtn').textContent = '求解中...';
  document.getElementById('resultBlock').style.display = 'none';
  setP('上傳班表至 GCP...', 20);

  try {
    const form = new FormData();
    form.append('file', uploadedFile, uploadedFile.name);

    setP('LP 最佳化求解中（約 30~90 秒）...', 40);

    const resp = await fetch(API_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(180000)
    });

    setP('接收結果...', 85);

    if (!resp.ok) {
      let errMsg = `伺服器錯誤 (${resp.status})`;
      try { const j = await resp.json(); errMsg = j.error || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const blob  = await resp.blob();
    setP('完成！', 100);

    const mmdd  = getTodayMMDD();
    const fname = `排班結果_${mmdd}.xlsx`;
    const url   = URL.createObjectURL(blob);

    const dl    = document.getElementById('dlBtn');
    dl.href     = url;
    dl.download = fname;

    document.getElementById('resultBlock').style.display = 'block';
    document.getElementById('resultTitle').textContent   = `✓ 排班完成 — ${fname}`;
    document.getElementById('resultBlock').scrollIntoView({ behavior: 'smooth', block: 'start' });

    setLoading(false);
    document.getElementById('runBtn').disabled = false;
    document.getElementById('runBtn').textContent = '重新排班';

  } catch (err) {
    setLoading(false);
    document.getElementById('runBtn').disabled = false;
    document.getElementById('runBtn').textContent = '重新排班';
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      showErr('求解超時（超過 3 分鐘），請稍後再試或聯繫管理員');
    } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      showErr('無法連線至排班伺服器，請確認網路連線或聯繫管理員');
    } else {
      showErr('排班失敗：' + err.message);
    }
  }
});

/* ── 工具函式 ─────────────────────────────────────────── */
function fmtSz(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function getTodayMMDD() {
  const d = new Date();
  return String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
}
function showErr(m) { const e=document.getElementById('err'); e.textContent=m; e.style.display='block'; }
function hideErr()  { document.getElementById('err').style.display='none'; }
function setLoading(on) { document.getElementById('loading').style.display = on ? 'block' : 'none'; }
function setP(m, p) { document.getElementById('lt').textContent=m; document.getElementById('prog').style.width=p+'%'; }
