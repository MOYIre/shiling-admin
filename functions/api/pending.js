/**
 * 食灵待审核 API
 * EdgeOne Pages Edge Function
 */

export async function onRequest({ request, env }) {
  const kv = env.SHILING_KV;
  const method = request.method;
  const url = new URL(request.url);
  
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  try {
    // GET: 获取所有待审核
    if (method === 'GET') {
      const data = await kv.get('pendingRequests', { type: 'json' });
      return new Response(JSON.stringify(data || []), { headers });
    }
    
    // POST: 添加待审核
    if (method === 'POST') {
      const body = await request.json();
      const { action, type, period, name } = body;
      
      if (!action || !type || !period || !name) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers });
      }
      
      // 获取现有数据
      let pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      
      // 检查重复
      const exists = pending.some(p => 
        p.action === action && p.type === type && p.period === period && p.name === name
      );
      if (exists) {
        return new Response(JSON.stringify({ error: '该申请已存在' }), { status: 400, headers });
      }
      
      // 添加新请求
      pending.push({
        action, type, period, name,
        time: new Date().toISOString()
      });
      
      await kv.put('pendingRequests', JSON.stringify(pending));
      
      return new Response(JSON.stringify({ success: true, message: '提交成功' }), { headers });
    }
    
    // DELETE: 删除待审核项
    if (method === 'DELETE') {
      const idx = parseInt(url.searchParams.get('idx') || '-1');
      
      if (idx < 0) {
        return new Response(JSON.stringify({ error: '无效索引' }), { status: 400, headers });
      }
      
      let pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      
      if (idx >= pending.length) {
        return new Response(JSON.stringify({ error: '索引越界' }), { status: 400, headers });
      }
      
      pending.splice(idx, 1);
      await kv.put('pendingRequests', JSON.stringify(pending));
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    // PUT: 清空所有待审核
    if (method === 'PUT' && url.searchParams.get('clear') === 'true') {
      await kv.put('pendingRequests', '[]');
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
