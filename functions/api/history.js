/**
 * 审核历史 API
 * EdgeOne Pages Edge Function
 * GET/POST: 公开接口
 * DELETE: 仅超级管理员可用
 */

// 验证超级管理员（只有 GitHub Token 才是超级管理员）
function verifySuperAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  
  if (!token) return false;
  
  // 只验证 GitHub Token
  const ghToken = typeof GITHUB_TOKEN !== 'undefined' ? GITHUB_TOKEN : env?.GITHUB_TOKEN;
  return token === ghToken;
}

export async function onRequest({ request, env }) {
  const kv = typeof XBSKV !== 'undefined' ? XBSKV : env?.SHILING_KV;
  
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV存储未配置' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
  
  const method = request.method;
  const url = new URL(request.url);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
  
  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  try {
    // GET: 获取审核历史
    if (method === 'GET') {
      const qq = url.searchParams.get('qq') || '';
      const keyword = url.searchParams.get('keyword') || '';
      const status = url.searchParams.get('status') || '';
      
      const history = await kv.get('approvalHistory', { type: 'json' }) || [];
      const pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      
      const pendingItems = pending.map(p => ({
        ...p,
        status: 'pending',
        statusText: '待审核'
      }));
      
      const historyItems = history.map(h => ({
        ...h,
        statusText: h.status === 'approved' ? '已通过' : '未通过'
      }));
      
      let allItems = [...historyItems, ...pendingItems];
      
      if (qq) {
        allItems = allItems.filter(item => item.qq && item.qq.includes(qq));
      }
      if (keyword) {
        allItems = allItems.filter(item => 
          item.name && item.name.toLowerCase().includes(keyword.toLowerCase())
        );
      }
      if (status) {
        allItems = allItems.filter(item => item.status === status);
      }
      
      allItems.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      return new Response(JSON.stringify(allItems), { headers });
    }
    
    // POST: 添加审核历史记录
    if (method === 'POST') {
      const body = await request.json();
      const { action, type, period, name, qq, status } = body;
      
      if (!action || !type || !name || !status) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers });
      }
      
      let history = await kv.get('approvalHistory', { type: 'json' }) || [];
      
      history.push({
        action,
        type,
        period: period || '',
        name,
        qq: qq || '',
        status,
        time: new Date().toISOString()
      });
      
      if (history.length > 100) {
        history = history.slice(-100);
      }
      
      await kv.put('approvalHistory', JSON.stringify(history));
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    // DELETE: 删除历史记录（仅超级管理员）
    if (method === 'DELETE') {
      if (!verifySuperAdmin(request, env)) {
        return new Response(JSON.stringify({ error: '仅超级管理员可删除记录' }), { status: 403, headers });
      }
      
      const body = await request.json();
      const { records } = body; // 要删除的记录数组，每项包含 { time, status, name }
      
      if (!records || !Array.isArray(records) || records.length === 0) {
        return new Response(JSON.stringify({ error: '请选择要删除的记录' }), { status: 400, headers });
      }
      
      // 构建 time -> record 的映射用于快速匹配
      const toDelete = new Map();
      records.forEach(r => {
        const key = `${r.status}:${r.time}`;
        toDelete.set(key, r);
      });
      
      // 处理历史记录
      let history = await kv.get('approvalHistory', { type: 'json' }) || [];
      const historyBefore = history.length;
      history = history.filter(h => {
        const key = `${h.status}:${h.time}`;
        return !toDelete.has(key);
      });
      const historyDeleted = historyBefore - history.length;
      if (historyDeleted > 0) {
        await kv.put('approvalHistory', JSON.stringify(history));
      }
      
      // 处理待审核记录（status 为 pending）
      let pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      const pendingBefore = pending.length;
      pending = pending.filter(p => {
        const key = `pending:${p.time}`;
        return !toDelete.has(key);
      });
      const pendingDeleted = pendingBefore - pending.length;
      if (pendingDeleted > 0) {
        await kv.put('pendingRequests', JSON.stringify(pending));
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        deleted: historyDeleted + pendingDeleted 
      }), { headers });
    }
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}