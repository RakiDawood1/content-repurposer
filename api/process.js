// api/process.js - Updated with support for alternative service and debug mode
require('dotenv').config();
const { processYouTubeUrl } = require('../src/controllers/combinedController');

module.exports = async (req, res) => {
  // Set CORS headers - allow from any origin for testing
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
// Near the top of your handling code:
if (req.body && req.body.preferAlternativeService) {
  return res.status(200).json({
    success: true,
    message: "Alternative service parameter received correctly",
    requestBody: req.body
  });
}
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      // Simple health check
      if (req.body && req.body.healthCheck) {
        return res.status(200).json({ 
          success: true, 
          message: 'API is operational',
          timestamp: new Date().toISOString()
        });
      }
      
      // Provide endpoint documentation if requested
      if (req.body && req.body.docs) {
        return res.status(200).json({
          success: true,
          message: 'API Documentation',
          endpoint: '/api/process',
          method: 'POST',
          parameters: {
            url: 'YouTube video URL (required)',
            language: 'Language code, defaults to "en"',
            skipRefinement: 'Boolean, skip transcript refinement',
            generateBlog: 'Boolean, generate blog post',
            fallbackMessage: 'Boolean, provide fallback message for unavailable transcripts',
            preferAlternativeService: 'Boolean, use alternative transcript service as primary',
            debug: 'Boolean, run in debug mode to collect detailed information'
          },
          example: {
            url: 'https://www.youtube.com/watch?v=VIDEO_ID',
            language: 'en',
            skipRefinement: false,
            generateBlog: true,
            fallbackMessage: true,
            preferAlternativeService: true,
            debug: false
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Check for missing/empty request body
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing request body',
          message: 'Please provide a valid JSON request body with a YouTube URL',
          timestamp: new Date().toISOString()
        });
      }

      // Process the request using the combined controller
      await processYouTubeUrl(req, res, (err) => {
        if (err) {
          console.error('Error in process API:', err);
          return res.status(500).json({ 
            success: false,
            error: 'Processing error',
            message: err.message,
            timestamp: new Date().toISOString()
          });
        }
      });
    } catch (error) {
      console.error('Unhandled error in process API:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Unhandled error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Method not allowed
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed', 
      message: 'This endpoint only accepts POST requests',
      timestamp: new Date().toISOString()
    });
  }
};