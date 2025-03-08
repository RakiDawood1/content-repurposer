import { OpenAPIRouter } from '@cloudflare/itty-router-openapi';

// Main router
const router = OpenAPIRouter({
  schema: {
    info: {
      title: 'YouTube Transcript API',
      description: 'API for processing YouTube transcripts and generating blog posts',
      version: '1.0',
    },
  },
});

// Define transcript segment interface
interface TranscriptSegment {
  text: string;
  start?: number;
  duration?: number;
}

// Add CORS headers to responses
function addCORSHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Fetch YouTube transcript
async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  try {
    const response = await fetch(`https://youtube-transcript-api.zeabur.app/api/transcript/${videoId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch transcript: ${response.status}`);
    }
    
    return await response.json() as TranscriptSegment[];
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw error;
  }
}

// Extract video ID from URL
function getVideoId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

// Generate blog from transcript using Gemini API
async function generateBlog(transcript: TranscriptSegment[], videoId: string): Promise<any> {
  const GEMINI_API_KEY = (globalThis as any).GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured');
  }
  
  // Extract the text from the transcript
  const fullText = transcript.map((segment: TranscriptSegment) => segment.text).join(' ');
  
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

  // Call Gemini API
  const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  const response = await fetch(`${geminiUrl}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json() as {
    candidates: Array<{
      content: {
        parts: Array<{
          text: string
        }>
      }
    }>
  };
  
  const blogContent = data.candidates[0].content.parts[0].text;

  // Extract title (assuming first line is the title)
  const lines = blogContent.split('\n');
  let title = lines[0];
  
  // Remove markdown heading symbols if present
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
}

// Define API endpoints
router.post('/api/transcript', async (request: Request) => {
  const { url } = await request.json() as { url: string };
  
  if (!url) {
    return new Response(JSON.stringify({ error: 'YouTube URL is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const videoId = getVideoId(url);
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Fetch new transcript
    const transcript = await fetchYouTubeTranscript(videoId);
    
    const result = {
      videoId,
      transcript
    };
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

router.post('/api/blog', async (request: Request) => {
  interface BlogRequest {
    transcript: TranscriptSegment[];
    videoId: string;
  }
  
  const { transcript, videoId } = await request.json() as BlogRequest;
  
  if (!transcript || !videoId) {
    return new Response(JSON.stringify({ error: 'Both transcript data and videoId are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Generate blog
    const blog = await generateBlog(transcript, videoId);
    
    return new Response(JSON.stringify(blog), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

router.post('/api/process', async (request: Request) => {
  const { url } = await request.json() as { url: string };
  
  if (!url) {
    return new Response(JSON.stringify({ error: 'YouTube URL is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const videoId = getVideoId(url);
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // 1. Fetch transcript
    const transcript = await fetchYouTubeTranscript(videoId);
    
    // 2. Generate blog
    const blog = await generateBlog(transcript, videoId);
    
    const result = {
      videoId,
      transcript,
      blog
    };
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Handle OPTIONS requests for CORS
router.options('*', () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
});

// Export a simplified fetch handler
export default {
  async fetch(request: Request, env: any, ctx: any) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    
    try {
      // Process the request through the router
      const response = await router.handle(request, env);
      
      // Add CORS headers to the response
      return addCORSHeaders(response);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
  }
};