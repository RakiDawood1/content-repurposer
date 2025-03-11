// src/services/transcriptService.js - Enhanced with better error handling
const { YoutubeTranscript } = require('youtube-transcript');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const axios = require('axios');

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

// Check if video exists and is accessible
async function checkVideoAvailability(videoId) {
  try {
    const response = await axios.get(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`);
    return { exists: true, title: response.data.title };
  } catch (error) {
    logger.error(`Video not available or inaccessible: ${videoId}`);
    return { exists: false, error: 'Video not found or is private' };
  }
}

async function fetchTranscript(videoId, language = 'en') {
  try {
    // First check if the video exists and is accessible
    const videoCheck = await checkVideoAvailability(videoId);
    if (!videoCheck.exists) {
      throw new Error(`Video not available: ${videoCheck.error}`);
    }
    
    logger.info(`Fetching transcript for video ${videoId}, language: ${language}`);
    const transcriptOptions = { lang: language };
    
    const transcriptList = await YoutubeTranscript.fetchTranscript(videoId, transcriptOptions);
    
    if (!transcriptList || transcriptList.length === 0) {
      throw new Error('Transcript not available for this video');
    }
    
    logger.info(`Successfully retrieved transcript with ${transcriptList.length} segments`);
    
    return transcriptList.map(item => ({
      text: item.text,
      start: item.start,
      duration: item.duration,
    }));
  } catch (error) {
    // More specific error messages based on the error type
    if (error.message.includes('disabled on this video')) {
      logger.error(`Transcript disabled for video ${videoId}: ${error.message}`);
      throw new Error(`Transcript is disabled for this video (${videoId}). The video owner has not enabled captions.`);
    } else if (error.message.includes('Video unavailable')) {
      logger.error(`Video unavailable ${videoId}: ${error.message}`);
      throw new Error(`The requested video (${videoId}) is unavailable. It may be private, deleted, or age-restricted.`);
    } else if (error.message.includes('Could not find any translations')) {
      logger.error(`No transcript found for language ${language} for video ${videoId}`);
      throw new Error(`No transcript available in the requested language (${language}). Try a different language or video.`);
    } else {
      logger.error(`Error fetching transcript: ${error.message}`);
      throw new Error(`Failed to fetch transcript: ${error.message}`);
    }
  }
}

async function refineTranscript(transcript) {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    logger.warn('No transcript data provided for refinement');
    return [];
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
  checkVideoAvailability
};