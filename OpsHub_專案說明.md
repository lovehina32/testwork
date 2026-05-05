# OpsHub 日翊客服小工具 — 完整專案說明

> 最後更新：2026-05-05  
> 維護者：Claude（AI）× 日翊客服團隊

---

## 一、專案概覽

| 項目 | 內容 |
|------|------|
| 專案名稱 | OpsHub 日翊客服小工具 |
| GitHub | `lovehina32/opshub` |
| 前端部署 | GitHub Pages → `https://lovehina32.github.io/opshub/` |
| 後端 Cloud Run | `https://rz-scheduler-v2-587734217935.asia-east1.run.app` |
| GCP 專案 ID | `project-6e44ca2e-f630-4c83-b13` |
| Cloud Run 服務 | `rz-scheduler-v2`（asia-east1） |
| Cloud Run 設定 | min-instances=1、timeout=300s、memory=512Mi |
| Firebase 專案 | `opshub-knowledge`（Spark 免費方案） |
| Firestore 資料庫 | default（Standard 版，asia-east1） |

---

## 二、專案結構

```
opshub/
├── index.html                        # 入口頁（自動跳轉）
├── login.html                        # 登入頁
├── home.html                         # 工具首頁（含分頁：首頁/一線/廠商）
├── admin.html                        # 帳號管理（管理員專用）
├── auth.js                           # 帳號驗證核心
├── shared.css                        # 全站共用樣式
├── home.css                          # 首頁樣式
├── cloudbuild.yaml                   # GCP Cloud Build 自動部署設定
│
└── tools/
    ├── knowledge-base/
    │   └── index.html                # 知識資料庫（Firebase Firestore）
    │
    ├── logistics-analyzer/
    │   ├── index.html
    │   ├── app.js                    # 物流數據分析邏輯
    │   └── tool.css
    │
    ├── claims-processor/
    │   ├── index.html
    │   ├── app.js                    # 壓賠六步驟 SOP 邏輯
    │   └── tool.css
    │
    ├── daily-report/
    │   ├── index.html
    │   ├── app.js                    # 一般業務 + EC 業務日報
    │   └── tool.css
    │
    └── scheduling/
        ├── index.html
        ├── app.js                    # 前端排班介面
        ├── tool.css
        ├── solver.py                 # （備份）
        └── backend/
            ├── main.py               # Flask API（Cloud Run）
            ├── solver.py             # LP 排班求解器
            ├── requirements.txt
            └── Dockerfile
```

---

## 三、後端 API 端點

Base URL：`https://rz-scheduler-v2-587734217935.asia-east1.run.app`

| 端點 | 方法 | 說明 |
|------|------|------|
| `/health` | GET | 健康檢查，喚醒 Cloud Run 用 |
| `/api/schedule` | POST | 上傳 Excel 班表 → LP 求解 → 回傳結果 xlsx |
| `/api/login` | POST | 日翊 FME AD 帳號驗證 |
| `/api/gemini` | POST | Gemini API 代理（保護 Key 不外露） |

### `/api/login` 回傳碼
| MSG 碼 | 說明 |
|--------|------|
| `000` | 驗證成功 |
| `100` | 帳號或密碼錯誤 |
| `200` | AD 認證錯誤 |
| `998` | 系統暫時無法使用 |
| `999` | 系統發生錯誤 |

---

## 四、帳號驗證系統（auth.js）

### 驗證流程
```
使用者輸入帳密
  ↓
POST /api/login（5秒 timeout）
  ↓ 成功 → Session 寫入 sessionStorage（TTL 8小時）
  ↓ 失敗或逾時 → Fallback 至本地 localStorage 帳號
```

### Session 結構
```javascript
{
  username:    'user001',
  role:        'admin' | 'user',
  displayName: '王小明',
  ts:          Date.now()
}
```

### 工具權限旗標（user 角色）
```javascript
tools: {
  logistics:   true | false,   // 物流數據分析
  claims:      true | false,   // 壓賠資料整合
  dailyReport: true | false    // 每日報表彙整
}
```

### 預設帳號
| 帳號 | 密碼 | 角色 |
|------|------|------|
| admin | admin | 管理員（全部工具） |

---

## 五、各工具功能說明

### 5-1 每日報表彙整（`tools/daily-report/`）

