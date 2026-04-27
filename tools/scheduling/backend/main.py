"""
日翊客服排班工具 — Cloud Run 後端 API
Flask + gunicorn

端點：
  POST /api/schedule   上傳 xlsx → 執行 LP 求解 → 回傳結果 xlsx
  GET  /health         健康檢查
"""

import os
import uuid
import tempfile
import json
from flask import Flask, request, jsonify, send_file, after_this_request
from flask_cors import CORS
from solver import run as run_solver

app = Flask(__name__)

# ── CORS：只允許自己的 GitHub Pages 網域 ──────────────────
ALLOWED_ORIGINS = os.environ.get(
    'ALLOWED_ORIGINS',
    'https://lovehina32.github.io'   # ← 部署後確認此網域正確
).split(',')

CORS(app, origins=ALLOWED_ORIGINS, methods=['GET', 'POST', 'OPTIONS'])


# ── 健康檢查 ─────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': '日翊排班求解器'})


# ── 主要 API：排班求解 ───────────────────────────────────
@app.route('/api/schedule', methods=['POST'])
def schedule():
    # 1. 驗證上傳檔案
    if 'file' not in request.files:
        return jsonify({'error': '請上傳 Excel 班表（file 欄位）'}), 400

    f = request.files['file']
    if not f.filename.endswith(('.xlsx', '.xls')):
        return jsonify({'error': '僅支援 .xlsx / .xls 格式'}), 400

    # 2. 建立暫存路徑
    tmp_dir  = tempfile.gettempdir()
    job_id   = str(uuid.uuid4())[:8]
    in_path  = os.path.join(tmp_dir, f'input_{job_id}.xlsx')
    out_path = os.path.join(tmp_dir, f'output_{job_id}.xlsx')

    try:
        # 3. 儲存上傳檔案
        f.save(in_path)

        # 4. 執行 LP 求解（含超時保護）
        result = run_solver(in_path, out_path)

        # 5. 讀取輸出檔案並回傳
        @after_this_request
        def cleanup(response):
            try:
                if os.path.exists(in_path):  os.remove(in_path)
                if os.path.exists(out_path): os.remove(out_path)
            except Exception:
                pass
            return response

        return send_file(
            out_path,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='排班結果.xlsx'
        )

    except Exception as e:
        # 清理暫存
        for p in [in_path, out_path]:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        return jsonify({'error': f'排班求解失敗：{str(e)}'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
