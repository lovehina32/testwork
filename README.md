# ⬡ OpsHub — 物流營運自動化工具集

> 整合物流數據分析 × 壓賠資料整合，一個平台，兩個工具。

## 線上展示

```
https://<你的帳號>.github.io/<repository名稱>/
```

---

## 專案結構

```
opshub/
├── index.html                          # 主頁（工具選擇）
├── shared.css                          # 共用樣式（Header、Footer）
├── home.css                            # 主頁專用樣式
├── .github/workflows/deploy.yml       # GitHub Pages 自動部署
│
└── tools/
    ├── logistics-analyzer/
    │   ├── index.html                  # 物流數據分析工具
    │   ├── tool.css                    # 工具頁共用樣式
    │   └── app.js                      # 分析邏輯（Claude AI）
    │
    └── claims-processor/
        ├── index.html                  # 壓賠資料整合工具
        ├── tool.css                    # 工具頁共用樣式
        └── app.js                      # SOP 六步驟邏輯
```

---

## 工具說明

### 📊 物流營運數據分析助手
- 上傳 CSV / Excel，Claude AI 自動分析
- 輸出：核心問題 Top 3、異常預警、改善建議
- **需要 Anthropic API Key**

### 📋 壓賠資料整合工具
- 四檔合併（理賠、查件、店鋪主檔 × 2）
- 自動執行六步驟 SOP，智慧欄位偵測
- 一鍵匯出標準 18 欄 Excel
- **免 API Key，完全離線**

---

## 部署到 GitHub Pages

1. 上傳此資料夾至 GitHub Repository（Public）
2. Settings → Pages → Source → **GitHub Actions**
3. 推送後自動部署，約 1 分鐘完成

### 本機測試
```bash
npx serve .
# 訪問 http://localhost:3000
```

---

## 技術架構

- 純 HTML + CSS + JavaScript（無框架）
- [SheetJS](https://sheetjs.com/) 處理 Excel 讀寫
- [Anthropic Claude API](https://docs.anthropic.com/) 驅動分析
- GitHub Pages 靜態部署

---

© 2025 OpsHub · MIT License
