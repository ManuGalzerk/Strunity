const SOURCE = {
  id: "animesaturn",
  name: "AnimeSaturn",
  baseUrl: "https://www.animesaturn.cx",
  language: "it",
  version: "1.0.0",
  iconUrl: "https://www.animesaturn.cx/favicon.ico",
  contentKind: "anime"
};

async function fetchPopular(page) {
  return [];
}

async function fetchLatest(page) {
  return [];
}

async function fetchSearch(query, page, filters) {
  const response = await fetchv2(`${SOURCE.baseUrl}/animelist?search=${encodeURIComponent(query)}`);
  const html = await response.text();

  const results = [];
  const regex = /<a href="(https:\/\/www\.animesaturn\.cx\/anime\/[^"]+)"[^>]*class="thumb image-wrapper">\s*<img src="(https:\/\/cdn\.animesaturn\.cx\/static\/images\/copertine\/[^"]+)"[^>]*alt="([^"]+)"/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push({
      id: match[1].trim(),
      title: match[3].trim(),
      imageUrl: match[2].trim()
    });
  }

  return results;
}

async function fetchItemDetails(id) {
  const response = await fetchv2(id);
  const html = await response.text();

  const descriptionRegex = /<div id="shown-trama">([^<]+)<\/div>/;
  const descriptionMatch = html.match(descriptionRegex);
  const description = descriptionMatch ? descriptionMatch[1].trim() : "";

  const titleRegex = /<b[^>]*>\s*([^<]+?)\s*<\/b>/;
  const titleMatch = html.match(titleRegex);

  const imageRegex = /<img[^>]+src="(https:\/\/cdn\.animesaturn\.cx\/static\/images\/copertine\/[^"]+)"/;
  const imageMatch = html.match(imageRegex);

  return {
    id,
    title: titleMatch ? titleMatch[1].trim() : "",
    description,
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

async function fetchVideoList(itemId, childId) {
  const response = await fetchv2(childId);
  const html = await response.text();

  const streamUrlRegex = /<a href="(https:\/\/www\.animesaturn\.cx\/watch\?file=[^"]+)"/;
  const match = html.match(streamUrlRegex);
  if (!match) return [];

  const redirect = match[1];
  const responseTwo = await fetchv2(redirect);
  const htmlTwo = await responseTwo.text();

  const hlsUrlRegex = /file:\s*"(https:\/\/[^"]+\.m3u8)"/;
  const hlsMatch = htmlTwo.match(hlsUrlRegex);
  if (hlsMatch) {
    const url = hlsMatch[1].trim();
    return [{ url, quality: "default", originalUrl: url }];
  }

  const mp4UrlRegex = /<source[^>]+src="(https:\/\/[^">]+\.mp4)"/;
  const mp4Match = htmlTwo.match(mp4UrlRegex);
  if (mp4Match) {
    const url = mp4Match[1].trim();
    return [{ url, quality: "default", originalUrl: url }];
  }

  return [];
}
