// src/services/transcriptService.js
const { YoutubeTranscript } = require('youtube-transcript');
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
  geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
  
  logger.info('Gemini API initialized successfully');
}

function getVideoId(url) {
  try {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  } catch (error) {
    logger.error(`Error extracting video ID: ${error.message}`);
    return null;
  }
}

async function fetchTranscript(videoId, language = 'en') {
  try {
    const transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcriptList || transcriptList.length === 0) {
      throw new Error('Transcript not available');
    }
    
    return transcriptList.map(item => ({
      text: item.text,
      start: item.start,
      duration: item.duration,
    }));
  } catch (error) {
    logger.error(`Error fetching transcript: ${error.message}`);
    throw error;
  }
}

async function refineTranscript(transcript) {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return [];
  }

  try {
    if (!geminiModel) {
      initializeGeminiAPI();
    }
    
    const batchSize = 20;
    const refinedTranscript = [];
    
    for (let i = 0; i < transcript.length; i += batchSize) {
      const batch = transcript.slice(i, i + batchSize);
      const batchRefined = await refineBatchWithGemini(batch);
      refinedTranscript.push(...batchRefined);
    }
    
    return refinedTranscript;
  } catch (error) {
    logger.error(`Error refining transcript with Gemini: ${error.message}`);
    return transcript.map(segment => ({
      ...segment,
      original: segment.text
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
    
    const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini response');
    }
    
    const refinedSegments = JSON.parse(jsonMatch[0]);
    
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
  initializeGeminiAPI
};