// TukTuk Cinema Provider for Nuvio
// Version: 1.6.0 - Full Arabic Support with Episode Number Matching
// Handles: الحلقة (episode) and الموسم (season) with Arabic/English numerals

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://tuktukcenma.cam';
const TMDB_API_KEY = '70896ffbbb915bc34056a969379c0393';

// Set to true to see debug info as streams, false to hide
const DEBUG_MODE = true;

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
  'Referer': 'https://tuktukcenma.cam/'
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

/**
 * Extract episode number from Arabic or English text
 * Handles: الحلقة ٧, الحلقة 7, الحلقه ٧, Episode 7, etc.
 */
function extractEpisodeNumber(text) {
  if (!text) return null;
  
  console.log(`[TukTuk] Extracting episode from: "${text}"`);
  
  // Arabic numerals to English mapping
  const arabicToEnglish = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  
  // Try: الحلقة with English numbers (most common)
  let match = text.match(/الحلقة\s*(\d+)/);
  if (match) {
    console.log(`[TukTuk] Found: الحلقة ${match[1]}`);
    return parseInt(match[1]);
  }
  
  // Try: الحلقه (alternative spelling with ه) with English numbers
  match = text.match(/الحلقه\s*(\d+)/);
  if (match) {
    console.log(`[TukTuk] Found: الحلقه ${match[1]}`);
    return parseInt(match[1]);
  }
  
  // Try: الحلقة with Arabic numerals (٠-٩)
  match = text.match(/الحلقة\s*([٠-٩]+)/);
  if (match) {
    let num = '';
    for (let i = 0; i < match[1].length; i++) {
      num += arabicToEnglish[match[1][i]] || match[1][i];
    }
    console.log(`[TukTuk] Found: الحلقة ${match[1]} = ${num}`);
    return parseInt(num);
  }
  
  // Try: الحلقه with Arabic numerals
  match = text.match(/الحلقه\s*([٠-٩]+)/);
  if (match) {
    let num = '';
    for (let i = 0; i < match[1].length; i++) {
      num += arabicToEnglish[match[1][i]] || match[1][i];
    }
    console.log(`[TukTuk] Found: الحلقه ${match[1]} = ${num}`);
    return parseInt(num);
  }
  
  // Fallback: Try English patterns
  match = text.match(/episode\s*(\d+)/i) || text.match(/ep\.?\s*(\d+)/i) || text.match(/\be(\d+)\b/i);
  if (match) {
    console.log(`[TukTuk] Found English: E${match[1]}`);
    return parseInt(match[1]);
  }
  
  // Last resort: Extract any standalone number
  match = text.match(/\b(\d+)\b/);
  if (match) {
    console.log(`[TukTuk] Found standalone number: ${match[1]}`);
    return parseInt(match[1]);
  }
  
  console.log(`[TukTuk] No episode number found in: "${text}"`);
  return null;
}

/**
 * Extract season number from Arabic or English text
 * Handles: الموسم ١, الموسم 1, Season 1, etc.
 */
function extractSeasonNumber(text) {
  if (!text) return null;
  
  const arabicToEnglish = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  
  // Try: الموسم with English numbers
  let match = text.match(/الموسم\s*(\d+)/);
  if (match) return parseInt(match[1]);
  
  // Try: الموسم with Arabic numerals
  match = text.match(/الموسم\s*([٠-٩]+)/);
  if (match) {
    let num = '';
    for (let i = 0; i < match[1].length; i++) {
      num += arabicToEnglish[match[1][i]] || match[1][i];
    }
    return parseInt(num);
  }
  
  // Fallback: English patterns
  match = text.match(/season\s*(\d+)/i) || text.match(/\bs(\d+)\b/i);
  if (match) return parseInt(match[1]);
  
  return null;
}

