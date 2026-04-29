// ==================== 配置 ====================
const CONFIG = {
  // Gist 配置
  gistId: 'a9f8a81d1ec3498c0d7b7afc24f43794',
  gistOwner: 'MOYIre',
  
  // API 端点
  githubApi: 'https://api.github.com',
  
  // 数据读取镜像源（多源自动切换，按优先级排列）
  dataUrls: [
    // 国内镜像源（优先，无缓存问题）
    'https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    // jsdelivr CDN（快速但有缓存）
    'https://cdn.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    'https://fastly.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    // 原始GitHub（备用）
    'https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    'https://raw.githubusercontent.com/MOYIre/shiling-data/master/menu.json'
  ],
  
  // 时段名称映射
  foodPeriods: {
    breakfast: '早餐',
    lunch: '午餐', 
    dinner: '晚餐',
    midnight: '夜宵'
  },
  drinkPeriods: {
    morning: '早茶',
    afternoon: '下午茶',
    evening: '晚茶',
    night: '夜茶'
  }
};

// ==================== KV API ====================
const KV_API = '/api/pending';
const MENU_API = '/api/menu';
const ANNOUNCEMENT_API = '/api/announcement';

async function kvGetPending() {
  try {
    const res = await fetch(KV_API);
    return await res.json();
  } catch {
    return [];
  }
}

async function kvAddPending(action, type, period, name, qq = '') {
  const res = await fetch(KV_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, type, period, name, qq })
  });
  return await res.json();
}

async function kvRemovePending(id, status = 'rejected') {
  const res = await fetch(KV_API + '?id=' + encodeURIComponent(id) + '&status=' + status, { method: 'DELETE' });
  return await res.json();
}

// ==================== 公告 API ====================
async function getAnnouncement() {
  try {
    const res = await fetch(ANNOUNCEMENT_API);
    return await res.json();
  } catch {
    return { content: '', updatedAt: null };
  }
}

async function saveAnnouncement(content) {
  const res = await fetch(ANNOUNCEMENT_API, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`
    },
    body: JSON.stringify({ content })
  });
  return await res.json();
}

async function deleteAnnouncement() {
  const res = await fetch(ANNOUNCEMENT_API, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${state.token}` }
  });
  return await res.json();
}

// ==================== 日志 API ====================
const LOGS_API = '/api/logs';

async function getLogs(action = '', limit = 100) {
  try {
    let url = `${LOGS_API}?limit=${limit}`;
    if (action) url += `&action=${action}`;
    const res = await fetch(url);
    return await res.json();
  } catch {
    return [];
  }
}

async function addLog(action, type, period = '', name = '', detail = '') {
  try {
    const res = await fetch(LOGS_API, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ action, type, period, name, detail })
    });
    const result = await res.json();
    if (!result.success) {
      console.error('日志记录失败:', result.error || '未知错误', { action, type, period, name });
    }
    return result;
  } catch (e) {
    console.error('日志记录请求失败:', e.message, { action, type, period, name });
    return { success: false, error: e.message };
  }
}

async function clearLogs() {
  try {
    const res = await fetch(LOGS_API, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    return await res.json();
  } catch {
    return { success: false };
  }
}

// ==================== 状态管理 ====================
const state = {
  token: null,
  user: null,
  isSuperAdmin: false,
  isAdmin: false,
  loginType: null, // 'github' | 'token'
  qqNumber: null,
  data: null,
  currentFoodPeriod: 'breakfast',
  currentDrinkPeriod: 'morning',
  menuMeta: null
};

// ==================== DOM 元素 ====================
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ==================== 工具函数 ====================
function showLoading() { $('loading').classList.remove('hidden'); }
function hideLoading() { $('loading').classList.add('hidden'); }

function showScreen(screenId) {
  $$('.screen').forEach(el => el.classList.add('hidden'));
  $(screenId).classList.remove('hidden');
}

async function fetchMenu(forceRefresh = false) {
  try {
    let url = MENU_API;
    if (forceRefresh) {
      url += '?_t=' + Date.now();
    }
    const res = await fetch(url, { cache: 'no-store' });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }
    state.data = result.data;
    state.menuMeta = result.meta || null;
    return state.data;
  } catch (e) {
    return fetchGist(forceRefresh);
  }
}

