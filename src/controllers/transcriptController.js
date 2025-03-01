// src/controllers/transcriptController.js - Modified version
const { getVideoId, fetchTranscript, refineTranscript } = require('../services/transcriptService');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

const transcriptCache = new NodeCache({ 
  stdTTL: process.env.CACHE_TTL || 3600,
  checkperiod: 120
});

async function getTranscript(req, res, next) {
  try {
    const { url, language = 'en', skipRefinement = false } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }
    
    const videoId = getVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    // Use different cache keys for raw vs. refined
    const cacheKey = skipRefinement 
      ? `raw-${videoId}-${language}` 
      : `refined-${videoId}-${language}`;
      
    const cachedResult = transcriptCache.get(cacheKey);
    
    if (cachedResult) {
      logger.info(`Cache hit for video ${videoId}`);
      return res.json(cachedResult);
    }
    
    // Fetch transcript
    const rawTranscript = await fetchTranscript(videoId, language);
    
    // Skip refinement if requested (for faster results)
    if (skipRefinement) {
      const result = {
        videoId,
        transcript: rawTranscript.map(item => ({
          ...item,
          original: item.text
        }))
      };
      
      transcriptCache.set(cacheKey, result);
      return res.json(result);
    }
    
    // Otherwise proceed with refinement
    const refinedTranscript = await refineTranscript(rawTranscript);
    
    const result = {
      videoId,
      raw: rawTranscript,
      refined: refinedTranscript
    };
    
    transcriptCache.set(cacheKey, result);
    
    return res.json(result);
  } catch (error) {
    logger.error(`Error processing transcript: ${error.message}`);
    
    if (error.message === 'Transcript not available') {
      return res.status(404).json({ error: 'Transcript not available for this video' });
    }
    
    next(error);
  }
}

module.exports = {
  getTranscript
};