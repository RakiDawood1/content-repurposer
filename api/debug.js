module.exports = async (req, res) => {
    try {
      // List of modules to check
      const modulesToCheck = ['youtubei.js', '@google/generative-ai', 'youtube-transcript'];
      
      // Check each module
      const moduleStatus = {};
      for (const module of modulesToCheck) {
        try {
          require.resolve(module);
          moduleStatus[module] = 'installed';
        } catch (error) {
          moduleStatus[module] = 'not installed';
        }
      }
      
      return res.status(200).json({
        nodeVersion: process.version,
        moduleStatus,
        environment: process.env.NODE_ENV,
        hasGeminiKey: !!process.env.GEMINI_API_KEY
      });
    } catch (error) {
      return res.status(500).json({
        error: error.message
      });
    }
  };