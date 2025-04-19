// Serverless entry point for Vercel deployment
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { analyzeMusicTrack } = require('../server/services/enhancedOpenAI');
const audioFeatureExtractor = require('../server/services/AudioFeatureExtractor');
const { generateBasicFeedback } = require('../server/services/basicFeedback');

// Create Express app
const app = express();

// Configure middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads in serverless environment
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: 'vercel' });
});

// Main track analysis endpoint
app.post('/api/analyze-track', upload.single('track'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }
  
  try {
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
      console.log('Audio features extracted successfully');
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
    
    // Parse reference artists
    const parsedReferenceArtists = req.body.referenceArtists ? 
      JSON.parse(req.body.referenceArtists) : [];
    
    // Generate feedback
    console.log('Generating AI feedback...');
    const feedback = await analyzeMusicTrack(filePath, parsedReferenceArtists, songFeatures);
    
    // Process response
    const content = feedback.choices[0].message.content;
    
    // Clean up temporary file
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('Error cleaning up temporary file:', cleanupError.message);
    }
    
    // Return structured feedback
    return res.json({
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
    console.error('Error in analyze-track endpoint:', error.message);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message,
      fallbackAnalysis: generateBasicFeedback(
        { tempo: 120, key: 'Unknown', energy: 0.7, dynamics: 6 },
        []
      )
    });
  }
});

// For Vercel serverless
module.exports = app;
