/**
 * 食灵待审核 API
 * EdgeOne Pages Edge Function
 */

const GIST_ID = 'a9f8a81d1ec3498c0d7b7afc24f43794';
const GIST_OWNER = 'MOYIre';

export async function onRequest({ request, env }) {
  // 使用全局XBSKV变量
  const kv = typeof XBSKV !== 'undefined' ? XBSKV : env?.SHILING_KV;
  // GitHub Token
  const ghToken = typeof GITHUB_TOKEN !== 'undefined' ? GITHUB_TOKEN : env?.GITHUB_TOKEN;
  
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV存储未配置，请绑定变量名 XBSKV' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  const method = request.method;
  const url = new URL(request.url);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  try {
    if (method === 'GET') {
      const data = await kv.get('pendingRequests', { type: 'json' });
      // 为旧数据补充 id
      const result = (data || []).map((item, idx) => ({
        ...item,
        id: item.id || `legacy-${idx}-${Date.now()}`
      }));
      return new Response(JSON.stringify(result), { headers });
    }
    
    if (method === 'POST') {
      const body = await request.json();
      const { action, type, period, name, qq } = body;
      
      if (!action || !type || !period || !name) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers });
      }
      
      let pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      
      // 检查pending列表重复
      const existsInPending = pending.some(p => 
        p.action === action && p.type === type && p.period === period && p.name === name
      );
      if (existsInPending) {
        return new Response(JSON.stringify({ error: '该申请已存在' }), { status: 400, headers });
      }
      
      // 检查菜单中是否已存在（仅对加菜/加饮）
      const isAdd = action === '加菜' || action === '加饮' || action === '加';
      if (isAdd) {
        try {
          const menuRes = await fetch('https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw');
          if (menuRes.ok) {
            const menu = await menuRes.json();
            
            if (type === 'drink') {
              // 饮品：检查所有时段
              const allDrinks = [
                ...(menu.drink?.morning || []),
                ...(menu.drink?.afternoon || []),
                ...(menu.drink?.evening || []),
                ...(menu.drink?.night || [])
              ];
              if (allDrinks.includes(name)) {
                return new Response(JSON.stringify({ error: '该饮品已存在于菜单中' }), { status: 400, headers });
              }
            } else if (type === 'food') {
              // 食物：检查所有时段和通用池
              const allFoods = [
                ...(menu.food?.breakfast || []),
                ...(menu.food?.lunch || []),
                ...(menu.food?.dinner || []),
                ...(menu.food?.midnight || []),
                ...(menu.extraPool || [])
              ];
              if (allFoods.includes(name)) {
                return new Response(JSON.stringify({ error: '该菜品已存在于菜单中' }), { status: 400, headers });
              }
            }
          }
        } catch (e) {
          // 获取菜单失败，跳过检查
        }
      }
      
      // 生成唯一 ID
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pending.push({ id, action, type, period, name, qq: qq || '', time: new Date().toISOString() });
      await kv.put('pendingRequests', JSON.stringify(pending));
      
      return new Response(JSON.stringify({ success: true, id }), { headers });
    }
    
    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      const status = url.searchParams.get('status') || 'rejected'; // approved 或 rejected
      
      if (!id) {
        return new Response(JSON.stringify({ error: '缺少id参数' }), { status: 400, headers });
      }
      
      let pending = await kv.get('pendingRequests', { type: 'json' }) || [];
      
      // 按 id 查找
      const idx = pending.findIndex(p => p.id === id || `legacy-${pending.indexOf(p)}-${Date.now()}` === id);
      if (idx === -1) {
        return new Response(JSON.stringify({ error: '未找到该记录' }), { status: 400, headers });
      }
      
      // 获取被删除的项
      const removed = pending[idx];
      
      // 保存到历史记录
      let history = await kv.get('approvalHistory', { type: 'json' }) || [];
      history.push({
        id: removed.id || id,
        action: removed.action,
        type: removed.type,
        period: removed.period,
        name: removed.name,
        qq: removed.qq || '',
        status: status,
        time: new Date().toISOString()
      });
      // 只保留最近100条
      if (history.length > 100) {
        history = history.slice(-100);
      }
      await kv.put('approvalHistory', JSON.stringify(history));
      
      // 从待审核列表删除
      pending.splice(idx, 1);
      await kv.put('pendingRequests', JSON.stringify(pending));
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    // PUT: 保存数据到Gist和仓库
    if (method === 'PUT') {
      if (!ghToken) {
        return new Response(JSON.stringify({ error: 'GitHub Token未配置' }), { status: 500, headers });
      }
      
      const body = await request.json();
      const { data } = body;
      
      if (!data) {
        return new Response(JSON.stringify({ error: '缺少数据' }), { status: 400, headers });
      }
      
      const content = JSON.stringify(data, null, 2);
      
      // 1. 更新Gist
      const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ShilingBot'
        },
        body: JSON.stringify({
          files: { '食灵菜单数据': { content } }
        })
      });
      
      if (!gistRes.ok) {
        const err = await gistRes.json();
        return new Response(JSON.stringify({ error: 'Gist更新失败: ' + (err.message || gistRes.status) }), { status: 500, headers });
      }
      
      // 2. 同步到仓库
      const fileRes = await fetch(`https://api.github.com/repos/${GIST_OWNER}/shiling-data/contents/menu.json`, {
        headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ShilingBot' }
      });
      const fileData = await fileRes.json();
      
      const repoRes = await fetch(`https://api.github.com/repos/${GIST_OWNER}/shiling-data/contents/menu.json`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ShilingBot'
        },
        body: JSON.stringify({
          message: 'sync: 同步菜单数据',
          content: btoa(unescape(encodeURIComponent(content))),
          sha: fileData.sha
        })
      });
      
      if (!repoRes.ok) {
        console.error('仓库同步失败，但Gist已更新');
      }
      
      // 4. 同步线上KV菜单数据，作为运行时主读取源
      try {
        await kv.put('menuData', content);
        const prevMeta = await kv.get('menuMeta', { type: 'json' }) || { version: 0 };
        const nextMeta = {
          version: (prevMeta.version || 0) + 1,
          updatedAt: new Date().toISOString(),
          source: 'pending-put'
        };
        await kv.put('menuMeta', JSON.stringify(nextMeta));
      } catch (e) {
        console.error('KV菜单同步失败，但Gist已更新:', e.message);
      }

      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