**一般業務**
- 接受：`.xls` / `.xlsx`
- 自動偵測表頭列（含「日期」「時間」「店號」欄位的列）
- 篩選：`時間 < 17:00:00`
- 排序：大類別（POP→一般商品→其他→清潔→運務配送問題→預購店取→營收袋）→ 中類別 → 店號
- 輸出欄位（16欄）：項次、日期、時間、店號、店名、配別、路線、倉別、來電單號、反應事項、處理結果、案件屬性、大類別、中類別、小類別、處理狀態
- 輸出格式：標題列紅字黃底、微軟正黑體、欄寬設定

**EC 業務**
- Step 1：案件來源＝店舖 → 排序：大類別→中類別→店號
- Step 2：案件來源＝消費者 → 店號填「消費者」、店名填消費者姓名 → 排序：大類別→中類別→案件屬性
- 輸出欄位（15欄）：無「配別」欄

---

### 5-2 壓賠資料整合（`tools/claims-processor/`）

**輸入檔案（4個）**
| 槽位 | 說明 |
|------|------|
| 理賠檔案 | 主要壓賠資料 |
| 大批查件 | 訂單查件資料 |
| 店鋪主檔 | 當月門市資料 |
| 前月店鋪主檔 | 備援用前月門市資料 |

**六步驟 SOP**
1. 基礎理賠資料對應（訂單補零至11位、日期格式統一）
2. 大批查件資料對應（廠商訂編、備註 Join）
3. 消費者姓名邏輯判斷
   - 寄件未離店 → 寄件人姓名
   - 未退貨 → 取件人姓名
   - 其他 → `[需補人名]`
4. 壓賠店號邏輯判斷
   - 寄件未離店 → 寄件店號
   - 未退貨 → 取件店號
   - 其他 → `[需補店號]`
5. 進店日邏輯判斷（對應 Step 3 邏輯）
6. 店舖歸屬資料關聯（當月主檔優先，查無則 fallback 前月）

**輸出欄位（18欄）**
項次、壓賠時店號、歸屬店名、歸屬店型、歸屬所別、歸屬課別、寄件方式、廠商名稱、訂單編號、廠商訂編、第二段條碼、消費者姓名、進店日、異常狀態、賠付原因（處理內容）、總賠償金額、結案日、備註

---

### 5-3 物流數據分析（`tools/logistics-analyzer/`）

**輸入**：CSV / Excel（自動偵測欄位）

**6個分析項目（可勾選）**
1. 數據總結與規模概覽（含高頻關鍵字）
2. 核心問題 Top 3
3. 類別統計（大/中/小類別）
4. 時效與品質評估（一次解決率）
5. 路線 / 店舖異常預警（超均值 2倍觸發）
6. 行動導向改善建議

**月報 Tab**
- 呼叫後端 `/api/gemini`（Gemini 2.5 Flash）產生重點說明
- Prompt 格式：大類→小類→商品名稱統計，每句附筆數
- Gemini 失敗時自動 fallback 純前端邏輯

---

### 5-4 客服排班（`tools/scheduling/`）

**前端流程**
1. 頁面載入 → 靜默 ping `/health` 喚醒 Cloud Run
2. 上傳 Excel 班表
3. POST `/api/schedule`（120秒 timeout）
4. 逾時自動重試一次（最長 5 分鐘）
5. 下載結果 Excel

**後端 LP 求解規則（`solver.py`）**

班位人員：陳芝容、李雅筠、胡巧宜、游鈞捷、張語軒、廖聲友、廖武志、羅思凱、曾雪惠、劉康正、郭信智（共11人）

| 日別 | 班位池 | 需求人數 |
|------|--------|----------|
| 週一 | ALL 移除 08~17×1、10~19 | 9人 |
| 週二~五 | ALL 移除 08~17×1、09~18×1、10~19 | 8人 |
| 週末 | 07~16、09~18、11~20、14~23 | 4人 |
| 課會日 | 完整班位清單（含2個10~19） | 11人 |

LP 約束：每週休假≥2天、連續上班≤6天、各人上班天數差距≤8天  
張語軒：固定08~17、週末休、不計入人數

---

### 5-5 知識資料庫（`tools/knowledge-base/`）

**技術**：Firebase Firestore（compat SDK v10.12.0）

