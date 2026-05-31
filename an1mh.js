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
 
// Match any anchor pointing to /hentai/... that contains an <img> with a /locandine/ src.
// Class names vary, so we don't hard-code them.
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
 
// Normalize a string for fuzzy comparison (lowercase, strip non-alphanumeric)
function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
 
// Heuristic: a real search-results page contains the "Hai cercato ... hai trovato N risultati"
// banner. A fallback (letter listing) does not. If the page IS a results page but the
// reported count is suspicious (≥100) for a multi-word query, it's likely a no-match fallback.
function looksLikeRealSearch(html) {
  return /Hai\s+cercato/i.test(html) && /hai\s+trovato\s*<b>\s*\d+/i.test(html.replace(/\*\*/g, "<b>"));
}
 
// ---- Sora entry points ----
 
async function searchResults(keyword) {
  try {
    const response = await soraFetch(`${BASE_URL}/hentailist?search=${encodeURIComponent(keyword)}`);
    const html = await response.text();
 
    let cards = parseAnimeCards(html);
 
    // Safety filter: if the page does NOT look like a real search result
    // (site redirected to a letter page), drop everything.
    if (!/Hai\s+cercato/i.test(html)) {
      return JSON.stringify([]);
    }
 
    // Secondary filter: keep only cards whose title fuzzy-matches the keyword.
    // This protects against the site returning broad matches.
    const nk = normalize(keyword);
    if (nk.length >= 3) {
      const tokens = keyword.toLowerCase().split(/\s+/).map(t => normalize(t)).filter(t => t.length >= 3);
      const filtered = cards.filter(c => {
        const nt = normalize(c.title);
        if (nt.includes(nk)) return true;                     // full keyword present
        if (tokens.length > 1 && tokens.every(t => nt.includes(t))) return true; // all words present
        return false;
      });
      // If fuzzy filtering wipes everything but the site DID say it found results,
      // trust the site (different romanization, alt titles, etc.) — return original.
      if (filtered.length > 0) cards = filtered;
    }
 
    return JSON.stringify(cards);
  } catch (e) {
    return JSON.stringify([]);
  }
}
 
async function extractDetails(url) {
  try {
    const response = await soraFetch(url);
    const html = await response.text();
 
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
    // If Sora passed a non-HentaiSaturn URL (e.g. an AniList fallback), bail out cleanly.
    if (!/hentaisaturn\.tv\/hentai\//i.test(url)) {
      return JSON.stringify([]);
    }
 
    const response = await soraFetch(url);
    const html = await response.text();
 
    const results = [];
    const seen = new Set();
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
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,           // jwplayer file:
    /source:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,         // plyr / other
    /src:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,            // generic
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.m3u8[^"'>]*)["']/i, // <source> hls
    /(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i,                   // bare m3u8
    /file:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,            // jwplayer mp4
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.mp4[^"'>]*)["']/i, // <source> mp4
    /(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i                     // bare mp4
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return null;
}
 
async function extractStreamUrl(url) {
  try {
    if (!/hentaisaturn\.tv\/episode\//i.test(url)) return null;
 
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
