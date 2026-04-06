/**
 * 公告 API
 * EdgeOne Pages Edge Function
 * GET: 公开获取公告
 * POST/PUT/DELETE: 仅超级管理员可用
 */

// 验证超级管理员
function verifySuperAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  
  if (!token) return false;
  
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
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
  
  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  try {
    // GET: 获取公告（公开）
    if (method === 'GET') {
      const announcement = await kv.get('announcement', { type: 'json' });
      return new Response(JSON.stringify(announcement || { content: '', updatedAt: null }), { headers });
    }
    
    // 以下操作需要超级管理员权限
    if (!verifySuperAdmin(request, env)) {
      return new Response(JSON.stringify({ error: '仅超级管理员可管理公告' }), { status: 403, headers });
    }
    
    // POST: 创建/更新公告
    if (method === 'POST' || method === 'PUT') {
      const body = await request.json();
      const { content } = body;
      
      if (!content || !content.trim()) {
        return new Response(JSON.stringify({ error: '公告内容不能为空' }), { status: 400, headers });
      }
      
      const announcement = {
        content: content.trim(),
        updatedAt: new Date().toISOString()
      };
      
      await kv.put('announcement', JSON.stringify(announcement));
      
      return new Response(JSON.stringify({ success: true, announcement }), { headers });
    }
    
    // DELETE: 删除公告
    if (method === 'DELETE') {
      await kv.put('announcement', JSON.stringify({ content: '', updatedAt: null }));
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
