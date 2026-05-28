// AnimeSaturn - Sora module (asyncJS: true)
// Entry points: searchResults, extractDetails, extractEpisodes, extractStreamUrl

const BASE_URL = "https://www.animesaturn.cx";

// Sora provides fetchv2; fall back to fetch in other environments
const _fetch = typeof fetchv2 !== "undefined" ? fetchv2 : fetch;

const ANIME_CARD_REGEX = /<a href="(https:\/\/www\.animesaturn\.cx\/anime\/[^"]+)"[^>]*class="thumb image-wrapper">\s*<img src="(https:\/\/cdn\.animesaturn\.cx\/static\/images\/copertine\/[^"]+)"[^>]*alt="([^"]+)"/g;

function parseAnimeCards(html) {
  const results = [];
  const seen = new Set();
  let match;
  ANIME_CARD_REGEX.lastIndex = 0;
  while ((match = ANIME_CARD_REGEX.exec(html)) !== null) {
    const href = match[1].trim();
    if (seen.has(href)) continue;
    seen.add(href);
    results.push({
      title: match[3].trim(),
      image: match[2].trim(),
      href: href
    });
  }
  return results;
}

// ---- Sora entry points ----

async function searchResults(keyword) {
  try {
    const response = await _fetch(`${BASE_URL}/animelist?search=${encodeURIComponent(keyword)}`);
    const html = await response.text();
    return JSON.stringify(parseAnimeCards(html));
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const response = await _fetch(url);
    const html = await response.text();

    const descriptionMatch = html.match(/<div id="shown-trama">([^<]+)<\/div>/);

    return JSON.stringify([{
      description: descriptionMatch ? descriptionMatch[1].trim() : "Nessuna descrizione disponibile.",
      aliases: "",
      airdate: ""
    }]);
  } catch (e) {
    return JSON.stringify([{
      description: "Errore nel caricamento dei dettagli.",
      aliases: "",
      airdate: ""
    }]);
  }
}

async function extractEpisodes(url) {
  try {
    const response = await _fetch(url);
    const html = await response.text();

    const results = [];
    const episodeRegex = /<a\s+href="(https:\/\/www\.animesaturn\.cx\/ep\/[^"]+)"\s*target="_blank"\s*class="btn btn-dark mb-1 bottone-ep">\s*Episodio\s+(\d+)\s*<\/a>/gs;

    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
      results.push({
        href: match[1].trim(),
        number: parseInt(match[2], 10)
      });
    }

    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}

// Helper: pull the playable URL out of the watch page HTML
function findStreamUrl(html) {
  const patterns = [
    // jwplayer: file: "https://...m3u8?query"
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    // sources: [{ file: "https://..." }]
    /sources?\s*:\s*\[\s*\{[^}]*?(?:file|src)\s*:\s*["'](https?:\/\/[^"']+)["']/i,
    // <source src="https://...mp4">
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.mp4[^"'>]*)["']/i,
    // bare m3u8 anywhere
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    // bare mp4 anywhere
    /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

async function extractStreamUrl(url) {
  try {
    const response = await _fetch(url);
    const html = await response.text();

    // Find the /watch?file=... link (absolute or relative)
    const watchMatch = html.match(/((?:https:\/\/www\.animesaturn\.cx)?\/watch\?file=[^"'\s]+)/);
    if (!watchMatch) {
      return JSON.stringify({ streams: [], subtitles: [] });
    }

    let watchUrl = watchMatch[1].trim();
    if (watchUrl.startsWith("/")) watchUrl = BASE_URL + watchUrl;

    const responseTwo = await _fetch(watchUrl);
    const htmlTwo = await responseTwo.text();

    const streamUrl = findStreamUrl(htmlTwo);
    if (!streamUrl) {
      return JSON.stringify({ streams: [], subtitles: [] });
    }

    return JSON.stringify({
      streams: [
        {
          title: "AnimeSaturn",
          streamUrl: streamUrl,
          headers: { "Referer": BASE_URL + "/" }
        }
      ],
      subtitles: []
    });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: [] });
  }
}
