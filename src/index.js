// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { setupRoutes } = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(cors({
  origin: ['https://portfolio-1-dee95f.webflow.io/', 'https://portfolio-1-dee95f.webflow.io/'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

setupRoutes(app);

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});