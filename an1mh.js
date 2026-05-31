// HentaiSaturn - Sora module (asyncJS: true)
  // Entry points: searchResults, extractDetails, extractEpisodes, extractStreamUrl
  // NOTE: extractStreamUrl returns a PLAIN URL STRING (or null) — the app parses it
  // as a stream URL, NOT as JSON. Returning an object/array causes "could not parse".

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
  
  // FIX: rimossa class="thumb image-wrapper" + CDN corretto da .cx a .tv
  const ANIME_CARD_REGEX = /<a href="(https:\/\/www\.hentaisaturn\.tv\/hentai\/[^"]+)"[^>]*>\s*<img 
  src="(https:\/\/[^"]+)"[^>]*alt="([^"]+)"/g;

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
      const descriptionMatch = html.match(/<div[^>]+id="shown-trama"[^>]*>([\s\S]*?)<\/div>/i);
      const description = descriptionMatch
        ? descriptionMatch[1].replace(/<[^>]+>/g, "").trim()
        : "Nessuna descrizione disponibile.";
      return JSON.stringify([{
        description: description,
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
      const episodeRegex = /<a\s+href="(https:\/\/www\.hentaisaturn\.tv\/episode\/[^"]+)"\s*target="_blank"\s*class="btn
  btn-dark mb-1 bottone-ep">\s*Episodio\s+(\d+)\s*<\/a>/gs;
      let match;
      while ((match = episodeRegex.exec(html)) !== null) {
        results.push({ href: match[1].trim(), number: parseInt(match[2], 10) });
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

      const watchMatch = epHtml.match(/((?:https:\/\/www\.hentaisaturn\.tv)?\/watch\?file=[^"'\s]+)/);
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
