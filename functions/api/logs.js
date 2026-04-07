/**
 * 管理员操作日志 API
 * EdgeOne Pages Edge Function
 * 记录管理员的增删改操作
 */

// 验证管理员权限（任何管理员都可以查看，但只有超级管理员可以删除）
function verifyAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  
  if (!token) return { isAdmin: false, isSuper: false };
  
  // 检查是否是 GitHub Token（超级管理员）
  const ghToken = typeof GITHUB_TOKEN !== 'undefined' ? GITHUB_TOKEN : env?.GITHUB_TOKEN;
  if (token === ghToken) {
    return { isAdmin: true, isSuper: true };
  }
  
  // 骰子Token（普通管理员）- 简单验证
  try {
    const decoded = atob(token);
    const data = JSON.parse(decoded);
    if (data.qq && data.exp && Date.now() <= data.exp) {
      return { isAdmin: true, isSuper: false, qq: data.qq };
    }
  } catch (e) {}
  
  return { isAdmin: false, isSuper: false };
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
    // GET: 获取操作日志
    if (method === 'GET') {
      const admin = url.searchParams.get('admin') || '';  // 按管理员筛选
      const action = url.searchParams.get('action') || ''; // 按操作类型筛选
      const limit = parseInt(url.searchParams.get('limit') || '100');
      
      let logs = await kv.get('adminLogs', { type: 'json' }) || [];
      
      // 筛选
      if (admin) {
        logs = logs.filter(log => log.admin && log.admin.includes(admin));
      }
      if (action) {
        logs = logs.filter(log => log.action === action);
      }
      
      // 按时间倒序，限制数量
      logs.sort((a, b) => new Date(b.time) - new Date(a.time));
      logs = logs.slice(0, limit);
      
      return new Response(JSON.stringify(logs), { headers });
    }
    
    // POST: 添加操作日志
    if (method === 'POST') {
      const auth = verifyAdmin(request, env);
      if (!auth.isAdmin) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers });
      }
      
      const body = await request.json();
      const { action, type, period, name, detail } = body;
      
      if (!action || !type) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers });
      }
      
      let logs = await kv.get('adminLogs', { type: 'json' }) || [];
      
      const logEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        admin: auth.qq || 'super-admin',
        isSuper: auth.isSuper,
        action,      // add, delete, update
        type,        // food, drink, admin, announcement
        period: period || '',
        name: name || '',
        detail: detail || '',
        time: new Date().toISOString()
      };
      
      logs.push(logEntry);
      
      // 只保留最近500条日志
      if (logs.length > 500) {
        logs = logs.slice(-500);
      }
      
      await kv.put('adminLogs', JSON.stringify(logs));
      
      return new Response(JSON.stringify({ success: true, id: logEntry.id }), { headers });
    }
    
    // DELETE: 清空日志（仅超级管理员）
    if (method === 'DELETE') {
      const auth = verifyAdmin(request, env);
      if (!auth.isSuper) {
        return new Response(JSON.stringify({ error: '仅超级管理员可清空日志' }), { status: 403, headers });
      }
      
      await kv.put('adminLogs', JSON.stringify([]));
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
