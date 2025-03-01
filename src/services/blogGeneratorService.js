// src/services/blogGeneratorService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI;
let geminiModel;

function initializeGeminiAPI() {
  if (!process.env.GEMINI_API_KEY) {
    logger.error('GEMINI_API_KEY not found in environment variables');
    throw new Error('Gemini API key is required');
  }
  
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // Use gemini-pro model for text content generation
  geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
  
  logger.info('Gemini API initialized for blog generation');
}

/**
 * Generate a blog post from transcript data
 * @param {Array} transcript - The transcript data (refined or raw)
 * @param {String} videoId - The YouTube video ID
 * @returns {Object} Blog post with title, content, and metadata
 */
async function generateBlogFromTranscript(transcript, videoId) {
  try {
    if (!geminiModel) {
      initializeGeminiAPI();
    }

    // Extract the full text from the transcript
    const fullText = transcript.map(segment => segment.text).join(' ');
    
    // Create the prompt for Gemini
    const prompt = `
I have a YouTube video transcript that I want to convert into a well-formatted blog post.
Please create a blog post that captures the key points, maintains the tone and style of the original,
and is organized with proper headings, paragraphs, and flow.

The transcript is from a YouTube video (ID: ${videoId}) and appears to be about:
${fullText.substring(0, 300)}...

Here's the full transcript:
${fullText}

Please format the blog post with:
1. An engaging title
2. A brief introduction
3. Properly structured sections with headings
4. A conclusion
5. Maintain the same tone and voice as the original content

The blog post should be comprehensive but concise, highlighting the main points rather than including every detail.
`;

    logger.info(`Generating blog post for video ${videoId}`);
    const blogStartTime = Date.now();
    
    // Generate the blog post
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const blogContent = response.text();
    
    const blogEndTime = Date.now();
    logger.info(`Blog generation completed in ${blogEndTime - blogStartTime}ms`);

    // Extract title from the generated content (assuming the first line is the title)
    const lines = blogContent.split('\n');
    let title = lines[0];
    
    // Remove markdown heading symbols if present (e.g., # Title)
    if (title.startsWith('#')) {
      title = title.replace(/^#+\s*/, '');
    }
    
    // Remove any quotes if present
    title = title.replace(/^["'](.*)["']$/, '$1');
    
    return {
      title: title,
      content: blogContent,
      videoId: videoId,
      generatedAt: new Date().toISOString(),
      wordCount: blogContent.split(/\s+/).length
    };
  } catch (error) {
    logger.error(`Error generating blog post: ${error.message}`);
    throw new Error(`Failed to generate blog post: ${error.message}`);
  }
}

module.exports = {
  generateBlogFromTranscript,
  initializeGeminiAPI
};