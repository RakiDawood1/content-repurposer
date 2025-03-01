// src/routes.js
const transcriptController = require('./controllers/transcriptController');
const blogController = require('./controllers/blogController');
const combinedController = require('./controllers/combinedController');

function setupRoutes(app) {
  // Individual endpoints
  app.post('/api/transcript', transcriptController.getTranscript);
  app.post('/api/blog', blogController.generateBlog);
  
  // Combined endpoint for one-step processing
  app.post('/api/process', combinedController.processYouTubeUrl);
  
  // Health check route
  app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
}

module.exports = { setupRoutes };