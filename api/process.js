// api/process.js - Enhanced with better error handling for Vercel
require('dotenv').config();
const { processYouTubeUrl } = require('../src/controllers/combinedController');

// Custom error handler for serverless function
const handleError = (error, res) => {
  console.error('API Error:', error);
  
  // Determine appropriate status code
  let statusCode = 500;
  let errorMessage = 'An unexpected error occurred';
  
  if (error.message && (
    error.message.includes('Transcript not available') ||
    error.message.includes('disabled on this video') ||
    error.message.includes('No transcript available')
  )) {
    statusCode = 404;
    errorMessage = error.message;
  } else if (error.message && error.message.includes('Invalid YouTube URL')) {
    statusCode = 400;
    errorMessage = error.message;
  }
  
  return res.status(statusCode).json({
    success: false,
    error: errorMessage,
    timestamp: new Date().toISOString()
  });
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');  // Allow from any origin for testing
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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
      
      // Handle missing request body
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing request body',
          message: 'Please provide a valid JSON request body with a YouTube URL',
          timestamp: new Date().toISOString()
        });
      }

      // Process the request using the controller
      await processYouTubeUrl(req, res, (err) => {
        if (err) {
          handleError(err, res);
        }
      });
    } catch (error) {
      handleError(error, res);
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