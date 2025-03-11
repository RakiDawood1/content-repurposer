// src/controllers/combinedController.js - Enhanced with better error handling
const { getVideoId, fetchTranscript, refineTranscript, checkVideoAvailability } = require('../services/transcriptService');
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
    // Get parameters from request
    const { url, language = 'en', skipRefinement = false, generateBlog = true } = req.body;
    
    // Validate request
    if (!url) {
      return res.status(400).json({ 
        success: false,
        error: 'YouTube URL is required',
        message: 'Please provide a valid YouTube URL in the request body'
      });
    }
    
    // Extract video ID
    const videoId = getVideoId(url);
    if (!videoId) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid YouTube URL',
        message: 'Could not extract a valid YouTube video ID from the provided URL'
      });
    }
    
    logger.info(`Processing video ${videoId} with language ${language}`);

    // Check video availability before proceeding
    const videoAvailability = await checkVideoAvailability(videoId);
    if (!videoAvailability.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Video not available',
        message: videoAvailability.error
      });
    }
    
    // Create a unique cache key based on all parameters
    const cacheKey = `combined-${videoId}-${language}-${skipRefinement}-${generateBlog}`;
    const cachedResult = combinedCache.get(cacheKey);
    
    if (cachedResult) {
      logger.info(`Cache hit for combined processing of video ${videoId}`);
      return res.json({
        success: true,
        ...cachedResult,
        cached: true
      });
    }
    
    // Start processing
    logger.info(`Processing video ${videoId} for transcript and blog`);
    const startTime = Date.now();
    
    // 1. Fetch transcript with comprehensive error handling
    let rawTranscript;
    try {
      rawTranscript = await fetchTranscript(videoId, language);
      
      if (!rawTranscript || rawTranscript.length === 0) {
        throw new Error('Empty transcript retrieved');
      }
      
      logger.info(`Successfully fetched transcript with ${rawTranscript.length} segments`);
    } catch (transcriptError) {
      logger.error(`Transcript error: ${transcriptError.message}`);
      return res.status(404).json({ 
        success: false,
        error: 'Transcript unavailable',
        message: transcriptError.message,
        videoId,
        videoTitle: videoAvailability.title
      });
    }
    
    // 2. Refine transcript if needed with error handling
    let refinedTranscript = null;
    if (!skipRefinement) {
      try {
        refinedTranscript = await refineTranscript(rawTranscript);
        logger.info(`Successfully refined transcript with ${refinedTranscript.length} segments`);
      } catch (refinementError) {
        logger.warn(`Transcript refinement failed: ${refinementError.message}`);
        logger.info('Proceeding with raw transcript');
        // Continue with raw transcript rather than failing
      }
    }
    
    // 3. Prepare the transcript response
    const transcriptResult = {
      videoId,
      videoTitle: videoAvailability.title,
      raw: rawTranscript,
      refined: refinedTranscript || null
    };
    
    // 4. If blog generation is not required, return just the transcript
    if (!generateBlog) {
      const result = {
        success: true,
        ...transcriptResult,
        processingTime: Date.now() - startTime
      };
      
      combinedCache.set(cacheKey, result);
      return res.json(result);
    }
    
    // 5. Generate blog from the best available transcript
    const transcriptToUse = refinedTranscript || rawTranscript;
    
    let blog;
    try {
      blog = await generateBlogFromTranscript(transcriptToUse, videoId, videoAvailability.title);
      logger.info('Successfully generated blog post');
    } catch (blogError) {
      logger.error(`Blog generation failed: ${blogError.message}`);
      return res.status(500).json({ 
        success: false,
        error: 'Blog generation failed',
        message: blogError.message,
        transcript: transcriptResult // Return transcript even if blog fails
      });
    }
    
    // 6. Combine results
    const result = {
      success: true,
      ...transcriptResult,
      blog,
      processingTime: Date.now() - startTime
    };
    
    logger.info(`Completed processing in ${Date.now() - startTime}ms`);
    
    // Cache the result
    combinedCache.set(cacheKey, result);
    
    return res.json(result);
  } catch (error) {
    logger.error(`Unexpected error in combined processing: ${error.message}`);
    
    return res.status(500).json({
      success: false,
      error: 'Processing failed',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred while processing the request' 
        : error.message
    });
  }
}

module.exports = {
  processYouTubeUrl
};