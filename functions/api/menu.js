/**
 * 菜单发布 API
 * GET: 获取线上菜单（KV优先，Gist回退）
 * POST: 发布当前菜单到KV（仅超级管理员）
 * PUT: 回滚到历史版本（仅超级管理员）
 */

const MENU_KV_KEY = 'menuData';
const MENU_META_KEY = 'menuMeta';
const MENU_HISTORY_KEY = 'menuHistory';

const MENU_SOURCE_URLS = [
  'https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
  'https://fastly.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
  'https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
  'https://raw.githubusercontent.com/MOYIre/shiling-data/master/menu.json',
  'https://cdn.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json'
];

function getKv(env) {
  return typeof XBSKV !== 'undefined' ? XBSKV : env?.SHILING_KV;
}

function getHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

async function fetchMenuFromRemote() {
  for (const url of MENU_SOURCE_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        return { data, source: url };
      }
    } catch (e) {}
  }
  return null;
}

function parseDiceToken(token) {
  try {
    const decoded = atob(token);
    const data = JSON.parse(decoded);
    if (!data.qq || !data.exp || !data.sig) return null;
    if (Date.now() > data.exp) return null;
    const expectedSig = btoa(data.qq + data.exp + 'shiling').slice(0, 16);
    if (data.sig !== expectedSig) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function isAdminToken(token) {
  if (!token) return false;

  const remote = await fetchMenuFromRemote();
  if (!remote?.data) return false;
  const admins = remote.data.admins || [];

  const diceData = parseDiceToken(token);
  if (diceData && admins.includes(diceData.qq)) {
    return true;
  }

  return false;
}

function verifySuperAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return false;

  const ghToken = typeof GITHUB_TOKEN !== 'undefined' ? GITHUB_TOKEN : env?.GITHUB_TOKEN;
  return !!(ghToken && token === ghToken);
}

export async function onRequest({ request, env }) {
  const kv = getKv(env);
  const headers = getHeaders();
  const method = request.method;

  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV存储未配置，请绑定变量名 XBSKV' }), { status: 500, headers });
  }

  if (method === 'OPTIONS') return new Response(null, { headers });

  try {
    if (method === 'GET') {
      const kvData = await kv.get(MENU_KV_KEY, { type: 'json' });
      const kvMeta = await kv.get(MENU_META_KEY, { type: 'json' });
      if (kvData) {
        return new Response(JSON.stringify({
          success: true,
          source: 'kv',
          data: kvData,
          meta: kvMeta || { updatedAt: null, version: 0 }
        }), { headers });
      }

      const remote = await fetchMenuFromRemote();
      if (!remote?.data) {
        return new Response(JSON.stringify({ error: '获取菜单失败' }), { status: 502, headers });
      }

      return new Response(JSON.stringify({
        success: true,
        source: 'remote',
        data: remote.data,
        meta: { updatedAt: new Date().toISOString(), version: 0, from: remote.source }
      }), { headers });
    }

    if (!verifySuperAdmin(request, env)) {
      return new Response(JSON.stringify({ error: '仅超级管理员可操作' }), { status: 403, headers });
    }

    if (method === 'POST') {
      const body = await request.json();
      const data = body?.data;
      if (!data) {
        return new Response(JSON.stringify({ error: '缺少 data' }), { status: 400, headers });
      }

      const prevData = await kv.get(MENU_KV_KEY, { type: 'json' });
      const prevMeta = await kv.get(MENU_META_KEY, { type: 'json' }) || { version: 0 };
      let history = await kv.get(MENU_HISTORY_KEY, { type: 'json' }) || [];

      if (prevData) {
        history.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          version: prevMeta.version || 0,
          updatedAt: prevMeta.updatedAt || new Date().toISOString(),
          data: prevData
        });
        if (history.length > 20) history = history.slice(-20);
        await kv.put(MENU_HISTORY_KEY, JSON.stringify(history));
      }

      const nextMeta = {
        version: (prevMeta.version || 0) + 1,
        updatedAt: new Date().toISOString(),
        source: 'webui'
      };

      await kv.put(MENU_KV_KEY, JSON.stringify(data));
      await kv.put(MENU_META_KEY, JSON.stringify(nextMeta));

      return new Response(JSON.stringify({ success: true, meta: nextMeta }), { headers });
    }

    if (method === 'PUT') {
      const body = await request.json();
      const version = Number(body?.version || 0);
      const history = await kv.get(MENU_HISTORY_KEY, { type: 'json' }) || [];
      if (!history.length) {
        return new Response(JSON.stringify({ error: '暂无可回滚版本' }), { status: 400, headers });
      }

      let target = history[history.length - 1];
      if (version > 0) {
        const found = history.find(v => Number(v.version) === version);
        if (found) target = found;
      }

      const prevData = await kv.get(MENU_KV_KEY, { type: 'json' });
      const prevMeta = await kv.get(MENU_META_KEY, { type: 'json' }) || { version: 0 };
      let nextHistory = history;
      if (prevData) {
        nextHistory.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          version: prevMeta.version || 0,
          updatedAt: prevMeta.updatedAt || new Date().toISOString(),
          data: prevData
        });
        if (nextHistory.length > 20) nextHistory = nextHistory.slice(-20);
      }

      await kv.put(MENU_KV_KEY, JSON.stringify(target.data));
      await kv.put(MENU_HISTORY_KEY, JSON.stringify(nextHistory));
      const rollbackMeta = {
        version: (prevMeta.version || 0) + 1,
        updatedAt: new Date().toISOString(),
        source: 'rollback',
        rollbackFrom: target.version
      };
      await kv.put(MENU_META_KEY, JSON.stringify(rollbackMeta));

      return new Response(JSON.stringify({ success: true, meta: rollbackMeta, rolledVersion: target.version }), { headers });
    }

    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
