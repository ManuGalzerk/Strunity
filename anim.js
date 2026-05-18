const SOURCE = {
  id: "animesaturn",
  name: "AnimeSaturn",
  baseUrl: "https://www.animesaturn.cx",
  language: "it",
  version: "2.0.0",
  iconUrl: "https://www.animesaturn.cx/favicon.ico",
  contentKind: "anime"
};

const ANIME_CARD_REGEX = /<a href="(https:\/\/www\.animesaturn\.cx\/anime\/[^"]+)"[^>]*class="thumb image-wrapper">\s*<img src="(https:\/\/cdn\.animesaturn\.cx\/static\/images\/copertine\/[^"]+)"[^>]*alt="([^"]+)"/g;

function parseAnimeCards(html) {
  const results = [];
  const seen = new Set();
  let match;
  ANIME_CARD_REGEX.lastIndex = 0;
  while ((match = ANIME_CARD_REGEX.exec(html)) !== null) {
    const id = match[1].trim();
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({
      id,
      title: match[3].trim(),
      imageUrl: match[2].trim(),
      type: "video"
    });
  }
  return results;
}

async function fetchPopular(page) {
  const response = await fetchv2(`${SOURCE.baseUrl}/top-anime`);
  const html = await response.text();
  return parseAnimeCards(html);
}

async function fetchLatest(page) {
  const response = await fetchv2(`${SOURCE.baseUrl}/`);
  const html = await response.text();
  return parseAnimeCards(html);
}

async function fetchSearch(query, page, filters) {
  const response = await fetchv2(`${SOURCE.baseUrl}/animelist?search=${encodeURIComponent(query)}`);
  const html = await response.text();
  return parseAnimeCards(html);
}

async function fetchItemDetails(id) {
  const response = await fetchv2(id);
  const html = await response.text();

  const descriptionMatch = html.match(/<div id="shown-trama">([^<]+)<\/div>/);
  const titleMatch = html.match(/<b[^>]*>\s*([^<]+?)\s*<\/b>/);
  const imageMatch = html.match(/<img[^>]+src="(https:\/\/cdn\.animesaturn\.cx\/static\/images\/copertine\/[^"]+)"/);

  return {
    id,
    title: titleMatch ? titleMatch[1].trim() : "",
    description: descriptionMatch ? descriptionMatch[1].trim() : "",
    imageUrl: imageMatch ? imageMatch[1].trim() : "",
    genres: [],
    status: "unknown",
    type: "video"
  };
}

async function fetchChildren(itemId) {
  const response = await fetchv2(itemId);
  const html = await response.text();

  const results = [];
  const episodeRegex = /<a\s+href="(https:\/\/www\.animesaturn\.cx\/ep\/[^"]+)"\s*target="_blank"\s*class="btn btn-dark mb-1 bottone-ep">\s*Episodio\s+(\d+)\s*<\/a>/gs;

  let match;
  while ((match = episodeRegex.exec(html)) !== null) {
    const number = parseInt(match[2], 10);
    results.push({
      id: match[1].trim(),
      number,
      title: `Episodio ${number}`
    });
  }

  return results;
}

async function fetchVideoList(itemId, c
