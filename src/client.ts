// global songloft
import { SubsonicConfig } from './config'

function stringToHex(str: string): string {
  // Simple UTF-8 to Hex
  let hex = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 128) {
      hex += code.toString(16).padStart(2, '0')
    } else {
      hex += encodeURIComponent(str.charAt(i)).replace(/%/g, '').toLowerCase()
    }
  }
  return hex
}

function buildUrl(config: SubsonicConfig, endpoint: string, params: Record<string, string> = {}): string {
  const url = config.url.replace(/\/$/, '')
  const qs: string[] = []
  
  qs.push(`u=${encodeURIComponent(config.username)}`)
  
  if (config.token && config.salt) {
    qs.push(`t=${encodeURIComponent(config.token)}`)
    qs.push(`s=${encodeURIComponent(config.salt)}`)
  } else if (config.password) {
    qs.push(`p=enc:${stringToHex(config.password)}`) // Hex encoded password
  }
  
  qs.push(`v=${encodeURIComponent(config.version || '1.16.1')}`)
  qs.push(`c=songloft`)
  qs.push(`f=json`)
  
  for (const [k, v] of Object.entries(params)) {
    qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  }
  
  return `${url}/rest/${endpoint}?${qs.join('&')}`
}

export async function ping(config: SubsonicConfig): Promise<boolean> {
  const res = await fetch(buildUrl(config, 'ping'))
  if (!res.ok) {
    throw new Error(`HTTP Error: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    const err = data['subsonic-response']?.error
    if (err) {
      throw new Error(`API Error [${err.code}]: ${err.message}`)
    }
    throw new Error('API Error: Unknown status failed')
  }
  return true
}

export async function getIndexes(config: SubsonicConfig): Promise<any[]> {
  const res = await fetch(buildUrl(config, 'getIndexes'))
  if (!res.ok) throw new Error('Failed to get indexes')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  
  const indexes = data['subsonic-response'].indexes?.index || []
  const artists: any[] = []
  
  // Flatten artists from alphabetical index
  for (const idx of indexes) {
    if (idx.artist && Array.isArray(idx.artist)) {
      artists.push(...idx.artist)
    } else if (idx.artist) {
      artists.push(idx.artist)
    }
  }
  
  return artists
}

export async function getMusicDirectory(config: SubsonicConfig, id: string): Promise<any[]> {
  const res = await fetch(buildUrl(config, 'getMusicDirectory', { id }))
  if (!res.ok) throw new Error('Failed to get directory')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  
  const dir = data['subsonic-response'].directory
  if (!dir || !dir.child) return []
  return Array.isArray(dir.child) ? dir.child : [dir.child]
}

export function getStreamUrl(config: SubsonicConfig, id: string): string {
  return buildUrl(config, 'stream', { id })
}

export async function searchSongs(config: SubsonicConfig, keyword: string, page: number = 1, pageSize: number = 20): Promise<any[]> {
  const params: Record<string, string> = {
    query: keyword,
    songCount: String(pageSize),
    songOffset: String((page - 1) * pageSize)
  }
  const res = await fetch(buildUrl(config, 'search3', params))
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  
  const songs = data['subsonic-response'].searchResult3?.song || []
  return Array.isArray(songs) ? songs : [songs]
}
