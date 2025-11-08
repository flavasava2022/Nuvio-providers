// TukTuk Cinema Provider for Nuvio
// Version: 1.0.0
// Supports: Movies, TV Series, Anime
// Language: Arabic, English

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://tuktukcenma.cam';

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
 * Fix relative URLs to absolute URLs
 */
function fixUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${MAIN_URL}${url}`;
  return `${MAIN_URL}/${url}`;
}

/**
 * Main function to get streams for a given TMDB ID
 * @param {string} tmdbId - TMDB ID of the content
 * @param {string} mediaType - "movie" or "tv"
 * @param {number} seasonNum - Season number (for TV shows)
 * @param {number} episodeNum - Episode number (for TV shows)
 * @returns {Promise<Array>} Array of stream objects
 */
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function(resolve, reject) {
    console.log(`[TukTukCinema] Starting search for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    
    if (mediaType === 'tv' && seasonNum && episodeNum) {
      console.log(`[TukTukCinema] Looking for Season ${seasonNum}, Episode ${episodeNum}`);
    }
    
    // Step 1: Search for content by TMDB ID
    const searchUrl = `${MAIN_URL}/?s=${tmdbId}`;
    
    fetch(searchUrl, {
      headers: WORKING_HEADERS
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }
      return response.text();
    })
    .then(function(html) {
      const $ = cheerio.load(html);
      const results = [];
      
      // Find search results
      $('div.Block--Item').each(function() {
        const $item = $(this);
        const link = $item.find('a').first();
        const href = fixUrl(link.attr('href'));
        const title = $item.find('div.Block--Info h3').text().trim() || link.attr('title') || '';
        
        if (href && title) {
          results.push({
            title: title,
            url: href
          });
        }
      });
      
      if (results.length === 0) {
        console.log('[TukTukCinema] No results found for TMDB ID');
        resolve([]);
        return Promise.reject(new Error('No results'));
      }
      
      console.log(`[TukTukCinema] Found ${results.length} result(s): ${results[0].title}`);
      
      // Use the first result
      const contentUrl = results[0].url;
      const contentTitle = results[0].title;
      
      // Step 2: Load the content page
      return fetch(contentUrl, { headers: WORKING_HEADERS })
        .then(function(response) {
          return response.text();
        })
        .then(function(contentHtml) {
          return {
            html: contentHtml,
            contentUrl: contentUrl,
            contentTitle: contentTitle
          };
        });
    })
    .then(function(contentData) {
      const $content = cheerio.load(contentData.html);
      let episodeUrl = contentData.contentUrl;
      
      // If it's a TV show, find the specific episode
      if (mediaType === 'tv' && seasonNum && episodeNum) {
        console.log(`[TukTukCinema] Navigating to Season ${seasonNum}, Episode ${episodeNum}`);
        
        // Check for multi-season series
        const seasonLinks = $content('section.allseasonss a[href*=/series/]');
        
        if (seasonLinks.length > 0) {
          console.log(`[TukTukCinema] Found ${seasonLinks.length} season(s)`);
          
          // Get the specific season link
          const seasonLink = seasonLinks.eq(seasonNum - 1);
          const seasonUrl = fixUrl(seasonLink.attr('href'));
          
          if (!seasonUrl) {
            console.log('[TukTukCinema] Season not found');
            resolve([]);
            return Promise.reject(new Error('Season not found'));
          }
          
          console.log(`[TukTukCinema] Loading season page: ${seasonUrl}`);
          
          // Load the season page to get episodes
          return fetch(seasonUrl, { headers: WORKING_HEADERS })
            .then(function(seasonResponse) {
              return seasonResponse.text();
            })
            .then(function(seasonHtml) {
              const $season = cheerio.load(seasonHtml);
              const episodes = $season('section.allepcont div.row a');
              
              console.log(`[TukTukCinema] Found ${episodes.length} episodes in season`);
              
              const episode = episodes.eq(episodeNum - 1);
              episodeUrl = fixUrl(episode.attr('href'));
              
              if (!episodeUrl) {
                console.log('[TukTukCinema] Episode not found');
                resolve([]);
                return Promise.reject(new Error('Episode not found'));
              }
              
              console.log(`[TukTukCinema] Episode URL: ${episodeUrl}`);
              
              return {
                episodeUrl: episodeUrl,
                contentTitle: contentData.contentTitle
              };
            });
        } else {
          // Single season series
          const episodes = $content('section.allepcont div.row a');
          
          console.log(`[TukTukCinema] Found ${episodes.length} episodes (single season)`);
          
          const episode = episodes.eq(episodeNum - 1);
          episodeUrl = fixUrl(episode.attr('href'));
          
          if (!episodeUrl) {
            console.log('[TukTukCinema] Episode not found');
            resolve([]);
            return Promise.reject(new Error('Episode not found'));
          }
          
          console.log(`[TukTukCinema] Episode URL: ${episodeUrl}`);
          
          return Promise.resolve({
            episodeUrl: episodeUrl,
            contentTitle: contentData.contentTitle
          });
        }
      }
      
      // For movies, use the content URL directly
      return Promise.resolve({
        episodeUrl: episodeUrl,
        contentTitle: contentData.contentTitle
      });
    })
    .then(function(result) {
      if (!result || !result.episodeUrl) {
        resolve([]);
        return Promise.reject(new Error('No episode URL'));
      }
      
      // Step 3: Get the watch page
      const watchUrl = result.episodeUrl.endsWith('/') 
        ? `${result.episodeUrl}watch/` 
        : `${result.episodeUrl}/watch/`;
      
      console.log(`[TukTukCinema] Loading watch page: ${watchUrl}`);
      
      return fetch(watchUrl, { headers: WORKING_HEADERS })
        .then(function(watchResponse) {
          return watchResponse.text();
        })
        .then(function(watchHtml) {
          return {
            watchHtml: watchHtml,
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
        console.log('[TukTukCinema] No iframe found on watch page');
        resolve([]);
        return Promise.reject(new Error('No iframe found'));
      }
      
      console.log(`[TukTukCinema] Found iframe: ${iframeSrc}`);
      
      // Check if it's a megatukmax iframe
      if (!iframeSrc.includes('megatukmax')) {
        console.log('[TukTukCinema] Non-megatukmax iframe, returning as direct source');
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
      
      // Extract iframe ID and construct megatukmax URL
      const iframeId = iframeSrc.split('/').pop();
      const iframeUrl = `https://w.megatukmax.xyz/iframe/${iframeId}`;
      
      console.log(`[TukTukCinema] Loading megatukmax iframe: ${iframeUrl}`);
      
      // Step 4: Load iframe to extract Inertia version
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
          contentTitle: watchData.contentTitle
        };
      });
    })
    .then(function(iframeData) {
      // Extract Inertia version from HTML
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
          console.log(`[TukTukCinema] Extracted Inertia version: ${version}`);
          break;
        }
      }
      
      // Fallback version if not found
      if (!version) {
        version = '852467c2571830b8584cc9bce61b6cde';
        console.log(`[TukTukCinema] Using fallback Inertia version: ${version}`);
      }
      
      // Step 5: Make Inertia API request to get streams
      const inertiaHeaders = {
        ...WORKING_HEADERS,
        'X-Inertia': 'true',
        'X-Inertia-Version': version,
        'X-Inertia-Partial-Component': 'files/mirror/video',
        'X-Inertia-Partial-Data': 'streams',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': iframeData.iframeUrl
      };
      
      console.log('[TukTukCinema] Making Inertia API request');
      
      return fetch(iframeData.iframeUrl, { headers: inertiaHeaders })
        .then(function(apiResponse) {
          return apiResponse.json();
        })
        .then(function(apiData) {
          const streams = [];
          
          if (apiData.props && apiData.props.streams && apiData.props.streams.data) {
            const qualities = apiData.props.streams.data;
            console.log(`[TukTukCinema] Found ${qualities.length} quality option(s)`);
            
            // Process each quality
            for (let i = 0; i < qualities.length; i++) {
              const quality = qualities[i];
              const label = quality.label || 'Unknown';
              
              if (quality.mirrors && quality.mirrors.length > 0) {
                // Process each mirror
                for (let j = 0; j < quality.mirrors.length; j++) {
                  const mirror = quality.mirrors[j];
                  let link = mirror.link;
                  
                  // Fix protocol-relative URLs
                  if (link && link.startsWith('//')) {
                    link = `https:${link}`;
                  }
                  
                  if (link) {
                    const driver = mirror.driver || 'Unknown';
                    console.log(`[TukTukCinema] Added stream: ${label} (${driver})`);
                    
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
            console.log('[TukTukCinema] No streams found in API response');
          } else {
            console.log(`[TukTukCinema] Successfully extracted ${streams.length} stream(s)`);
          }
          
          resolve(streams);
        });
    })
    .catch(function(error) {
      if (error.message === 'Handled') {
        // Already resolved, ignore
        return;
      }
      if (error.message === 'No results' || error.message === 'Season not found' || 
          error.message === 'Episode not found' || error.message === 'No episode URL' || 
          error.message === 'No iframe found') {
        // Already resolved with empty array
        return;
      }
      console.error(`[TukTukCinema] Error: ${error.message}`);
      resolve([]);
    });
  });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
