#!/usr/bin/env node
// scripts/upgrade-transcript-library.js

/**
 * This script helps to diagnose and upgrade the YouTube transcript library
 * Run with: node scripts/upgrade-transcript-library.js
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Define colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Execute a shell command and return output
 */
async function execCommand(command, args = [], cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.blue}> ${command} ${args.join(' ')}${colors.reset}`);
    
    const childProcess = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });
    
    childProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(`${colors.red}${text}${colors.reset}`);
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Check current library versions
 */
async function checkCurrentVersions() {
  console.log(`\n${colors.bright}${colors.cyan}Checking current library versions...${colors.reset}\n`);
  
  try {
    // Check if youtube-transcript is installed
    await execCommand('npm', ['list', 'youtube-transcript']);
  } catch (error) {
    console.log(`${colors.yellow}Could not find youtube-transcript in dependencies${colors.reset}`);
  }
  
  // List alternative libraries
  console.log(`\n${colors.bright}${colors.cyan}Available alternative libraries:${colors.reset}\n`);
  
  console.log(`${colors.bright}1. youtube-transcript${colors.reset} - Current library`);
  console.log('   Simple library to fetch transcripts from YouTube videos');
  
  console.log(`\n${colors.bright}2. youtubei.js${colors.reset} - Alternative with broader capabilities`);
  console.log('   Full-featured library for accessing YouTube data including transcripts');
  console.log('   https://github.com/LuanRT/YouTube.js');
  
  console.log(`\n${colors.bright}3. ytdl-core${colors.reset} - Popular YouTube download library`);
  console.log('   Can be used with closed-captions format option');
  console.log('   https://github.com/fent/node-ytdl-core');
}

/**
 * Upgrade libraries
 */
async function upgradeLibraries() {
  console.log(`\n${colors.bright}${colors.cyan}Upgrading libraries...${colors.reset}\n`);
  
  try {
    // Update youtube-transcript to latest version
    await execCommand('npm', ['install', 'youtube-transcript@latest', '--save']);
    console.log(`${colors.green}Successfully upgraded youtube-transcript to latest version${colors.reset}`);
  } catch (error) {
    console.log(`${colors.red}Failed to upgrade youtube-transcript: ${error.message}${colors.reset}`);
  }
  
  // Ask about installing alternatives
  console.log(`\n${colors.bright}${colors.cyan}Do you want to install alternative libraries?${colors.reset}\n`);
  console.log('1. Install youtubei.js (recommended alternative)');
  console.log('2. Install ytdl-core (popular for downloads)');
  console.log('3. Skip installing alternatives');
  
  // Note: In a real script, you'd handle user input here
  // For this example, we'll just show the command that would be run
  
  console.log(`\n${colors.yellow}To install youtubei.js, run:${colors.reset}`);
  console.log(`npm install youtubei.js --save`);
  
  console.log(`\n${colors.yellow}To install ytdl-core, run:${colors.reset}`);
  console.log(`npm install ytdl-core --save`);
}

/**
 * Generate example code for alternatives
 */
async function generateExampleCode() {
  console.log(`\n${colors.bright}${colors.cyan}Generating example code for transcript fetching...${colors.reset}\n`);
  
  const examplesDir = path.join(process.cwd(), 'examples');
  try {
    await fs.mkdir(examplesDir, { recursive: true });
    
    // Example for youtubei.js
    const youtubeiExample = `// examples/youtubei-transcript-example.js
const { Innertube } = require('youtubei.js');

/**
 * Fetch transcript using youtubei.js
 * @param {string} videoId - YouTube video ID
 * @param {string} [language='en'] - Language code
 */
async function fetchTranscriptWithYoutubei(videoId, language = 'en') {
  try {
    // Initialize the client
    const youtube = await Innertube.create();
    
    // Get the captions for the video
    const info = await youtube.getInfo(videoId);
    const captions = info.getCaption(language) || info.getCaption(); // Fallback to default
    
    if (!captions) {
      throw new Error('No captions available for this video');
    }
    
    // Get the transcript
    const captionTrack = await captions.fetch();
    
    // Format similar to youtube-transcript
    return captionTrack.map(item => ({
      text: item.text,
      start: item.start,
      duration: item.dur
    }));
  } catch (error) {
    console.error('Error fetching transcript with youtubei.js:', error);
    throw error;
  }
}

// Example usage
async function example() {
  try {
    const transcript = await fetchTranscriptWithYoutubei('dQw4w9WgXcQ');
    console.log(\`Found \${transcript.length} transcript segments\`);
    console.log(transcript.slice(0, 3)); // Show first 3 segments
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

example();
`;

    // Example for ytdl-core
    const ytdlExample = `// examples/ytdl-transcript-example.js
const ytdl = require('ytdl-core');

/**
 * Fetch transcript using ytdl-core
 * @param {string} videoId - YouTube video ID
 * @param {string} [language='en'] - Language code
 */
async function fetchTranscriptWithYtdl(videoId, language = 'en') {
  try {
    // Get video info
    const info = await ytdl.getInfo(videoId);
    
    // Find the caption track for the specified language
    const captionTrack = info.player_response.captions?.playerCaptionsTracklistRenderer?.captionTracks
      ?.find(track => track.languageCode === language) || 
      info.player_response.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]; // Fallback to first
    
    if (!captionTrack) {
      throw new Error('No captions available for this video');
    }
    
    // Fetch the captions
    const captionUrl = captionTrack.baseUrl;
    const response = await fetch(captionUrl);
    const xmlData = await response.text();
    
    // Parse XML response (simple approach - in production use a proper XML parser)
    const segments = xmlData
      .match(/<text start="[^"]+" dur="[^"]+"[^>]*>[^<]*<\\/text>/g)
      ?.map(segment => {
        const start = parseFloat(segment.match(/start="([^"]+)"/)?.[1] || '0');
        const duration = parseFloat(segment.match(/dur="([^"]+)"/)?.[1] || '0');
        const text = segment
          .replace(/<[^>]*>([^<]*)<\\/text>/g, '$1')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        
        return { text, start, duration };
      }) || [];
    
    return segments;
  } catch (error) {
    console.error('Error fetching transcript with ytdl-core:', error);
    throw error;
  }
}

// Example usage
async function example() {
  try {
    const transcript = await fetchTranscriptWithYtdl('dQw4w9WgXcQ');
    console.log(\`Found \${transcript.length} transcript segments\`);
    console.log(transcript.slice(0, 3)); // Show first 3 segments
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

example();
`;

    // Write example files
    await fs.writeFile(path.join(examplesDir, 'youtubei-transcript-example.js'), youtubeiExample);
    await fs.writeFile(path.join(examplesDir, 'ytdl-transcript-example.js'), ytdlExample);
    
    console.log(`${colors.green}Example code written to examples/ directory${colors.reset}`);
    console.log(`- examples/youtubei-transcript-example.js`);
    console.log(`- examples/ytdl-transcript-example.js`);
  } catch (error) {
    console.log(`${colors.red}Failed to write example code: ${error.message}${colors.reset}`);
  }
}

// Main execution
async function main() {
  console.log(`${colors.bright}${colors.cyan}=======================================
YouTube Transcript Library Upgrade Utility
=======================================${colors.reset}`);
  
  try {
    await checkCurrentVersions();
    await upgradeLibraries();
    await generateExampleCode();
    
    console.log(`\n${colors.bright}${colors.green}Upgrade utility completed.${colors.reset}`);
    console.log(`Please check the examples/ directory for example code using alternative libraries.`);
  } catch (error) {
    console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();