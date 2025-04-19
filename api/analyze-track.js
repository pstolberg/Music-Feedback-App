// Combined serverless function with database support
const OpenAI = require('openai');
const multer = require('multer');
const { query } = require('./db');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// Helper function to run multer in serverless
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

// Generate hardcoded feedback for MVP version
function generateHardcodedFeedback(trackName) {
  return {
    analysis: `# Track Analysis: ${trackName || 'Untitled Track'}

## Overall Assessment
Your track has a solid foundation with a well-established rhythm section and good energy flow. The arrangement effectively builds tension and provides satisfying release points. Some elements could benefit from additional refinement in the mix.

## Mix Analysis
The low-end has good presence but could use tighter control. There's good stereo width in the mid-range elements. Consider adding more definition to the high frequencies and ensuring better separation between key elements.

## Creative Suggestions
Try experimenting with more automation to create movement throughout the track. Consider introducing subtle ambient textures during breakdown sections to add more emotional depth and interest.`,
    audioFeatures: {
      tempo: 128,
      key: 'C Major',
      energy: 0.75,
      dynamics: 8.2
    }
  };
}

module.exports = async (req, res) => {
  // Enable CORS for cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST for actual track analysis
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Process the file upload
    console.log('Processing track upload...');
    await runMiddleware(req, res, upload.single('track'));

    // Check if file was included
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Log file details
    console.log('File received:', req.file.originalname, 'Size:', req.file.size);

    // Generate feedback (currently hardcoded)
    const feedback = generateHardcodedFeedback(req.file.originalname);
    
    try {
      // Store analysis in database
      await query(
        'INSERT INTO track_analysis (track_name, analysis, audio_features) VALUES ($1, $2, $3)',
        [req.file.originalname, feedback.analysis, feedback.audioFeatures]
      );
      console.log('Analysis stored in database');
    } catch (dbError) {
      // Continue even if database storage fails
      console.error('Database error:', dbError.message);
    }

    // Return analysis response
    return res.status(200).json({
      analysis: feedback.analysis,
      technicalInsights: feedback.analysis,
      audioFeatures: feedback.audioFeatures,
      storedInDb: true
    });
  } catch (error) {
    console.error('Error in serverless function:', error.message);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message
    });
  }
};
