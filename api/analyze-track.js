// Serverless function for Vercel deployment: /api/analyze-track
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { analyzeMusicTrack } = require('../server/services/enhancedOpenAI');
const audioFeatureExtractor = require('../server/services/AudioFeatureExtractor');
const { generateBasicFeedback } = require('../server/services/basicFeedback');

// Configure multer for memory storage (required for serverless)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Helper function to run multer in serverless context
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

// Serverless function handler
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Process the uploaded file
    await runMiddleware(req, res, upload.single('track'));
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    // Create temporary file from memory buffer
    const tmpDir = '/tmp';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    const filePath = path.join(tmpDir, req.file.originalname);
    fs.writeFileSync(filePath, req.file.buffer);
    
    console.log('Extracting audio features...');
    let songFeatures;
    
    try {
      // Extract audio features
      songFeatures = await audioFeatureExtractor.extractFeatures(filePath);
      console.log('Audio features extracted successfully:', Object.keys(songFeatures).join(', '));
    } catch (audioError) {
      console.error('Error extracting audio features:', audioError.message);
      // Create basic fallback features
      songFeatures = {
        tempo: 125,
        key: 'Unknown',
        energy: 0.7,
        dynamics: 6,
        mood: 'Unknown',
        complexity: 'Medium'
      };
      console.log('Using fallback audio features');
    }
    
    // Parse reference artists from form data
    const parsedReferenceArtists = req.body.referenceArtists ? 
      JSON.parse(req.body.referenceArtists) : [];
    
    // Generate feedback
    console.log('Generating AI feedback...');
    const feedback = await analyzeMusicTrack(filePath, parsedReferenceArtists, songFeatures);
    
    // Process response from OpenAI
    const content = feedback.choices[0].message.content;
    console.log('Feedback generated successfully, length:', content.length);
    
    // Clean up temporary file
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('Error cleaning up temporary file:', cleanupError.message);
    }
    
    // Return structured feedback with audio features
    console.log('Sending response with audio features');
    return res.status(200).json({
      analysis: content,
      technicalInsights: content,
      comparisonToReference: parsedReferenceArtists.length > 0 ? 
        `Your track was compared against the styles of ${parsedReferenceArtists.join(', ')}.` : null,
      nextSteps: "Consider the feedback above to improve your production.",
      audioFeatures: {
        tempo: typeof songFeatures.tempo === 'object' ? songFeatures.tempo.value || 120 : songFeatures.tempo || 120,
        key: typeof songFeatures.key === 'object' ? songFeatures.key.name || 'Unknown' : songFeatures.key || 'Unknown',
        energy: typeof songFeatures.energy === 'object' ? songFeatures.energy.value || 0.7 : songFeatures.energy || 0.7,
        dynamics: typeof songFeatures.dynamics === 'object' ? songFeatures.dynamics.value || 6 : songFeatures.dynamics || 6
      }
    });
  } catch (error) {
    console.error('Error in serverless function:', error.message);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message,
      fallbackAnalysis: generateBasicFeedback(
        { tempo: 120, key: 'Unknown', energy: 0.7, dynamics: 6 },
        []
      )
    });
  }
};
