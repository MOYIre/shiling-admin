/**
 * 审核历史 API
 * EdgeOne Pages Edge Function
 * 公开接口，无需登录
 */

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
