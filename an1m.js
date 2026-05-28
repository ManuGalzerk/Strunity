// AnimeSaturn - Sora module (asyncJS: true)
// Entry points required by Sora: searchResults, extractDetails, extractEpisodes, extractStreamUrl

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

async function extractStreamUrl(url) {
  try {
    const response = await _fetch(url);
    const html = await response.text();

    const match = html.match(/<a href="(https:\/\/www\.animesaturn\.cx\/watch\?file=[^"]+)"/);
    if (!match) return null;

    const responseTwo = await _fetch(match[1]);
    const htmlTwo = await responseTwo.text();

    const hlsMatch = htmlTwo.match(/file:\s*"(https:\/\/[^"]+\.m3u8)"/);
    if (hlsMatch) return hlsMatch[1].trim();

    const mp4Match = htmlTwo.match(/<source[^>]+src="(https:\/\/[^">]+\.mp4)"/);
    if (mp4Match) return mp4Match[1].trim();

    return null;
  } catch (e) {
    return null;
  }
}
