const cheerio = require('cheerio');
const axios = require('axios');

const BASE_URL = 'https://cimanow.cc';
const NAME = 'CimaNow';

// Helper function to extract numbers from text
const getIntFromText = (text) => {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
};

// Parse search result element to meta
const parseSearchResult = ($, element) => {
  const $el = $(element);
  const url = $el.attr('href');
  if (!url) return null;

  // Skip episodes and expired content
  if ($el.find('li[aria-label="episode"]').length > 0) return null;
  if (url.match(/expired-download|افلام-اون-لاين/)) return null;

  const posterUrl = $el.find('img').attr('data-src') || '';
  let title = $el.find('li[aria-label="title"]').html() || '';
  title = title.replace(/ <em>.*|\n/g, '').replace('&nbsp;', '');
  
  const year = $el.find('li[aria-label="year"]').text();
  const isMovie = url.match(/فيلم|مسرحية|حفلات/);
  
  // Check quality
  const quality = $el.find('li[aria-label="ribbon"]').first().text()
    .replace(/ |-|1080|720/g, '').trim();
  
  // Check for dubbed content
  const ribbons = $el.find('li[aria-label="ribbon"]');
  const isDubbed = ribbons.text().includes('مدبلج');
  if (isDubbed) {
    title = `${title} (مدبلج)`;
  }

  // Add season info if exists
  const seasonText = $el.find('li[aria-label="ribbon"]:contains("الموسم")').text();
  if (seasonText) {
    title = `${title} ${seasonText}`;
  }

  return {
    id: Buffer.from(url).toString('base64'),
    type: isMovie ? 'movie' : 'series',
    name: title,
    poster: posterUrl,
    posterShape: 'poster',
    releaseInfo: year || undefined,
    description: quality || undefined
  };
};

