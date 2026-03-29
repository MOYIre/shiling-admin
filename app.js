// ==================== 配置 ====================
const CONFIG = {
  // Gist 配置
  gistId: 'a9f8a81d1ec3498c0d7b7afc24f43794',
  gistOwner: 'MOYIre',
  
  // OAuth 配置（需要创建 OAuth App 后填入）
  // 创建地址: https://github.com/settings/developers
  clientId: '', // 留空，使用 Device Flow
  
  // API 端点
  githubApi: 'https://api.github.com',
  gistUrl: 'https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
  
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

// ==================== 状态管理 ====================
const state = {
  token: null,
  user: null,
  isSuperAdmin: false,
  isAdmin: false,
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
  try {
    const res = await fetch(CONFIG.gistUrl);
    if (!res.ok) throw new Error('Failed to fetch gist');
    state.data = await res.json();
    return state.data;
  } catch (err) {
    console.error('Fetch gist error:', err);
    alert('获取数据失败，请稍后重试');
    throw err;
  }
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

// ==================== 认证相关 ====================
async function loginWithToken(token) {
  showLoading();
  try {
    state.token = token;
    
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
    
    // 更新 UI
    updateUI();
    showScreen('main-screen');
    
  } catch (err) {
    console.error('Login error:', err);
    alert('登录失败: ' + err.message);
    state.token = null;
  } finally {
    hideLoading();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  state.isSuperAdmin = false;
  state.isAdmin = false;
  state.data = null;
  sessionStorage.removeItem('gh_token');
  showScreen('login-screen');
}

function checkAuth() {
  const token = sessionStorage.getItem('gh_token');
  if (token) {
    loginWithToken(token);
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
  
  // 更新待审核数量
  const pendingCount = state.data?.pendingRequests?.length || 0;
  const countEl = $('pending-count');
  if (pendingCount > 0) {
    countEl.textContent = pendingCount;
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }
  
  // 渲染菜单
  renderFoodMenu();
  renderDrinkMenu();
  renderAdminList();
  renderPendingList();
}

function renderFoodMenu() {
  if (!state.data) return;
  const list = state.data.food[state.currentFoodPeriod] || [];
  const container = $('food-list');
  
  container.innerHTML = list.map((item, idx) => `
    <div class="menu-item">
      <span class="name">${item}</span>
      ${state.isAdmin ? `<button class="delete-btn" data-type="food" data-period="${state.currentFoodPeriod}" data-idx="${idx}">x</button>` : ''}
    </div>
  `).join('');
}

function renderDrinkMenu() {
  if (!state.data) return;
  const list = state.data.drink[state.currentDrinkPeriod] || [];
  const container = $('drink-list');
  
  container.innerHTML = list.map((item, idx) => `
    <div class="menu-item">
      <span class="name">${item}</span>
      ${state.isAdmin ? `<button class="delete-btn" data-type="drink" data-period="${state.currentDrinkPeriod}" data-idx="${idx}">x</button>` : ''}
    </div>
  `).join('');
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
      <span>${admin}</span>
      ${state.isSuperAdmin ? `<button class="btn small danger" data-admin-idx="${idx}">移除</button>` : ''}
    </div>
  `).join('');
}

function renderPendingList() {
  if (!state.data) return;
  const pending = state.data.pendingRequests || [];
  const container = $('pending-list');
  
  if (pending.length === 0) {
    container.innerHTML = '<p class="empty">暂无待审核申请</p>';
    return;
  }
  
  const periodNames = { ...CONFIG.foodPeriods, ...CONFIG.drinkPeriods };
  
  container.innerHTML = pending.map((req, idx) => `
    <div class="pending-item">
      <div class="info">
        <div class="type">${req.type === 'food' ? '菜品' : '饮品'} - ${periodNames[req.period] || req.period}</div>
        <div class="name">${req.name}</div>
      </div>
      <div class="actions">
        <button class="btn small success" data-approve="${idx}">通过</button>
        <button class="btn small danger" data-reject="${idx}">拒绝</button>
      </div>
    </div>
  `).join('');
}

// ==================== 数据操作 ====================
async function saveGist() {
  if (!state.isAdmin) {
    alert('没有编辑权限');
    return;
  }
  
  try {
    await githubApi(`/gists/${CONFIG.gistId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        files: {
          'menu.json': {
            content: JSON.stringify(state.data, null, 2)
          }
        }
      })
    });
    
    // 更新待审核计数
    updateUI();
  } catch (err) {
    console.error('Save gist error:', err);
    alert('保存失败: ' + err.message);
  }
}

async function addItem(type, period, name) {
  if (!state.isAdmin) {
    // 访客：添加到待审核
    if (!state.data.pendingRequests) state.data.pendingRequests = [];
    state.data.pendingRequests.push({
      type,
      period,
      name,
      time: new Date().toISOString()
    });
    await saveGist();
    alert('已提交申请，等待管理员审核');
    return;
  }
  
  // 管理员：直接添加
  if (!state.data[type]) state.data[type] = {};
  if (!state.data[type][period]) state.data[type][period] = [];
  
  if (state.data[type][period].includes(name)) {
    alert('该项已存在');
    return;
  }
  
  state.data[type][period].push(name);
  await saveGist();
  updateUI();
}

async function removeItem(type, period, idx) {
  if (!state.isAdmin) return;
  
  state.data[type][period].splice(idx, 1);
  await saveGist();
  updateUI();
}

async function approveRequest(idx) {
  if (!state.isAdmin) return;
  
  const req = state.data.pendingRequests[idx];
  
  // 添加到对应菜单
  if (!state.data[req.type]) state.data[req.type] = {};
  if (!state.data[req.type][req.period]) state.data[req.type][req.period] = [];
  
  if (!state.data[req.type][req.period].includes(req.name)) {
    state.data[req.type][req.period].push(req.name);
  }
  
  // 从待审核中移除
  state.data.pendingRequests.splice(idx, 1);
  await saveGist();
  updateUI();
}

async function rejectRequest(idx) {
  if (!state.isAdmin) return;
  
  state.data.pendingRequests.splice(idx, 1);
  await saveGist();
  updateUI();
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
  // 登录
  $('login-btn').addEventListener('click', () => {
    const token = prompt('请输入您的 GitHub Personal Access Token:\n\n' +
      '获取方式:\n' +
      '1. 访问 https://github.com/settings/tokens\n' +
      '2. 点击 "Generate new token (classic)"\n' +
      '3. 勾选 gist 权限\n' +
      '4. 生成并复制 token');
    
    if (token) {
      loginWithToken(token.trim());
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
      if (confirm('确定要拒绝这个申请吗？')) {
        rejectRequest(parseInt(e.target.dataset.reject));
      }
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

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  checkAuth();
});
