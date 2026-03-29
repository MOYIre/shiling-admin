/**
 * 食灵待审核 API
 * EdgeOne Pages Edge Function
 */

export async function onRequest({ request, env }) {
  const kv = env.SHILING_KV;
  
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV存储未配置，请绑定变量名 SHILING_KV' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  const method = request.method;
  const url = new URL(request.url);
  
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
    if (method === 'GET') {
      const data = await kv.get('pendingRequests', { type: 'json' });
      return new Response(JSON.stringify(data || []), { headers });
    }
    
    if (method === 'POST') {
      const body = await request.json();
      const { action, type, period, name } = body;
      
      if (!action || !type || !period || !name) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers });
      }
      
      let pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      
      const exists = pending.some(p => 
        p.action === action && p.type === type && p.period === period && p.name === name
      );
      if (exists) {
        return new Response(JSON.stringify({ error: '该申请已存在' }), { status: 400, headers });
      }
      
      pending.push({ action, type, period, name, time: new Date().toISOString() });
      await kv.put('pendingRequests', JSON.stringify(pending));
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
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
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