// Get catalogs
const getCatalog = async (type, id, extra = {}) => {
  try {
    // Handle search
    if (extra.search) {
      return await search(extra.search, type);
    }

    // Get homepage content
    const response = await axios.get(`${BASE_URL}/home`, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    
    const $ = cheerio.load(response.data);
    const metas = [];

    // Parse sections excluding unwanted ones
    $('section').not('section:contains("أختر وجهتك المفضلة")')
                .not('section:contains("تم اضافته حديثاً")')
                .each((_, section) => {
      $(section).find('a').each((_, element) => {
        const meta = parseSearchResult($, element);
        if (meta && (!type || meta.type === type)) {
          metas.push(meta);
        }
      });
    });

    return { metas };
  } catch (error) {
    console.error('Error fetching catalog:', error.message);
    return { metas: [] };
  }
};

// Search functionality
const search = async (query, type) => {
  try {
    const response = await axios.get(`${BASE_URL}/page/1/?s=${encodeURIComponent(query)}`);
    const $ = cheerio.load(response.data);
    const metas = [];

    $('section article a').each((_, element) => {
      const meta = parseSearchResult($, element);
      if (meta && (!type || meta.type === type)) {
        metas.push(meta);
      }
    });

    // Handle pagination
    const paginationEl = $('ul[aria-label="pagination"]');
    if (paginationEl.length > 0) {
      const maxPage = parseInt(
        paginationEl.find('li').not('.active').last().text() || '1'
      );

      if (maxPage > 1 && maxPage <= 5) {
        const pagePromises = [];
        for (let page = 2; page <= maxPage; page++) {
          pagePromises.push(
            axios.get(`${BASE_URL}/page/${page}/?s=${encodeURIComponent(query)}`)
              .then(res => {
                const $page = cheerio.load(res.data);
                const pageMetas = [];
                $page('section article a').each((_, element) => {
                  const meta = parseSearchResult($page, element);
                  if (meta && (!type || meta.type === type)) {
                    pageMetas.push(meta);
                  }
                });
                return pageMetas;
              })
          );
        }
        const pageResults = await Promise.all(pagePromises);
        pageResults.forEach(pageMetas => metas.push(...pageMetas));
      }
    }

    // Remove duplicates
    const seen = new Set();
    const uniqueMetas = metas.filter(meta => {
      if (seen.has(meta.id)) return false;
      seen.add(meta.id);
      return true;
    });

    return { metas: uniqueMetas };
  } catch (error) {
    console.error('Error searching:', error.message);
    return { metas: [] };
  }
};

// Get detailed metadata
const getMeta = async (type, id) => {
  try {
    const url = Buffer.from(id, 'base64').toString('utf-8');
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const title = $('title').text().split(' | ')[0];
    
    // Extract poster URL
    let posterUrl = $('body > script:nth-child(3)').html() || '';
    const posterMatch = posterUrl.match(/"image":"([^"]+)"/);
    posterUrl = posterMatch ? posterMatch[1] : $('meta[property="og:image"]').attr('content') || '';

    const year = $('article ul:nth-child(1) li a').last()?.text() || '';
    const description = $('ul#details li:contains("لمحة") p').text();
    const genres = [];
    $('article ul').first()?.find('li').each((_, el) => {
      genres.push($(el).text());
    });

    const trailerUrl = $('iframe').attr('src');
    const isMovie = title.match(/فيلم|حفلات|مسرحية/);

    const meta = {
      id,
      type: isMovie ? 'movie' : 'series',
      name: title,
      poster: posterUrl,
      posterShape: 'poster',
      background: posterUrl,
      description,
      genres: genres.slice(0, 3),
      releaseInfo: year || undefined,
      links: []
    };

    if (trailerUrl) {
      meta.links.push({
        name: 'Trailer',
        category: 'Trailer',
        url: trailerUrl
      });
    }

    // Handle series episodes
    if (!isMovie) {
      const videos = [];
      const seasonTitle = $('span[aria-label="season-title"]').html() || '';
      const seasonNum = getIntFromText(seasonTitle.replace(/<p>.*|\n/g, ''));

      $('ul#eps li').each((_, episode) => {
        const $ep = $(episode);
        const epUrl = $ep.find('a').attr('href') + '/watching';
        const epTitle = $ep.find('a img:nth-child(2)').attr('alt') || '';
        const epNum = parseInt($ep.find('a em').text() || '0');
        const epThumb = $ep.find('a img:nth-child(2)').attr('src');

        videos.push({
          id: Buffer.from(epUrl).toString('base64'),
          title: epTitle,
          season: seasonNum || 1,
          episode: epNum,
          thumbnail: epThumb,
          released: new Date().toISOString()
        });
      });

      meta.videos = videos.sort((a, b) => a.episode - b.episode);
    }

    return { meta };
  } catch (error) {
    console.error('Error fetching meta:', error.message);
    return { meta: null };
  }
};

// Get streaming links
const getStreams = async (type, id) => {
  try {
    const url = Buffer.from(id, 'base64').toString('utf-8');
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const streams = [];

    $('ul#download [aria-label="quality"]').each((_, element) => {
      const $el = $(element);
      const isFast = $el.find('span').text().includes('فائق السرعة');
      const serverName = isFast ? 'Fast Servers' : 'Servers';

      $el.find('a').each((_, link) => {
        const $link = $(link);
        const streamUrl = $link.attr('href');
        const qualityText = $link.text();
        const quality = getIntFromText(qualityText);

        if (streamUrl) {
          streams.push({
            name: NAME,
            title: `${quality || 'Unknown'}p - ${serverName}`,
            url: streamUrl,
            behaviorHints: {
              notWebReady: true,
              bingeGroup: `${NAME}-${serverName}`
            }
          });
        }
      });
    });

    return { streams };
  } catch (error) {
    console.error('Error fetching streams:', error.message);
    return { streams: [] };
  }
};

module.exports = {
  manifest: require('./manifest.json'),
  getCatalog,
  getMeta,
  getStreams
};
