// HentaiSaturn - Sora module (asyncJS: true)
// Entry points: searchResults, extractDetails, extractEpisodes, extractStreamUrl
// extractStreamUrl returns a PLAIN URL STRING (or null).
 
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
 
// HentaiSaturn card markup: any <a href=".../hentai/..."> containing an
// <img src=".../locandine/..." alt="...">. Class names vary, so don't hard-code them.
const CARD_REGEX = /<a[^>]+href="(https?:\/\/www\.hentaisaturn\.tv\/hentai\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/cdn\.hentaisaturn\.tv\/static\/images\/locandine\/[^"]+)"[^>]*\balt="([^"]+)"/g;
 
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
 
    // Prefer the in-page "trama" block; fall back to the <meta description>.
    let description = "";
    const tramaMatch = html.match(/<div id="shown-trama">([\s\S]*?)<\/div>/);
    if (tramaMatch) {
      description = tramaMatch[1].replace(/<[^>]+>/g, "").trim();
    }
    if (!description) {
      const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
      if (metaMatch) description = metaMatch[1].trim();
    }
 
    return JSON.stringify([{
      description: description || "Nessuna descrizione disponibile.",
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
    const seen = new Set();
    // Match any anchor pointing to /episode/... whose link text is "Episodio N".
    const episodeRegex = /<a[^>]+href="(https?:\/\/www\.hentaisaturn\.tv\/episode\/[^"]+)"[^>]*>\s*Episodio\s+(\d+)\s*<\/a>/gi;
    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
      const href = match[1].trim();
      if (seen.has(href)) continue;
      seen.add(href);
      results.push({ href: href, number: parseInt(match[2], 10) });
    }
    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}
 
function findStreamUrl(html) {
  const patterns = [
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.m3u8[^"'>]*)["']/i,
    /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i,
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.mp4[^"'>]*)["']/i,
    /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return null;
}
 
async function extractStreamUrl(url) {
  try {
    const epResponse = await soraFetch(url);
    const epHtml = await epResponse.text();
 
    const watchMatch = epHtml.match(/((?:https?:\/\/www\.hentaisaturn\.tv)?\/watch\?file=[^"'\s]+)/);
    if (!watchMatch) return null;
 
    let watchUrl = watchMatch[1].trim();
    if (watchUrl.startsWith("/")) watchUrl = BASE_URL + watchUrl;
 
    const watchResponse = await soraFetch(watchUrl, { headers: { "Referer": url }, method: "GET", body: null });
    const watchHtml = await watchResponse.text();
 
    return findStreamUrl(watchHtml);
  } catch (e) {
    return null;
  }
}
