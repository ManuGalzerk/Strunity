mh · JS
// HentaiSaturn - Sora module (asyncJS: true)
// Mirrors the AnimeSaturn module structure (same codebase, same markup conventions).
// The only meaningful difference is the watch page: HentaiSaturn's primary player
// loads the video via JavaScript so the stream URL isn't in the HTML — we use the
// alternative player (&s=alt) which exposes the direct URL in plain HTML.
 
const BASE_URL = "https://www.hentaisaturn.tv";
 
async function soraFetch(url, options = { headers: {}, method: "GET", body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? "GET", options.body ?? null);
  } catch (e) {
    try {
      return await fetch(url, options);
    } catch (error) {
      return null;
    }
  }
}
 
// Strict card regex matching the same structure as the working AnimeSaturn module:
// <a href=".../hentai/..." class="thumb image-wrapper">
//   <img src=".../locandine/..." alt="Title">
// This class only appears on actual result cards, so fallback/archive pages won't match.
const CARD_REGEX = /<a href="(https:\/\/www\.hentaisaturn\.tv\/hentai\/[^"]+)"[^>]*class="thumb image-wrapper">\s*<img src="(https:\/\/cdn\.hentaisaturn\.tv\/static\/images\/locandine\/[^"]+)"[^>]*alt="([^"]+)"/g;
 
function parseAnimeCards(html) {
  const results = [];
  const seen = new Set();
  let match;
  CARD_REGEX.lastIndex = 0;
  while ((match = CARD_REGEX.exec(html)) !== null) {
    const href = match[1].trim();
    if (seen.has(href)) continue;
    seen.add(href);
    results.push({ title: match[3].trim(), image: match[2].trim(), href: href });
  }
  return results;
}
 
// ---- Sora entry points ----
 
async function searchResults(keyword) {
  try {
    const response = await soraFetch(`${BASE_URL}/hentailist?search=${encodeURIComponent(keyword)}`);
    const html = await response.text();
    return JSON.stringify(parseAnimeCards(html));
  } catch (e) {
    return JSON.stringify([]);
  }
}
 
async function extractDetails(url) {
  try {
    const response = await soraFetch(url);
    const html = await response.text();
    const descriptionMatch = html.match(/<div id="shown-trama">([^<]+)<\/div>/);
    return JSON.stringify([{
      description: descriptionMatch ? descriptionMatch[1].trim() : "Nessuna descrizione disponibile.",
      aliases: "",
      airdate: ""
    }]);
  } catch (e) {
    return JSON.stringify([{ description: "Errore nel caricamento dei dettagli.", aliases: "", airdate: "" }]);
  }
}
 
async function extractEpisodes(url) {
  try {
    const response = await soraFetch(url);
    const html = await response.text();
    const results = [];
    // Episode URL pattern on HentaiSaturn is /episode/ (vs /ep/ on AnimeSaturn)
    const episodeRegex = /<a\s+href="(https:\/\/www\.hentaisaturn\.tv\/episode\/[^"]+)"\s*target="_blank"\s*class="btn btn-dark mb-1 bottone-ep">\s*Episodio\s+(\d+)\s*<\/a>/gs;
    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
      results.push({ href: match[1].trim(), number: parseInt(match[2], 10) });
    }
    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}
 
// Pull a playable URL out of the watch-page HTML.
// On the &s=alt player it's a plain <a href="...mp4">; on JS players it's various inline patterns.
function findStreamUrl(html) {
  const patterns = [
    /<a[^>]+href=["'](https?:\/\/[^"'<>]+\.mp4[^"'<>]*)["']/i,    // anchor in &s=alt page
    /<a[^>]+href=["'](https?:\/\/[^"'<>]+\.m3u8[^"'<>]*)["']/i,
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,            // jwplayer hls
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.m3u8[^"'>]*)["']/i,
    /(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i,                    // bare m3u8
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.mp4[^"'>]*)["']/i,
    /(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i                      // bare mp4
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return null;
}
 
async function extractStreamUrl(url) {
  try {
    // url = episode page. Find the "Guarda lo streaming" watch link.
    const epResponse = await soraFetch(url);
    const epHtml = await epResponse.text();
 
    const watchMatch = epHtml.match(/((?:https:\/\/www\.hentaisaturn\.tv)?\/watch\?file=[^"'\s]+)/);
    if (!watchMatch) return null;
 
    let watchUrl = watchMatch[1].trim();
    if (watchUrl.startsWith("/")) watchUrl = BASE_URL + watchUrl;
 
    // Primary player loads via JS — switch to the alt player which exposes
    // the direct URL as a plain <a href="...mp4"> in the HTML.
    const altUrl = watchUrl + (watchUrl.includes("?") ? "&s=alt" : "?s=alt");
 
    const altResponse = await soraFetch(altUrl, { headers: { "Referer": url }, method: "GET", body: null });
    if (altResponse) {
      const altHtml = await altResponse.text();
      const altStream = findStreamUrl(altHtml);
      if (altStream) return altStream;
    }
 
    // Fallback to primary player in case alt isn't available for some episodes.
    const primResponse = await soraFetch(watchUrl, { headers: { "Referer": url }, method: "GET", body: null });
    if (primResponse) {
      const primHtml = await primResponse.text();
      return findStreamUrl(primHtml);
    }
 
    return null;
  } catch (e) {
    return null;
  }
}
 
