// src/utils/transcriptDebug.js
const { YoutubeTranscript } = require('youtube-transcript');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Utility to debug transcript issues by trying multiple methods and logging detailed results
 */
async function debugTranscriptIssue(videoId, options = {}) {
  const debugInfo = {
    videoId,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    options,
    results: {},
    error: null
  };
  
  try {
    // 1. Check basic video info
    try {
      const response = await axios.get(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`);
      debugInfo.results.videoInfo = {
        success: true,
        title: response.data.title,
        author: response.data.author_name,
        thumbnailUrl: response.data.thumbnail_url
      };
    } catch (error) {
      debugInfo.results.videoInfo = {
        success: false,
        error: error.message
      };
    }
    
    // 2. Check direct HTML for transcript hints
    try {
      const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const html = response.data;
      const captionsExist = html.includes('"captions":') || 
                            html.includes('"captionTracks":') || 
                            html.includes('timedtext');
      
      debugInfo.results.htmlCheck = {
        success: true,
        length: html.length,
        captionsHintFound: captionsExist,
        textSample: html.substring(0, 200) + '...'
      };
    } catch (error) {
      debugInfo.results.htmlCheck = {
        success: false,
        error: error.message
      };
    }
    
    // 3. Try multiple transcript fetch methods
    const transcriptMethods = [
      { name: 'default', options: {} },
      { name: 'english-specific', options: { lang: 'en' } },
      { name: 'english-us', options: { lang: 'en-US' } },
      { name: 'with-country', options: { lang: 'en', country: 'US' } },
      // Add more methods as needed
    ];
    
    debugInfo.results.transcriptAttempts = [];
    
    for (const method of transcriptMethods) {
      try {
        const startTime = Date.now();
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, method.options);
        const endTime = Date.now();
        
        debugInfo.results.transcriptAttempts.push({
          method: method.name,
          options: method.options,
          success: true,
          segmentCount: transcript.length,
          elapsedMs: endTime - startTime,
          sampleSegments: transcript.slice(0, 2) // Include first 2 segments as sample
        });
      } catch (error) {
        debugInfo.results.transcriptAttempts.push({
          method: method.name,
          options: method.options,
          success: false,
          error: error.message,
          errorType: error.constructor.name
        });
      }
    }
    
    // 4. Package library version info
    try {
      // Try to get version from package.json in the youtube-transcript directory
      const packageJsonPath = path.resolve(require.resolve('youtube-transcript'), '../../package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      debugInfo.libraryInfo = {
        name: 'youtube-transcript',
        version: packageJson.version,
        dependencies: packageJson.dependencies
      };
    } catch (error) {
      debugInfo.libraryInfo = {
        error: `Could not get library info: ${error.message}`
      };
    }
    
    // Save debug output to a log file
    const debugOutputPath = path.join(process.cwd(), 'logs', 'transcript-debug');
    try {
      await fs.mkdir(debugOutputPath, { recursive: true });
      const filename = `${videoId}-${Date.now()}.json`;
      await fs.writeFile(
        path.join(debugOutputPath, filename),
        JSON.stringify(debugInfo, null, 2)
      );
      logger.info(`Debug info saved to logs/transcript-debug/${filename}`);
    } catch (error) {
      logger.error(`Failed to save debug info: ${error.message}`);
    }
    
    return debugInfo;
  } catch (error) {
    logger.error(`Debug process failed: ${error.message}`);
    debugInfo.error = error.message;
    return debugInfo;
  }
}

module.exports = {
  debugTranscriptIssue
};