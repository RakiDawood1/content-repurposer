// src/services/alternativeTranscriptService.js
const { Innertube } = require('youtubei.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI;
let geminiModel;
let youtubeClient = null;

/**
 * Initialize the Gemini API for text processing
 */
function initializeGeminiAPI() {
  if (!process.env.GEMINI_API_KEY) {
    logger.error('GEMINI_API_KEY not found in environment variables');
    throw new Error('Gemini API key is required');
  }
  
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
  
  logger.info('Gemini API initialized successfully');
}

/**
 * Initialize the YouTube client (lazy loading)
 */
async function getYouTubeClient() {
  if (!youtubeClient) {
    try {
      logger.info('Initializing YouTube client');
      youtubeClient = await Innertube.create();
      logger.info('YouTube client initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize YouTube client: ${error.message}`);
      throw new Error(`YouTube client initialization failed: ${error.message}`);
    }
  }
  return youtubeClient;
}

/**
 * Extract YouTube video ID from various URL formats
 */
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

/**
 * Fetch transcript using YouTubei.js
 */
async function fetchTranscript(videoId, language = 'en') {
  try {
    logger.info(`Fetching transcript for video ${videoId} using alternative method`);
    
    // Get YouTube client
    const youtube = await getYouTubeClient();
    
    // Get video information
    const info = await youtube.getInfo(videoId);
    
    // Get video details
    const videoDetails = {
      title: info.basic_info.title,
      author: info.basic_info.author,
      lengthSeconds: info.basic_info.duration.seconds
    };
    
    logger.info(`Retrieved info for video: "${videoDetails.title}" by ${videoDetails.author}`);
    
    // Find available caption tracks
    const captionTracks = info.captions?.caption_tracks || [];
    
    if (captionTracks.length === 0) {
      logger.error(`No caption tracks available for video ${videoId}`);
      throw new Error(`No captions available for this video (${videoId})`);
    }
    
    // Try to find the requested language
    let selectedTrack = captionTracks.find(track => 
      track.language_code === language || 
      track.language_code.startsWith(language + '-')
    );
    
    // Fall back to English if requested language not found
    if (!selectedTrack && language !== 'en') {
      logger.warn(`Requested language ${language} not found, trying English`);
      selectedTrack = captionTracks.find(track => 
        track.language_code === 'en' || 
        track.language_code.startsWith('en-')
      );
    }
    
    // Fall back to first available track if neither requested nor English found
    if (!selectedTrack) {
      logger.warn(`Falling back to first available caption track: ${captionTracks[0].language_code}`);
      selectedTrack = captionTracks[0];
    }
    
    // Fetch the caption track
    const captionTrack = await youtube.getCaption(selectedTrack.id);
    
    if (!captionTrack || !captionTrack.body?.length) {
      throw new Error('Retrieved caption track is empty');
    }
    
    logger.info(`Successfully retrieved transcript with ${captionTrack.body.length} segments in language ${selectedTrack.language_code}`);
    
    // Format caption track similar to youtube-transcript format
    return captionTrack.body.map(item => ({
      text: item.text,
      start: item.start,
      duration: item.duration,
      language: selectedTrack.language_code
    }));
  } catch (error) {
    logger.error(`Error fetching transcript with alternative method: ${error.message}`);
    
    if (error.message.includes('No captions available')) {
      throw new Error(`Transcript unavailable: No captions found for video ${videoId}`);
    } else if (error.message.includes('Video unavailable')) {
      throw new Error(`Video unavailable: The video ${videoId} may be private, deleted, or age-restricted`);
    } else {
      throw new Error(`Failed to fetch transcript: ${error.message}`);
    }
  }
}

/**
 * Generate a fallback message when no transcript is available
 */
async function generateBasicTranscript(videoId) {
  if (!geminiModel) {
    initializeGeminiAPI();
  }
  
  try {
    // Try to get video info for a better message
    let videoTitle = "this video";
    
    try {
      const youtube = await getYouTubeClient();
      const info = await youtube.getInfo(videoId);
      videoTitle = info.basic_info.title || "this video";
    } catch (error) {
      logger.warn(`Couldn't get video title for fallback message: ${error.message}`);
    }
    
    const prompt = `
I need a placeholder message for a YouTube video when the transcript is unavailable.
The video ID is ${videoId} and its title is "${videoTitle}".

Please create a brief message that:
1. Explains that the transcript couldn't be retrieved for this specific video
2. Mentions the title of the video
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
      text: `I'm sorry, the transcript for "${videoId}" is unavailable. The video likely doesn't have captions enabled or they're not accessible. Please try a different video with captions enabled.`,
      start: 0,
      duration: 10,
      isUnavailableMessage: true
    }];
  }
}

/**
 * Refine transcript using Gemini
 */
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

/**
 * Helper to refine a batch of transcript segments
 */
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
  getYouTubeClient
};