function getTitleFromTMDB(tmdbId, mediaType) {
  return new Promise(function(resolve, reject) {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
    
    console.log(`[TukTukCinema] TMDB API: ${tmdbUrl}`);
    
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
          reject(new Error('No title in TMDB response'));
          return;
        }
        
        console.log(`[TukTukCinema] ✓ Title: "${title}" (${year})`);
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
    
    console.log(`[TukTukCinema] ========== NEW REQUEST ==========`);
    console.log(`[TukTukCinema] TMDB ID: ${tmdbId}`);
    console.log(`[TukTukCinema] Type: ${mediaType}`);
    console.log(`[TukTukCinema] Request: S${seasonNum}E${episodeNum}`);
    
    if (DEBUG_MODE) {
      debugStreams.push(
        createDebugStream(
          `Request: S${seasonNum}E${episodeNum}`,
          `TMDB ID: ${tmdbId}`,
          `Type: ${mediaType}`
        )
      );
    }
    
    if (!tmdbId || tmdbId === 'undefined' || tmdbId === 'null') {
      resolve([createDebugStream('ERROR: Invalid TMDB ID', `Received: ${tmdbId}`, 'Cannot search')]);
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
        
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(searchTitle)}`;
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream(`Title: "${searchTitle}"`, `Year: ${searchYear}`, 'From TMDB API'));
        }
        
        return fetch(searchUrl, { headers: WORKING_HEADERS })
          .then(function(response) {
            if (!response.ok) throw new Error(`Search failed: ${response.status}`);
            return response.text();
          })
          .then(function(html) {
            return { html: html, searchTitle: searchTitle, searchYear: searchYear };
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
            console.log(`[TukTukCinema] Found: "${title}" (${(score * 100).toFixed(0)}% match)`);
            results.push({ title: title, url: href, score: score });
          }
        });
        
        if (results.length === 0) {
          console.log('[TukTukCinema] ❌ No results found');
          resolve([
            createDebugStream('ERROR: No results found', `Searched: "${searchData.searchTitle}"`, 'Not available on TukTuk Cinema')
          ].concat(debugStreams));
          return Promise.reject(new Error('No results'));
        }
        
        results.sort(function(a, b) { return b.score - a.score; });
        const bestMatch = results[0];
        
        console.log(`[TukTukCinema] ✓ Best match: "${bestMatch.title}" (${(bestMatch.score * 100).toFixed(0)}%)`);
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream(`Matched: "${bestMatch.title}"`, `Similarity: ${(bestMatch.score * 100).toFixed(0)}%`, 'Best result'));
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
        
        // For movies, use content URL directly
        if (mediaType === 'movie' || !seasonNum || !episodeNum) {
          console.log('[TukTukCinema] Movie mode - using main URL');
          if (DEBUG_MODE) {
            debugStreams.push(createDebugStream('Movie: Using main URL', contentData.contentUrl.substring(0, 50) + '...', 'No episodes'));
          }
          return Promise.resolve({
            episodeUrl: contentData.contentUrl,
            contentTitle: contentData.contentTitle
          });
        }
        
        // TV Show - find episode by matching الحلقة number in title
        console.log(`[TukTukCinema] TV Show mode - looking for الموسم ${seasonNum} الحلقة ${episodeNum}`);
        
        const seasonLinks = $content('section.allseasonss a[href*="/series/"]');
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream(`TV Show: ${seasonLinks.length} season(s) found`, `Need: الموسم ${seasonNum} الحلقة ${episodeNum}`, 'Matching by Arabic title'));
        }
        
        if (seasonLinks.length > 0) {
          // Multi-season series
          console.log(`[TukTukCinema] Multi-season series: ${seasonLinks.length} season(s)`);
          
          if (seasonNum > seasonLinks.length) {
            resolve([
              createDebugStream('ERROR: الموسم not available', `Requested: الموسم ${seasonNum}`, `Available: ${seasonLinks.length} season(s)`)
            ].concat(debugStreams));
            return Promise.reject(new Error('Season not found'));
          }
          
          const seasonLink = seasonLinks.eq(seasonNum - 1);
          const seasonUrl = fixUrl(seasonLink.attr('href'));
          const seasonTitle = seasonLink.find('h3').text().trim() || seasonLink.text().trim();
          
          console.log(`[TukTukCinema] Loading الموسم ${seasonNum}: "${seasonTitle}"`);
          console.log(`[TukTukCinema] Season URL: ${seasonUrl}`);
          
          if (DEBUG_MODE) {
            debugStreams.push(createDebugStream(`Loading الموسم ${seasonNum}`, seasonTitle, `Array index: ${seasonNum - 1}`));
          }
          
          if (!seasonUrl) {
            resolve([
              createDebugStream('ERROR: Season URL missing', `الموسم ${seasonNum}`, 'No href attribute')
            ].concat(debugStreams));
            return Promise.reject(new Error('Season URL missing'));
          }
          
          return fetch(seasonUrl, { headers: WORKING_HEADERS })
            .then(function(response) { return response.text(); })
            .then(function(seasonHtml) {
              const $season = cheerio.load(seasonHtml);
              const episodes = $season('section.allepcont div.row a');
              
              console.log(`[TukTukCinema] الموسم ${seasonNum} has ${episodes.length} episodes total`);
              
              // Search through all episodes to find matching episode number
              let foundEpisode = null;
              let foundIndex = -1;
              let foundTitle = '';
              
              episodes.each(function(index) {
                const $ep = $season(this);
                const epTitle = $ep.find('div.ep-info h2').text().trim() || 
                               $ep.find('div.epnum').text().trim() || 
                               $ep.text().trim();
                
                const epNum = extractEpisodeNumber(epTitle);
                
                console.log(`[TukTukCinema] [Index ${index}] "${epTitle}" => Episode ${epNum}`);
                
                if (epNum === episodeNum) {
                  foundEpisode = $ep;
                  foundIndex = index;
                  foundTitle = epTitle;
                  console.log(`[TukTukCinema] ✓✓✓ MATCH FOUND! ✓✓✓`);
                  return false; // break the loop
                }
              });
              
              if (!foundEpisode) {
                console.log(`[TukTukCinema] ❌ الحلقة ${episodeNum} not found in any title`);
                resolve([
                  createDebugStream('ERROR: الحلقة not found', `الحلقة ${episodeNum} not in titles`, `Total episodes: ${episodes.length}`)
                ].concat(debugStreams));
                return Promise.reject(new Error('Episode not found'));
              }
              
              const episodeUrl = fixUrl(foundEpisode.attr('href'));
              
              console.log(`[TukTukCinema] ✓ Found at array index: ${foundIndex}`);
              console.log(`[TukTukCinema] ✓ Episode title: "${foundTitle}"`);
              console.log(`[TukTukCinema] ✓ Episode URL: ${episodeUrl}`);
              
              if (DEBUG_MODE) {
                debugStreams.push(createDebugStream(`✓ Found الحلقة ${episodeNum}!`, foundTitle, `Array index: ${foundIndex}`));
              }
              
              if (!episodeUrl) {
                resolve([
                  createDebugStream('ERROR: Episode URL missing', `الحلقة ${episodeNum}`, 'No href attribute')
                ].concat(debugStreams));
                return Promise.reject(new Error('Episode URL missing'));
              }
              
              return {
                episodeUrl: episodeUrl,
                contentTitle: contentData.contentTitle
              };
            });
        } else {
          // Single season series
          const episodes = $content('section.allepcont div.row a');
          
          console.log(`[TukTukCinema] Single season series: ${episodes.length} episodes`);
          
          if (episodes.length === 0) {
            resolve([
              createDebugStream('ERROR: No episodes found', 'This might be a movie', contentData.contentUrl)
            ].concat(debugStreams));
            return Promise.reject(new Error('No episodes'));
          }
          
          // Search for episode by number in title
          let foundEpisode = null;
          let foundIndex = -1;
          let foundTitle = '';
          
          episodes.each(function(index) {
            const $ep = $content(this);
            const epTitle = $ep.find('div.ep-info h2').text().trim() || 
                           $ep.find('div.epnum').text().trim() || 
                           $ep.text().trim();
            
            const epNum = extractEpisodeNumber(epTitle);
            
            console.log(`[TukTukCinema] [Index ${index}] "${epTitle}" => Episode ${epNum}`);
            
            if (epNum === episodeNum) {
              foundEpisode = $ep;
              foundIndex = index;
              foundTitle = epTitle;
              console.log(`[TukTukCinema] ✓✓✓ MATCH FOUND! ✓✓✓`);
              return false; // break
            }
          });
          
          if (!foundEpisode) {
            console.log(`[TukTukCinema] ❌ الحلقة ${episodeNum} not found`);
            resolve([
              createDebugStream('ERROR: الحلقة not found', `الحلقة ${episodeNum}`, `Total: ${episodes.length}`)
            ].concat(debugStreams));
            return Promise.reject(new Error('Episode not found'));
          }
          
          const episodeUrl = fixUrl(foundEpisode.attr('href'));
          
          console.log(`[TukTukCinema] ✓ Found at index: ${foundIndex}`);
          console.log(`[TukTukCinema] ✓ Title: "${foundTitle}"`);
          
          if (DEBUG_MODE) {
            debugStreams.push(createDebugStream(`✓ Found الحلقة ${episodeNum}`, foundTitle, `Index: ${foundIndex}`));
          }
          
          if (!episodeUrl) {
            resolve([
              createDebugStream('ERROR: Episode URL missing', '', '')
            ].concat(debugStreams));
            return Promise.reject(new Error('Episode URL missing'));
          }
          
          return Promise.resolve({
            episodeUrl: episodeUrl,
            contentTitle: contentData.contentTitle
          });
        }
      })
      .then(function(result) {
        if (!result || !result.episodeUrl) {
          resolve([
            createDebugStream('ERROR: No episode URL', 'Processing failed', '')
          ].concat(debugStreams));
          return Promise.reject(new Error('No URL'));
        }
        
        const watchUrl = result.episodeUrl.endsWith('/') 
          ? `${result.episodeUrl}watch/` 
          : `${result.episodeUrl}/watch/`;
        
        console.log(`[TukTukCinema] Loading watch page: ${watchUrl}`);
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream('Loading watch page', watchUrl.substring(0, 50) + '...', 'Looking for iframe'));
        }
        
        return fetch(watchUrl, { headers: WORKING_HEADERS })
          .then(function(response) { return response.text(); })
          .then(function(html) {
            return {
              watchHtml: html,
              watchUrl: watchUrl,
              contentTitle: result.contentTitle
            };
          });
      })
      .then(function(watchData) {
        const $watch = cheerio.load(watchData.watchHtml);
        const iframe = $watch('div.player--iframe iframe');
        const iframeSrc = fixUrl(iframe.attr('src'));
        
        if (!iframeSrc) {
          console.log('[TukTukCinema] ❌ No iframe found on watch page');
          resolve([
            createDebugStream('ERROR: No video iframe', 'Watch page has no player', watchData.watchUrl)
          ].concat(debugStreams));
          return Promise.reject(new Error('No iframe'));
        }
        
        console.log(`[TukTukCinema] ✓ Found iframe: ${iframeSrc}`);
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream('Found iframe', iframeSrc.substring(0, 50) + '...', iframeSrc.includes('megatukmax') ? 'MegaTukMax' : 'External'));
        }
        
        // If it's not megatukmax, return as external player
        if (!iframeSrc.includes('megatukmax')) {
          console.log('[TukTukCinema] External iframe detected');
          const streams = [{
            name: 'TukTuk - External Player',
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
          resolve(DEBUG_MODE ? debugStreams.concat(streams) : streams);
          return Promise.reject(new Error('Handled'));
        }
        
        // MegaTukMax iframe - extract streams via Inertia API
        const iframeId = iframeSrc.split('/').pop();
        const iframeUrl = `https://w.megatukmax.xyz/iframe/${iframeId}`;
        
        console.log(`[TukTukCinema] Loading MegaTukMax iframe: ${iframeUrl}`);
        
        return fetch(iframeUrl, { 
          headers: { ...WORKING_HEADERS, 'Referer': watchData.watchUrl }
        })
        .then(function(response) { return response.text(); })
        .then(function(html) {
          return {
            iframeHtml: html,
            iframeUrl: iframeUrl,
            contentTitle: watchData.contentTitle
          };
        });
      })
      .then(function(iframeData) {
        // Extract Inertia version from iframe HTML
        let version = '';
        const patterns = [
          /"version"\s*:\s*"([a-f0-9]{32,})"/,
          /X-Inertia-Version["']?\s*[:=]\s*["']([a-f0-9]{32,})["']/
        ];
        
        for (let i = 0; i < patterns.length; i++) {
          const match = iframeData.iframeHtml.match(patterns[i]);
          if (match && match[1]) {
            version = match[1];
            console.log(`[TukTukCinema] ✓ Extracted Inertia version: ${version}`);
            break;
          }
        }
        
        // Fallback version if extraction fails
        if (!version) {
          version = '852467c2571830b8584cc9bce61b6cde';
          console.log(`[TukTukCinema] Using fallback Inertia version: ${version}`);
        }
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream('Inertia API call', `Version: ${version.substring(0, 8)}...`, 'Getting stream URLs'));
        }
        
        // Make Inertia API request to get streams
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
        
        console.log('[TukTukCinema] Making Inertia API request...');
        
        return fetch(iframeData.iframeUrl, { headers: inertiaHeaders })
          .then(function(response) { return response.json(); })
          .then(function(apiData) {
            const streams = [];
            
            if (apiData.props && apiData.props.streams && apiData.props.streams.data) {
              const qualities = apiData.props.streams.data;
              console.log(`[TukTukCinema] ✓ API returned ${qualities.length} quality option(s)`);
              
              if (DEBUG_MODE) {
                debugStreams.push(createDebugStream(`✓ API Success: ${qualities.length} qualities`, 'Extracting stream URLs', 'Check streams below'));
              }
              
              for (let i = 0; i < qualities.length; i++) {
                const quality = qualities[i];
                const label = quality.label || 'Unknown';
                
                if (quality.mirrors && quality.mirrors.length > 0) {
                  for (let j = 0; j < quality.mirrors.length; j++) {
                    const mirror = quality.mirrors[j];
                    let link = mirror.link;
                    
                    // Fix protocol-relative URLs
                    if (link && link.startsWith('//')) {
                      link = `https:${link}`;
                    }
                    
                    if (link) {
                      const driver = mirror.driver || 'source';
                      console.log(`[TukTukCinema] ✓ Stream: ${label} (${driver})`);
                      
                      streams.push({
                        name: `TukTuk - ${label} (${driver})`,
                        title: iframeData.contentTitle,
                        url: link,
                        quality: label,
                        size: 'Unknown',
                        headers: {
                          'User-Agent': WORKING_HEADERS['User-Agent'],
                          'Accept': '*/*',
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
              console.log('[TukTukCinema] ❌ No streams extracted from API response');
              resolve([
                createDebugStream('ERROR: No streams', 'API returned no data', 'Check TukTuk Cinema')
              ].concat(debugStreams));
            } else {
              console.log(`[TukTukCinema] ========== SUCCESS: ${streams.length} stream(s) ready ==========`);
              resolve(DEBUG_MODE ? debugStreams.concat(streams) : streams);
            }
          });
      })
      .catch(function(error) {
        if (error.message === 'Handled' || error.message === 'No results' || 
            error.message === 'Season not found' || error.message === 'Episode not found' ||
            error.message === 'Season URL missing' || error.message === 'Episode URL missing' ||
            error.message === 'No episodes' || error.message === 'No URL' || 
            error.message === 'No iframe') {
          // Already resolved with appropriate debug info
          return;
        }
        console.error(`[TukTukCinema] Unexpected error: ${error.message}`);
        resolve([
          createDebugStream('UNEXPECTED ERROR', error.message, 'Check console logs')
        ].concat(debugStreams));
      });
  });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
