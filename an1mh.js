// HentaiSaturn - Sora module (asyncJS: true)
// Strategy: HentaiSaturn's /hentailist?search= is broken (redirects unpredictably
// to /hentailist or /hentailist?letter=...), so we bypass it. We fetch the letter
// page corresponding to the first character of the keyword and filter client-side.

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

// Match any anchor to /hentai/... containing an <img> with a /locandine/ src.
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

function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function pickLetter(keyword) {
  const trimmed = keyword.trim();
  if (!trimmed) return null;
  const ch = trimmed.charAt(0).toUpperCase();
  if (/[A-Z]/.test(ch)) return ch;
  if (/[0-9]/.test(ch)) return "0-9";
  return ".";
}

// Tokens with at least 3 characters, used for multi-word fuzzy matching.
function significantTokens(keyword) {
  return keyword
    .toLowerCase()
    .split(/[\s\-_:,.!?]+/)
    .map(t => normalize(t))
    .filter(t => t.length >= 3);
}

function fuzzyMatch(title, keyword, tokens) {
  const nt = normalize(title);
  const nk = normalize(keyword);
  if (!nt || !nk) return false;
  // 1) Whole normalized keyword is a substring of the title (best match).
  if (nt.includes(nk)) return true;
  // 2) Multi-word: at least half of the significant tokens must appear.
  if (tokens.length >= 2) {
    const hits = tokens.filter(t => nt.includes(t)).length;
    return hits >= Math.max(2, Math.ceil(tokens.length / 2));
  }
  // 3) Single-token: must be a prefix of (or contained in) the title.
  if (tokens.length === 1) {
    return nt.includes(tokens[0]);
  }
  return false;
}

// ---- Sora entry points ----

async function searchResults(keyword) {
  try {
    if (!keyword || !keyword.trim()) return JSON.stringify([]);

    const letter = pickLetter(keyword);
    if (!letter) return JSON.stringify([]);

    const response = await soraFetch(`${BASE_URL}/hentailist?letter=${encodeURIComponent(letter)}`);
    const html = await response.text();
    const allCards = parseAnimeCards(html);

    const tokens = significantTokens(keyword);
    let matched = allCards.filter(c => fuzzyMatch(c.title, keyword, tokens));

    // Final guard: never return random/unfiltered cards. If no fuzzy match,
    // return empty so Sora knows this source has no match.
    return JSON.stringify(matched);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    if (!/hentaisaturn\.tv\/hentai\//i.test(url)) {
      return JSON.stringify([{ description: "URL non valida.", aliases: "", airdate: "" }]);
    }

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
    if (!/hentaisaturn\.tv\/hentai\//i.test(url)) return JSON.stringify([]);

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
    /file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /source:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /src:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.m3u8[^"'>]*)["']/i,
    /(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i,
    /file:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
    /<source[^>]+src=["'](https?:\/\/[^"'>]+\.mp4[^"'>]*)["']/i,
    /(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i
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
