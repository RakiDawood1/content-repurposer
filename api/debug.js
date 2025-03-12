// api/debug.js
module.exports = async (req, res) => {
    try {
      // Check if youtubei.js is installed
      const youtubeijsInstalled = !!require.resolve('youtubei.js');
      
      // Get Node.js version
      const nodeVersion = process.version;
      
      // List all loaded modules
      const modules = Object.keys(require.cache).filter(key => 
        key.includes('node_modules') && 
        !key.includes('node_modules/node_modules')
      ).map(path => {
        const parts = path.split('node_modules/');
        return parts[parts.length - 1].split('/')[0];
      });
      
      // Return debug info
      return res.status(200).json({
        youtubeijsInstalled,
        nodeVersion,
        modules: [...new Set(modules)],
        env: {
          nodeEnv: process.env.NODE_ENV,
          hasGeminiKey: !!process.env.GEMINI_API_KEY
        }
      });
    } catch (error) {
      return res.status(500).json({
        error: error.message,
        stack: error.stack
      });
    }
  };