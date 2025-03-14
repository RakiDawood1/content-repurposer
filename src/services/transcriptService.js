// src/services/transcriptService.js - Updated with alternative approaches
const { YoutubeTranscript } = require('youtube-transcript');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const logger = require('../utils/logger');

let genAI;
let geminiModel;

function initializeGeminiAPI() {
  if (!process.env.GEMINI_API_KEY) {
    logger.error('GEMINI_API_KEY not found in environment variables');
    throw new Error('Gemini API key is required');
  }
  
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
  
  logger.info('Gemini API initialized successfully');
}

function getVideoId(url) {
  try {
    if (!url) return null;
    
    // Handle various YouTube URL formats
    const regExpStandard = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const regExpShort = /^.*((youtube.com\/shorts\/)([^#&?]*))/;
    
    // Try standard format first
    const matchStandard = url.match(regExpStandard);
    if (matchStandard && matchStandard[7] && matchStandard[7].length === 11) {
      return matchStandard[7];
    }
    
    // Try shorts format
    const matchShort = url.match(regExpShort);
    if (matchShort && matchShort[3]) {
      return matchShort[3];
    }
    
    logger.warn(`Could not extract video ID from URL: ${url}`);
    return null;
  } catch (error) {
    logger.error(`Error extracting video ID: ${error.message}`);
    return null;
  }
}

// Alternative method to check video info via oEmbed
async function checkVideoInfo(videoId) {
  try {
    const response = await axios.get(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`);
    return { 
      exists: true, 
      title: response.data.title,
      author: response.data.author_name
    };
  } catch (error) {
    logger.error(`Unable to fetch video info for ${videoId}: ${error.message}`);
    return { exists: false, error: 'Video information unavailable' };
  }
}

// Direct HTML parsing approach (fallback when API fails)
async function directTranscriptCheck(videoId) {
  try {
    // Fetch video page HTML
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = response.data;
    
    // Check if captions are mentioned in the page
    const hasCaptions = html.includes('"captions":') || 
                         html.includes('"captionTracks":') || 
                         html.includes('timedtext');
    
    return {
      hasTranscriptHint: hasCaptions,
      pageAccessible: true
    };
  } catch (error) {
    logger.error(`Direct page check failed for ${videoId}: ${error.message}`);
    return {
      hasTranscriptHint: false,
      pageAccessible: false,
      error: error.message
    };
  }
}

async function fetchTranscript(videoId, language = 'en') {
  try {
    logger.info(`Attempting to fetch transcript for video ${videoId}, language: ${language}`);
    
    // First check if video exists and is accessible
    const videoInfo = await checkVideoInfo(videoId);
    if (!videoInfo.exists) {
      throw new Error(`Video ${videoId} not found or inaccessible`);
    }
    
    // Try direct page check for transcript hints
    const directCheck = await directTranscriptCheck(videoId);
    
    if (!directCheck.hasTranscriptHint) {
      logger.warn(`Video ${videoId} likely has no captions available based on page check`);
    }
    
    // Try multiple transcript fetch strategies
    let transcriptList = null;
    let fetchError = null;
    
    // Strategy 1: Standard approach with specified language
    try {
      transcriptList = await YoutubeTranscript.fetchTranscript(videoId, { lang: language });
      if (transcriptList && transcriptList.length > 0) {
        logger.info(`Successfully retrieved transcript with strategy 1`);
      }
    } catch (error) {
      fetchError = error;
      logger.warn(`Strategy 1 failed: ${error.message}`);
      
      // Strategy 2: Try without language specification (auto)
      try {
        transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
        if (transcriptList && transcriptList.length > 0) {
          logger.info(`Successfully retrieved transcript with strategy 2`);
        }
      } catch (error2) {
        logger.warn(`Strategy 2 failed: ${error2.message}`);
        
        // Strategy 3: Try with English explicitly
        try {
          transcriptList = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
          if (transcriptList && transcriptList.length > 0) {
            logger.info(`Successfully retrieved transcript with strategy 3`);
          }
        } catch (error3) {
          logger.warn(`Strategy 3 failed: ${error3.message}`);
          
          // Strategy 4: Try with additional headers/format
          try {
            // This is a more aggressive approach
            transcriptList = await YoutubeTranscript.fetchTranscript(videoId, {
              lang: language,
              country: 'US'
            });
            if (transcriptList && transcriptList.length > 0) {
              logger.info(`Successfully retrieved transcript with strategy 4`);
            }
          } catch (error4) {
            logger.error(`All transcript fetch strategies failed for video ${videoId}`);
            throw fetchError || error4; // Throw the original error for better diagnostics
          }
        }
      }
    }
    
    // Final check if transcript is valid
    if (!transcriptList || transcriptList.length === 0) {
      throw new Error('Empty transcript retrieved');
    }
    
    logger.info(`Successfully retrieved transcript with ${transcriptList.length} segments`);
    
    // Format transcript data
    return transcriptList.map(item => ({
      text: item.text || '',
      start: item.start || 0,
      duration: item.duration || 0,
    }));
  } catch (error) {
    // Enhanced error reporting
    if (error.message.includes('disabled on this video')) {
      logger.error(`Transcript disabled for video ${videoId}: ${error.message}`);
      throw new Error(`Transcript is disabled for this video (${videoId}). Please try a different video or use a video with captions enabled.`);
    } else if (error.message.includes('Could not find any translations')) {
      logger.error(`No transcript found for language ${language} for video ${videoId}`);
      throw new Error(`No transcript available in the requested language (${language}). Try a different language or video.`);
    } else {
      const videoTitle = await checkVideoInfo(videoId).then(info => info.title || videoId).catch(() => videoId);
      logger.error(`Failed to fetch transcript for "${videoTitle}" (${videoId}): ${error.message}`);
      throw new Error(`Unable to fetch transcript: ${error.message}`);
    }
  }
}

async function generateBasicTranscript(videoId) {
  if (!geminiModel) {
    initializeGeminiAPI();
  }
  
  try {
    // Get video info for better message
    const videoInfo = await checkVideoInfo(videoId).catch(() => ({ title: 'this video' }));
    const videoTitle = videoInfo.title || 'this video';
    
    const prompt = `
I need a placeholder message for a YouTube video when the transcript is unavailable.
The video ID is ${videoId} and its title is "${videoTitle}".

Please create a brief message that:
1. Explains that the transcript couldn't be retrieved for this specific video
2. Mentions the title of the video if available
3. Suggests that either the video doesn't have captions enabled or they're not accessible
4. Recommends trying a different video that has captions enabled
5. Keeps the tone helpful and informative

Format this as a short paragraph (2-3 sentences).
`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Return as a single-segment transcript
    return [{
      text: text,
      start: 0,
      duration: 10,
      isUnavailableMessage: true
    }];
  } catch (error) {
    logger.error(`Error generating basic transcript message: ${error.message}`);
    return [{
      text: `I'm sorry, the transcript for this video (${videoId}) is unavailable. The video likely doesn't have captions enabled or they're not accessible. Please try a different video with captions enabled.`,
      start: 0,
      duration: 10,
      isUnavailableMessage: true
    }];
  }
}

async function refineTranscript(transcript) {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    logger.warn('No transcript data provided for refinement');
    return [];
  }

  // Skip refinement if this is an unavailable message
  if (transcript.length === 1 && transcript[0].isUnavailableMessage) {
    logger.info('Skipping refinement for unavailable transcript message');
    return transcript;
  }

  try {
    if (!geminiModel) {
      initializeGeminiAPI();
    }
    
    logger.info(`Refining transcript with ${transcript.length} segments`);
    
    // Process in smaller batches to avoid token limits
    const batchSize = 15;
    const refinedTranscript = [];
    
    for (let i = 0; i < transcript.length; i += batchSize) {
      logger.debug(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(transcript.length/batchSize)}`);
      const batch = transcript.slice(i, i + batchSize);
      const batchRefined = await refineBatchWithGemini(batch);
      refinedTranscript.push(...batchRefined);
    }
    
    logger.info('Transcript refinement completed successfully');
    return refinedTranscript;
  } catch (error) {
    logger.error(`Error refining transcript with Gemini: ${error.message}`);
    // In case of refinement failure, return the original transcript with metadata
    logger.info('Returning original transcript due to refinement failure');
    return transcript.map(segment => ({
      ...segment,
      original: segment.text,
      refinementFailed: true
    }));
  }
}

async function refineBatchWithGemini(batchSegments) {
  const segmentTexts = batchSegments.map(segment => segment.text);
  
  const prompt = `
I have a YouTube video transcript that needs refinement. Please correct spelling errors, 
fix grammar issues, add proper punctuation, and ensure natural sentence flow.
Here are the transcript segments:

${segmentTexts.map((text, index) => `Segment ${index + 1}: "${text}"`).join('\n')}

Please return the refined transcript in JSON format with this exact structure:
[
  {"index": 0, "refined": "corrected text for segment 1"},
  {"index": 1, "refined": "corrected text for segment 2"},
  ...
]
Only include the JSON array in your response, nothing else.
`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // More robust JSON extraction
    const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini response');
    }
    
    let refinedSegments;
    try {
      refinedSegments = JSON.parse(jsonMatch[0]);
    } catch (jsonError) {
      logger.error(`JSON parse error: ${jsonError.message}`);
      throw new Error('Failed to parse JSON from Gemini response');
    }
    
    return batchSegments.map((segment, index) => {
      const refinedSegment = refinedSegments.find(rs => rs.index === index);
      return {
        ...segment,
        text: refinedSegment ? refinedSegment.refined : segment.text,
        original: segment.text
      };
    });
  } catch (error) {
    logger.error(`Error in Gemini refinement: ${error.message}`);
    return batchSegments.map(segment => ({
      ...segment,
      original: segment.text
    }));
  }
}

module.exports = {
  getVideoId,
  fetchTranscript,
  refineTranscript,
  initializeGeminiAPI,
  generateBasicTranscript,
  checkVideoInfo,
  directTranscriptCheck
};