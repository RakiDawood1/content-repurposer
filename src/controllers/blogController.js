// src/controllers/blogController.js
const { generateBlogFromTranscript } = require('../services/blogGeneratorService');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

// In-memory cache with TTL (Time-To-Live)
const blogCache = new NodeCache({ 
  stdTTL: process.env.CACHE_TTL || 3600, // Default: 1 hour
  checkperiod: 120 // Check for expired keys every 2 minutes
});

/**
 * Generate a blog post from a YouTube transcript
 */
async function generateBlog(req, res, next) {
  try {
    const { transcript, videoId, useRefined = true } = req.body;
    
    if (!transcript || !videoId) {
      return res.status(400).json({ 
        error: 'Both transcript data and videoId are required' 
      });
    }
    
    // Check which transcript to use (refined or raw)
    const transcriptData = useRefined && transcript.refined ? 
      transcript.refined : 
      (transcript.raw || transcript);
    
    // Check cache first
    const cacheKey = `blog-${videoId}-${useRefined ? 'refined' : 'raw'}`;
    const cachedBlog = blogCache.get(cacheKey);
    
    if (cachedBlog) {
      logger.info(`Cache hit for blog from video ${videoId}`);
      return res.json(cachedBlog);
    }
    
    // Generate the blog post
    const blog = await generateBlogFromTranscript(transcriptData, videoId);
    
    // Store in cache
    blogCache.set(cacheKey, blog);
    
    return res.json(blog);
  } catch (error) {
    logger.error(`Error generating blog: ${error.message}`);
    next(error);
  }
}

module.exports = {
  generateBlog
};