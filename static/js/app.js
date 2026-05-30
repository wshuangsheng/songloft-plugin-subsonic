let currentServers = []
let currentPathId = 'root'
let pathStack = ['root'] // 用于返回上一级

function showSnackbar(message) {
    const snackbar = document.getElementById('snackbar');
    snackbar.textContent = message;
    snackbar.classList.add('show');
    setTimeout(() => {
        snackbar.classList.remove('show');
    }, 3000);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'))
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'))
    document.getElementById(`tab-${tabId}`).classList.add('active')
    document.querySelector(`.tab-item[data-tab="${tabId}"]`).classList.add('active')
}

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const authData = localStorage.getItem('songloft-auth');
        if (authData) {
            const auth = JSON.parse(authData);
            if (auth.accessToken) {
                headers['Authorization'] = 'Bearer ' + auth.accessToken;
            }
        }
    } catch (e) {}
    return headers;
}

async function fetchServers() {
    try {
        const res = await fetch('./lists', { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        currentServers = data
        renderServerList()
        renderBrowserSelect()
    } catch (e) {
        showSnackbar('获取服务器失败: ' + e)
    }
}

function getFormData() {
    return {
        name: document.getElementById('subName').value.trim(),
        url: document.getElementById('subUrl').value.trim(),
        username: document.getElementById('subUsername').value.trim(),
        password: document.getElementById('subPassword').value.trim(),
        salt: document.getElementById('subSalt').value.trim(),
    }
}

async function testServer() {
    const data = getFormData()
    if (!data.url || !data.username) {
        showSnackbar('地址和用户名不能为空')
        return
    }
    
    // 如果填写了salt，将password字段作为token使用
    const payload = {
        name: data.name || 'test',
        url: data.url,
        username: data.username,
        version: '1.16.1'
    }
    if (data.salt) {
        payload.token = data.password
        payload.salt = data.salt
    } else {
        payload.password = data.password
    }

    try {
        const res = await fetch('./test', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error(await res.text())
        const result = await res.json()
        if (result.success) {
            showSnackbar('测试通过！')
        } else {
            showSnackbar('测试失败: ' + (result.error || '未知错误'))
        }
    } catch (e) {
        showSnackbar('测试请求出错: ' + e)
    }
}

async function addServer() {
    const data = getFormData()
    if (!data.name || !data.url || !data.username) {
        showSnackbar('名称、地址和用户名不能为空')
        return
    }

    const payload = {
        name: data.name,
        url: data.url,
        username: data.username,
        version: '1.16.1'
    }
    if (data.salt) {
        payload.token = data.password
        payload.salt = data.salt
    } else {
        payload.password = data.password
    }

    try {
        const res = await fetch('./lists', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        })
        if (res.ok) {
            showSnackbar('保存成功')
            document.getElementById('subName').value = ''
            document.getElementById('subUrl').value = ''
            document.getElementById('subUsername').value = ''
            document.getElementById('subPassword').value = ''
            document.getElementById('subSalt').value = ''
            fetchServers()
        }
    } catch (e) {
        showSnackbar('保存失败: ' + e)
    }
}

async function deleteServer(name) {
    if (!confirm(`确定删除 ${name} 吗？`)) return
    try {
        const res = await fetch(`./lists/${encodeURIComponent(name)}`, { 
            method: 'DELETE',
            headers: getAuthHeaders()
        })
        if (res.ok) {
            showSnackbar('删除成功')
            fetchServers()
        }
    } catch (e) {
        showSnackbar('删除失败: ' + e)
    }
}

function renderServerList() {
    const container = document.getElementById('serverList')
    if (currentServers.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无服务器，请先添加</div>'
        return
    }

    container.innerHTML = ''
    currentServers.forEach(server => {
        const item = document.createElement('div')
        item.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--md-outline-variant)'
        
        item.innerHTML = `
            <div style="flex:1">
                <div style="font-size:16px;color:var(--md-on-surface);font-weight:500">${server.name}</div>
                <div style="font-size:13px;color:var(--md-on-surface-variant);margin-top:4px">${server.url}</div>
            </div>
            <button class="btn-icon" style="color:var(--md-error)" title="删除">
                <span class="material-symbols-outlined">delete</span>
            </button>
        `
        item.querySelector('button').onclick = () => deleteServer(server.name)
        container.appendChild(item)
    })
}

function renderBrowserSelect() {
    const select = document.getElementById('browserServerSelect')
    const currentVal = select.value
    
    select.innerHTML = '<option value="">请选择服务器...</option>'
    currentServers.forEach(server => {
        const opt = document.createElement('option')
        opt.value = server.name
        opt.textContent = server.name
        select.appendChild(opt)
    })
    
    if (currentServers.some(s => s.name === currentVal)) {
        select.value = currentVal
    } else {
        document.getElementById('browserList').innerHTML = '<div class="empty-state">请选择服务器进行浏览</div>'
        pathStack = ['root']
        currentPathId = 'root'
    }
}

async function loadDirectory(serverName, dirId) {
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'
    document.getElementById('browserPathDisplay').textContent = dirId === 'root' ? 'Artists' : `[ID: ${dirId}]`
    
    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/items?id=${encodeURIComponent(dirId)}`, {
            headers: getAuthHeaders()
        })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        
        currentPathId = dirId
        
        if (items.length === 0) {
            container.innerHTML = '<div class="empty-state">空目录</div>'
            return
        }
        
        container.innerHTML = ''
        items.forEach(item => {
            const el = document.createElement('div')
            el.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--md-outline-variant);cursor:pointer;'
            el.classList.add('browser-item')
            
            const icon = item.type === 'directory' ? 'folder_special' : 'music_note'
            const color = item.type === 'directory' ? 'var(--md-primary)' : 'var(--md-on-surface)'
            const subtitle = item.type === 'directory' ? 'Artist/Album' : (item.artist ? item.artist + ' - ' : '') + (item.album || '')
            
            el.innerHTML = `
                <span class="material-symbols-outlined" style="color:${color};margin-right:12px">${icon}</span>
                <div style="flex:1;overflow:hidden">
                    <div style="font-size:14px;color:var(--md-on-surface);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
                    <div style="font-size:12px;color:var(--md-on-surface-variant);margin-top:2px">${subtitle}</div>
                </div>
            `
            
            el.onclick = () => {
                if (item.type === 'directory') {
                    pathStack.push(item.id)
                    loadDirectory(serverName, item.id)
                } else {
                    showSnackbar('可以直接播放: ' + item.name)
                    console.log('Stream URL:', item.streamUrl)
                }
            }
            
            el.onmouseenter = () => el.style.backgroundColor = 'var(--md-surface-container-high)'
            el.onmouseleave = () => el.style.backgroundColor = 'transparent'
            
            container.appendChild(el)
        })
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab)
    })
    
    document.getElementById('refreshBtn').onclick = fetchServers
    document.getElementById('testServerBtn').onclick = testServer
    document.getElementById('addServerBtn').onclick = addServer
    
    document.getElementById('browserServerSelect').onchange = (e) => {
        const val = e.target.value
        if (val) {
            pathStack = ['root']
            loadDirectory(val, 'root')
        } else {
            document.getElementById('browserList').innerHTML = '<div class="empty-state">请选择服务器进行浏览</div>'
        }
    }
    
    document.getElementById('browserUpBtn').onclick = () => {
        const server = document.getElementById('browserServerSelect').value
        if (!server || pathStack.length <= 1) return
        pathStack.pop() // remove current
        const parentId = pathStack[pathStack.length - 1]
        loadDirectory(server, parentId)
    }

    fetchServers()
})
