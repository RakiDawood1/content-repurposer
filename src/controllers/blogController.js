// src/services/blogGeneratorService.js - Enhanced with better error handling
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI;
let geminiModel;

function initializeGeminiAPI() {
  if (!process.env.GEMINI_API_KEY) {
    logger.error('GEMINI_API_KEY not found in environment variables');
    throw new Error('Gemini API key is required');
  }
  
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use gemini-pro model for text content generation
    geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    logger.info('Gemini API initialized for blog generation');
  } catch (error) {
    logger.error(`Failed to initialize Gemini API: ${error.message}`);
    throw new Error(`Gemini API initialization failed: ${error.message}`);
  }
}

/**
 * Generate a blog post from transcript data
 * @param {Array} transcript - The transcript data (refined or raw)
 * @param {String} videoId - The YouTube video ID
 * @param {String} videoTitle - The title of the YouTube video (optional)
 * @returns {Object} Blog post with title, content, and metadata
 */
async function generateBlogFromTranscript(transcript, videoId, videoTitle = '') {
  try {
    if (!geminiModel) {
      initializeGeminiAPI();
    }

    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      throw new Error('Invalid or empty transcript provided');
    }

    // Extract the full text from the transcript
    const fullText = transcript.map(segment => segment.text).join(' ');
    
    if (fullText.trim().length < 50) {
      throw new Error('Transcript text is too short to generate a meaningful blog');
    }
    
    // Determine source text excerpt (beginning of content)
    const excerptLength = Math.min(300, Math.floor(fullText.length / 3));
    const contentExcerpt = fullText.substring(0, excerptLength);
    
    // Create the prompt for Gemini with more detailed instructions
    const prompt = `
I have a YouTube video transcript that I want to convert into a well-formatted blog post.
${videoTitle ? `The video title is: "${videoTitle}"` : ''}

Please create a professional blog post that captures the key points, maintains the tone and style of the original,
and is organized with proper headings, paragraphs, and flow.

The transcript is from a YouTube video (ID: ${videoId}) and appears to be about:
${contentExcerpt}...

Here's the full transcript:
${fullText}

Please format the blog post with:
1. An engaging title that captures the essence of the content
2. A brief introduction that hooks the reader
3. 3-5 properly structured sections with descriptive headings
4. A conclusion that summarizes key takeaways
5. Maintain the same tone and voice as the original content

The blog post should be comprehensive but concise (about 800-1200 words), highlighting the main points rather than including every detail.
Focus on clarity, readability, and maintaining the original message. Use short paragraphs and simple language.
`;

    logger.info(`Generating blog post for video ${videoId}`);
    const blogStartTime = Date.now();
    
    // Generate the blog post with timeout and retry logic
    let attempts = 0;
    const maxAttempts = 2;
    let blogContent = null;
    
    while (attempts < maxAttempts && !blogContent) {
      attempts++;
      try {
        const result = await Promise.race([
          geminiModel.generateContent(prompt),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Blog generation timed out')), 30000)
          )
        ]);
        
        const response = await result.response;
        blogContent = response.text();
        
        if (!blogContent || blogContent.trim().length < 100) {
          throw new Error('Generated blog content is too short or empty');
        }
      } catch (error) {
        logger.warn(`Blog generation attempt ${attempts} failed: ${error.message}`);
        
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to generate blog after ${maxAttempts} attempts: ${error.message}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const blogEndTime = Date.now();
    logger.info(`Blog generation completed in ${blogEndTime - blogStartTime}ms`);

    // Extract title from the generated content
    const lines = blogContent.split('\n');
    let title = lines[0];
    
    // Remove markdown heading symbols if present (e.g., # Title)
    if (title.startsWith('#')) {
      title = title.replace(/^#+\s*/, '');
    }
    
    // Remove any quotes if present
    title = title.replace(/^["'](.*)["']$/, '$1');
    
    // If title extraction failed, create a fallback title
    if (!title || title.trim().length < 3) {
      title = videoTitle || `Blog Post from YouTube Video (${videoId})`;
    }
    
    // Calculate reading time (average 200 words per minute)
    const wordCount = blogContent.split(/\s+/).length;
    const readingTimeMinutes = Math.ceil(wordCount / 200);
    
    return {
      title: title,
      content: blogContent,
      videoId: videoId,
      generatedAt: new Date().toISOString(),
      wordCount: wordCount,
      readingTime: `${readingTimeMinutes} min read`,
      videoTitle: videoTitle || null
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