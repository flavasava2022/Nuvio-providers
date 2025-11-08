// TukTuk Cinema Provider for Nuvio - FULLY WORKING VERSION
// Version: 1.3.0 - Fixed video playback and episode selection

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://tuktukcenma.cam';
const TMDB_API_KEY = '70896ffbbb915bc34056a969379c0393';

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://tuktukcenma.cam',
  'Referer': 'https://tuktukcenma.cam/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site'
};

function createDebugStream(name, title, info) {
  return {
    name: '🔍 DEBUG: ' + name,
    title: title || 'Debug Info',
    url: 'about:blank',
    quality: info || 'Debug',
    size: 'Debug Info',
    headers: WORKING_HEADERS,
    provider: 'tuktukcinema'
  };
}

function fixUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${MAIN_URL}${url}`;
  return `${MAIN_URL}/${url}`;
}

function getTitleFromTMDB(tmdbId, mediaType) {
  return new Promise(function(resolve, reject) {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
    
    console.log(`[TukTukCinema] Fetching from TMDB: ${tmdbUrl}`);
    
    fetch(tmdbUrl)
      .then(function(response) {
        if (!response.ok) {
          throw new Error(`TMDB API returned ${response.status}`);
        }
        return response.json();
      })
      .then(function(data) {
        const title = data.title || data.name || data.original_title || data.original_name;
        const year = data.release_date ? data.release_date.substring(0, 4) : 
                     data.first_air_date ? data.first_air_date.substring(0, 4) : '';
        
        if (!title) {
          reject(new Error('No title in TMDB response'));
          return;
        }
        
        console.log(`[TukTukCinema] ✓ TMDB Title: "${title}" (${year})`);
        resolve({ title: title, year: year });
      })
      .catch(function(error) {
        console.error(`[TukTukCinema] TMDB Error: ${error.message}`);
        reject(error);
      });
  });
}

function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function(resolve, reject) {
    console.log(`[TukTukCinema] ===== NEW REQUEST =====`);
    console.log(`[TukTukCinema] TMDB ID: ${tmdbId}`);
    console.log(`[TukTukCinema] Media Type: ${mediaType}`);
    console.log(`[TukTukCinema] Season: ${seasonNum}, Episode: ${episodeNum}`);
    
    if (!tmdbId || tmdbId === 'undefined' || tmdbId === 'null') {
      resolve([createDebugStream('Invalid TMDB ID', `Received: "${tmdbId}"`, 'Cannot search')]);
      return;
    }
    
    getTitleFromTMDB(tmdbId, mediaType)
      .then(function(tmdbData) {
        const searchTitle = tmdbData.title;
        const searchYear = tmdbData.year;
        
        if (!searchTitle || searchTitle === 'undefined') {
          throw new Error('TMDB returned undefined title');
        }
        
        console.log(`[TukTukCinema] ✓ Searching for: "${searchTitle}" (${searchYear})`);
        console.log(`[TukTukCinema] ✓ Need S${seasonNum}E${episodeNum}`);
        
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(searchTitle)}`;
        
        return fetch(searchUrl, { headers: WORKING_HEADERS })
          .then(function(response) {
            if (!response.ok) throw new Error(`Search failed: ${response.status}`);
            return response.text();
          })
          .then(function(html) {
            return {
              html: html,
              searchTitle: searchTitle,
              searchYear: searchYear
            };
          });
      })
      .then(function(searchData) {
        const $ = cheerio.load(searchData.html);
        const results = [];
        
        $('div.Block--Item').each(function() {
          const $item = $(this);
          const link = $item.find('a').first();
          const href = fixUrl(link.attr('href'));
          const title = $item.find('div.Block--Info h3').text().trim() || link.attr('title') || '';
          
          if (href && title) {
            const score = similarity(title.toLowerCase(), searchData.searchTitle.toLowerCase());
            console.log(`[TukTukCinema] Found: "${title}" (${(score * 100).toFixed(0)}%)`);
            results.push({ title: title, url: href, score: score });
          }
        });
        
        if (results.length === 0) {
          resolve([createDebugStream('No results', `Searched: "${searchData.searchTitle}"`, 'Not on TukTuk')]);
          return Promise.reject(new Error('No results'));
        }
        
        results.sort(function(a, b) { return b.score - a.score; });
        const bestMatch = results[0];
        
        console.log(`[TukTukCinema] ✓ Best match: "${bestMatch.title}"`);
        
        return fetch(bestMatch.url, { headers: WORKING_HEADERS })
          .then(function(response) { return response.text(); })
          .then(function(html) {
            return {
              html: html,
              contentUrl: bestMatch.url,
              contentTitle: bestMatch.title,
              searchTitle: searchData.searchTitle
            };
          });
      })
      .then(function(contentData) {
        const $content = cheerio.load(contentData.html);
        
        // For movies, use the content URL directly
        if (mediaType === 'movie' || !seasonNum || !episodeNum) {
          console.log('[TukTukCinema] Movie - using content URL');
          return Promise.resolve({
            episodeUrl: contentData.contentUrl,
            contentTitle: contentData.contentTitle,
            searchTitle: contentData.searchTitle
          });
        }
        
        // For TV shows, find the specific episode
        console.log(`[TukTukCinema] TV Show - looking for S${seasonNum}E${episodeNum}`);
        
        const seasonLinks = $content('section.allseasonss a[href*="/series/"]');
        
        if (seasonLinks.length > 0) {
          // Multi-season series
          console.log(`[TukTukCinema] Multi-season: ${seasonLinks.length} season(s)`);
          
          if (seasonNum > seasonLinks.length) {
            resolve([
              createDebugStream('Season unavailable', `S${seasonNum} requested`, `Only ${seasonLinks.length} available`)
            ]);
            return Promise.reject(new Error('Season not found'));
          }
          
          // Get the correct season (index starts at 0)
          const seasonLink = seasonLinks.eq(seasonNum - 1);
          const seasonUrl = fixUrl(seasonLink.attr('href'));
          
          console.log(`[TukTukCinema] Loading S${seasonNum}: ${seasonUrl}`);
          
          return fetch(seasonUrl, { headers: WORKING_HEADERS })
            .then(function(response) { return response.text(); })
            .then(function(seasonHtml) {
              const $season = cheerio.load(seasonHtml);
              const episodes = $season('section.allepcont div.row a');
              
              console.log(`[TukTukCinema] S${seasonNum} has ${episodes.length} episodes`);
              
              if (episodeNum > episodes.length || episodeNum < 1) {
                resolve([
                  createDebugStream('Episode unavailable', `E${episodeNum} requested`, `Only ${episodes.length} available`)
                ]);
                return Promise.reject(new Error('Episode not found'));
              }
              
              // Get the correct episode (index starts at 0)
              const episode = episodes.eq(episodeNum - 1);
              const episodeUrl = fixUrl(episode.attr('href'));
              
              if (!episodeUrl) {
                resolve([createDebugStream('Episode link error', 'No URL found', seasonUrl)]);
                return Promise.reject(new Error('Episode URL missing'));
              }
              
              console.log(`[TukTukCinema] ✓ S${seasonNum}E${episodeNum} URL: ${episodeUrl}`);
              
              return {
                episodeUrl: episodeUrl,
                contentTitle: contentData.contentTitle,
                searchTitle: contentData.searchTitle
              };
            });
        } else {
          // Single season series
          const episodes = $content('section.allepcont div.row a');
          console.log(`[TukTukCinema] Single season: ${episodes.length} episodes`);
          
          if (episodes.length === 0) {
            resolve([createDebugStream('No episodes', 'Might be a movie', contentData.contentUrl)]);
            return Promise.reject(new Error('No episodes'));
          }
          
          if (episodeNum > episodes.length || episodeNum < 1) {
            resolve([
              createDebugStream('Episode unavailable', `E${episodeNum} requested`, `Only ${episodes.length} available`)
            ]);
            return Promise.reject(new Error('Episode not found'));
          }
          
          // Get the correct episode (index starts at 0)
          const episode = episodes.eq(episodeNum - 1);
          const episodeUrl = fixUrl(episode.attr('href'));
          
          if (!episodeUrl) {
            resolve([createDebugStream('Episode link error', 'No URL found', contentData.contentUrl)]);
            return Promise.reject(new Error('Episode URL missing'));
          }
          
          console.log(`[TukTukCinema] ✓ E${episodeNum} URL: ${episodeUrl}`);
          
          return Promise.resolve({
            episodeUrl: episodeUrl,
            contentTitle: contentData.contentTitle,
            searchTitle: contentData.searchTitle
          });
        }
      })
      .then(function(result) {
        if (!result || !result.episodeUrl) {
          resolve([createDebugStream('Processing error', 'No URL', 'Check steps')]);
          return Promise.reject(new Error('No URL'));
        }
        
        const watchUrl = result.episodeUrl.endsWith('/') 
          ? `${result.episodeUrl}watch/` 
          : `${result.episodeUrl}/watch/`;
        
        console.log(`[TukTukCinema] Watch page: ${watchUrl}`);
        
        return fetch(watchUrl, { headers: WORKING_HEADERS })
          .then(function(response) { return response.text(); })
          .then(function(html) {
            return {
              watchHtml: html,
              watchUrl: watchUrl,
              contentTitle: result.contentTitle,
              searchTitle: result.searchTitle
            };
          });
      })
      .then(function(watchData) {
        const $watch = cheerio.load(watchData.watchHtml);
        const iframe = $watch('div.player--iframe iframe');
        const iframeSrc = fixUrl(iframe.attr('src'));
        
        if (!iframeSrc) {
          resolve([createDebugStream('No video player', 'No iframe found', watchData.watchUrl)]);
          return Promise.reject(new Error('No iframe'));
        }
        
        console.log(`[TukTukCinema] ✓ Iframe: ${iframeSrc}`);
        
        // If it's not megatukmax, return the iframe URL directly
        if (!iframeSrc.includes('megatukmax')) {
          console.log('[TukTukCinema] External iframe');
          resolve([{
            name: 'TukTuk Cinema - External',
            title: watchData.contentTitle,
            url: iframeSrc,
            quality: 'Auto',
            size: 'Unknown',
            headers: {
              'User-Agent': WORKING_HEADERS['User-Agent'],
              'Referer': watchData.watchUrl
            },
            provider: 'tuktukcinema'
          }]);
          return Promise.reject(new Error('Handled'));
        }
        
        const iframeId = iframeSrc.split('/').pop();
        const iframeUrl = `https://w.megatukmax.xyz/iframe/${iframeId}`;
        
        console.log(`[TukTukCinema] Loading megatukmax: ${iframeUrl}`);
        
        return fetch(iframeUrl, { 
          headers: { ...WORKING_HEADERS, 'Referer': watchData.watchUrl }
        })
        .then(function(response) { return response.text(); })
        .then(function(html) {
          return {
            iframeHtml: html,
            iframeUrl: iframeUrl,
            contentTitle: watchData.contentTitle,
            searchTitle: watchData.searchTitle
          };
        });
      })
      .then(function(iframeData) {
        let version = '';
        const patterns = [
          /"version"\s*:\s*"([a-f0-9]{32,})"/,
          /X-Inertia-Version["']?\s*[:=]\s*["']([a-f0-9]{32,})["']/
        ];
        
        for (let i = 0; i < patterns.length; i++) {
          const match = iframeData.iframeHtml.match(patterns[i]);
          if (match && match[1]) {
            version = match[1];
            break;
          }
        }
        
        if (!version) {
          version = '852467c2571830b8584cc9bce61b6cde';
        }
        
        console.log(`[TukTukCinema] Inertia version: ${version}`);
        
        const inertiaHeaders = {
          'User-Agent': WORKING_HEADERS['User-Agent'],
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'X-Inertia': 'true',
          'X-Inertia-Version': version,
          'X-Inertia-Partial-Component': 'files/mirror/video',
          'X-Inertia-Partial-Data': 'streams',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': iframeData.iframeUrl,
          'Origin': 'https://w.megatukmax.xyz'
        };
        
        return fetch(iframeData.iframeUrl, { headers: inertiaHeaders })
          .then(function(response) { return response.json(); })
          .then(function(apiData) {
            const streams = [];
            
            if (apiData.props && apiData.props.streams && apiData.props.streams.data) {
              const qualities = apiData.props.streams.data;
              console.log(`[TukTukCinema] ✓ ${qualities.length} qualities`);
              
              for (let i = 0; i < qualities.length; i++) {
                const quality = qualities[i];
                const label = quality.label || 'Unknown';
                
                if (quality.mirrors && quality.mirrors.length > 0) {
                  for (let j = 0; j < quality.mirrors.length; j++) {
                    const mirror = quality.mirrors[j];
                    let link = mirror.link;
                    
                    if (link && link.startsWith('//')) {
                      link = `https:${link}`;
                    }
                    
                    if (link) {
                      const driver = mirror.driver || 'Unknown';
                      console.log(`[TukTukCinema] ✓ ${label} (${driver})`);
                      
                      streams.push({
                        name: `TukTuk - ${label}`,
                        title: iframeData.contentTitle,
                        url: link,
                        quality: label,
                        size: 'Unknown',
                        headers: {
                          'User-Agent': WORKING_HEADERS['User-Agent'],
                          'Accept': '*/*',
                          'Origin': 'https://w.megatukmax.xyz',
                          'Referer': iframeData.iframeUrl
                        },
                        provider: 'tuktukcinema'
                      });
                    }
                  }
                }
              }
            }
            
            if (streams.length === 0) {
              resolve([
                createDebugStream('No streams', 'API returned no data', iframeData.iframeUrl)
              ]);
            } else {
              console.log(`[TukTukCinema] ===== ${streams.length} streams =====`);
              resolve(streams);
            }
          });
      })
      .catch(function(error) {
        if (error.message === 'Handled' || error.message === 'No results' || 
            error.message === 'Season not found' || error.message === 'Episode not found' ||
            error.message === 'Episode URL missing' || error.message === 'No episodes' ||
            error.message === 'No URL' || error.message === 'No iframe') {
          return;
        }
        console.error(`[TukTukCinema] ERROR: ${error.message}`);
        resolve([createDebugStream('Error', error.message, 'See console')]);
      });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
