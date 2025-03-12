// src/controllers/blogController.js
const { generateBlogFromTranscript } = require('../services/blogGeneratorService');
const logger = require('../utils/logger');

/**
 * Generate a blog post from transcript data
 */
async function generateBlog(req, res, next) {
  try {
    const { transcript, videoId } = req.body;
    
    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: 'Valid transcript data is required' });
    }
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    logger.info(`Generating blog for video ${videoId} with ${transcript.length} transcript segments`);
    
    const blog = await generateBlogFromTranscript(transcript, videoId);
    
    return res.json({
      success: true,
      blog
    });
  } catch (error) {
    logger.error(`Error generating blog: ${error.message}`);
    next(error);
  }
}

module.exports = {
  generateBlog
};