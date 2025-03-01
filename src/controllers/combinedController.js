// src/controllers/combinedController.js
const { getVideoId, fetchTranscript, refineTranscript } = require('../services/transcriptService');
const { generateBlogFromTranscript } = require('../services/blogGeneratorService');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

// In-memory cache with TTL (Time-To-Live)
const combinedCache = new NodeCache({ 
  stdTTL: process.env.CACHE_TTL || 3600, // Default: 1 hour
  checkperiod: 120 // Check for expired keys every 2 minutes
});

/**
 * Process a YouTube URL to get transcript and generate a blog in one request
 */
async function processYouTubeUrl(req, res, next) {
  try {
    const { url, language = 'en', skipRefinement = false, generateBlog = true } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }
    
    const videoId = getVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    // Create a unique cache key based on all parameters
    const cacheKey = `combined-${videoId}-${language}-${skipRefinement}-${generateBlog}`;
    const cachedResult = combinedCache.get(cacheKey);
    
    if (cachedResult) {
      logger.info(`Cache hit for combined processing of video ${videoId}`);
      return res.json(cachedResult);
    }
    
    // Start processing
    logger.info(`Processing video ${videoId} for transcript and blog`);
    const startTime = Date.now();
    
    // 1. Fetch transcript
    const rawTranscript = await fetchTranscript(videoId, language);
    
    // 2. Refine transcript if needed
    const refinedTranscript = skipRefinement ? null : await refineTranscript(rawTranscript);
    
    // 3. Prepare the transcript response
    const transcriptResult = {
      videoId,
      raw: rawTranscript,
      refined: refinedTranscript || null
    };
    
    // 4. If blog generation is not required, return just the transcript
    if (!generateBlog) {
      combinedCache.set(cacheKey, transcriptResult);
      return res.json(transcriptResult);
    }
    
    // 5. Generate blog from the best available transcript
    const transcriptToUse = refinedTranscript || rawTranscript;
    const blog = await generateBlogFromTranscript(transcriptToUse, videoId);
    
    // 6. Combine results
    const result = {
      ...transcriptResult,
      blog
    };
    
    const endTime = Date.now();
    logger.info(`Completed processing in ${endTime - startTime}ms`);
    
    // Cache the result
    combinedCache.set(cacheKey, result);
    
    return res.json(result);
  } catch (error) {
    logger.error(`Error in combined processing: ${error.message}`);
    
    if (error.message === 'Transcript not available') {
      return res.status(404).json({ error: 'Transcript not available for this video' });
    }
    
    next(error);
  }
}

module.exports = {
  processYouTubeUrl
};