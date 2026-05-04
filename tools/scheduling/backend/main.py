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
import urllib.request
from flask import Flask, request, jsonify, send_file, after_this_request
from flask_cors import CORS
from solver import run as run_solver

app = Flask(__name__)

# ── CORS：只允許自己的 GitHub Pages 網域 ──────────────────
ALLOWED_ORIGINS = os.environ.get(
    'ALLOWED_ORIGINS',
    'https://lovehina32.github.io'   # ← 部署後確認此網域正確
).split(',')

CORS(app,
     origins=ALLOWED_ORIGINS,
     methods=['GET', 'POST', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'],
     supports_credentials=False)


def _cors_headers(resp, status=200):
    origin = request.headers.get('Origin', '')
    if origin in ALLOWED_ORIGINS:
        resp.headers['Access-Control-Allow-Origin']  = origin
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


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


# ── 日翊帳號驗證：兩層驗證架構 ──────────────────────────
# 白名單：允許使用 OpsHub 的日翊帳號（空白表示全開放）
ALLOWED_USERS = os.environ.get('ALLOWED_USERS', '').split(',')

@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return _cors_headers(app.make_response(''), 204)
    body = request.get_json(force=True) or {}
    user_id  = str(body.get('USER_ID', '')).strip()[:15]
    password = str(body.get('PSW', ''))[:30]

    if not user_id or not password:
        return jsonify({'MSG': '400 缺少帳號或密碼'}), 400

    # 第一層：白名單檢查（ALLOWED_USERS 為空則全部放行）
    if ALLOWED_USERS and ALLOWED_USERS[0] and user_id not in ALLOWED_USERS:
        return jsonify({'MSG': '403 此帳號無使用權限'}), 403

    # 第二層：日翊 CheckUserId 驗證
    try:
        fme_req = urllib.request.Request(
            'https://eip.fme.com.tw/FMEIP/AasApi/CheckUserId',
            data=json.dumps({'USER_ID': user_id, 'PSW': password}).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(fme_req, timeout=10) as res:
            result = json.loads(res.read().decode('utf-8'))
        return jsonify(result)
    except urllib.error.HTTPError as e:
        err_body = json.loads(e.read().decode('utf-8'))
        return jsonify(err_body), e.code
    except Exception as e:
        return jsonify({'MSG': f'999 {str(e)}'}), 500


# ── Gemini 代理：保護 API Key 不外露 ────────────────────
@app.route('/api/gemini', methods=['POST', 'OPTIONS'])
def gemini_proxy():
    if request.method == 'OPTIONS':
        return _cors_headers(app.make_response(''), 204)
    GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')
    if not GEMINI_KEY:
        return jsonify({'error': 'GEMINI_API_KEY 未設定'}), 500

    try:
        body = request.get_json(force=True)
        if not body:
            return jsonify({'error': '缺少 request body'}), 400

        url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}'
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=90) as res:
            result = json.loads(res.read().decode('utf-8'))
        return jsonify(result)

    except urllib.error.HTTPError as e:
        err_body = json.loads(e.read().decode('utf-8'))
        return jsonify(err_body), e.code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
