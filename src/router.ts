import { createRouter, jsonResponse, createSearchHandler, createMusicUrlHandler } from '@songloft/plugin-sdk'
import type { HTTPRequest, SearchResultItem } from '@songloft/plugin-sdk'
import { getConfigs, saveConfigs, getConfig, SubsonicConfig } from './config'
import { ping, getIndexes, getMusicDirectory, getStreamUrl, searchSongs, getStarred, getRandomSongs } from './client'

function parseBody(req: HTTPRequest): any {
  if (!req.body) return {}
  try {
    const str = typeof req.body === 'string'
      ? req.body
      : String.fromCharCode.apply(null, Array.from(req.body as Uint8Array))
    return JSON.parse(str)
  } catch {
    return {}
  }
}

const router = createRouter()

// 列出所有配置的 Subsonic
router.get('/lists', async (req: HTTPRequest) => {
  const configs = await getConfigs()
  return jsonResponse(configs.map(c => ({
    id: c.name,
    name: c.name,
    url: c.url,
    username: c.username,
    salt: c.salt
  })))
})

// 添加/更新 Subsonic 配置
router.post('/lists', async (req: HTTPRequest) => {
  const data = parseBody(req) as SubsonicConfig
  const configs = await getConfigs()
  const existing = configs.findIndex(c => c.name === data.name)
  if (existing >= 0) {
    const oldConfig = configs[existing]
    // 密码留空则保留旧密码配置
    if (!data.password && !data.token) {
      data.password = oldConfig.password
      data.token = oldConfig.token
    }
    configs[existing] = data
  } else {
    configs.push(data)
  }
  await saveConfigs(configs)
  return jsonResponse({ success: true })
})

// 删除配置
router.delete('/lists/:id', async (req: HTTPRequest, params) => {
  const configs = await getConfigs()
  const filtered = configs.filter(c => c.name !== params.id)
  await saveConfigs(filtered)
  return jsonResponse({ success: true })
})

// 测试连接
router.post('/test', async (req: HTTPRequest) => {
  const data = parseBody(req)
  try {
    const ok = await ping(data as SubsonicConfig)
    return jsonResponse({ success: ok })
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) })
  }
})

// 获取特定配置的目录项 (Artists 或 directory contents)
router.get('/lists/:id/items', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) {
    return jsonResponse({ error: 'Config not found' }, 404)
  }
  
  // Parse query string manually or assume query parsing is available if not, but we can do simple regex
  // plugin-sdk passes req.query as string.
  let pathId = ''
  if (req.query) {
    const match = req.query.match(/(?:^|&)id=([^&]*)/)
    if (match) pathId = decodeURIComponent(match[1])
  }
  
  try {
    if (!pathId || pathId === 'root') {
      // 根目录：获取 Artists
      const artists = await getIndexes(config)
      return jsonResponse(artists.map(a => ({
        id: a.id,
        name: a.name,
        type: 'directory'
      })))
    } else {
      // 获取子目录内容
      const items = await getMusicDirectory(config, pathId)
      return jsonResponse(items.map(item => ({
        id: item.id,
        name: item.title || item.name,
        type: item.isDir ? 'directory' : 'file',
        artist: item.artist,
        album: item.album,
        duration: item.duration,
        size: item.size,
        streamUrl: item.isDir ? '' : getStreamUrl(config, item.id),
        coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined
      })))
    }
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 全局搜索
router.post('/api/search', createSearchHandler({
  search: async (keyword: string, page = 1, pageSize = 20) => {
    const configs = await getConfigs()
    if (configs.length === 0) return []
    
    const results: SearchResultItem[] = []
    
    // 并发搜索所有配置的服务器
    await Promise.all(configs.map(async (config) => {
      try {
        const songs = await searchSongs(config, keyword, page, pageSize)
        for (const s of songs) {
          results.push({
            title: s.title,
            artist: s.artist,
            album: s.album,
            duration: s.duration || 0,
            cover_url: s.coverArt ? getStreamUrl(config, s.coverArt).replace('stream', 'getCoverArt') : undefined,
            source_data: { configName: config.name, songId: s.id }
          })
        }
      } catch (e) {
        // 忽略单个服务器错误，但打印日志方便排查
        console.error('Subsonic search error for ' + config.name + ':', String(e))
      }
    }))
    
    return results
  }
}))

// 播放链接解析
router.post('/api/music/url', createMusicUrlHandler({
  resolveUrl: async (sourceData: Record<string, unknown>) => {
    const configName = sourceData.configName as string
    const songId = sourceData.songId as string
    if (!configName || !songId) throw new Error('Invalid source_data')
    
    const config = await getConfig(configName)
    if (!config) throw new Error('Subsonic config not found: ' + configName)
    
    return getStreamUrl(config, songId)
  }
}))

// 新增前端 API - 扁平化搜索
router.get('/lists/:id/search', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)
  
  let keyword = ''
  if (req.query) {
    const match = req.query.match(/(?:^|&)q=([^&]*)/)
    if (match) keyword = decodeURIComponent(match[1])
  }
  
  try {
    const songs = await searchSongs(config, keyword, 1, 100)
    return jsonResponse(songs.map(item => ({
      id: item.id,
      name: item.title,
      type: 'file',
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      size: item.size,
      streamUrl: getStreamUrl(config, item.id),
      coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 新增前端 API - 我的收藏
router.get('/lists/:id/starred', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)
  
  try {
    const songs = await getStarred(config)
    return jsonResponse(songs.map((item: any) => ({
      id: item.id,
      name: item.title,
      type: 'file',
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      size: item.size,
      streamUrl: getStreamUrl(config, item.id),
      coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 新增前端 API - 随机/随便听听
router.get('/lists/:id/random', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)
  
  try {
    const songs = await getRandomSongs(config, 50)
    return jsonResponse(songs.map((item: any) => ({
      id: item.id,
      name: item.title,
      type: 'file',
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      size: item.size,
      streamUrl: getStreamUrl(config, item.id),
      coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

export default router
