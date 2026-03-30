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

async function kvGetPending() {
  try {
    const res = await fetch(KV_API);
    return await res.json();
  } catch {
    return [];
  }
}

async function kvAddPending(action, type, period, name) {
  const res = await fetch(KV_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, type, period, name })
  });
  return await res.json();
}

async function kvRemovePending(idx) {
  const res = await fetch(KV_API + '?idx=' + idx, { method: 'DELETE' });
  return await res.json();
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
  currentDrinkPeriod: 'morning'
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

async function fetchGist() {
  // 尝试多个镜像源
  for (let i = 0; i < CONFIG.dataUrls.length; i++) {
    const url = CONFIG.dataUrls[i];
    try {
      console.log(`尝试从源 ${i + 1}/${CONFIG.dataUrls.length} 获取数据`);
      const res = await fetch(url);
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
    await fetchGist();
    state.isAdmin = state.isSuperAdmin || 
                     (state.data.admins && state.data.admins.includes(user.login));
    
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
async function loginWithDiceToken(token) {
  showLoading();
  try {
    // 解析token
    const tokenData = parseLoginToken(token);
    
    if (!tokenData) {
      alert('无效的Token格式');
      hideLoading();
      return;
    }
    
    if (tokenData.error) {
      alert(tokenData.error);
      hideLoading();
      return;
    }
    
    // 获取gist数据
    await fetchGist();
    
    // 验证是否在管理员列表中
    const admins = state.data.admins || [];
    if (!admins.includes(tokenData.qq)) {
      alert('您不是管理员，无法登录');
      hideLoading();
      return;
    }
    
    // 验证签名（简化：检查token中的签名是否匹配）
    const expectedSig = btoa(tokenData.qq + tokenData.exp + 'shiling').slice(0, 16);
    if (tokenData.sig !== expectedSig) {
      alert('Token签名验证失败');
      hideLoading();
      return;
    }
    
    // 登录成功
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
    <div class="pending-item">
      <div class="info">
        <div class="action">${req.action || '加菜'}</div>
        <div class="type">${req.type === 'food' ? '菜品' : '饮品'} - ${periodNames[req.period] || req.period}</div>
        <div class="name">${req.name}</div>
        ${req.qq ? `<div class="submitter">提交者: <img src="https://q1.qlogo.cn/g?b=qq&nk=${req.qq}&s=20" alt="" style="vertical-align:middle;border-radius:50%"> ${req.qq}</div>` : ''}
      </div>
      <div class="actions">
        <button class="btn small success" data-approve="${idx}">通过</button>
        <button class="btn small danger" data-reject="${idx}">拒绝</button>
      </div>
    </div>
  `).join('');
}

// ==================== CDN缓存刷新 ====================
async function refreshCDN() {
  const cdnUrls = [
    'https://purge.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    'https://purge.jsdelivr.net/gh/MOYIre/shiling-data@latest/menu.json'
  ];
  
  for (const url of cdnUrls) {
    try {
      await fetch(url, { method: 'POST' });
      console.log('CDN缓存刷新:', url);
    } catch (e) {
      console.log('CDN刷新失败:', e);
    }
  }
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
  if (!state.isAdmin) {
    alert('没有编辑权限');
    return;
  }
  
  try {
    if (state.loginType === 'token') {
      // 普通管理员：通过Edge Function代理保存
      const res = await fetch(KV_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: state.data })
      });
      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || '保存失败');
      }
    } else {
      // 超级管理员：直接调用GitHub API
      await githubApi(`/gists/${CONFIG.gistId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          files: {
            '食灵菜单数据': {
              content: JSON.stringify(state.data, null, 2)
            }
          }
        })
      });
      
      await syncToRepo();
      await refreshCDN();
    }
    
    updateUI();
  } catch (err) {
    console.error('Save gist error:', err);
    alert('保存失败: ' + err.message);
  }
}

async function addItem(type, period, name) {
  if (!state.isAdmin) {
    // 访客：提交到KV待审核
    const result = await kvAddPending('加' + (type === 'food' ? '菜' : '饮'), type, period, name);
    alert(result.success ? '已提交申请，等待管理员审核' : (result.error || '提交失败'));
    return;
  }
  
  // 管理员：直接添加
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
  updateUI();
}

