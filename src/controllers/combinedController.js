// src/controllers/combinedController.js - With fallback to alternative service
const originalService = require('../services/transcriptService');
const alternativeService = require('../services/alternativeTranscriptService');
const { generateBlogFromTranscript } = require('../services/blogGeneratorService');
const logger = require('../utils/logger');
const { debugTranscriptIssue } = require('../utils/transcriptDebug');
const NodeCache = require('node-cache');

// In-memory cache with TTL (Time-To-Live)
const combinedCache = new NodeCache({ 
  stdTTL: process.env.CACHE_TTL || 3600, // Default: 1 hour
  checkperiod: 120 // Check for expired keys every 2 minutes
});

/**
 * Process a YouTube URL to get transcript and generate a blog in one request
 * With fallback to alternative transcript service
 */
async function processYouTubeUrl(req, res, next) {
  try {
    // Get parameters from request
    const { 
      url, 
      language = 'en', 
      skipRefinement = false, 
      generateBlog = true, 
      fallbackMessage = true,
      debug = false,
      preferAlternativeService = false  // New option to prefer alternative service
    } = req.body;
    
    // Validate request
    if (!url) {
      return res.status(400).json({ 
        success: false,
        error: 'YouTube URL is required',
        message: 'Please provide a valid YouTube URL in the request body'
      });
    }
    
    // Extract video ID
    const videoId = originalService.getVideoId(url);
    if (!videoId) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid YouTube URL',
        message: 'Could not extract a valid YouTube video ID from the provided URL'
      });
    }
    
    // Debug mode - collect detailed information
    if (debug) {
      logger.info(`Running in debug mode for video ${videoId}`);
      try {
        const debugInfo = await debugTranscriptIssue(videoId, { language });
        return res.json({
          success: true,
          debug: true,
          debugInfo
        });
      } catch (debugError) {
        logger.error(`Debug mode failed: ${debugError.message}`);
        // Continue with normal processing
      }
    }
    
    logger.info(`Processing video ${videoId} with language ${language}`);
    
    // Create a unique cache key based on all parameters
    const cacheKey = `combined-${videoId}-${language}-${skipRefinement}-${generateBlog}-${fallbackMessage}-${preferAlternativeService}`;
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
    
    // Try to fetch the transcript using the appropriate service
    let transcript;
    let transcriptUnavailable = false;
    let usedAlternativeService = false;
    let transcriptError = null;
    
    // Determine which service to try first
    const primaryService = preferAlternativeService ? alternativeService : originalService;
    const secondaryService = preferAlternativeService ? originalService : alternativeService;
    
    // First attempt with primary service
    try {
      logger.info(`Attempting to fetch transcript with ${preferAlternativeService ? 'alternative' : 'original'} service`);
      transcript = await primaryService.fetchTranscript(videoId, language);
      
      if (preferAlternativeService) {
        usedAlternativeService = true;
      }
    } catch (primaryError) {
      logger.warn(`Primary transcript service failed: ${primaryError.message}`);
      transcriptError = primaryError;
      
      // Second attempt with secondary service
      try {
        logger.info(`Attempting to fetch transcript with ${preferAlternativeService ? 'original' : 'alternative'} service`);
        transcript = await secondaryService.fetchTranscript(videoId, language);
        
        if (!preferAlternativeService) {
          usedAlternativeService = true;
        }
      } catch (secondaryError) {
        logger.warn(`Secondary transcript service failed: ${secondaryError.message}`);
        
        // Both services failed - use fallback message if enabled
        if (fallbackMessage) {
          logger.info('Using fallback message in place of transcript');
          // Use the service that's available for the fallback message
          const fallbackService = alternativeService.generateBasicTranscript ? alternativeService : originalService;
          transcript = await fallbackService.generateBasicTranscript(videoId);
          transcriptUnavailable = true;
        } else {
          // Return error if fallback message is disabled
          return res.status(404).json({
            success: false,
            error: 'Transcript unavailable',
            message: `Unable to retrieve transcript: ${primaryError.message}`,
            videoId
          });
        }
      }
    }
    
    // Refine transcript if needed and available
    let refinedTranscript = null;
    if (!skipRefinement && !transcriptUnavailable) {
      try {
        // Use the service that provided the transcript
        const refinementService = usedAlternativeService ? alternativeService : originalService;
        refinedTranscript = await refinementService.refineTranscript(transcript);
      } catch (refinementError) {
        logger.warn(`Transcript refinement failed: ${refinementError.message}`);
        // Continue with unrefined transcript
      }
    }
    
    // Prepare the transcript response
    const transcriptResult = {
      videoId,
      raw: transcript,
      refined: refinedTranscript,
      transcriptUnavailable,
      usedAlternativeService
    };
    
    // If blog generation is not required, return just the transcript
    if (!generateBlog) {
      const result = {
        success: true,
        ...transcriptResult,
        processingTime: Date.now() - startTime
      };
      
      combinedCache.set(cacheKey, result);
      return res.json(result);
    }
    
    // Generate blog from the best available transcript
    let blog;
    try {
      // Use the best available transcript version
      const transcriptToUse = refinedTranscript || transcript;
      blog = await generateBlogFromTranscript(transcriptToUse, videoId);
      
      // Add a note if this was generated from a fallback message
      if (transcriptUnavailable) {
        blog.note = "This blog was generated without an actual video transcript. The content is based on a generic message as the video's transcript was unavailable.";
      }
    } catch (blogError) {
      logger.error(`Blog generation failed: ${blogError.message}`);
      return res.status(500).json({
        success: false,
        error: 'Blog generation failed',
        message: blogError.message,
        transcript: transcriptResult
      });
    }
    
    // Combine results
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