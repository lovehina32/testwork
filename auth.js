/* ─── 日翊客服小工具 · auth.js ───────────────────────────── */
'use strict';

const AUTH = (function () {
  const SESSION_KEY = 'rz_session';
  const USERS_KEY   = 'rz_users';
  const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 小時

  // ── 預設帳號（首次載入寫入 localStorage）─────────────────
  const DEFAULT_USERS = [
    {
      username: 'admin',
      password: 'admin',
      role: 'admin',          // 'admin' | 'user'
      displayName: '系統管理員',
      enabled: true,
      tools: {                // 工具開關（僅 user 角色有效，admin 全開）
        logistics: true,
        claims: true
      }
    }
  ];

  // ── 初始化：若 localStorage 無帳號資料則寫入預設值 ────────
  function init() {
    if (!localStorage.getItem(USERS_KEY)) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    }
  }

  // ── 讀取所有帳號 ──────────────────────────────────────────
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch { return []; }
  }

  // ── 寫入帳號列表 ──────────────────────────────────────────
  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // ── 登入驗證 ──────────────────────────────────────────────
  function login(username, password) {
    const users = getUsers();
    const user  = users.find(u => u.username === username && u.password === password);
    if (!user)         return { ok: false, reason: '帳號或密碼錯誤' };
    if (!user.enabled) return { ok: false, reason: '此帳號已停用，請聯絡管理員' };
    const session = { username: user.username, role: user.role, displayName: user.displayName, ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  }

  // ── 取得目前 Session ──────────────────────────────────────
  function getSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (s && Date.now() - s.ts < SESSION_TTL) return s;
      return null;
    } catch { return null; }
  }

  // ── 登出 ──────────────────────────────────────────────────
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ── 驗證守衛（需在每頁呼叫）─────────────────────────────
  function guard(requiredRole, loginPath) {
    const s = getSession();
    const lp = loginPath || 'login.html';
    if (!s) { window.location.replace(lp); return null; }
    if (requiredRole === 'admin' && s.role !== 'admin') {
      window.location.replace('home.html');
      return null;
    }
    return s;
  }

  // ── 取得某使用者的工具權限 ────────────────────────────────
  function getUserTools(username) {
    const users = getUsers();
    const user  = users.find(u => u.username === username);
    if (!user) return { logistics: false, claims: false };
    if (user.role === 'admin') return { logistics: true, claims: true };
    return user.tools || { logistics: true, claims: true };
  }

  // ── 新增帳號 ──────────────────────────────────────────────
  function addUser(data) {
    const users = getUsers();
    if (users.find(u => u.username === data.username)) return { ok: false, reason: '帳號名稱已存在' };
    users.push({
      username:    data.username,
      password:    data.password,
      role:        data.role || 'user',
      displayName: data.displayName || data.username,
      enabled:     true,
      tools:       data.tools || { logistics: true, claims: true }
    });
    saveUsers(users);
    return { ok: true };
  }

  // ── 更新帳號（啟用/停用、工具開關、密碼）────────────────
  function updateUser(username, patch) {
    const users = getUsers();
    const idx   = users.findIndex(u => u.username === username);
    if (idx === -1) return { ok: false, reason: '找不到帳號' };
    if (username === 'admin' && patch.role && patch.role !== 'admin') return { ok: false, reason: '管理員角色無法變更' };
    users[idx] = { ...users[idx], ...patch };
    saveUsers(users);
    return { ok: true };
  }

  // ── 刪除帳號 ──────────────────────────────────────────────
  function deleteUser(username) {
    if (username === 'admin') return { ok: false, reason: '無法刪除管理員帳號' };
    const users = getUsers().filter(u => u.username !== username);
    saveUsers(users);
    return { ok: true };
  }

  init();
  return { login, logout, getSession, guard, getUsers, addUser, updateUser, deleteUser, getUserTools };
})();