async function fetchGist(forceRefresh = false) {
  // 尝试多个镜像源
  for (let i = 0; i < CONFIG.dataUrls.length; i++) {
    let url = CONFIG.dataUrls[i];
    // 添加时间戳避免缓存（强制刷新或原始源时）
    if (forceRefresh || i >= 3) {
      url += (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    }
    try {
      console.log(`尝试从源 ${i + 1}/${CONFIG.dataUrls.length} 获取数据`);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
      console.log(`成功从源 ${i + 1} 获取数据`);
      return state.data;
    } catch (err) {
      console.error(`源 ${i + 1} 获取失败:`, err.message);
    }
  }
  alert('获取数据失败，所有镜像源均不可用');
  throw new Error('All mirrors failed');
}

async function githubApi(endpoint, options = {}) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    ...options.headers
  };
  
  if (state.token) {
    headers['Authorization'] = `token ${state.token}`;
  }
  
  const res = await fetch(`${CONFIG.githubApi}${endpoint}`, {
    ...options,
    headers
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  
  return res.json();
}

// ==================== Token 解析 ====================
function parseLoginToken(token) {
  // Token格式: SHILING_<qq>_<timestamp>_<signature>
  // 简化格式: base64编码的JSON
  try {
    const decoded = atob(token);
    const data = JSON.parse(decoded);
    
    if (!data.qq || !data.exp || !data.sig) {
      return null;
    }
    
    // 检查是否过期
    if (Date.now() > data.exp) {
      return { error: 'Token已过期，请重新获取' };
    }
    
    return data;
  } catch (e) {
    return null;
  }
}

// ==================== 认证相关 ====================
// 统一登录入口，自动判断Token类型
async function login(token) {
  if (!token || !token.trim()) {
    alert('请输入Token');
    return;
  }
  
  token = token.trim();
  
  // 尝试解析为骰子Token（base64 JSON格式）
  const tokenData = parseLoginToken(token);
  
  if (tokenData && !tokenData.error) {
    // 骰子Token
    await loginWithDiceToken(token, tokenData);
  } else if (tokenData?.error) {
    // Token过期
    alert(tokenData.error);
  } else {
    // 尝试作为GitHub Token
    await loginWithGitHub(token);
  }
}

// 超级管理员登录
async function loginWithGitHub(token) {
  showLoading();
  try {
    state.token = token;
    state.loginType = 'github';
    
    // 获取用户信息
    const user = await githubApi('/user');
    state.user = user;
    
    // 检查是否是 Gist owner（超级管理员）
    const gist = await githubApi(`/gists/${CONFIG.gistId}`);
    state.isSuperAdmin = gist.owner.login === user.login;
    
    // 检查是否在管理员列表中
    await fetchMenu();
    state.isAdmin = state.isSuperAdmin ||
                     (state.data.admins && state.data.admins.includes(user.login));
    
    if (!state.isAdmin) {
      alert('您不是管理员，无法登录');
      state.token = null;
      state.loginType = null;
      hideLoading();
      return;
    }
    
    // 保存到 sessionStorage
    sessionStorage.setItem('gh_token', token);
    sessionStorage.setItem('login_type', 'github');
    
    // 更新 UI
    updateUI();
    showScreen('main-screen');
    
  } catch (err) {
    console.error('Login error:', err);
    alert('登录失败: ' + err.message);
    state.token = null;
    state.loginType = null;
  } finally {
    hideLoading();
  }
}

// 普通管理员登录（骰子Token）
async function loginWithDiceToken(token, tokenData) {
  showLoading();
  try {
    // 获取线上菜单数据
    await fetchMenu();
    
    // 验证是否在管理员列表中
    const admins = state.data.admins || [];
    if (!admins.includes(tokenData.qq)) {
      alert('您不是管理员，无法登录');
      hideLoading();
      return;
    }
    
    // 验证签名
    const expectedSig = btoa(tokenData.qq + tokenData.exp + 'shiling').slice(0, 16);
    if (tokenData.sig !== expectedSig) {
      alert('Token签名验证失败');
      hideLoading();
      return;
    }
    
    // 登录成功
    state.token = token;  // 设置token供API调用
    state.loginType = 'token';
    state.qqNumber = tokenData.qq;
    state.isAdmin = true;
    state.isSuperAdmin = false;
    state.user = {
      login: tokenData.qq,
      avatar_url: `https://q1.qlogo.cn/g?b=qq&nk=${tokenData.qq}&s=100`
    };
    
    // 保存到 sessionStorage
    sessionStorage.setItem('dice_token', token);
    sessionStorage.setItem('login_type', 'token');
    
    // 更新 UI
    updateUI();
    showScreen('main-screen');
    
  } catch (err) {
    console.error('Token login error:', err);
    alert('登录失败: ' + err.message);
  } finally {
    hideLoading();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  state.isSuperAdmin = false;
  state.isAdmin = false;
  state.loginType = null;
  state.qqNumber = null;
  state.data = null;
  sessionStorage.removeItem('gh_token');
  sessionStorage.removeItem('dice_token');
  sessionStorage.removeItem('login_type');
  showScreen('login-screen');
}

function checkAuth() {
  const loginType = sessionStorage.getItem('login_type');
  
  if (loginType === 'github') {
    const token = sessionStorage.getItem('gh_token');
    if (token) {
      loginWithGitHub(token);
    }
  } else if (loginType === 'token') {
    const token = sessionStorage.getItem('dice_token');
    if (token) {
      loginWithDiceToken(token);
    }
  }
}

function renderMenuMeta() {
  const infoEl = $('menu-meta');
  if (!infoEl) return;
  if (!state.menuMeta || !state.menuMeta.updatedAt) {
    infoEl.textContent = '线上版本: 未发布';
    return;
  }
  const v = state.menuMeta.version ?? 0;
  const t = new Date(state.menuMeta.updatedAt).toLocaleString('zh-CN');
  const src = state.menuMeta.source ? ` · 来源: ${state.menuMeta.source}` : '';
  infoEl.textContent = `线上版本: v${v} · 更新时间: ${t}${src}`;
}

// ==================== UI 更新 ====================
function updateUI() {
  // 用户信息
  $('avatar').src = state.user.avatar_url;
  $('username').textContent = state.user.login;
  
  // 角色徽章
  const badge = $('role-badge');
  if (state.isSuperAdmin) {
    badge.textContent = '超级管理员';
    badge.className = 'badge super';
  } else if (state.isAdmin) {
    badge.textContent = '管理员';
    badge.className = 'badge';
  } else {
    badge.textContent = '访客';
    badge.className = 'badge';
    badge.style.background = '#888';
  }
  
  // 显示管理员标签
  if (state.isAdmin) {
    $$('.admin-only').forEach(el => el.classList.remove('hidden'));
    $$('.super-only').forEach(el => {
      el.style.display = state.isSuperAdmin ? 'flex' : 'none';
    });
  }
  
  // 渲染菜单（renderPendingList会更新待审核数量）
  renderFoodMenu();
  renderDrinkMenu();
  renderAdminList();
  renderPendingList();
  renderMenuMeta();
  
  // 超级管理员加载公告
  if (state.isSuperAdmin) {
    loadAnnouncement();
  }
}

// 加载公告
async function loadAnnouncement() {
  const result = await getAnnouncement();
  const textarea = $('announcement-content');
  const timeEl = $('announcement-time');
  
  if (textarea) {
    textarea.value = result.content || '';
  }
  if (timeEl) {
    timeEl.textContent = result.updatedAt 
      ? '上次更新: ' + new Date(result.updatedAt).toLocaleString('zh-CN')
      : '';
  }
}

function renderFoodMenu() {
  if (!state.data) return;
  const container = $('food-list');
  
  // 通用池使用extraPool，其他时段使用food
  let list;
  if (state.currentFoodPeriod === 'extra') {
    list = state.data.extraPool || [];
  } else {
    list = state.data.food[state.currentFoodPeriod] || [];
  }
  
  container.innerHTML = list.length ? list.map((item, idx) => `
    <div class="menu-item">
      <span class="name">${item}</span>
      ${state.isAdmin ? `<button class="delete-btn" data-type="${state.currentFoodPeriod === 'extra' ? 'extraPool' : 'food'}" data-period="${state.currentFoodPeriod}" data-idx="${idx}">x</button>` : ''}
    </div>
  `).join('') : '<p class="empty">暂无菜品</p>';
}

function renderDrinkMenu() {
  if (!state.data) return;
  const container = $('drink-list');
  
  // 合并所有时段的饮品，去重
  const allDrinks = [
    ...(state.data.drink?.morning || []),
    ...(state.data.drink?.afternoon || []),
    ...(state.data.drink?.evening || []),
    ...(state.data.drink?.night || [])
  ].filter((v, i, a) => a.indexOf(v) === i);
  
  container.innerHTML = allDrinks.length ? allDrinks.map((item, idx) => `
    <div class="menu-item">
      <span class="name">${item}</span>
      ${state.isAdmin ? `<button class="delete-btn" data-type="drink" data-period="all" data-idx="${idx}">x</button>` : ''}
    </div>
  `).join('') : '<p class="empty">暂无饮品</p>';
}

function renderAdminList() {
  if (!state.data) return;
  const admins = state.data.admins || [];
  const container = $('admin-list');
  
  if (admins.length === 0) {
    container.innerHTML = '<p class="empty">暂无管理员</p>';
    return;
  }
  
  container.innerHTML = admins.map((admin, idx) => `
    <div class="admin-item">
      <img src="https://q1.qlogo.cn/g?b=qq&nk=${admin}&s=40" alt="">
      <span>${admin}</span>
      ${state.isSuperAdmin ? `<button class="btn small danger" data-admin-idx="${idx}">移除</button>` : ''}
    </div>
  `).join('');
}

async function renderPendingList() {
  const container = $('pending-list');
  
  // 从KV获取待审核列表
  const pending = await kvGetPending();
  
  // 更新待审核数量
  const countEl = $('pending-count');
  if (pending.length > 0) {
    countEl.textContent = pending.length;
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }
  
  if (pending.length === 0) {
    container.innerHTML = '<p class="empty">暂无待审核申请</p>';
    return;
  }
  
  const periodNames = { ...CONFIG.foodPeriods, extra: '通用池', all: '不限时段' };
  
  container.innerHTML = pending.map((req, idx) => `
    <div class="pending-item" data-pending-id="${req.id || `idx-${idx}`}">
      <div class="info">
        <div class="action">${req.action || '加菜'}</div>
        <div class="type">${req.type === 'food' ? '菜品' : '饮品'} - ${periodNames[req.period] || req.period}</div>
        <div class="name">${req.name}</div>
        ${req.qq ? `<div class="submitter">提交者: <img src="https://q1.qlogo.cn/g?b=qq&nk=${req.qq}&s=40" alt="" style="vertical-align:middle;border-radius:50%"> ${req.qq}</div>` : ''}
      </div>
      <div class="actions">
        <button class="btn small success" data-approve="${req.id || `idx-${idx}`}">通过</button>
        <button class="btn small danger" data-reject="${req.id || `idx-${idx}`}">拒绝</button>
      </div>
    </div>
  `).join('');
}

// 渲染操作日志
async function renderLogsList(action = '') {
  const container = $('logs-list');
  if (!container) return;
  
  const logs = await getLogs(action);
  
  if (logs.length === 0) {
    container.innerHTML = '<p class="empty">暂无操作日志</p>';
    return;
  }
  
  const actionNames = {
    add: '添加',
    delete: '删除',
    update: '更新'
  };
  
  const typeNames = {
    food: '菜品',
    drink: '饮品',
    admin: '管理员',
    announcement: '公告'
  };
  
  const periodNames = { ...CONFIG.foodPeriods, extra: '通用池', all: '不限时段' };
  
  container.innerHTML = logs.map(log => `
    <div class="log-item">
      <div class="log-time">${new Date(log.time).toLocaleString('zh-CN')}</div>
      <div class="log-admin">
        ${log.isSuper ? '👑 ' : ''}
        <img src="${log.admin === 'super-admin' || log.isSuper 
          ? 'https://github.com/MOYIre.png?size=20' 
          : `https://q1.qlogo.cn/g?b=qq&nk=${log.admin}&s=20`}" alt="" style="vertical-align:middle;border-radius:50%">
        ${log.admin}
      </div>
      <div class="log-content">
        <span class="log-action ${log.action}">${actionNames[log.action] || log.action}</span>
        <span class="log-type">${typeNames[log.type] || log.type}</span>
        ${log.period ? `<span class="log-period">${periodNames[log.period] || log.period}</span>` : ''}
        ${log.name ? `<span class="log-name">「${log.name}」</span>` : ''}
        ${log.detail ? `<span class="log-detail">${log.detail}</span>` : ''}
      </div>
    </div>
  `).join('');
}

// ==================== CDN缓存刷新 ====================
async function refreshCDN() {
  const cdnUrls = [
    'https://purge.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    'https://purge.jsdelivr.net/gh/MOYIre/shiling-data@latest/menu.json',
    // 刷新 gist 缓存
    'https://purge.jsdelivr.net/gh/MOYIre/shiling-data@master/gist-cache.json'
  ];
  
  let successCount = 0;
  for (const url of cdnUrls) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        console.log('CDN缓存刷新成功:', url);
        successCount++;
      }
    } catch (e) {
      console.log('CDN刷新失败:', e);
    }
  }
  
  // 等待 CDN 缓存生效
  if (successCount > 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return successCount;
}

// ==================== 同步到GitHub仓库 ====================
async function syncToRepo() {
  try {
    // 获取当前文件sha
    const fileData = await githubApi('/repos/MOYIre/shiling-data/contents/menu.json');
    
    // 更新文件
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(state.data, null, 2))));
    await githubApi('/repos/MOYIre/shiling-data/contents/menu.json', {
      method: 'PUT',
      body: JSON.stringify({
        message: 'sync: 同步菜单数据',
        content: content,
        sha: fileData.sha
      })
    });
    console.log('已同步到shiling-data仓库');
    return true;
  } catch (e) {
    console.error('同步仓库失败:', e);
    return false;
  }
}

// ==================== 数据操作 ====================
async function saveGist() {
  if (!state.isSuperAdmin) {
    alert('仅超级管理员可发布到线上');
    return;
  }

  try {
    const res = await fetch(MENU_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token || ''}`
      },
      body: JSON.stringify({ data: state.data })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || '发布失败');
    }

    await fetchMenu(true);
    updateUI();
  } catch (err) {
    console.error('Save menu error:', err);
    alert('保存失败: ' + err.message);
  }
}
async function rollbackMenu(version = 0) {
  if (!state.isAdmin) {
    alert('没有操作权限');
    return;
  }
  try {
    const res = await fetch(MENU_API, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token || ''}`
      },
      body: JSON.stringify({ version })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || '回滚失败');
    }
    await fetchMenu(true);
    updateUI();
    alert(`已回滚到历史版本 v${result.rolledVersion || 'latest'}`);
  } catch (err) {
    alert('回滚失败: ' + err.message);
  }
}

async function addItem(type, period, name) {
  if (!state.isSuperAdmin) {
    // 非超级管理员：提交到KV待审核
    const result = await kvAddPending('加' + (type === 'food' ? '菜' : '饮'), type, period, name, state.qqNumber || '');
    alert(result.success ? '已提交申请，等待超级管理员审核上线' : (result.error || '提交失败'));
    return;
  }
  
  // 超级管理员：直接添加并自动发布
  if (type === 'extraPool' || period === 'extra') {
    // 通用池
    if (!state.data.extraPool) state.data.extraPool = [];
    if (state.data.extraPool.includes(name)) {
      alert('该项已存在');
      return;
    }
    state.data.extraPool.push(name);
  } else if (type === 'drink') {
    // 饮品：添加到所有时段
    if (!state.data.drink) state.data.drink = {};
    ['morning', 'afternoon', 'evening', 'night'].forEach(p => {
      if (!state.data.drink[p]) state.data.drink[p] = [];
      if (!state.data.drink[p].includes(name)) {
        state.data.drink[p].push(name);
      }
    });
  } else {
    // 普通菜品
    if (!state.data[type]) state.data[type] = {};
    if (!state.data[type][period]) state.data[type][period] = [];
    if (state.data[type][period].includes(name)) {
      alert('该项已存在');
      return;
    }
    state.data[type][period].push(name);
  }
  
  await saveGist();

  // 记录操作日志
  await addLog('add', type === 'extraPool' ? 'food' : type, period, name, '自动发布到线上');

  updateUI();
}

async function removeItem(type, period, idx) {
  if (!state.isSuperAdmin) {
    alert('仅超级管理员可直接删除线上菜单');
    return;
  }
  
  let deletedName = '';
  
  if (type === 'extraPool') {
    // 从通用池删除
    deletedName = state.data.extraPool[idx];
    state.data.extraPool.splice(idx, 1);
  } else if (period === 'all') {
    // 从所有时段删除饮品
    const allDrinks = [
      ...(state.data.drink?.morning || []),
      ...(state.data.drink?.afternoon || []),
      ...(state.data.drink?.evening || []),
      ...(state.data.drink?.night || [])
    ].filter((v, i, a) => a.indexOf(v) === i);
    deletedName = allDrinks[idx];
    if (deletedName) {
      ['morning', 'afternoon', 'evening', 'night'].forEach(p => {
        if (state.data.drink?.[p]) {
          const i = state.data.drink[p].indexOf(deletedName);
          if (i > -1) state.data.drink[p].splice(i, 1);
        }
      });
    }
  } else {
    // 普通删除
    deletedName = state.data[type][period][idx];
    state.data[type][period].splice(idx, 1);
  }
  
  await saveGist();

  // 记录操作日志
  await addLog('delete', type === 'extraPool' ? 'food' : type, period, deletedName, '自动发布到线上');

  updateUI();
}

async function approveRequest(id) {
  if (!state.isSuperAdmin) {
    alert('仅超级管理员可执行上线审核');
    return;
  }
  
  // 从KV获取待审核列表，根据id找到对应请求
  const pending = await kvGetPending();
  const req = pending.find(p => (p.id || `idx-${pending.indexOf(p)}`) === id);
  if (!req) { alert('请求不存在'); return; }
  
  // 立即播放动画并移除UI
  const container = $('pending-list');
  const item = container.querySelector(`[data-pending-id="${id}"]`);
  if (item) {
    item.classList.add('approved');
    setTimeout(() => {
      item.remove();
      // 更新待审核数量
      const countEl = $('pending-count');
      const newCount = parseInt(countEl.textContent) - 1;
      if (newCount > 0) {
        countEl.textContent = newCount;
      } else {
        countEl.classList.add('hidden');
      }
      // 如果列表为空，显示空状态
      if (container.querySelectorAll('.pending-item').length === 0) {
        container.innerHTML = '<p class="empty">暂无待审核申请</p>';
      }
    }, 300);
  }
  
  // 后台执行操作（不阻塞UI）
  (async () => {
    try {
      // 先从KV移除（快速）
      await kvRemovePending(id, 'approved');
      // 然后执行数据同步（慢，但不阻塞UI）
      await executeApproval(req);
    } catch (err) {
      console.error('审批操作失败:', err);
      alert('数据同步失败: ' + err.message);
    }
  })();
}

async function rejectRequest(id) {
  if (!state.isAdmin) return;
  
  // 立即播放动画并移除UI
  const container = $('pending-list');
  const item = container.querySelector(`[data-pending-id="${id}"]`);
  
  // 获取当前数量用于更新
  const countEl = $('pending-count');
  const currentCount = parseInt(countEl.textContent) || 0;
  
  if (item) {
    item.classList.add('rejected');
    setTimeout(() => {
      item.remove();
      // 更新待审核数量
      const newCount = currentCount - 1;
      if (newCount > 0) {
        countEl.textContent = newCount;
      } else {
        countEl.classList.add('hidden');
      }
      // 如果列表为空，显示空状态
      if (container.querySelectorAll('.pending-item').length === 0) {
        container.innerHTML = '<p class="empty">暂无待审核申请</p>';
      }
    }, 300);
  }
  
  // 后台执行删除（不阻塞UI）
  (async () => {
    try {
      await kvRemovePending(id, 'rejected');
    } catch (err) {
      console.error('拒绝操作失败:', err);
      alert('操作失败: ' + err.message);
    }
  })();
}

// 执行审核通过操作
async function executeApproval(data) {
  // 判断操作类型：检查是否包含"加"字（添加）或"删"字（删除）
  const actionStr = data.action || '';
  const isAdd = actionStr.includes('加');
  const isDelete = actionStr.includes('删');
  const isFood = data.type === 'food';
  
  if (isAdd) {
    if (data.period === 'extra' || data.period === '通用池') {
      // 食物进通用池
      if (!state.data.extraPool) state.data.extraPool = [];
      if (!state.data.extraPool.includes(data.name)) {
        state.data.extraPool.push(data.name);
      }
    } else if (data.period === 'all' || data.period === '不限时段') {
      // 饮品加到所有时段
      if (!state.data.drink) state.data.drink = {};
      ['morning', 'afternoon', 'evening', 'night'].forEach(p => {
        if (!state.data.drink[p]) state.data.drink[p] = [];
        if (!state.data.drink[p].includes(data.name)) {
          state.data.drink[p].push(data.name);
        }
      });
    } else {
      // 普通添加
      if (!state.data[data.type]) state.data[data.type] = {};
      if (!state.data[data.type][data.period]) state.data[data.type][data.period] = [];
      if (!state.data[data.type][data.period].includes(data.name)) {
        state.data[data.type][data.period].push(data.name);
      }
    }
  } else if (isDelete) {
    // 删除
    if (data.period === 'all' || data.period === '不限时段') {
      // 从所有时段删除饮品
      if (state.data.drink) {
        ['morning', 'afternoon', 'evening', 'night'].forEach(p => {
          if (state.data.drink[p]) {
            const idx = state.data.drink[p].indexOf(data.name);
            if (idx > -1) state.data.drink[p].splice(idx, 1);
          }
        });
      }
    } else if (data.period === 'extra' || data.period === '通用池') {
      // 从通用池删除
      const idx = state.data.extraPool?.indexOf(data.name);
      if (idx > -1) state.data.extraPool.splice(idx, 1);
    } else if (state.data[data.type]?.[data.period]) {
      const idx = state.data[data.type][data.period].indexOf(data.name);
      if (idx > -1) state.data[data.type][data.period].splice(idx, 1);
    }
  }
  
  await saveGist();

  // 记录操作日志
  await addLog(isAdd ? 'add' : 'delete', data.type, data.period, data.name, `审核通过并自动发布 - 提交者: ${data.qq || '未知'}`);
}

async function addAdmin(qqNumber) {
  if (!state.isSuperAdmin) {
    alert('只有超级管理员可以添加管理员');
    return;
  }
  
  if (!state.data.admins) state.data.admins = [];
  
  if (state.data.admins.includes(qqNumber)) {
    alert('该用户已是管理员');
    return;
  }
  
  state.data.admins.push(qqNumber);
  await saveGist();
  
  // 记录操作日志
  await addLog('add', 'admin', '', qqNumber);
  
  updateUI();
}

async function removeAdmin(idx) {
  if (!state.isSuperAdmin) return;
  
  const removedAdmin = state.data.admins[idx];
  state.data.admins.splice(idx, 1);
  await saveGist();
  
  // 记录操作日志
  await addLog('delete', 'admin', '', removedAdmin);
  
  updateUI();
}

// ==================== 事件处理 ====================
function initEventListeners() {
  // 统一登录
  $('login-btn').addEventListener('click', () => {
    const token = $('token-input').value;
    login(token);
  });

  $('rollback-menu-btn')?.addEventListener('click', async () => {
    if (!confirm('确定回滚到上一个历史版本吗？')) return;
    showLoading();
    try {
      await rollbackMenu();
    } finally {
      hideLoading();
    }
  });
  
  // Token输入框回车
  $('token-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      $('login-btn').click();
    }
  });
  
  // 退出
  $('logout-btn').addEventListener('click', logout);
  
  // 标签切换
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      $$('.tab-content').forEach(content => content.classList.add('hidden'));
      $(`${tabName}-tab`).classList.remove('hidden');
      
      // 切换到日志标签页时加载日志
      if (tabName === 'logs') {
        renderLogsList();
      }
    });
  });
  
  // 时段切换
  document.addEventListener('click', e => {
    if (e.target.classList.contains('period-tab')) {
      const tab = e.target;
      const container = tab.closest('.period-tabs');
      container.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const section = tab.closest('.tab-content');
      if (section.id === 'menu-tab') {
        state.currentFoodPeriod = tab.dataset.period;
        renderFoodMenu();
      } else {
        state.currentDrinkPeriod = tab.dataset.period;
        renderDrinkMenu();
      }
    }
  });
  
  // 添加菜品
  $('add-food-btn').addEventListener('click', () => {
    const input = $('new-food');
    const name = input.value.trim();
    if (name) {
      addItem('food', state.currentFoodPeriod, name);
      input.value = '';
    }
  });
  
  // 添加饮品
  $('add-drink-btn').addEventListener('click', () => {
    const input = $('new-drink');
    const name = input.value.trim();
    if (name) {
      addItem('drink', state.currentDrinkPeriod, name);
      input.value = '';
    }
  });
  
  // Enter 键添加
  $('new-food').addEventListener('keypress', e => {
    if (e.key === 'Enter') $('add-food-btn').click();
  });
  $('new-drink').addEventListener('keypress', e => {
    if (e.key === 'Enter') $('add-drink-btn').click();
  });
  
  // 删除菜品/饮品
  document.addEventListener('click', e => {
    if (e.target.classList.contains('delete-btn')) {
      const { type, period, idx } = e.target.dataset;
      if (confirm('确定要删除吗？')) {
        removeItem(type, period, parseInt(idx));
      }
    }
  });
  
  // 审核操作
  document.addEventListener('click', e => {
    if (e.target.dataset.approve !== undefined) {
      approveRequest(e.target.dataset.approve);
    }
    if (e.target.dataset.reject !== undefined) {
      rejectRequest(e.target.dataset.reject);
    }
  });
  
  // 管理员操作
  $('add-admin-btn')?.addEventListener('click', () => {
    const input = $('new-admin');
    const qq = input.value.trim();
    if (qq) {
      addAdmin(qq);
      input.value = '';
    }
  });
  
  document.addEventListener('click', e => {
    if (e.target.dataset.adminIdx !== undefined) {
      if (confirm('确定要移除这个管理员吗？')) {
        removeAdmin(parseInt(e.target.dataset.adminIdx));
      }
    }
  });
  
  // 公告管理（仅超级管理员）
  $('save-announcement-btn')?.addEventListener('click', async () => {
    const content = $('announcement-content')?.value?.trim();
    if (!content) {
      alert('请输入公告内容');
      return;
    }
    
    showLoading();
    try {
      const result = await saveAnnouncement(content);
      if (result.success) {
        alert('公告发布成功！');
        // 记录操作日志
        await addLog('update', 'announcement', '', '', content.substring(0, 50) + (content.length > 50 ? '...' : ''));
        loadAnnouncement();
      } else {
        alert('发布失败: ' + (result.error || '未知错误'));
      }
    } catch (err) {
      alert('发布失败: ' + err.message);
    } finally {
      hideLoading();
    }
  });
  
  $('delete-announcement-btn')?.addEventListener('click', async () => {
    if (!confirm('确定要删除公告吗？')) return;
    
    showLoading();
    try {
      const result = await deleteAnnouncement();
      if (result.success) {
        alert('公告已删除');
        // 记录操作日志
        await addLog('delete', 'announcement');
        $('announcement-content').value = '';
        $('announcement-time').textContent = '';
      } else {
        alert('删除失败: ' + (result.error || '未知错误'));
      }
    } catch (err) {
      alert('删除失败: ' + err.message);
    } finally {
      hideLoading();
    }
  });
  
  // 操作日志
  $('refresh-logs-btn')?.addEventListener('click', () => {
    const action = $('logs-action-filter')?.value || '';
    renderLogsList(action);
  });
  
  $('logs-action-filter')?.addEventListener('change', (e) => {
    renderLogsList(e.target.value);
  });
  
  $('clear-logs-btn')?.addEventListener('click', async () => {
    if (!confirm('确定要清空所有操作日志吗？此操作不可恢复！')) return;
    
    showLoading();
    try {
      const result = await clearLogs();
      if (result.success) {
        alert('日志已清空');
        renderLogsList();
      } else {
        alert('清空失败');
      }
    } catch (err) {
      alert('清空失败: ' + err.message);
    } finally {
      hideLoading();
    }
  });
}

// ==================== URL参数处理 ====================
function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const type = params.get('type');
  const period = params.get('period');
  const name = params.get('name');
  const qq = params.get('qq');
  
  if (action && type && period && name) {
    // 清除URL参数
    window.history.replaceState({}, '', window.location.pathname);
    
    // 显示提交提示
    return { action, type, period, name, qq };
  }
  return null;
}

function showSubmitDialog(data) {
  const periodNames = {
    breakfast: '早餐', lunch: '午餐', dinner: '晚餐', midnight: '夜宵',
    extra: '通用池', all: '不限时段'
  };
  
  const actionText = data.action === '加菜' || data.action === '加饮' ? '添加' : '删除';
  const typeText = data.type === 'food' ? '菜品' : '饮品';
  const periodName = periodNames[data.period] || data.period;
  
  // 管理员直接执行
  if (state.isAdmin || state.isSuperAdmin) {
    if (confirm('确认' + actionText + typeText + '：' + periodName + ' - ' + data.name + '\n\n您是管理员，点击确定将直接执行')) {
      executeApproval(data).then(() => {
        alert('操作成功！');
        updateUI();
      }).catch(err => {
        alert('操作失败: ' + err.message);
      });
    }
    return;
  }
  
  // 非管理员：提交到待审核列表
  if (confirm('申请' + actionText + typeText + '：' + periodName + ' - ' + data.name + '\n\n确定提交审核吗？')) {
    kvAddPending(data.action, data.type, data.period, data.name, data.qq || '').then(result => {
      alert(result.success ? '已提交申请，等待管理员审核' : (result.error || '提交失败'));
    });
  }
}

function addToPending(data) {
  // 存到localStorage
  let pending = JSON.parse(localStorage.getItem('shiling_pending') || '[]');
  
  // 检查是否已存在相同申请
  const exists = pending.some(p => 
    p.action === data.action && 
    p.type === data.type && 
    p.period === data.period && 
    p.name === data.name
  );
  
  if (exists) {
    alert('该申请已存在，请勿重复提交');
    return;
  }
  
  pending.push({
    ...data,
    time: new Date().toISOString()
  });
  
  localStorage.setItem('shiling_pending', JSON.stringify(pending));
  alert('提交成功！请等待管理员审核');
}

function submitPendingRequest(data) {
  if (!state.data) state.data = {};
  if (!state.data.pendingRequests) state.data.pendingRequests = [];
  
  state.data.pendingRequests.push({
    action: data.action,
    type: data.type,
    period: data.period,
    name: data.name,
    time: new Date().toISOString()
  });
  
  alert('申请已记录！\n请等待管理员登录后审核。');
  localStorage.setItem('shiling_pending', JSON.stringify(state.data.pendingRequests));
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  checkAuth();
  
  // 处理URL参数（从骰子跳转来的提交请求）
  const submitData = handleUrlParams();
  if (submitData) {
    setTimeout(() => showSubmitDialog(submitData), 500);
  }
});