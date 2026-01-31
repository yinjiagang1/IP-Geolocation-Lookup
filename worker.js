/**
 * ==============================================================================
 *  IP Tools  - 兼容版 (兼容无额度返回的 Key)
 *  修复：当 API Header 不返回剩余次数时，UI 显示 "未知/不限"
 * ==============================================================================
 */

const DEFAULT_DATA = {
  "i18n": {
    "United States": "美国", "United Kingdom": "英国", "Germany": "德国", "France": "法国",
    "China": "中国", "Hong Kong": "中国香港", "Taiwan": "中国台湾", "Japan": "日本",
    "Singapore": "新加坡", "South Korea": "韩国", "Russia": "俄罗斯", "Australia": "澳大利亚"
  },
  "usageTypeMap": {
    "COM": "商业宽带", "ORG": "组织机构", "ISP": "家庭宽带", "MOB": "移动流量",
    "DCH": "数据中心/机房", "CDN": "CDN节点", "EDU": "教育网", "GOV": "政府", "SES": "爬虫"
  }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // 1. 获取映射数据
    if (path === '/mapping.json') {
      let data = null;
      try {
        const kvData = await env.IP_KV.get('mapping_data');
        if (kvData) data = JSON.parse(kvData);
      } catch (e) { }
      return new Response(JSON.stringify(data || DEFAULT_DATA), {
        headers: { 'content-type': 'application/json;charset=UTF-8', ...corsHeaders }
      });
    }

    // 2. 后端代理查询接口 (增强：尝试获取多种配额 Header)
    if (path === '/api/check' && request.method === 'POST') {
      try {
        const body = await request.json();
        const ip = body.ip;
        
        // 优先使用前端 Key，否则使用 Env Key
        const apiKey = (body.key && body.key.trim() !== "") ? body.key : env.IP_API_KEY;

        if (!apiKey) {
          return new Response(JSON.stringify({ error: { error_message: '未配置 API Key' } }), {
            headers: { 'content-type': 'application/json', ...corsHeaders }
          });
        }

        const apiUrl = `https://api.ip2location.io/?key=${apiKey}&ip=${ip}&format=json`;
        const resp = await fetch(apiUrl);
        
        // === 修改开始：尝试获取不同的配额字段 ===
        // 1. 尝试获取剩余点数 (Prepaid 账号)
        let credits = resp.headers.get('X-Credits-Remaining');
        // 2. 如果没有点数，尝试获取剩余请求次数 (Free/Subscription 账号有时会返回这个)
        if (!credits) {
            credits = resp.headers.get('X-RateLimit-Remaining');
        }
        
        const data = await resp.json();

        // 注入字段：如果有值则传值，如果没有(null)则传 null
        data._credits = credits; 

        return new Response(JSON.stringify(data), {
          headers: { 'content-type': 'application/json;charset=UTF-8', ...corsHeaders }
        });
        // === 修改结束 ===

      } catch (e) {
        return new Response(JSON.stringify({ error: { error_message: 'Server Proxy Error' } }), { status: 500, headers: corsHeaders });
      }
    }

    // 3. 保存数据接口
    if (path === '/api/save' && request.method === 'POST') {
      const token = request.headers.get('x-admin-token');
      const correctToken = env.ADMIN_TOKEN || '123456'; 
      if (token !== correctToken) return new Response(JSON.stringify({ success: false, msg: '密码错误' }), { status: 403, headers: corsHeaders });

      try {
        const body = await request.json();
        await env.IP_KV.put('mapping_data', JSON.stringify(body));
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, msg: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    if (path === '/admin') return new Response(getAdminHTML(), { headers: { 'content-type': 'text/html;charset=UTF-8' } });
    return new Response(getIndexHTML(), { headers: { 'content-type': 'text/html;charset=UTF-8' } });
  }
};

/** HTML: 主页 */
function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IP 地理位置批量查询</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;600;800&family=Noto+Sans+SC:wght@400;500;700&display=swap');
body{background:#0b1120;color:#e2e8f0;font-family:'Inter','Noto Sans SC',sans-serif}
.font-mono{font-family:'JetBrains Mono',monospace}
.glass-panel{background:rgba(30,41,59,0.6);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);box-shadow:0 8px 32px 0 rgba(0,0,0,0.2)}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
.btn-primary{background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);transition:all .3s ease}.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(37,99,235,0.3)}.btn-primary:disabled{opacity:0.6;cursor:not-allowed}
.badge-proxy{background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.3)}
.badge-direct{background:rgba(34,197,94,0.2);color:#86efac;border:1px solid rgba(34,197,94,0.3)}
</style>
</head>
<body class="min-h-screen p-4 md:p-8 pb-20">
<div class="max-w-6xl mx-auto space-y-6">
 <header class="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
  <div>
   <h1 class="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 flex items-center gap-3"><i data-lucide="radar" class="text-blue-500"></i>IP 地理位置批量查询</h1>
   <p class="text-slate-400 text-sm mt-1">留空使用默认 Key，或输入自己的 Key</p>
  </div>
  
  <div class="flex flex-col md:flex-row gap-3 items-end md:items-center w-full md:w-auto">
    <!-- 剩余额度显示 -->
    <div class="hidden md:flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-3 py-1.5 rounded-lg text-xs text-slate-300">
        <i data-lucide="coins" class="w-3 h-3 text-yellow-500"></i>
        <span>剩余: <b id="creditsCount" class="text-white">--</b></span>
    </div>

    <!-- API Key 输入框 -->
    <div class="w-full md:w-auto relative group">
     <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg blur opacity-30 group-hover:opacity-60 transition duration-200"></div>
     <div class="relative flex items-center bg-[#0f172a] rounded-lg p-1 border border-slate-700">
      <i data-lucide="key" class="w-4 h-4 text-slate-400 ml-2"></i>
      <input type="text" id="userApiKey" class="bg-transparent border-none text-sm text-white px-3 py-1.5 focus:outline-none w-full md:w-64 placeholder-slate-500" placeholder="IP2Location API Key (可选)">
     </div>
    </div>
  </div>
 </header>

 <div class="glass-panel rounded-2xl p-1">
  <div class="bg-[#0f172a]/50 p-4 rounded-t-xl border-b border-slate-700/50 flex justify-between items-center">
   <div class="flex items-center gap-4">
       <span class="text-slate-400 text-sm font-medium flex items-center gap-2"><i data-lucide="list"></i> IP 输入列表</span>
       <!-- 移动端额度 -->
       <span class="md:hidden flex items-center gap-1 text-xs text-slate-500"><i data-lucide="coins" class="w-3 h-3 text-yellow-500"></i> <span id="creditsCountMobile">--</span></span>
   </div>
   <div class="flex gap-2">
    <button onclick="document.getElementById('ipInput').value=''" class="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 transition">清空</button>
    <button onclick="fileInput.click()" class="bg-slate-700 hover:bg-slate-600 text-xs text-white px-3 py-1.5 rounded transition flex items-center gap-1"><i data-lucide="upload-cloud" class="w-3 h-3"></i> 导入文件</button>
    <input type="file" id="fileInput" hidden accept=".txt,.csv,.log,.json">
   </div>
  </div>
  <textarea id="ipInput" rows="6" class="w-full bg-transparent p-4 text-slate-300 font-mono text-sm outline-none resize-y" placeholder="在此粘贴或右上角导入 IP 地址..."></textarea>
  <div class="p-4 border-t border-slate-700/50 flex flex-col md:flex-row justify-between items-center gap-4">
   <div class="flex items-center gap-4 text-sm text-slate-400">
    <div id="statusIndicator" class="flex items-center gap-2 opacity-0 transition-opacity"><div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div><span>处理进度: <span id="progressNums" class="text-white font-mono">0/0</span></span></div>
   </div>
   <button onclick="processIPs()" id="actionBtn" class="btn-primary w-full md:w-auto px-8 py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2"><i data-lucide="play"></i> 开始检测</button>
  </div>
  <div class="h-1 bg-slate-800 rounded-b-xl overflow-hidden"><div id="progressBar" class="h-full bg-blue-500 w-0 transition-all duration-300"></div></div>
 </div>

 <div id="statsPanel" class="hidden grid grid-cols-2 md:grid-cols-4 gap-4">
  <div class="glass-panel p-4 rounded-xl border-l-4 border-blue-500"><div class="text-slate-400 text-xs uppercase font-bold">总计 (Total)</div><div class="text-2xl font-bold text-white mt-1" id="statTotal">0</div></div>
  <div class="glass-panel p-4 rounded-xl border-l-4 border-emerald-500"><div class="text-slate-400 text-xs uppercase font-bold">直连 (Direct)</div><div class="text-2xl font-bold text-emerald-400 mt-1" id="statDirect">0</div></div>
  <div class="glass-panel p-4 rounded-xl border-l-4 border-red-500"><div class="text-slate-400 text-xs uppercase font-bold">代理 (Proxy)</div><div class="text-2xl font-bold text-red-400 mt-1" id="statProxy">0</div></div>
  <div class="glass-panel p-4 rounded-xl border-l-4 border-purple-500 flex flex-col justify-center items-start">
    <button onclick="exportData('xlsx')" class="w-full text-left text-sm text-purple-300 hover:text-white transition flex items-center gap-2 mb-1"><i data-lucide="sheet"></i> 导出 Excel</button>
    <button onclick="exportData('csv')" class="w-full text-left text-sm text-blue-300 hover:text-white transition flex items-center gap-2"><i data-lucide="file-text"></i> 导出 CSV</button>
  </div>
 </div>
 <div id="outputArea" class="space-y-6"></div>
 
 <!-- 修改后的 Footer：增加数据来源声明 -->
 <footer class="text-center text-slate-600 text-xs mt-10 pb-6">
    <p>Data powered by Cloudflare KV & Worker Proxy</p>
    <p class="mt-1 opacity-75">IP数据来源 <a href="https://www.ip2location.io" target="_blank" class="hover:text-blue-400 transition underline decoration-dotted">IP2Location.io</a></p>
 </footer>

</div>
<script>
let MAPPING = { i18n: {}, usageTypeMap: {} };
let analyzedData = [], isProcessing = false;
document.addEventListener('DOMContentLoaded', () => {
 lucide.createIcons();
 loadMapping();
 const savedKey = localStorage.getItem('ip_api_key');
 if(savedKey) document.getElementById('userApiKey').value = savedKey;
});
document.getElementById('userApiKey').addEventListener('change', (e) => {
 localStorage.setItem('ip_api_key', e.target.value);
});
document.getElementById('fileInput').addEventListener('change', e => {
 const f = e.target.files[0]; if(!f) return;
 const r = new FileReader(); r.onload = v => document.getElementById('ipInput').value = v.target.result; r.readAsText(f);
});
async function loadMapping() {
 try { MAPPING = await (await fetch('./mapping.json')).json(); } catch (e) { console.warn('Load mapping failed'); }
}
function extractIPs(text) {
 const v4 = text.match(/\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b/g) || [];
 const v6 = text.match(/(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/g) || [];
 return [...new Set([...v4, ...v6])];
}

// 核心修复：更新额度 UI (如果值为 null，显示更友好的提示)
function updateCreditUI(credits) {
    const elDesk = document.getElementById('creditsCount');
    const elMob = document.getElementById('creditsCountMobile');
    
    // 如果 credits 有具体数值，直接显示
    if (credits !== null && credits !== undefined) {
        elDesk.innerText = credits;
        elMob.innerText = credits;
    } else {
        // 如果 API 没返回，显示 "未知/不限"
        elDesk.innerText = '未知/不限';
        elMob.innerText = '未知';
    }
}

async function processIPs() {
 if(isProcessing) return;
 const ipList = extractIPs(document.getElementById('ipInput').value);
 if (!ipList.length) return alert('未检测到有效IP');
 
 const userKey = document.getElementById('userApiKey').value.trim();
 
 isProcessing = true; analyzedData = [];
 document.getElementById('outputArea').innerHTML = '';
 document.getElementById('statsPanel').classList.add('hidden');
 document.getElementById('statusIndicator').classList.remove('opacity-0');
 document.getElementById('actionBtn').disabled = true;
 document.getElementById('actionBtn').innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> 处理中...';
 lucide.createIcons();

 let completed = 0;
 const check = async (ip) => {
  try {
   const res = await fetch('/api/check', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({ ip, key: userKey }) 
   });
   const d = await res.json();
   
   // 调用 UI 更新 (d._credits 可能为 null)
   updateCreditUI(d._credits);

   if(d.error) throw new Error(d.error.error_message);
   return { ip, ...d, country: t(d.country_name), region: t(d.region_name), city: t(d.city_name), usage_cn: MAPPING.usageTypeMap[d.usage_type] || d.usage_type };
  } catch (e) { return { ip, error: true, msg: e.message || "查询失败" }; }
  finally {
   completed++;
   document.getElementById('progressBar').style.width = \`\${(completed/ipList.length)*100}%\`;
   document.getElementById('progressNums').innerText = \`\${completed}/\${ipList.length}\`;
  }
 };
 
 const results = [];
 for (let i=0; i<ipList.length; i+=5) {
  results.push(...await Promise.all(ipList.slice(i, i+5).map(check)));
  if(i+5 < ipList.length) await new Promise(r=>setTimeout(r, 200));
 }
 analyzedData = results;
 renderResults(); updateStats();
 isProcessing = false;
 document.getElementById('actionBtn').disabled = false;
 document.getElementById('actionBtn').innerHTML = '<i data-lucide="play"></i> 开始检测';
 document.getElementById('statusIndicator').classList.add('opacity-0');
 document.getElementById('statsPanel').classList.remove('hidden');
 lucide.createIcons();
}

function t(v) { return MAPPING.i18n[v] || v || '-'; }
function renderResults() {
 const box = document.getElementById('outputArea'); box.innerHTML = '';
 const groups = analyzedData.reduce((a,i) => { const k = i.error ? '检测失败' : (i.country||'未知'); (a[k]=a[k]||[]).push(i); return a; }, {});
 Object.keys(groups).forEach(k => {
  const list = groups[k], isErr = k==='检测失败';
  const flag = (!isErr && list[0].country_code) ? \`<img src="https://flagcdn.com/24x18/\${list[0].country_code.toLowerCase()}.png" class="inline mr-2 shadow-sm">\` : '';
  box.innerHTML += \`
  <div class="glass-panel rounded-xl overflow-hidden">
   <div class="px-6 py-3 bg-slate-800/40 border-b border-slate-700/50 flex justify-between items-center">
    <h3 class="font-bold \${isErr?'text-red-400':'text-blue-400'} flex items-center">\${!isErr?flag:''} \${k} <span class="ml-2 text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">\${list.length}</span></h3>
   </div>
   <div class="overflow-x-auto"><table class="w-full text-sm text-left">
    <thead class="text-xs text-slate-500 uppercase bg-slate-900/20"><tr><th class="px-6 py-3">IP</th><th class="px-6 py-3">类型</th><th class="px-6 py-3">地区</th><th class="px-6 py-3">用途</th><th class="px-6 py-3">ISP</th></tr></thead>
    <tbody class="divide-y divide-slate-700/30">\${list.map(i => isErr ? \`<tr><td class="px-6 py-3 font-mono text-slate-300">\${i.ip}</td><td colspan="4" class="text-red-400 px-6">\${i.msg}</td></tr>\` : \`
    <tr class="hover:bg-slate-700/20"><td class="px-6 py-3 font-mono text-slate-200 select-all">\${i.ip}</td>
    <td class="px-6 py-3"><span class="px-2 py-1 rounded text-xs font-bold \${i.is_proxy?'badge-proxy':'badge-direct'}">\${i.is_proxy?'代理':'直连'}</span></td>
    <td class="px-6 py-3 text-slate-300">\${i.region}/\${i.city}</td><td class="px-6 py-3"><span class="text-xs font-mono border border-slate-600 px-1 rounded text-slate-400">\${i.usage_type}</span> \${i.usage_cn}</td>
    <td class="px-6 py-3 text-slate-400 truncate max-w-xs">\${i.as} <span class="block text-xs text-slate-600">AS\${i.asn}</span></td></tr>\`).join('')}</tbody>
   </table></div>
  </div>\`;
 });
}
function updateStats() {
 const v = analyzedData.filter(x=>!x.error), p = v.filter(x=>x.is_proxy).length;
 ['statTotal','statDirect','statProxy'].forEach((id,i) => document.getElementById(id).innerText = [analyzedData.length, v.length-p, p][i]);
}
function exportData(t) {
 if(!analyzedData.length) return alert('无数据');
 const d = analyzedData.map(i => ({IP:i.ip, 状态:i.error?'失败':'成功', 代理:i.is_proxy?'是':'否', 国家:i.country, 省份:i.region, 城市:i.city, 用途:i.usage_cn, ISP:i.as}));
 const n = \`IP_Report_\${new Date().toISOString().slice(0,10)}\`;
 if(t==='xlsx') { const w=XLSX.utils.json_to_sheet(d), b=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b,w,"Data"); XLSX.writeFile(b, n+'.xlsx'); }
 else { const c=XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(d)), a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(["\\uFEFF"+c],{type:'text/csv'})); a.download=n+'.csv'; a.click(); }
}
</script>
</body>
</html>`;
}

/** HTML: 后台管理 */
/** HTML: 后台管理 (新增行直接在底部显示) */
function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KV 数据管理后台</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<style>
body { background: #0f172a; color: #f1f5f9; font-family: 'Inter', system-ui, sans-serif; }
.glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
.input-dark { background: #1e293b; border: 1px solid #334155; color: white; }
.input-dark:focus { border-color: #3b82f6; outline: none; }
/* 新增行的呼吸灯效果 */
.new-row-highlight { animation: pulse-border 2s infinite; border-color: #3b82f6; }
@keyframes pulse-border { 0% { border-color: #3b82f6; box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); } 70% { border-color: #60a5fa; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0); } 100% { border-color: #3b82f6; box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); } }
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
.btn { transition: .2s; } .btn:active { transform: scale(0.98); }
#authModal { transition: opacity 0.2s ease-in-out; }
#authModal.hidden { opacity: 0; pointer-events: none; }
#authModal:not(.hidden) { opacity: 1; pointer-events: auto; }
</style>
</head>
<body class="min-h-screen p-4 md:p-8">
 <div class="max-w-7xl mx-auto">
  <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
   <div class="flex items-center gap-3">
    <div class="bg-blue-600 p-2 rounded-lg"><i data-lucide="database" class="text-white w-6 h-6"></i></div>
    <div>
     <h1 class="text-2xl font-bold text-white">Cloudflare KV 映射管理</h1>
     <p class="text-slate-400 text-sm mt-1">数据实时存储于边缘节点，无需重新部署代码</p>
    </div>
   </div>
   <div class="flex gap-3">
    <button onclick="openAuthModal()" class="btn flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20">
        <i data-lucide="cloud-upload" class="w-4 h-4"></i> 保存并生效
    </button>
    <button onclick="exportJSON()" class="btn flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium text-sm">
        <i data-lucide="download" class="w-4 h-4"></i> 备份
    </button>
   </div>
  </header>
  
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
   <div class="glass rounded-xl p-6 flex flex-col h-[75vh]">
    <div class="flex justify-between mb-4"><h2 class="font-bold text-blue-400 flex items-center gap-2"><i data-lucide="globe" class="w-4 h-4"></i> 地区映射 (i18n)</h2><input placeholder="搜索..." class="input-dark px-2 py-1 rounded text-sm w-32" oninput="render('i18nList',this.value)"></div>
    <!-- 列表容器 -->
    <div class="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2 pb-10" id="i18nList"></div>
    <button onclick="addItem('i18n')" class="mt-4 w-full py-2 border-2 border-dashed border-slate-600 text-slate-400 rounded-lg hover:border-blue-500 hover:text-blue-500 transition text-sm flex justify-center items-center gap-2">
        <i data-lucide="plus"></i> 新增地区
    </button>
   </div>
   <div class="glass rounded-xl p-6 flex flex-col h-[75vh]">
    <div class="flex justify-between mb-4"><h2 class="font-bold text-purple-400 flex items-center gap-2"><i data-lucide="network" class="w-4 h-4"></i> 类型映射 (Usage)</h2><input placeholder="搜索..." class="input-dark px-2 py-1 rounded text-sm w-32" oninput="render('usageList',this.value)"></div>
    <!-- 列表容器 -->
    <div class="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2 pb-10" id="usageList"></div>
    <button onclick="addItem('usage')" class="mt-4 w-full py-2 border-2 border-dashed border-slate-600 text-slate-400 rounded-lg hover:border-purple-500 hover:text-purple-500 transition text-sm flex justify-center items-center gap-2">
        <i data-lucide="plus"></i> 新增类型
    </button>
   </div>
  </div>
 </div>

 <!-- 认证模态框 -->
 <div id="authModal" class="fixed inset-0 z-50 flex items-center justify-center hidden">
    <div class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" onclick="closeAuthModal()"></div>
    <div class="relative bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100">
        <div class="text-center mb-6">
            <div class="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-3"><i data-lucide="lock" class="text-blue-500 w-6 h-6"></i></div>
            <h3 class="text-lg font-bold text-white">身份验证</h3>
            <p class="text-slate-400 text-xs mt-1">请输入管理员 Token 以保存更改</p>
        </div>
        <div class="space-y-4">
            <div class="relative">
                <input type="password" id="adminTokenInput" class="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-blue-500 outline-none block p-2.5 pr-10" placeholder="Admin Token" onkeydown="if(event.key==='Enter') submitSave()">
                <button type="button" onclick="togglePwd()" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"><i id="eyeIcon" data-lucide="eye" class="w-4 h-4"></i></button>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="closeAuthModal()" class="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition">取消</button>
                <button onclick="submitSave()" id="confirmBtn" class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-500/20 transition flex justify-center items-center gap-2">确认保存</button>
            </div>
        </div>
    </div>
 </div>

 <div id="toastContainer" class="fixed top-5 right-5 z-50 flex flex-col gap-2"></div>

 <script>
  lucide.createIcons();
  let mapping = { i18n: {}, usageTypeMap: {} };
  
  fetch('./mapping.json')
    .then(r=>r.json())
    .then(j=>{mapping=j;renderAll();showToast('已从云端加载最新配置')})
    .catch(()=>showToast('加载失败，请检查网络','error'));

  function getRef(t) { return t.includes('i18n') ? mapping.i18n : mapping.usageTypeMap; }
  
  // 修改后的渲染逻辑：确保新增行(空Key)总是在最下方
  function renderAll() { render('i18nList'); render('usageList'); }
  
  function render(id, filter='') {
   const type = id==='i18nList'?'i18n':'usage', obj = getRef(type), box = document.getElementById(id); box.innerHTML='';
   
   // 1. 提取所有 Key
   const allKeys = Object.keys(obj);
   // 2. 分离出普通 Key 和 空 Key (新增行)
   const normalKeys = allKeys.filter(k => k !== '').sort();
   const hasNewRow = obj.hasOwnProperty(''); // 检查是否存在空 Key

   // 3. 生成 HTML 函数
   const createRow = (k, isNew) => {
       const v = obj[k];
       // 如果是新增行，加上特殊的高亮样式和 autofocus
       const rowClass = isNew ? 'border border-blue-500/50 bg-blue-500/10 new-row-highlight' : 'border border-transparent group hover:bg-slate-700/30';
       const placeholderK = isNew ? '输入原始数据(回车确认)' : 'Key';
       const placeholderV = isNew ? '输入中文翻译' : 'Value';
       const autoFocus = isNew ? 'autofocus' : '';
       
       return \`
       <div class="flex gap-2 mb-2 p-1 rounded-lg transition-all \${rowClass}">
          <input class="input-dark w-1/2 px-3 py-2 rounded-lg text-xs font-mono text-slate-300 border border-transparent focus:border-blue-500 transition" 
                 value="\${k}" \${autoFocus}
                 onchange="updK('\${type}','\${k}',this.value)" 
                 placeholder="\${placeholderK}">
          <input class="input-dark w-1/2 px-3 py-2 rounded-lg text-xs text-blue-100 border border-transparent focus:border-purple-500 transition" 
                 value="\${v}" 
                 onchange="updV('\${type}','\${k}',this.value)" 
                 placeholder="\${placeholderV}">
          <button onclick="rm('\${type}','\${k}')" class="text-slate-500 hover:text-red-500 px-1 opacity-0 group-hover:opacity-100 transition \${isNew?'opacity-100':''}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
       </div>\`;
   };

   // 4. 渲染普通行
   normalKeys.forEach(k => {
    if(filter && !k.toLowerCase().includes(filter.toLowerCase()) && !obj[k].includes(filter)) return;
    box.innerHTML += createRow(k, false);
   });

   // 5. 渲染新增行 (如果存在且没有被过滤)
   if (hasNewRow && !filter) {
       box.innerHTML += createRow('', true);
   }

   lucide.createIcons();
  }

  // 修改 addItem：不再弹窗，而是添加一个空 Key 到对象中
  function addItem(t) { 
      const ref = getRef(t);
      // 防止重复添加空行
      if(ref.hasOwnProperty('')) {
          showToast('请先填写底部的新增行', 'info');
          // 聚焦到已存在的空行
          const container = document.getElementById(t==='i18n'?'i18nList':'usageList');
          const lastInput = container.lastElementChild.querySelector('input');
          if(lastInput) lastInput.focus();
          return;
      }
      
      // 添加空 Key
      ref[''] = ''; 
      renderAll();
      
      // 滚动到底部并聚焦
      setTimeout(() => {
          const container = document.getElementById(t==='i18n'?'i18nList':'usageList');
          container.scrollTop = container.scrollHeight;
          const inputs = container.querySelectorAll('input');
          // 找到倒数第二个输入框(因为最后一个是 Value，倒数第二个是 Key)进行聚焦
           // 其实上面的 render 已经加了 autofocus，但为了保险再做一次
          if(inputs.length >= 2) {
              // 查找 value 为空的 input 并聚焦
              for(let i of inputs) {
                  if(i.value === '' && i.placeholder.includes('API')) {
                      i.focus();
                      break;
                  }
              }
          }
      }, 50);
  }

  // 更新 Key 的逻辑
  function updK(t, o, n) { 
      if(o === n) return; 
      // 检查新 Key 是否已存在
      if(getRef(t)[n]) {
          showToast('该 Key 已存在', 'error');
          // 渲染回去，重置输入框的值
          renderAll();
          return;
      }
      
      // 保存旧值
      const val = getRef(t)[o];
      // 删除旧 Key (如果是空 Key，相当于确认新增)
      delete getRef(t)[o];
      // 添加新 Key
      getRef(t)[n] = val;
      
      renderAll();
      
      // 重新渲染后焦点会丢失，尝试找回焦点 (虽然不是必须，但体验更好)
      // 由于 Key 变了，我们需要找到新 Key 对应的 input
      setTimeout(() => {
         // 这里比较难精确定位，用户通常输入完 Key 会去点 Value，或者按回车
         showToast(o === '' ? '新增成功' : '修改成功', 'success');
      }, 50);
  }

  function updV(t,k,v) { getRef(t)[k]=v; }
  
  function rm(t,k) { 
      // 如果是删除空行，不需要 confirm
      if(k === '' || confirm('确认删除 '+k+'?')){ 
          delete getRef(t)[k]; 
          renderAll(); 
      } 
  }

  // --- 模态框逻辑保持不变 ---
  const modal = document.getElementById('authModal');
  const input = document.getElementById('adminTokenInput');
  function openAuthModal() { modal.classList.remove('hidden'); input.value = ''; setTimeout(() => input.focus(), 100); }
  function closeAuthModal() { modal.classList.add('hidden'); }
  function togglePwd() {
      const type = input.type === 'password' ? 'text' : 'password';
      input.type = type;
      document.getElementById('eyeIcon').setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
      lucide.createIcons();
  }
  async function submitSave() {
    const pwd = input.value;
    if(!pwd) { input.focus(); return; }
    const btn = document.getElementById('confirmBtn'); const originalText = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> 保存中...';
    try {
        const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': pwd }, body: JSON.stringify(mapping) });
        const d = await res.json();
        if(d.success) { showToast('✅ 保存成功！所有更改即刻生效'); closeAuthModal(); } 
        else { showToast('❌ 保存失败: ' + d.msg, 'error'); input.classList.add('border-red-500'); setTimeout(() => input.classList.remove('border-red-500'), 2000); }
    } catch(e) { showToast('网络错误', 'error'); } finally { btn.disabled = false; btn.innerHTML = originalText; }
  }

  function exportJSON() {
   const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(mapping,null,2)],{type:'application/json'})); a.download = 'mapping_backup.json'; a.click();
  }
  
  function showToast(m,t='success') {
   const colors = {error:'bg-red-600', info:'bg-blue-600', success:'bg-emerald-600'};
   const d=document.createElement('div'); d.className=\`\${colors[t]} text-white px-4 py-2 rounded shadow text-sm toast flex items-center gap-2 animate-bounce\`; 
   d.style.animation = 'fadeIn 0.3s ease-out';
   d.innerHTML = t==='error' ? \`<i data-lucide="alert-circle" class="w-4 h-4"></i> \${m}\` : \`<i data-lucide="check-circle" class="w-4 h-4"></i> \${m}\`;
   document.getElementById('toastContainer').appendChild(d); lucide.createIcons(); setTimeout(()=>d.remove(),3000);
  }
 </script>
 <style> @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } </style>
</body>
</html>`;
}