**Firestore 安全規則**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /knowledge/{docId} {
      allow read, write: if true;
      match /versions/{versionId} {
        allow read, write: if true;
      }
    }
  }
}
```

**Firestore Collections**

`knowledge/` 文章主文件
```javascript
{
  title:          string,
  content:        string,
  category:       'sop' | 'faq' | 'policy' | 'notice' | 'other',
  tags:           string[],
  version:        number,
  createdAt:      Timestamp,
  updatedAt:      Timestamp,
  author:         string,       // 顯示名稱
  authorUsername: string,       // 帳號
  lastEditedBy:   string,       // 最後編輯者顯示名稱
  lastEditedUser: string        // 最後編輯者帳號
}
```

`knowledge/{id}/versions/` 版本歷史
```javascript
{
  version:   number,
  title:     string,
  content:   string,
  category:  string,
  tags:      string[],
  savedAt:   Timestamp,
  summary:   string,    // 編輯摘要
  operator:  string,    // 操作者顯示名稱
  username:  string,    // 操作者帳號
  action:    'edit' | 'create'
}
```

`audit_log/` 刪除記錄
```javascript
{
  action:    'delete',
  docId:     string,
  title:     string,
  operator:  string,
  username:  string,
  timestamp: Timestamp
}
```

**功能**
- 登入守衛（呼叫 `AUTH.guard()`，未登入跳回 login.html）
- Header 顯示登入帳號頭像 + 名稱
- 分類篩選（含即時計數）、全文搜尋
- 版本歷史顯示操作者 + 動作標籤
- 刪除前寫入 audit_log

**Firebase 設定碼**
```javascript
const firebaseConfig = {
  apiKey:            "AIzaSyBr1bq3WUhjjXH9rvKLgVa-DFK1vrg5QeM",
  authDomain:        "opshub-knowledge.firebaseapp.com",
  projectId:         "opshub-knowledge",
  storageBucket:     "opshub-knowledge.firebasestorage.app",
  messagingSenderId: "257794213641",
  appId:             "1:257794213641:web:df105659dee73c393d75d8"
};
```

---

## 六、後端環境變數（Cloud Run）

| 變數 | 說明 | 範例 |
|------|------|------|
| `ALLOWED_ORIGINS` | 允許的前端網域 | `https://lovehina32.github.io` |
| `ALLOWED_USERS` | 白名單帳號（空=全開放） | `user1,user2` |
| `GEMINI_API_KEY` | Gemini API 金鑰 | `AIzaSy...` |

---

## 七、後端部署（Cloud Run）

```bash
# 本機建置測試
cd tools/scheduling/backend
docker build -t rz-scheduler-v2 .
docker run -p 8080:8080 rz-scheduler-v2

# GCP 部署（透過 Cloud Build）
gcloud builds submit --config cloudbuild.yaml
```

Docker 設定：python:3.11-slim + coinor-cbc + gunicorn（2 workers、timeout 180s）

---

## 八、待辦事項

- [ ] 公司 GCP 帳號設定完成後，重新部署 Cloud Run 並更新 `app.js` API URL
- [ ] 帳號系統遷移至 GCP 後端 API（取代 localStorage）
- [ ] Firebase Storage 附件功能（需升級 Blaze 方案後補上）
- [ ] 知識資料庫 Storage：支援上傳附件（PDF、圖片）

---

## 九、已知限制

| 項目 | 說明 |
|------|------|
| 帳號儲存 | 目前使用 localStorage，換瀏覽器或清快取會遺失 |
| Cloud Run 冷啟動 | 雖設 min-instances=1，閒置後仍可能慢，已加預熱+自動重試 |
| Firebase Storage | Spark 免費方案不支援，需升級 Blaze |
| Gemini API | 透過後端代理，Key 不外露；失敗時有前端 fallback |

---

## 十、接續開發提示

新對話開始時，貼入以下內容即可快速接續：

```
OpsHub 日翊客服小工具 — 接續開發

GitHub：lovehina32/opshub
PAT：ghp_****（請自行填入 PAT）
後端 Cloud Run：https://rz-scheduler-v2-587734217935.asia-east1.run.app
Firebase 專案：opshub-knowledge（Spark 方案，Firestore 已啟用）

Firebase Config：
  apiKey: AIzaSyBr1bq3WUhjjXH9rvKLgVa-DFK1vrg5QeM
  projectId: opshub-knowledge
  appId: 1:257794213641:web:df105659dee73c393d75d8

功能模組：登入、帳號管理、每日報表彙整、壓賠資料整合、
          物流數據分析（Gemini月報）、客服排班（LP求解）、知識資料庫（Firestore）

請先閱讀 OpsHub_專案說明.md 了解完整架構後再繼續開發。
```
