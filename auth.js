/* ─── 日翊客服小工具 · auth.js ───────────────────────────── */
'use strict';

const AUTH = (function () {
  const SESSION_KEY = 'rz_session';
  const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 小時

  // ── Firebase 設定（與知識庫共用同一專案）────────────────
  const FB_CONFIG = {
    apiKey:            "AIzaSyBr1bq3WUhjjXH9rvKLgVa-DFK1vrg5QeM",
    authDomain:        "opshub-knowledge.firebaseapp.com",
    projectId:         "opshub-knowledge",
    storageBucket:     "opshub-knowledge.firebasestorage.app",
    messagingSenderId: "257794213641",
    appId:             "1:257794213641:web:df105659dee73c393d75d8"
  };

  // ── 初始化 Firebase（若尚未初始化）──────────────────────
  function getDb() {
    if (!window.firebase) return null;
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    return firebase.firestore();
  }

  // ── 後端 API 端點 ─────────────────────────────────────────
  const API_BASE = 'https://rz-scheduler-v2-587734217935.asia-east1.run.app';

  // ── 預設帳號（Firestore 空白時寫入）─────────────────────
  const DEFAULT_USERS = [
    {
      username:    'admin',
      password:    'admin',
      role:        'admin',
      displayName: '系統管理員',
      enabled:     true,
      tools: { logistics: true, claims: true, dailyReport: true, knowledge: true }
    }
  ];

  // ── 從 Firestore 讀取所有帳號 ─────────────────────────────
  async function getUsers() {
    const db = getDb();
    if (!db) return getLocalUsers();
    try {
      const snap = await db.collection('users').orderBy('createdAt').get();
      if (snap.empty) {
        // 首次：合併 localStorage 舊帳號 + 預設帳號寫入 Firestore
        const localUsers = getLocalUsers();
        const toWrite = localUsers.length > 0 ? localUsers : DEFAULT_USERS;
        const batch = db.batch();
        toWrite.forEach(u => {
          batch.set(db.collection('users').doc(u.username), {
            ...u,
            tools: u.tools || { logistics: true, claims: true, dailyReport: true, knowledge: true },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        await batch.commit();
        return toWrite;
      }
      return snap.docs.map(d => ({ ...d.data() }));
    } catch (e) {
      console.warn('Firestore 讀取失敗，fallback localStorage', e);
      return getLocalUsers();
    }
  }

  async function initDefaultUsers(db) {
    const batch = db.batch();
    DEFAULT_USERS.forEach(u => {
      batch.set(db.collection('users').doc(u.username), {
        ...u, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }

  // ── localStorage fallback ─────────────────────────────────
  function getLocalUsers() {
    try { return JSON.parse(localStorage.getItem('rz_users')) || DEFAULT_USERS; }
    catch { return DEFAULT_USERS; }
  }

  // ── 本地帳號驗證 ──────────────────────────────────────────
  async function localLogin(username, password) {
    const users = await getUsers();
    const user  = users.find(u => u.username === username && u.password === password);
    if (!user)          return { ok: false, reason: '帳號或密碼錯誤' };
    if (!user.enabled)  return { ok: false, reason: '此帳號已停用，請聯絡管理員' };
    const allTools = { logistics: true, claims: true, dailyReport: true, knowledge: true };
    const session = {
      username:    user.username,
      role:        user.role,
      displayName: user.displayName,
      ts:          Date.now(),
      tools:       user.role === 'admin' ? allTools : (user.tools || allTools)
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  }

  // ── 登入驗證 ──────────────────────────────────────────────
  async function login(username, password) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ USER_ID: username, PSW: password }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const data = await resp.json();

      if (resp.status === 403) return { ok: false, reason: '此帳號無使用權限' };
      if (resp.status === 400) return { ok: false, reason: '請輸入帳號與密碼' };

      const code = String(data.MSG || '').split(' ')[0];
      if (code !== '000') return localLogin(username, password);

      // 日翊帳號驗證成功，從 Firestore 查詢工具權限
      const users = await getUsers();
      const user  = users.find(u => u.username === username);
      const session = {
        username, ts: Date.now(),
        role:        user ? user.role        : 'user',
        displayName: user ? user.displayName : username,
        tools:       user ? (user.tools||{}) : {}
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return { ok: true, session };

    } catch (e) {
      return localLogin(username, password);
    }
  }

  // ── Session ───────────────────────────────────────────────
  function getSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (s && Date.now() - s.ts < SESSION_TTL) return s;
      return null;
    } catch { return null; }
  }

  function logout() { sessionStorage.removeItem(SESSION_KEY); }

  function guard(requiredRole, loginPath) {
    const s  = getSession();
    const lp = loginPath || 'login.html';
    if (!s) { window.location.replace(lp); return null; }
    if (requiredRole === 'admin' && s.role !== 'admin') {
      window.location.replace('home.html'); return null;
    }
    return s;
  }

  // ── 工具權限 ──────────────────────────────────────────────
  async function getUserTools(username) {
    const users = await getUsers();
    const user  = users.find(u => u.username === username);
    if (!user) return { logistics: false, claims: false, dailyReport: false, knowledge: false };
    if (user.role === 'admin') return { logistics: true, claims: true, dailyReport: true, knowledge: true };
    return user.tools || { logistics: true, claims: true, dailyReport: true, knowledge: true };
  }

  // ── 新增帳號 ──────────────────────────────────────────────
  async function addUser(data) {
    const db = getDb();
    if (!db) return { ok: false, reason: 'Firestore 未載入' };
    const users = await getUsers();
    if (users.find(u => u.username === data.username)) return { ok: false, reason: '帳號名稱已存在' };
    const newUser = {
      username:    data.username,
      password:    data.password,
      role:        data.role || 'user',
      displayName: data.displayName || data.username,
      enabled:     true,
      tools:       data.tools || { logistics: true, claims: true, dailyReport: true, knowledge: true },
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(data.username).set(newUser);
    return { ok: true };
  }

  // ── 更新帳號 ──────────────────────────────────────────────
  async function updateUser(username, patch) {
    const db = getDb();
    if (!db) return { ok: false, reason: 'Firestore 未載入' };
    if (username === 'admin' && patch.role && patch.role !== 'admin')
      return { ok: false, reason: '管理員角色無法變更' };
    await db.collection('users').doc(username).update(patch);
    return { ok: true };
  }

  // ── 刪除帳號 ──────────────────────────────────────────────
  async function deleteUser(username) {
    if (username === 'admin') return { ok: false, reason: '無法刪除管理員帳號' };
    const db = getDb();
    if (!db) return { ok: false, reason: 'Firestore 未載入' };
    await db.collection('users').doc(username).delete();
    return { ok: true };
  }

  return { login, logout, getSession, guard, getUsers, addUser, updateUser, deleteUser, getUserTools };
})();
