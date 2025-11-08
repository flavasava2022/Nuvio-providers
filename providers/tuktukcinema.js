// TukTuk Cinema Provider for Nuvio - WITH DEBUG INFO
// Version: 1.1.0 (Debug Edition)
// Shows search info as fake streams when no results found

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://tuktukcenma.cam';
const TMDB_API_KEY = '0efa8cc62e7c3e3e54a4f9c9563c4367'; // Public TMDB key

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty'
};

/**
 * Create debug stream to show info in Nuvio UI
 */
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

/**
 * Get title from TMDB API
 */
function getTitleFromTMDB(tmdbId, mediaType) {
  return new Promise(function(resolve, reject) {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    
    console.log(`[TukTukCinema] Fetching title from TMDB: ${tmdbUrl}`);
    
    fetch(tmdbUrl)
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        const title = data.title || data.name;
        const year = data.release_date ? data.release_date.substring(0, 4) : 
                     data.first_air_date ? data.first_air_date.substring(0, 4) : '';
        
        console.log(`[TukTukCinema] TMDB Title: ${title} (${year})`);
        resolve({ title: title, year: year });
      })
      .catch(function(error) {
        console.error(`[TukTukCinema] TMDB API Error: ${error.message}`);
        reject(error);
      });
  });
}

/**
 * Calculate string similarity (for matching search results)
 */