async function removeItem(type, period, idx) {
  if (!state.isAdmin) return;
  
  if (type === 'extraPool') {
    // 从通用池删除
    state.data.extraPool.splice(idx, 1);
  } else if (period === 'all') {
    // 从所有时段删除饮品
    const allDrinks = [
      ...(state.data.drink?.morning || []),
      ...(state.data.drink?.afternoon || []),
      ...(state.data.drink?.evening || []),
      ...(state.data.drink?.night || [])
    ].filter((v, i, a) => a.indexOf(v) === i);
    const drinkName = allDrinks[idx];
    if (drinkName) {
      ['morning', 'afternoon', 'evening', 'night'].forEach(p => {
        if (state.data.drink?.[p]) {
          const i = state.data.drink[p].indexOf(drinkName);
          if (i > -1) state.data.drink[p].splice(i, 1);
        }
      });
    }
  } else {
    // 普通删除
    state.data[type][period].splice(idx, 1);
  }
  
  await saveGist();
  updateUI();
}

async function approveRequest(idx) {
  if (!state.isAdmin) return;
  
  // 从KV获取待审核列表
  const pending = await kvGetPending();
  const req = pending[idx];
  if (!req) { alert('请求不存在'); return; }
  
  // 立即播放通过动画
  const container = $('pending-list');
  const items = container.querySelectorAll('.pending-item');
  const item = items[idx];
  if (item) {
    item.classList.add('approved');
  }
  
  // 后台执行操作
  try {
    await executeApproval(req);
    await kvRemovePending(idx);
  } catch (err) {
    alert('操作失败: ' + err.message);
  }
  
  // 动画结束后更新列表
  setTimeout(async () => {
    await renderPendingList();
    updateUI();
  }, 300);
}

async function rejectRequest(idx) {
  if (!state.isAdmin) return;
  
  // 立即播放拒绝动画
  const container = $('pending-list');
  const items = container.querySelectorAll('.pending-item');
  const item = items[idx];
  if (item) {
    item.classList.add('rejected');
  }
  
  // 后台执行删除
  try {
    await kvRemovePending(idx);
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
  
  // 动画结束后更新列表
  setTimeout(async () => {
    await renderPendingList();
  }, 300);
}

// 执行审核通过操作
async function executeApproval(data) {
  const isAdd = data.action === '加菜' || data.action === '加饮' || data.action === '加';
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
  } else {
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
  updateUI();
}

async function removeAdmin(idx) {
  if (!state.isSuperAdmin) return;
  
  state.data.admins.splice(idx, 1);
  await saveGist();
  updateUI();
}

// ==================== 事件处理 ====================
function initEventListeners() {
  // 超级管理员登录
  $('super-login-btn').addEventListener('click', () => {
    const token = prompt('请输入您的 GitHub Personal Access Token:\n\n' +
      '获取方式:\n' +
      '1. 访问 https://github.com/settings/tokens\n' +
      '2. 点击 "Generate new token (classic)"\n' +
      '3. 勾选 gist 权限\n' +
      '4. 生成并复制 token');
    
    if (token) {
      loginWithGitHub(token.trim());
    }
  });
  
  // Token登录
  $('token-login-btn').addEventListener('click', () => {
    const token = $('token-input').value.trim();
    if (!token) {
      alert('请输入Token');
      return;
    }
    loginWithDiceToken(token);
  });
  
  // Token输入框回车
  $('token-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      $('token-login-btn').click();
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
      approveRequest(parseInt(e.target.dataset.approve));
    }
    if (e.target.dataset.reject !== undefined) {
      rejectRequest(parseInt(e.target.dataset.reject));
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
}

// ==================== URL参数处理 ====================
function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const type = params.get('type');
  const period = params.get('period');
  const name = params.get('name');
  
  if (action && type && period && name) {
    // 清除URL参数
    window.history.replaceState({}, '', window.location.pathname);
    
    // 显示提交提示
    return { action, type, period, name };
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
    addToPending(data);
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