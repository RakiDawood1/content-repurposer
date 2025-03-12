// api/process.js - Complete version with extensive debugging
require('dotenv').config();
console.log('Loading api/process.js');

// Try to load the combined controller with error handling
let processYouTubeUrl;
try {
  const combinedController = require('../src/controllers/combinedController');
  processYouTubeUrl = combinedController.processYouTubeUrl;
  console.log('Successfully loaded combinedController');
} catch (error) {
  console.error('Error loading combinedController:', error);
  // Provide a fallback implementation if the real one fails to load
  processYouTubeUrl = async (req, res) => {
    return res.status(500).json({ 
      success: false, 
      error: 'Controller loading failed',
      message: 'The server encountered an error while loading the controller.',
      timestamp: new Date().toISOString()
    });
  };
}

// Check for dependency availability
console.log('Checking dependencies...');
try {
  require.resolve('youtubei.js');
  console.log('✅ youtubei.js is installed');
} catch (error) {
  console.log('❌ youtubei.js is NOT installed:', error.message);
}

try {
  require.resolve('youtube-transcript');
  console.log('✅ youtube-transcript is installed');
} catch (error) {
  console.log('❌ youtube-transcript is NOT installed:', error.message);
}

try {
  require.resolve('@google/generative-ai');
  console.log('✅ @google/generative-ai is installed');
} catch (error) {
  console.log('❌ @google/generative-ai is NOT installed:', error.message);
}

module.exports = async (req, res) => {
  console.log('Request received:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      console.log('Request body:', req.body);
      
      // Explicitly log preferAlternativeService parameter
      if (req.body && req.body.preferAlternativeService) {
        console.log('Alternative service requested:', req.body.preferAlternativeService);
      }
      
      // Simple health check
      if (req.body && req.body.healthCheck) {
        console.log('Health check requested');
        return res.status(200).json({ 
          success: true, 
          message: 'API is operational',
          timestamp: new Date().toISOString(),
          nodeVersion: process.version
        });
      }
      
      // Special debug endpoint for checking alternative service
      if (req.body && req.body.debugAlternativeService) {
        console.log('Debug alternative service requested');
        try {
          const { Innertube } = require('youtubei.js');
          return res.status(200).json({
            success: true,
            message: 'Alternative service (youtubei.js) is available',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: 'Alternative service unavailable',
            message: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Provide endpoint documentation if requested
      if (req.body && req.body.docs) {
        console.log('Documentation requested');
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
            debug: 'Boolean, run in debug mode to collect detailed information',
            healthCheck: 'Boolean, check if API is operational',
            debugAlternativeService: 'Boolean, check if alternative service is available'
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
        console.log('Empty request body received');
        return res.status(400).json({
          success: false,
          error: 'Missing request body',
          message: 'Please provide a valid JSON request body with a YouTube URL',
          timestamp: new Date().toISOString()
        });
      }
      
      // Force alternative service if explicitly requested
      if (req.body.forceAlternativeService) {
        console.log('Force alternative service requested');
        try {
          const { Innertube } = require('youtubei.js');
          const youtube = await Innertube.create();
          const videoId = req.body.url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)[1];
          
          console.log(`Fetching transcript directly for video ${videoId}`);
          const info = await youtube.getInfo(videoId);
          
          // Find available caption tracks
          const captionTracks = info.captions?.caption_tracks || [];
          
          if (captionTracks.length === 0) {
            console.log('No caption tracks available');
            return res.status(404).json({
              success: false,
              error: 'No captions available',
              message: `No caption tracks available for video ${videoId}`,
              timestamp: new Date().toISOString()
            });
          }
          
          // Get first caption track
          const selectedTrack = captionTracks[0];
          console.log(`Using caption track: ${selectedTrack.name?.simpleText || 'Unknown'}`);
          
          // Fetch the caption track
          const captionTrack = await youtube.getCaption(selectedTrack.id);
          
          return res.status(200).json({
            success: true,
            message: 'Transcript retrieved directly from alternative service',
            videoId,
            transcript: captionTrack.body.map(item => ({
              text: item.text,
              start: item.start,
              duration: item.duration
            })),
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error using alternative service directly:', error);
          return res.status(500).json({
            success: false,
            error: 'Alternative service failed',
            message: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Process the request using the combined controller
      console.log('Processing request with combinedController');
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
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed', 
      message: 'This endpoint only accepts POST requests',
      timestamp: new Date().toISOString()
    });
  }
};