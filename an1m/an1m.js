// AnimeSaturn - Sora module (asyncJS: true)
// Entry points: searchResults, extractDetails, extractEpisodes, extractStreamUrl
// NOTE: extractStreamUrl returns a PLAIN URL STRING (or null) — the app parses it
// as a stream URL, NOT as JSON. Returning an object/array causes "could not parse".

const BASE_URL = "https://www.animesaturn.cx";

// Proven fetch helper (same signature as the working modules in this repo)
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

// FIX: uso new RegExp() per evitare problemi di parsing del literal nel JS engine di Shirox
const ANIME_CARD_REGEX = new RegExp(
  '<a href="(https://www\\.animesaturn\\.cx/anime/[^"]+)"[^>]*class="thumb image-wrapper">\\s*<img src="(https://cdn\\.animesaturn\\.cx/static/images/copertine/[^"]+)"[^>]*alt="([^"]+)"',
  'g'
);

function parseAnimeCards(html) {
  const results = [];
  const seen = new Set();
  let match;
  ANIME_CARD_REGEX.lastIndex = 0;
  while ((match = ANIME_CARD_REGEX.exec(html)) !== null) {
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
    const response = await soraFetch(`${BASE_URL}/animelist?search=${encodeURIComponent(keyword)}`);
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
    const episodeRegex = /<a\s+href="(https:\/\/www\.animesaturn\.cx\/ep\/[^"]+)"\s*target="_blank"\s*class="btn btn-dark mb-1 bottone-ep">\s*Episodio\s+(\d+)\s*<\/a>/gs;
    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
      results.push({ href: match[1].trim(), number: parseInt(match[2], 10) });
    }
    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}

// Pull a playable URL out of the watch-page HTML (m3u8 preferred, then mp4)
function findStreamUrl(html) {
  const patterns = [
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,            // jwplayer file:
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.m3u8[^"'>]*)["']/i, // <source> hls
    /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i,                        // bare m3u8
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.mp4[^"'>]*)["']/i,  // <source> mp4
    /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i                          // bare mp4
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

async function extractStreamUrl(url) {
  try {
    // url = episode page (/ep/...). Find the "Guarda lo streaming" watch link.
    const epResponse = await soraFetch(url);
    const epHtml = await epResponse.text();

    const watchMatch = epHtml.match(/((?:https:\/\/www\.animesaturn\.cx)?\/watch\?file=[^"'\s]+)/);
    if (!watchMatch) return null;

    let watchUrl = watchMatch[1].trim();
    if (watchUrl.startsWith("/")) watchUrl = BASE_URL + watchUrl;

    // Watch page often needs the episode page as Referer
    const watchResponse = await soraFetch(watchUrl, { headers: { "Referer": url }, method: "GET", body: null });
    const watchHtml = await watchResponse.text();

    return findStreamUrl(watchHtml); // plain string URL, or null
  } catch (e) {
    return null;
  }
}