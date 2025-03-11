// api/process.js
const express = require('express');
const cors = require('cors');
const { processYouTubeUrl } = require('../src/controllers/combinedController');

// Create a standalone Express app for the serverless function
const app = express();

// Configure CORS specifically for this endpoint
app.use(cors({
  origin: ['https://portfolio-1-dee95f.webflow.io'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Requested-With']
}));

app.use(express.json());

// Handle OPTIONS requests explicitly
app.options('*', cors());

// Handle the actual POST request
app.post('/', processYouTubeUrl);

// Export as serverless function
module.exports = (req, res) => {
  // Pass the request to the Express app
  app(req, res);
};