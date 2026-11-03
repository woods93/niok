#!/usr/bin/env node
// Builds src/_data/episodes.json from the show's YouTube channel feed and, when set,
// the podcast's RSS feed. If a feed cannot be read, the previous data stays in place.

import fs from 'node:fs';
import path from 'node:path';
import Parser from 'rss-parser';
import { readJson, writeJson, decodeEntities, stripHtml } from './lib/util.mjs';

const ROOT = process.cwd();
const cfg = readJson(process.env.EPISODES_CONFIG || path.join(ROOT, 'config', 'episodes.json'), {});
const OUT = path.join(ROOT, 'src', '_data', 'episodes.json');
const prev = readJson(OUT, { videos: [], podcast: [] });

const parser = new Parser({
  timeout: 20000,
  headers: { 'User-Agent': 'NashvilleIOnceKnewReader/1.0' },
  customFields: {
    item: ['yt:videoId', ['media:group', 'mediaGroup'], ['itunes:duration', 'duration'], ['itunes:image', 'itunesImage']]
  }
});

async function load(url) {
  if (url.startsWith('file:')) return parser.parseString(fs.readFileSync(path.resolve(ROOT, url.slice(5)), 'utf8'));
  return parser.parseURL(url);
}

const short = (s, n = 260) => {
  const t = stripHtml(s || '');
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ') > 120 ? cut.lastIndexOf(' ') : n).replace(/[\s,;:.\-]+$/, '') + '…';
};

async function youtube() {
  if (!cfg.youtubeChannelId) return prev.videos || [];
  const url = cfg.youtubeFeedUrl || `https://www.youtube.com/feeds/videos.xml?channel_id=${cfg.youtubeChannelId}`;
  try {
    const feed = await load(url);
    const videos = [];
    for (const it of feed.items || []) {
      const id = it['yt:videoId'] || (/yt:video:([\w-]{11})/.exec(it.id || '') || [])[1];
      if (!id) continue;
      const g = it.mediaGroup || {};
      const desc = Array.isArray(g['media:description']) ? g['media:description'][0] : '';
      videos.push({
        id,
        title: decodeEntities(it.title || '').trim(),
        url: `https://www.youtube.com/watch?v=${id}`,
        published: new Date(it.isoDate || it.pubDate || Date.now()).toISOString(),
        description: short(desc),
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      });
    }
    videos.sort((a, b) => b.published.localeCompare(a.published));
    console.log(`ok      YouTube: ${videos.length} videos`);
    return videos.slice(0, cfg.maxVideos || 30);
  } catch (e) {
    console.warn(`FAILED  YouTube feed: ${String(e.message || e).slice(0, 200)} (keeping previous)`);
    return prev.videos || [];
  }
}

async function podcast() {
  if (!cfg.podcastFeed) return [];
  try {
    const feed = await load(cfg.podcastFeed);
    const eps = [];
    for (const it of feed.items || []) {
      const audio = it.enclosure && /audio|mpeg|mp3|m4a/i.test((it.enclosure.type || '') + (it.enclosure.url || '')) ? it.enclosure.url : '';
      eps.push({
        title: decodeEntities(it.title || '').trim(),
        url: it.link || '',
        audio: /^https:/i.test(audio) ? audio : audio.replace(/^http:/i, 'https:'),
        published: new Date(it.isoDate || it.pubDate || Date.now()).toISOString(),
        duration: it.duration || '',
        description: short(it.contentSnippet || it.content || it.summary || '')
      });
    }
    eps.sort((a, b) => b.published.localeCompare(a.published));
    console.log(`ok      Podcast feed: ${eps.length} episodes`);
    return eps.slice(0, cfg.maxPodcastEpisodes || 30);
  } catch (e) {
    console.warn(`FAILED  Podcast feed: ${String(e.message || e).slice(0, 200)} (keeping previous)`);
    return prev.podcast || [];
  }
}

const out = {
  updatedAt: new Date().toISOString(),
  channelUrl: cfg.youtubeChannelUrl || '',
  links: cfg.listenLinks || [],
  videos: await youtube(),
  podcast: await podcast()
};
writeJson(OUT, out);
