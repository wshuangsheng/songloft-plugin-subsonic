import type { HTTPRequest, HTTPResponse } from '@songloft/plugin-sdk'
import { validateAuth, getServerConfig, saveServerConfig, ServerConfig } from './auth'
import { okResponse, errorResponse } from './responses'

type Handler = (req: HTTPRequest, query: URLSearchParams) => Promise<HTTPResponse>

function authError(query: URLSearchParams): HTTPResponse {
  const r = errorResponse(query, 40, 'Wrong username or password')
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- System ---

const handlePing: Handler = async (_req, query) => {
  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetUser: Handler = async (_req, query) => {
  const config = await getServerConfig()
  const r = okResponse(query, {
    user: {
      username: config.username,
      adminRole: true,
      streamRole: true,
      downloadRole: true,
      coverArtRole: true,
      scrobbleRole: true,
    }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Browsing ---

const handleGetArtists: Handler = async (_req, query) => {
  const songs = await songloft.songs.list({ limit: 100000 })
  const artistMap = new Map<string, number>()
  for (const song of songs) {
    const a = song.artist || 'Unknown'
    artistMap.set(a, (artistMap.get(a) || 0) + 1)
  }

  const indexes: Record<string, any[]> = {}
  for (const [name, count] of artistMap) {
    const letter = (name[0] || '#').toUpperCase()
    const key = /[A-Z]/.test(letter) ? letter : '#'
    if (!indexes[key]) indexes[key] = []
    indexes[key].push({ id: `ar-${name}`, name, albumCount: 0, songCount: count })
  }

  const indexArr = Object.entries(indexes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, artists]) => ({ name, artist: artists }))

  const r = okResponse(query, { artists: { ignoredArticles: 'The El La', index: indexArr } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetMusicFolders: Handler = async (_req, query) => {
  const r = okResponse(query, { musicFolders: { musicFolder: [{ id: 1, name: 'Music' }] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetAlbumList2: Handler = async (_req, query) => {
  const type = query.get('type') || 'newest'
  const size = Math.min(parseInt(query.get('size') || '20'), 500)
  const offset = parseInt(query.get('offset') || '0')

  const songs = await songloft.songs.list({ limit: 100000 })

  // 按 album 聚合
  const albumMap = new Map<string, { artist: string; songCount: number; id: number }>()
  for (const song of songs) {
    const album = song.album || 'Unknown'
    if (!albumMap.has(album)) {
      albumMap.set(album, { artist: song.artist, songCount: 0, id: song.id })
    }
    albumMap.get(album)!.songCount++
  }

  let albums = Array.from(albumMap.entries()).map(([name, info]) => ({
    id: `al-${info.id}`,
    name,
    artist: info.artist,
    songCount: info.songCount,
    coverArt: `al-${info.id}`,
  }))

  if (type === 'alphabeticalByName') {
    albums.sort((a, b) => a.name.localeCompare(b.name))
  }
  // default: newest (original order from DB)

  albums = albums.slice(offset, offset + size)
  const r = okResponse(query, { albumList2: { album: albums } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Search ---

const handleSearch3: Handler = async (_req, query) => {
  const q = query.get('query') || ''
  const songCount = Math.min(parseInt(query.get('songCount') || '20'), 100)

  const songs = await songloft.songs.search(q)
  const songResults = songs.slice(0, songCount).map(s => songToSubsonic(s))

  const r = okResponse(query, { searchResult3: { song: songResults } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Media ---

const handleStream: Handler = async (_req, query) => {
  const id = query.get('id')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const songId = parseInt(id)
  if (isNaN(songId)) {
    const r = errorResponse(query, 10, 'Invalid id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  return { serveFile: { songId } }
}

const handleGetCoverArt: Handler = async (_req, query) => {
  const id = query.get('id') || ''
  // coverArt id 可能是 "al-123" 或直接数字
  const numId = parseInt(id.replace(/^(al|ar)-/, ''))
  if (isNaN(numId)) {
    return { statusCode: 404, headers: {}, body: '' }
  }
  const song = await songloft.songs.getById(numId)
  if (!song?.coverPath) {
    return { statusCode: 404, headers: {}, body: '' }
  }
  return { serveFile: { filePath: `music://${song.coverPath}` } }
}

// --- Playlists ---

const handleGetPlaylists: Handler = async (_req, query) => {
  const playlists = await songloft.playlists.list()
  const items = playlists.map(p => ({
    id: String(p.id),
    name: p.name,
    songCount: p.songCount,
    public: true,
    coverArt: p.coverUrl || '',
  }))
  const r = okResponse(query, { playlists: { playlist: items } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetPlaylist: Handler = async (_req, query) => {
  const id = parseInt(query.get('id') || '0')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const playlist = await songloft.playlists.getById(id)
  if (!playlist) {
    const r = errorResponse(query, 70, 'Playlist not found')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const songs = await songloft.playlists.getSongs(id, { limit: 10000 })
  const entries = songs.map(s => songToSubsonic(s))
  const r = okResponse(query, {
    playlist: { id: String(playlist.id), name: playlist.name, songCount: playlist.songCount, entry: entries }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Random ---

const handleGetRandomSongs: Handler = async (_req, query) => {
  const size = Math.min(parseInt(query.get('size') || '10'), 500)
  const songs = await songloft.songs.list({ limit: size })
  const r = okResponse(query, { randomSongs: { song: songs.map(s => songToSubsonic(s)) } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Helpers ---

function songToSubsonic(s: any) {
  return {
    id: String(s.id),
    title: s.title || '',
    artist: s.artist || '',
    album: s.album || '',
    duration: s.duration || 0,
    isDir: false,
    coverArt: String(s.id),
    type: 'music',
    suffix: (s.filePath || '').split('.').pop() || 'mp3',
  }
}

// --- Route table ---

const routes: Record<string, Handler> = {
  '/rest/ping.view': handlePing,
  '/rest/ping': handlePing,
  '/rest/getLicense.view': handlePing,
  '/rest/getLicense': handlePing,
  '/rest/getUser.view': handleGetUser,
  '/rest/getUser': handleGetUser,
  '/rest/getMusicFolders.view': handleGetMusicFolders,
  '/rest/getMusicFolders': handleGetMusicFolders,
  '/rest/getArtists.view': handleGetArtists,
  '/rest/getArtists': handleGetArtists,
  '/rest/getAlbumList2.view': handleGetAlbumList2,
  '/rest/getAlbumList2': handleGetAlbumList2,
  '/rest/search3.view': handleSearch3,
  '/rest/search3': handleSearch3,
  '/rest/stream.view': handleStream,
  '/rest/stream': handleStream,
  '/rest/download.view': handleStream,
  '/rest/download': handleStream,
  '/rest/getCoverArt.view': handleGetCoverArt,
  '/rest/getCoverArt': handleGetCoverArt,
  '/rest/getPlaylists.view': handleGetPlaylists,
  '/rest/getPlaylists': handleGetPlaylists,
  '/rest/getPlaylist.view': handleGetPlaylist,
  '/rest/getPlaylist': handleGetPlaylist,
  '/rest/getRandomSongs.view': handleGetRandomSongs,
  '/rest/getRandomSongs': handleGetRandomSongs,
}

// --- Server config management (exposed via normal auth routes) ---

const handleGetServerConfig: Handler = async (_req, _query) => {
  const config = await getServerConfig()
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: config.enabled, username: config.username })
  }
}

const handleSetServerConfig: Handler = async (req, _query) => {
  const body = req.body ? (typeof req.body === 'string' ? req.body : new TextDecoder().decode(req.body)) : '{}'
  const data = JSON.parse(body) as Partial<ServerConfig>
  const config = await getServerConfig()
  if (data.enabled !== undefined) config.enabled = data.enabled
  if (data.username) config.username = data.username
  if (data.password) config.password = data.password
  await saveServerConfig(config)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: config.enabled, username: config.username })
  }
}

export async function handleServerRoute(req: HTTPRequest): Promise<HTTPResponse | null> {
  const path = req.path
  const query = new URLSearchParams(req.query)

  // 服务端配置管理（走正常 JWT 认证路由）
  if (path === '/server/config') {
    if (req.method === 'GET') return handleGetServerConfig(req, query)
    if (req.method === 'PUT' || req.method === 'POST') return handleSetServerConfig(req, query)
  }

  // Subsonic REST API 路由
  const handler = routes[path]
  if (!handler) return null

  // Subsonic 认证验证
  if (!await validateAuth(query)) {
    return authError(query)
  }

  return handler(req, query)
}
