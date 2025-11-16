// Test file for TukTuk Cinema provider
const { getStreams } = require('../providers/cimanow.js');

console.log('=================================');
console.log('Testing TukTuk Cinema Provider');
console.log('=================================\n');

// Test 1: Movie
console.log('Test 1: Movie (TMDB ID: 550 - Fight Club)');
getStreams('550', 'movie')
  .then(function(streams) {
    console.log(`✓ Found ${streams.length} stream(s)\n`);
    if (streams.length > 0) {
      console.log('Sample stream:');
      console.log(JSON.stringify(streams[0], null, 2));
    }
    console.log('\n---------------------------------\n');
    
    // Test 2: TV Show - Single Episode
    console.log('Test 2: TV Show (TMDB ID: 1399 - Game of Thrones S01E01)');
    return getStreams('1399', 'tv', 1, 1);
  })
  .then(function(streams) {
    console.log(`✓ Found ${streams.length} stream(s)\n`);
    if (streams.length > 0) {
      console.log('Sample stream:');
      console.log(JSON.stringify(streams[0], null, 2));
    }
    console.log('\n---------------------------------\n');
    console.log('✓ All tests completed');
  })
  .catch(function(error) {
    console.error('✗ Test failed:', error.message);
  });
