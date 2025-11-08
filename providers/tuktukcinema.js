// TukTuk Cinema Provider for Nuvio - FULL DEBUG VERSION
// Version: 1.4.0 - Shows debug info as streams

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://tuktukcenma.cam';
const TMDB_API_KEY = '70896ffbbb915bc34056a969379c0393';

// Set to true to see debug streams, false to hide them
const DEBUG_MODE = true;

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
    name: '🔍 ' + name,
    title: title || 'Debug',
    url: 'about:blank',
    quality: info || 'Debug',
    size: 'Info',
    headers: WORKING_HEADERS,
    provider: 'tuktukcinema-debug'
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
    
    console.log(`[TukTukCinema] TMDB: ${tmdbUrl}`);
    
    fetch(tmdbUrl)
      .then(function(response) {
        if (!response.ok) throw new Error(`TMDB ${response.status}`);
        return response.json();
      })
      .then(function(data) {
        const title = data.title || data.name || data.original_title || data.original_name;
        const year = data.release_date ? data.release_date.substring(0, 4) : 
                     data.first_air_date ? data.first_air_date.substring(0, 4) : '';
        
        if (!title) {
          reject(new Error('No title'));
          return;
        }
        
        console.log(`[TukTukCinema] Title: "${title}" (${year})`);
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
    const debugStreams = [];
    
    console.log(`[TukTukCinema] === REQUEST ===`);
    console.log(`[TukTukCinema] TMDB: ${tmdbId}`);
    console.log(`[TukTukCinema] Type: ${mediaType}`);
    console.log(`[TukTukCinema] S${seasonNum}E${episodeNum}`);
    
    if (DEBUG_MODE) {
      debugStreams.push(
        createDebugStream(
          `Request: ${mediaType}`,
          `TMDB ID: ${tmdbId}`,
          seasonNum && episodeNum ? `S${seasonNum}E${episodeNum}` : 'Movie'
        )
      );
    }
    
    if (!tmdbId || tmdbId === 'undefined') {
      resolve([createDebugStream('ERROR: Invalid TMDB ID', `Got: ${tmdbId}`, 'Cannot search')]);
      return;
    }
    
    getTitleFromTMDB(tmdbId, mediaType)
      .then(function(tmdbData) {
        const searchTitle = tmdbData.title;
        
        if (DEBUG_MODE) {
          debugStreams.push(
            createDebugStream(
              `Found title: "${searchTitle}"`,
              `Year: ${tmdbData.year}`,
              'From TMDB API'
            )
          );
        }
        
        console.log(`[TukTukCinema] Search: "${searchTitle}"`);
        
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(searchTitle)}`;
        
        return fetch(searchUrl, { headers: WORKING_HEADERS })
          .then(function(response) {
            if (!response.ok) throw new Error(`Search ${response.status}`);
            return response.text();
          })
          .then(function(html) {
            return {
              html: html,
              searchTitle: searchTitle,
              searchYear: tmdbData.year
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
            results.push({ title: title, url: href, score: score });
          }
        });
        
        if (results.length === 0) {
          resolve([
            createDebugStream('ERROR: No results', `Searched: "${searchData.searchTitle}"`, 'Not on TukTuk Cinema')
          ].concat(debugStreams));
          return Promise.reject(new Error('No results'));
        }
        
        results.sort(function(a, b) { return b.score - a.score; });
        const bestMatch = results[0];
        
        console.log(`[TukTukCinema] Match: "${bestMatch.title}"`);
        
        if (DEBUG_MODE) {
          debugStreams.push(
            createDebugStream(
              `Matched: "${bestMatch.title}"`,
              `Similarity: ${(bestMatch.score * 100).toFixed(0)}%`,
              'Best result'
            )
          );
        }
        
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
        
        // For movies
        if (mediaType === 'movie' || !seasonNum || !episodeNum) {
          console.log('[TukTukCinema] Movie mode');
          if (DEBUG_MODE) {
            debugStreams.push(
              createDebugStream(
                'Movie: Using main URL',
                contentData.contentUrl.substring(0, 50) + '...',
                'No episodes needed'
              )
            );
          }
          return Promise.resolve({
            episodeUrl: contentData.contentUrl,
            contentTitle: contentData.contentTitle,
            searchTitle: contentData.searchTitle
          });
        }
        
        // For TV shows
        console.log(`[TukTukCinema] TV: Need S${seasonNum}E${episodeNum}`);
        
        const seasonLinks = $content('section.allseasonss a[href*="/series/"]');
        
        if (DEBUG_MODE) {
          debugStreams.push(
            createDebugStream(
              `TV Show: ${seasonLinks.length} season(s) found`,
              `Looking for Season ${seasonNum}`,
              `Episode ${episodeNum}`
            )
          );
        }
        
        if (seasonLinks.length > 0) {
          // Multi-season
          console.log(`[TukTukCinema] Multi-season: ${seasonLinks.length}`);
          
          if (seasonNum > seasonLinks.length) {
            resolve([
              createDebugStream('ERROR: Season unavailable', `S${seasonNum} requested`, `Only ${seasonLinks.length} seasons`)
            ].concat(debugStreams));
            return Promise.reject(new Error('Season not found'));
          }
          
          const seasonLink = seasonLinks.eq(seasonNum - 1);
          const seasonUrl = fixUrl(seasonLink.attr('href'));
          
          console.log(`[TukTukCinema] Season ${seasonNum} URL: ${seasonUrl}`);
          
          if (DEBUG_MODE) {
            debugStreams.push(
              createDebugStream(
                `Loading Season ${seasonNum}`,
                seasonUrl.substring(0, 50) + '...',
                `Index: ${seasonNum - 1}`
              )
            );
          }
          
          return fetch(seasonUrl, { headers: WORKING_HEADERS })
            .then(function(response) { return response.text(); })
            .then(function(seasonHtml) {
              const $season = cheerio.load(seasonHtml);
              const episodes = $season('section.allepcont div.row a');
              
              console.log(`[TukTukCinema] S${seasonNum}: ${episodes.length} episodes`);
              
              if (DEBUG_MODE) {
                debugStreams.push(
                  createDebugStream(
                    `Season ${seasonNum}: ${episodes.length} episodes`,
                    `Looking for Episode ${episodeNum}`,
                    `Index: ${episodeNum - 1}`
                  )
                );
              }
              
              if (episodeNum > episodes.length || episodeNum < 1) {
                resolve([
                  createDebugStream('ERROR: Episode unavailable', `E${episodeNum} requested`, `Only ${episodes.length} episodes`)
                ].concat(debugStreams));
                return Promise.reject(new Error('Episode not found'));
              }
              
              const episode = episodes.eq(episodeNum - 1);
              const episodeUrl = fixUrl(episode.attr('href'));
              const episodeTitle = episode.find('div.ep-info h2').text().trim();
              
              console.log(`[TukTukCinema] E${episodeNum} URL: ${episodeUrl}`);
              console.log(`[TukTukCinema] E${episodeNum} Title: ${episodeTitle}`);
              
              if (DEBUG_MODE) {
                debugStreams.push(
                  createDebugStream(
                    `Found Episode ${episodeNum}`,
                    episodeTitle || 'No title',
                    episodeUrl.substring(0, 50) + '...'
                  )
                );
              }
              
              if (!episodeUrl) {
                resolve([
                  createDebugStream('ERROR: Episode URL missing', `E${episodeNum}`, 'No href found')
                ].concat(debugStreams));
                return Promise.reject(new Error('Episode URL missing'));
              }
              
              return {
                episodeUrl: episodeUrl,
                contentTitle: contentData.contentTitle,
                searchTitle: contentData.searchTitle
              };
            });
        } else {
          // Single season
          const episodes = $content('section.allepcont div.row a');
          console.log(`[TukTukCinema] Single season: ${episodes.length} episodes`);
          
          if (DEBUG_MODE) {
            debugStreams.push(
              createDebugStream(
                `Single season: ${episodes.length} episodes`,
                `Looking for Episode ${episodeNum}`,
                `Index: ${episodeNum - 1}`
              )
            );
          }
          
          if (episodes.length === 0) {
            resolve([
              createDebugStream('ERROR: No episodes', 'Might be a movie', contentData.contentUrl)
            ].concat(debugStreams));
            return Promise.reject(new Error('No episodes'));
          }
          
          if (episodeNum > episodes.length || episodeNum < 1) {
            resolve([
              createDebugStream('ERROR: Episode unavailable', `E${episodeNum} requested`, `Only ${episodes.length} episodes`)
            ].concat(debugStreams));
            return Promise.reject(new Error('Episode not found'));
          }
          
          const episode = episodes.eq(episodeNum - 1);
          const episodeUrl = fixUrl(episode.attr('href'));
          const episodeTitle = episode.find('div.ep-info h2').text().trim();
          
          console.log(`[TukTukCinema] E${episodeNum} URL: ${episodeUrl}`);
          
          if (DEBUG_MODE) {
            debugStreams.push(
              createDebugStream(
                `Found Episode ${episodeNum}`,
                episodeTitle || 'No title',
                episodeUrl.substring(0, 50) + '...'
              )
            );
          }
          
          if (!episodeUrl) {
            resolve([
              createDebugStream('ERROR: Episode URL missing', `E${episodeNum}`, 'No href')
            ].concat(debugStreams));
            return Promise.reject(new Error('Episode URL missing'));
          }
          
          return Promise.resolve({
            episodeUrl: episodeUrl,
            contentTitle: contentData.contentTitle,
            searchTitle: contentData.searchTitle
          });
        }
      })
      .then(function(result) {
        if (!result || !result.episodeUrl) {
          resolve([
            createDebugStream('ERROR: No URL', 'Processing failed', 'Check previous steps')
          ].concat(debugStreams));
          return Promise.reject(new Error('No URL'));
        }
        
        const watchUrl = result.episodeUrl.endsWith('/') 
          ? `${result.episodeUrl}watch/` 
          : `${result.episodeUrl}/watch/`;
        
        console.log(`[TukTukCinema] Watch: ${watchUrl}`);
        
        if (DEBUG_MODE) {
          debugStreams.push(
            createDebugStream(
              'Loading watch page',
              watchUrl.substring(0, 50) + '...',
              'Looking for iframe'
            )
          );
        }
        
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
          resolve([
            createDebugStream('ERROR: No iframe', 'Watch page has no player', watchData.watchUrl)
          ].concat(debugStreams));
          return Promise.reject(new Error('No iframe'));
        }
        
        console.log(`[TukTukCinema] Iframe: ${iframeSrc}`);
        
        if (DEBUG_MODE) {
          debugStreams.push(
            createDebugStream(
              'Found iframe',
              iframeSrc.substring(0, 50) + '...',
              iframeSrc.includes('megatukmax') ? 'MegaTukMax' : 'External'
            )
          );
        }
        
        if (!iframeSrc.includes('megatukmax')) {
          const streams = [{
            name: 'TukTuk Cinema - External Player',
            title: watchData.contentTitle,
            url: iframeSrc,
            quality: 'Auto',
            size: 'Unknown',
            headers: {
              'User-Agent': WORKING_HEADERS['User-Agent'],
              'Referer': watchData.watchUrl
            },
            provider: 'tuktukcinema'
          }];
          
          if (DEBUG_MODE) {
            resolve(debugStreams.concat(streams));
          } else {
            resolve(streams);
          }
          return Promise.reject(new Error('Handled'));
        }
        
        const iframeId = iframeSrc.split('/').pop();
        const iframeUrl = `https://w.megatukmax.xyz/iframe/${iframeId}`;
        
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
        
        console.log(`[TukTukCinema] Inertia: ${version}`);
        
        if (DEBUG_MODE) {
          debugStreams.push(
            createDebugStream(
              'Inertia API call',
              `Version: ${version}`,
              'Getting stream URLs'
            )
          );
        }
        
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
              console.log(`[TukTukCinema] ${qualities.length} qualities`);
              
              if (DEBUG_MODE) {
                debugStreams.push(
                  createDebugStream(
                    `API Success: ${qualities.length} qualities`,
                    'Extracting stream URLs',
                    'Check below for actual streams'
                  )
                );
              }
              
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
                      
                      streams.push({
                        name: `TukTuk - ${label} (${driver})`,
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
                createDebugStream('ERROR: No streams', 'API returned no data', 'Check TukTuk Cinema')
              ].concat(debugStreams));
            } else {
              console.log(`[TukTukCinema] SUCCESS: ${streams.length} streams`);
              
              if (DEBUG_MODE) {
                resolve(debugStreams.concat(streams));
              } else {
                resolve(streams);
              }
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
        resolve([
          createDebugStream('UNEXPECTED ERROR', error.message, 'See console')
        ].concat(debugStreams));
      });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
