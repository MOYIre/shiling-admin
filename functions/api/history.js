/**
 * 审核历史 API
 * EdgeOne Pages Edge Function
 * GET/POST: 公开接口
 * DELETE: 需要管理员验证
 */

const ADMINS = ['3029590078']; // 管理员QQ列表

function verifyAdmin(request, env) {
  // 从 Authorization header 获取 token
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  
  if (!token) return false;
  
  // 尝试解析骰子Token
  try {
    const decoded = atob(token);
    const data = JSON.parse(decoded);
    if (data.qq && data.exp && data.sig) {
      // 检查过期
      if (Date.now() > data.exp) return false;
      // 验证签名
      const expectedSig = btoa(data.qq + data.exp + 'shiling').slice(0, 16);
      if (data.sig !== expectedSig) return false;
      // 检查是否是管理员
      return ADMINS.includes(data.qq);
    }
  } catch (e) {}
  
  // 验证 GitHub Token（超级管理员）
  const ghToken = typeof GITHUB_TOKEN !== 'undefined' ? GITHUB_TOKEN : env?.GITHUB_TOKEN;
  if (token === ghToken) return true;
  
  return false;
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
      const status = url.searchParams.get('status') || ''; // approved, rejected, pending
      
      // 获取历史记录
      const history = await kv.get('approvalHistory', { type: 'json' }) || [];
      // 获取待审核
      const pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      
      // 合并数据：待审核项
      const pendingItems = pending.map(p => ({
        ...p,
        status: 'pending',
        statusText: '待审核'
      }));
      
      // 历史记录项
      const historyItems = history.map(h => ({
        ...h,
        statusText: h.status === 'approved' ? '已通过' : '未通过'
      }));
      
      // 合并所有记录
      let allItems = [...historyItems, ...pendingItems];
      
      // 过滤
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
      
      // 按时间倒序
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
        status, // approved 或 rejected
        time: new Date().toISOString()
      });
      
      // 只保留最近100条记录
      if (history.length > 100) {
        history = history.slice(-100);
      }
      
      await kv.put('approvalHistory', JSON.stringify(history));
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    // DELETE: 删除历史记录（需要管理员权限）
    if (method === 'DELETE') {
      // 验证管理员权限
      if (!verifyAdmin(request, env)) {
        return new Response(JSON.stringify({ error: '无权限' }), { status: 403, headers });
      }
      
      const body = await request.json();
      const { indexes } = body; // 要删除的索引数组，格式: ["history:0", "pending:1"]
      
      if (!indexes || !Array.isArray(indexes) || indexes.length === 0) {
        return new Response(JSON.stringify({ error: '请选择要删除的记录' }), { status: 400, headers });
      }
      
      // 分别处理 history 和 pending
      const historyIndexes = [];
      const pendingIndexes = [];
      
      indexes.forEach(idx => {
        const [type, i] = idx.split(':');
        if (type === 'history') historyIndexes.push(parseInt(i));
        else if (type === 'pending') pendingIndexes.push(parseInt(i));
      });
      
      // 删除历史记录（从后往前删除，避免索引变化）
      if (historyIndexes.length > 0) {
        let history = await kv.get('approvalHistory', { type: 'json' }) || [];
        historyIndexes.sort((a, b) => b - a).forEach(i => {
          if (i >= 0 && i < history.length) {
            history.splice(i, 1);
          }
        });
        await kv.put('approvalHistory', JSON.stringify(history));
      }
      
      // 删除待审核记录
      if (pendingIndexes.length > 0) {
        let pending = await kv.get('pendingRequests', { type: 'json' }) || [];
        pendingIndexes.sort((a, b) => b - a).forEach(i => {
          if (i >= 0 && i < pending.length) {
            pending.splice(i, 1);
          }
        });
        await kv.put('pendingRequests', JSON.stringify(pending));
      }
      
      return new Response(JSON.stringify({ success: true, deleted: indexes.length }), { headers });
    }
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
