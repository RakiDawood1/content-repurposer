// src/routes.js
const transcriptController = require('./controllers/transcriptController');
const blogController = require('./controllers/blogController');
const combinedController = require('./controllers/combinedController');

// Check if controllers are properly loaded and have the expected methods
function validateControllers() {
  // Check combined controller
  if (!combinedController || typeof combinedController.processYouTubeUrl !== 'function') {
    console.error('WARNING: combinedController.processYouTubeUrl is not a function!');
    console.log('combinedController:', combinedController);
  }
  
  // Check other controllers
  if (!transcriptController || typeof transcriptController.getTranscript !== 'function') {
    console.error('WARNING: transcriptController.getTranscript is not a function!');
  }
  
  if (!blogController || !blogController.generateBlog) {
    console.error('WARNING: blogController.generateBlog is not available!');
  }
}

function setupRoutes(app) {
  // Validate controllers before setting up routes
  validateControllers();

  // Root route
  app.get('/', (req, res) => {
    res.status(200).json({
      message: 'YouTube Transcript to Blog API',
      endpoints: {
        health: '/api/health',
        transcript: '/api/transcript',
        blog: '/api/blog',
        process: '/api/process'
      },
      docs: 'Make POST requests to the endpoints with appropriate JSON data'
    });
  });

  // Individual endpoints
  if (transcriptController && transcriptController.getTranscript) {
    app.post('/api/transcript', transcriptController.getTranscript);
  } else {
    app.post('/api/transcript', (req, res) => {
      res.status(503).json({ error: 'Transcript service unavailable' });
    });
  }
  
  if (blogController && blogController.generateBlog) {
    app.post('/api/blog', blogController.generateBlog);
  } else {
    app.post('/api/blog', (req, res) => {
      res.status(503).json({ error: 'Blog service unavailable' });
    });
  }
  
  // Combined endpoint for one-step processing
  if (combinedController && combinedController.processYouTubeUrl) {
    app.post('/api/process', combinedController.processYouTubeUrl);
  } else {
    app.post('/api/process', (req, res) => {
      res.status(503).json({ 
        error: 'Process service unavailable', 
        message: 'The combined processing service is currently unavailable' 
      });
    });
  }
  
  // Health check route
  app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
}

module.exports = { setupRoutes };