function similarity(s1, s2) {
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
    
    if (mediaType === 'tv' && seasonNum && episodeNum) {
      console.log(`[TukTukCinema] Season: ${seasonNum}, Episode: ${episodeNum}`);
    }
    
    // Step 1: Get the actual title from TMDB
    getTitleFromTMDB(tmdbId, mediaType)
      .then(function(tmdbData) {
        const searchTitle = tmdbData.title;
        const searchYear = tmdbData.year;
        
        console.log(`[TukTukCinema] Searching for: "${searchTitle}"`);
        
        // Step 2: Search TukTuk Cinema with the actual title
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(searchTitle)}`;
        console.log(`[TukTukCinema] Search URL: ${searchUrl}`);
        
        return fetch(searchUrl, { headers: WORKING_HEADERS })
          .then(function(response) {
            if (!response.ok) {
              throw new Error(`Search failed: ${response.status}`);
            }
            return response.text();
          })
          .then(function(html) {
            return {
              html: html,
              searchTitle: searchTitle,
              searchYear: searchYear,
              searchUrl: searchUrl
            };
          });
      })
      .then(function(searchData) {
        const $ = cheerio.load(searchData.html);
        const results = [];
        
        // Find all search results
        $('div.Block--Item').each(function() {
          const $item = $(this);
          const link = $item.find('a').first();
          const href = fixUrl(link.attr('href'));
          const title = $item.find('div.Block--Info h3').text().trim() || link.attr('title') || '';
          
          if (href && title) {
            // Calculate similarity score
            const score = similarity(title.toLowerCase(), searchData.searchTitle.toLowerCase());
            console.log(`[TukTukCinema] Found: "${title}" (similarity: ${(score * 100).toFixed(0)}%)`);
            
            results.push({
              title: title,
              url: href,
              score: score
            });
          }
        });
        
        if (results.length === 0) {
          console.log('[TukTukCinema] ❌ No results found');
          
          // Return debug info as fake streams
          resolve([
            createDebugStream(
              'No results found on TukTuk Cinema',
              `Searched: "${searchData.searchTitle}"`,
              `TMDB ID: ${tmdbId}`
            ),
            createDebugStream(
              'Search URL',
              searchData.searchUrl,
              'Try opening this URL in browser'
            ),
            createDebugStream(
              'Suggestion',
              'Content might not be available',
              'Or try different media type'
            )
          ]);
          return Promise.reject(new Error('No results'));
        }
        
        // Sort by similarity score and pick the best match
        results.sort(function(a, b) { return b.score - a.score; });
        const bestMatch = results[0];
        
        console.log(`[TukTukCinema] ✓ Best match: "${bestMatch.title}" (${(bestMatch.score * 100).toFixed(0)}%)`);
        console.log(`[TukTukCinema] URL: ${bestMatch.url}`);
        
        // If match quality is too low, show debug info
        if (bestMatch.score < 0.3) {
          const allTitles = results.slice(0, 3).map(function(r) { 
            return r.title; 
          }).join(', ');
          
          resolve([
            createDebugStream(
              'Low similarity match',
              `Best: "${bestMatch.title}"`,
              `Score: ${(bestMatch.score * 100).toFixed(0)}%`
            ),
            createDebugStream(
              'Other results found',
              allTitles,
              'Continuing anyway...'
            )
          ]);
          // Continue processing with low score match
        }
        
        // Step 3: Load the content page
        return fetch(bestMatch.url, { headers: WORKING_HEADERS })
          .then(function(response) {
            return response.text();
          })
          .then(function(contentHtml) {
            return {
              html: contentHtml,
              contentUrl: bestMatch.url,
              contentTitle: bestMatch.title,
              searchTitle: searchData.searchTitle
            };
          });
      })
      .then(function(contentData) {
        const $content = cheerio.load(contentData.html);
        let episodeUrl = contentData.contentUrl;
        
        // If it's a TV show, find the specific episode
        if (mediaType === 'tv' && seasonNum && episodeNum) {
          console.log(`[TukTukCinema] Looking for S${seasonNum}E${episodeNum}`);
          
          const seasonLinks = $content('section.allseasonss a[href*=/series/]');
          
          if (seasonLinks.length > 0) {
            console.log(`[TukTukCinema] Found ${seasonLinks.length} season(s)`);
            
            if (seasonNum > seasonLinks.length) {
              resolve([
                createDebugStream(
                  'Season not available',
                  `Requested: S${seasonNum}`,
                  `Available: ${seasonLinks.length} season(s)`
                )
              ]);
              return Promise.reject(new Error('Season not found'));
            }
            
            const seasonLink = seasonLinks.eq(seasonNum - 1);
            const seasonUrl = fixUrl(seasonLink.attr('href'));
            
            if (!seasonUrl) {
              console.log('[TukTukCinema] ❌ Season URL not found');
              resolve([
                createDebugStream(
                  'Season link error',
                  `Season ${seasonNum} exists but no URL`,
                  contentData.contentUrl
                )
              ]);
              return Promise.reject(new Error('Season URL missing'));
            }
            
            console.log(`[TukTukCinema] Loading season ${seasonNum}: ${seasonUrl}`);
            
            return fetch(seasonUrl, { headers: WORKING_HEADERS })
              .then(function(seasonResponse) {
                return seasonResponse.text();
              })
              .then(function(seasonHtml) {
                const $season = cheerio.load(seasonHtml);
                const episodes = $season('section.allepcont div.row a');
                
                console.log(`[TukTukCinema] Found ${episodes.length} episodes`);
                
                if (episodeNum > episodes.length) {
                  resolve([
                    createDebugStream(
                      'Episode not available',
                      `Requested: E${episodeNum}`,
                      `Available: ${episodes.length} episode(s)`
                    )
                  ]);
                  return Promise.reject(new Error('Episode not found'));
                }
                
                const episode = episodes.eq(episodeNum - 1);
                episodeUrl = fixUrl(episode.attr('href'));
                
                if (!episodeUrl) {
                  console.log('[TukTukCinema] ❌ Episode URL not found');
                  resolve([
                    createDebugStream(
                      'Episode link error',
                      `E${episodeNum} exists but no URL`,
                      seasonUrl
                    )
                  ]);
                  return Promise.reject(new Error('Episode URL missing'));
                }
                
                console.log(`[TukTukCinema] ✓ Episode URL: ${episodeUrl}`);
                
                return {
                  episodeUrl: episodeUrl,
                  contentTitle: contentData.contentTitle,
                  searchTitle: contentData.searchTitle
                };
              });
          } else {
            const episodes = $content('section.allepcont div.row a');
            console.log(`[TukTukCinema] Found ${episodes.length} episodes (single season)`);
            
            if (episodes.length === 0) {
              resolve([
                createDebugStream(
                  'No episodes found',
                  'This might be a movie, not a series',
                  contentData.contentUrl
                )
              ]);
              return Promise.reject(new Error('No episodes'));
            }
            
            if (episodeNum > episodes.length) {
              resolve([
                createDebugStream(
                  'Episode not available',
                  `Requested: E${episodeNum}`,
                  `Available: ${episodes.length} episode(s)`
                )
              ]);
              return Promise.reject(new Error('Episode not found'));
            }
            
            const episode = episodes.eq(episodeNum - 1);
            episodeUrl = fixUrl(episode.attr('href'));
            
            if (!episodeUrl) {
              console.log('[TukTukCinema] ❌ Episode URL not found');
              resolve([
                createDebugStream(
                  'Episode link error',
                  `E${episodeNum} exists but no URL`,
                  contentData.contentUrl
                )
              ]);
              return Promise.reject(new Error('Episode URL missing'));
            }
            
            console.log(`[TukTukCinema] ✓ Episode URL: ${episodeUrl}`);
            
            return Promise.resolve({
              episodeUrl: episodeUrl,
              contentTitle: contentData.contentTitle,
              searchTitle: contentData.searchTitle
            });
          }
        }
        
        // For movies
        return Promise.resolve({
          episodeUrl: episodeUrl,
          contentTitle: contentData.contentTitle,
          searchTitle: contentData.searchTitle
        });
      })
      .then(function(result) {
        if (!result || !result.episodeUrl) {
          resolve([
            createDebugStream(
              'Processing error',
              'No episode URL generated',
              'Check previous steps'
            )
          ]);
          return Promise.reject(new Error('No URL'));
        }
        
        const watchUrl = result.episodeUrl.endsWith('/') 
          ? `${result.episodeUrl}watch/` 
          : `${result.episodeUrl}/watch/`;
        
        console.log(`[TukTukCinema] Watch page: ${watchUrl}`);
        
        return fetch(watchUrl, { headers: WORKING_HEADERS })
          .then(function(watchResponse) {
            return watchResponse.text();
          })
          .then(function(watchHtml) {
            return {
              watchHtml: watchHtml,
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
          console.log('[TukTukCinema] ❌ No iframe found');
          resolve([
            createDebugStream(
              'No video player found',
              'Watch page has no iframe',
              watchData.watchUrl
            ),
            createDebugStream(
              'Possible reasons',
              '1. Page structure changed',
              '2. Content removed'
            )
          ]);
          return Promise.reject(new Error('No iframe'));
        }
        
        console.log(`[TukTukCinema] ✓ Iframe: ${iframeSrc}`);
        
        if (!iframeSrc.includes('megatukmax')) {
          console.log('[TukTukCinema] Non-megatukmax iframe, returning direct');
          resolve([{
            name: 'TukTuk Cinema - Auto',
            title: watchData.contentTitle,
            url: iframeSrc,
            quality: 'Auto',
            size: 'Unknown',
            headers: WORKING_HEADERS,
            provider: 'tuktukcinema'
          }]);
          return Promise.reject(new Error('Handled'));
        }
        
        const iframeId = iframeSrc.split('/').pop();
        const iframeUrl = `https://w.megatukmax.xyz/iframe/${iframeId}`;
        
        console.log(`[TukTukCinema] Loading iframe: ${iframeUrl}`);
        
        return fetch(iframeUrl, { 
          headers: { ...WORKING_HEADERS, 'Referer': watchData.watchUrl }
        })
        .then(function(iframeResponse) {
          return iframeResponse.text();
        })
        .then(function(iframeHtml) {
          return {
            iframeHtml: iframeHtml,
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
          /X-Inertia-Version["']?\s*[:=]\s*["']([a-f0-9]{32,})["']/,
          /data-page\s*=\s*["'].*?"version"\s*:\s*"([a-f0-9]{32,})"/
        ];
        
        for (let i = 0; i < patterns.length; i++) {
          const match = iframeData.iframeHtml.match(patterns[i]);
          if (match && match[1]) {
            version = match[1];
            console.log(`[TukTukCinema] ✓ Inertia version: ${version}`);
            break;
          }
        }
        
        if (!version) {
          version = '852467c2571830b8584cc9bce61b6cde';
          console.log(`[TukTukCinema] Using fallback version`);
        }
        
        const inertiaHeaders = {
          ...WORKING_HEADERS,
          'X-Inertia': 'true',
          'X-Inertia-Version': version,
          'X-Inertia-Partial-Component': 'files/mirror/video',
          'X-Inertia-Partial-Data': 'streams',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': iframeData.iframeUrl
        };
        
        console.log('[TukTukCinema] Making Inertia API request...');
        
        return fetch(iframeData.iframeUrl, { headers: inertiaHeaders })
          .then(function(apiResponse) {
            return apiResponse.json();
          })
          .then(function(apiData) {
            const streams = [];
            
            if (apiData.props && apiData.props.streams && apiData.props.streams.data) {
              const qualities = apiData.props.streams.data;
              console.log(`[TukTukCinema] ✓ Found ${qualities.length} qualities`);
              
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
                      console.log(`[TukTukCinema] ✓ Stream: ${label} (${driver})`);
                      
                      streams.push({
                        name: `TukTuk Cinema - ${label} (${driver})`,
                        title: iframeData.contentTitle,
                        url: link,
                        quality: label,
                        size: 'Unknown',
                        headers: WORKING_HEADERS,
                        provider: 'tuktukcinema'
                      });
                    }
                  }
                }
              }
            }
            
            if (streams.length === 0) {
              console.log('[TukTukCinema] ❌ No streams in API response');
              resolve([
                createDebugStream(
                  'API returned no streams',
                  'Inertia API responded but no data',
                  iframeData.iframeUrl
                ),
                createDebugStream(
                  'Match info',
                  `Found: "${iframeData.contentTitle}"`,
                  `Searched: "${iframeData.searchTitle}"`
                )
              ]);
            } else {
              console.log(`[TukTukCinema] ===== SUCCESS: ${streams.length} streams =====`);
              resolve(streams);
            }
          });
      })
      .catch(function(error) {
        if (error.message === 'Handled' || error.message === 'No results' || 
            error.message === 'Season not found' || error.message === 'Episode not found' ||
            error.message === 'Season URL missing' || error.message === 'Episode URL missing' ||
            error.message === 'No episodes' || error.message === 'No URL' || 
            error.message === 'No iframe') {
          // Already resolved with debug info
          return;
        }
        console.error(`[TukTukCinema] ❌ ERROR: ${error.message}`);
        resolve([
          createDebugStream(
            'Unexpected error',
            error.message,
            'Check console logs'
          )
        ]);
      });
  });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
