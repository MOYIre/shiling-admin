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
      return new Response(JSON.stringify(data || []), { headers });
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
              // 食物：检查指定时段或通用池
              if (period === 'extra') {
                if (menu.extraPool?.includes(name)) {
                  return new Response(JSON.stringify({ error: '该菜品已存在于通用池中' }), { status: 400, headers });
                }
              } else {
                if (menu.food?.[period]?.includes(name)) {
                  return new Response(JSON.stringify({ error: '该菜品已存在于' + {breakfast:'早餐',lunch:'午餐',dinner:'晚餐',midnight:'夜宵'}[period] + '菜单中' }), { status: 400, headers });
                }
              }
            }
          }
        } catch (e) {
          // 获取菜单失败，跳过检查
        }
      }
      
      pending.push({ action, type, period, name, qq: qq || '', time: new Date().toISOString() });
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
      
      // 3. 刷新CDN缓存
      try {
        await fetch('https://purge.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json', { method: 'POST' });
      } catch (e) {}
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
