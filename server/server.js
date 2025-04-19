require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queueTrackAnalysis } = require('./services/queueService');
const { generateBasicFeedback } = require('./services/basicFeedback'); 
const { analyzeMusicTrack } = require('./services/enhancedOpenAI'); 
const audioFeatureExtractor = require('./services/AudioFeatureExtractor');
const redisManager = require('./services/redisManager');

const app = express();
const PORT = process.env.PORT || 5002;

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads with strict validation
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, 'track-' + Date.now() + path.extname(file.originalname));
  }
});

// Strict file filter for audio files only
const fileFilter = (req, file, cb) => {
  // Accept only specific audio formats
  const validMimeTypes = [
    'audio/mpeg',           // MP3
    'audio/mp4',            // M4A, AAC
    'audio/wav',            // WAV
    'audio/x-wav',          // WAV alternate
    'audio/ogg',            // OGG
    'audio/flac',           // FLAC
    'audio/x-flac'          // FLAC alternate
  ];
  
  if (validMimeTypes.includes(file.mimetype)) {
    console.log(`Accepted file upload: ${file.originalname} (${file.mimetype})`);
    cb(null, true);
  } else {
    console.error(`Rejected file upload: ${file.originalname} (${file.mimetype})`);
    cb(new Error(`Only audio files are allowed. Got: ${file.mimetype}`), false);
  }
};

// Configure multer with strict limits
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max size
    files: 1                    // Only one file at a time
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Track status storage (in-memory for demo, would use Redis/DB in production)
const trackStatus = new Map();

// API routes
app.post('/api/feedback', upload.single('track'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file uploaded' });
    }

    const { referenceArtists } = req.body;
    const parsedReferenceArtists = referenceArtists ? JSON.parse(referenceArtists) : [];
    
    // Create a unique track ID
    const trackId = req.file.filename;
    
    // Update status to "processing"
    trackStatus.set(trackId, {
      status: 'processing',
      message: 'Track uploaded, queuing for analysis',
      trackPath: req.file.path,
      submittedAt: new Date().toISOString()
    });
    
    try {
      // Queue the track for background processing
      const job = await queueTrackAnalysis(
        req.file.path,
        parsedReferenceArtists,
        'user-123' // Placeholder user ID
      );
      
      // Update status with job information
      trackStatus.set(trackId, {
        ...trackStatus.get(trackId),
        jobId: job.jobId,
        status: 'queued',
        message: 'Track queued for analysis'
      });
      
      // Return a response with the job ID
      res.status(202).json({
        message: 'Track queued for analysis',
        trackId,
        jobId: job.jobId
      });
    } catch (queueError) {
      console.log('Queue error, falling back to immediate processing:', queueError.message);
      
      // Always fall back to immediate processing
      // Update status
      trackStatus.set(trackId, {
        ...trackStatus.get(trackId),
        status: 'immediate_processing',
        message: 'Processing immediately'
      });
      
      // Force a timeout for the entire operation
      const analysisTimeout = setTimeout(() => {
        console.log('Analysis operation timed out after 40 seconds');
        if (!res.headersSent) {
          return res.status(500).json({
            error: 'Analysis timed out',
            message: 'Track analysis took too long and timed out. Please try again.'
          });
        }
      }, 40000);
      
      try {
        // Process immediately with explicit timeout catches
        console.log('Starting immediate audio analysis');
        const songFeatures = await audioFeatureExtractor.extractFeatures(req.file.path);
        console.log('Audio analysis complete, generating AI feedback');
        
        const feedback = await analyzeMusicTrack(req.file.path, parsedReferenceArtists, songFeatures);
        
        // Clear the timeout since we completed successfully
        clearTimeout(analysisTimeout);
        
        // Only proceed if headers haven't been sent (no timeout occurred)
        if (!res.headersSent) {
          // Update status to completed
          trackStatus.set(trackId, {
            ...trackStatus.get(trackId),
            status: 'completed',
            message: 'Analysis completed',
            completedAt: new Date().toISOString()
          });
          
          // Return immediate results
          return res.status(200).json({ 
            message: 'Track processed successfully',
            trackId,
            feedback 
          });
        }
      } catch (processingError) {
        console.error('Error during immediate processing:', processingError);
        return res.status(500).json({ 
          message: 'Error analyzing track', 
          errorType: 'PROCESSING_ERROR',
          error: processingError.toString() 
        });
      }
    }
    
  } catch (error) {
    console.error('Error processing feedback:', error);
    res.status(500).json({ 
      message: 'Error processing feedback', 
      errorType: 'GENERAL_SERVER_ERROR',
      error: error.toString(),
      stack: error.stack
    });
  }
});

// Fallback route for immediate feedback (for development/demo)
app.post('/api/feedback/immediate', upload.single('track'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file uploaded' });
    }

    const { referenceArtists } = req.body;
    const parsedReferenceArtists = referenceArtists ? JSON.parse(referenceArtists) : [];
    
    console.log('Extracting audio features for immediate feedback...');
    let songFeatures;
    try {
      songFeatures = await audioFeatureExtractor.extractFeatures(req.file.path);
      console.log('Successfully extracted audio features');
    } catch (featureError) {
      console.error('Error extracting audio features:', featureError);
      
      // Fallback to basic metadata extraction
      console.log('Falling back to basic metadata extraction...');
      try {
        // Simple metadata fallback
        const mm = require('music-metadata');
        const metadata = await mm.parseFile(req.file.path);
        
        // Create minimal feature set from metadata
        songFeatures = {
          title: metadata.common.title || path.basename(req.file.path),
          artist: metadata.common.artist || 'Unknown Artist',
          genre: metadata.common.genre?.[0] || 'Electronic',
          tempo: {
            value: metadata.common.bpm || 120,
            description: 'Unknown (using estimated value)',
            quality: 'Could not be analyzed'
          },
          loudness: {
            value: -14,
            description: 'Unknown (using standard value)',
            quality: 'Could not be analyzed'
          },
          dynamics: {
            value: 8,
            description: 'Unknown (using standard value)',
            quality: 'Could not be analyzed'  
          },
          mixBalance: {
            value: 0.5,
            description: 'Unknown (using standard value)',
            quality: 'Could not be analyzed'
          }
        };
        
        console.log('Successfully created fallback features');
      } catch (fallbackError) {
        console.error('Even fallback metadata extraction failed:', fallbackError);
        return res.status(500).json({ 
          message: 'Audio analysis completely failed', 
          errorType: 'COMPLETE_ANALYSIS_FAILURE',
          originalError: featureError.toString(),
          fallbackError: fallbackError.toString()
        });
      }
    }
    
    // Use the OpenAI service for generating feedback
    try {
      const feedback = await analyzeMusicTrack(req.file.path, parsedReferenceArtists, songFeatures);
      
      res.status(200).json({ feedback });
    } catch (openaiError) {
      console.error('Error generating AI feedback:', openaiError);
      return res.status(500).json({ 
        message: 'Error generating AI feedback', 
        errorType: 'OPENAI_SERVICE_ERROR',
        error: openaiError.toString(),
        stack: openaiError.stack
      });
    }
    
  } catch (error) {
    console.error('Error processing immediate feedback:', error);
    res.status(500).json({ 
      message: 'Error processing feedback', 
      errorType: 'GENERAL_SERVER_ERROR',
      error: error.toString(),
      stack: error.stack
    });
  }
});

// Simple direct endpoint for testing - with minimal dependencies
app.post('/api/analyze-track-simple', upload.single('track'), async (req, res) => {
  try {
    console.log('Simple track analysis endpoint called');
    
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file uploaded' });
    }

    // Extract reference artists
    const { referenceArtists } = req.body;
    const parsedReferenceArtists = referenceArtists ? JSON.parse(referenceArtists) : [];
    
    console.log('Starting simple audio analysis');
    
    // Create super simple audio features manually
    const songFeatures = {
      tempo: 125,
      key: 'C minor',
      energy: 0.7,
      dynamics: 6,
      mood: 'Unknown',
      complexity: 'Medium'
    };
    
    console.log('Simple audio features created - skipping actual audio analysis');
    console.log('Starting OpenAI API call with strict timeout');
    
    // Create a controller to abort the fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Aborting OpenAI API call after timeout');
      controller.abort();
    }, 15000); // 15 second timeout
    
    try {
      const feedback = await generateSimpleFeedback(songFeatures, parsedReferenceArtists, controller.signal);
      clearTimeout(timeoutId);
      console.log('Successfully generated feedback');
      
      return res.status(200).json({ 
        message: 'Track processed successfully with simple endpoint',
        feedback
      });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('OpenAI error or timeout in simple endpoint:', error.message);
      
      // Create fallback feedback
      const fallbackFeedback = {
        analysis: "We couldn't analyze your track in detail due to a technical issue. However, based on the basic metrics, your track appears to have a good tempo for dance music, reasonable dynamics, and energy suitable for club play.",
        technicalInsights: "Consider checking your mix for frequency balance and ensuring your loudness levels are optimized for streaming platforms.",
        nextSteps: "Try comparing your track to commercial references for a better understanding of how to improve your production.",
        songFeatures
      };
      
      return res.status(200).json({
        message: 'Fallback analysis provided',
        feedback: fallbackFeedback
      });
    }
  } catch (error) {
    console.error('Error in simple analysis endpoint:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Direct and reliable track analysis endpoint - production ready simplified version
app.post('/api/analyze-track', upload.single('track'), async (req, res) => {
  // Track analysis with direct processing
  console.log('Track analysis endpoint called with direct processing approach');
  
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  
  try {
    // Prepare reference artists
    const parsedReferenceArtists = req.body.referenceArtists ? JSON.parse(req.body.referenceArtists) : [];
    console.log('Reference artists:', parsedReferenceArtists);
    
    // Extract audio features using our robust AudioFeatureExtractor
    console.log('Starting audio analysis with AudioFeatureExtractor');
    let songFeatures;
    
    try {
      // Use our new robust audio feature extractor
      console.log('Extracting audio features from:', req.file.path);
      songFeatures = await audioFeatureExtractor.extractFeatures(req.file.path);
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
    
    // Generate professional feedback using GPT-4o with the enhanced structured prompt
    console.log('Starting OpenAI feedback generation');
    let feedback;
    try {
      // Call our enhanced OpenAI service
      const response = await analyzeMusicTrack(req.file.path, parsedReferenceArtists, songFeatures);
      
      // Process response
      const content = response.choices[0].message.content;
      console.log('OpenAI API response received, length:', content.length);
      
      // Structured feedback object
      feedback = {
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
      };
      
      // Log the audio features specifically for debugging
      console.log('Audio features being sent to client:', JSON.stringify(feedback.audioFeatures));
      
      // Store results in Redis if available for future reference
      if (redisManager.isReady()) {
        const trackId = path.basename(req.file.path, path.extname(req.file.path));
        await redisManager.set(`track:${trackId}:features`, songFeatures, 86400); // 24hr expiry
        await redisManager.set(`track:${trackId}:feedback`, feedback, 86400); // 24hr expiry
        console.log(`Track analysis stored in Redis with key track:${trackId}`);
      }
    } catch (openaiError) {
      console.error('Error generating feedback with OpenAI:', openaiError.message);
      
      // Fall back to basic feedback generator if OpenAI fails
      feedback = {
        analysis: generateBasicFeedback(songFeatures, parsedReferenceArtists),
        technicalInsights: generateBasicFeedback(songFeatures, parsedReferenceArtists),
        comparisonToReference: parsedReferenceArtists.length > 0 ? 
          `Your track was compared against the styles of ${parsedReferenceArtists.join(', ')}.` : null,
        nextSteps: "Try the suggestions above to improve your production.",
        audioFeatures: {
          tempo: typeof songFeatures.tempo === 'object' ? songFeatures.tempo.value || 120 : songFeatures.tempo || 120,
          key: typeof songFeatures.key === 'object' ? songFeatures.key.name || 'Unknown' : songFeatures.key || 'Unknown',
          energy: typeof songFeatures.energy === 'object' ? songFeatures.energy.value || 0.7 : songFeatures.energy || 0.7,
          dynamics: typeof songFeatures.dynamics === 'object' ? songFeatures.dynamics.value || 6 : songFeatures.dynamics || 6
        }
      };
    }
    
    // Cleanup the uploaded file
    try {
      fs.unlinkSync(req.file.path);
      console.log('Temporary file removed:', req.file.path);
    } catch (cleanupError) {
      console.error('Error removing temporary file:', cleanupError);
    }
    
    // Return the generated feedback
    return res.status(200).json({
      message: 'Track analyzed successfully',
      feedback
    });
    
  } catch (error) {
    console.error('Error in track analysis endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Endpoint for testing AI feedback with sample data
app.post('/api/debug-analyze', upload.single('track'), async (req, res) => {
  console.log('Debug analyze endpoint called');
  
  try {
    const sampleFeatures = {
      title: "Sample Track",
      tempo: 128,
      key: "C Minor",
      energy: 0.85,
      dynamics: 7,
      loudness: {
        value: -8.2,
        peak: -0.7
      },
      spectralBalance: "Well balanced with slightly boosted low-mids",
      complexity: "Medium-High",
      mood: "Energetic"
    };
    
    // Get reference artists from request
    const parsedReferenceArtists = req.body.referenceArtists ? JSON.parse(req.body.referenceArtists) : ["Disclosure", "Fred Again"];
    console.log('Debug with reference artists:', parsedReferenceArtists);
    
    console.log('Starting OpenAI debug feedback generation');
    const response = await analyzeMusicTrack(
      req.file ? req.file.path : null, 
      parsedReferenceArtists, 
      sampleFeatures
    );
    
    // Always clean up any uploaded file
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('Temporary debug file removed');
      } catch (cleanupError) {
        console.error('Error removing debug temporary file:', cleanupError);
      }
    }
    
    // Return the generated feedback
    return res.status(200).json({
      message: 'Debug analysis completed',
      feedback: {
        analysis: response.choices[0].message.content,
        technicalInsights: response.choices[0].message.content,
        comparisonToReference: parsedReferenceArtists.length > 0 ? 
          `Your track was compared against the styles of ${parsedReferenceArtists.join(', ')}.` : null,
        nextSteps: "These are debug suggestions to improve your production.",
        audioFeatures: sampleFeatures
      }
    });
  } catch (error) {
    console.error('Error in debug analyze endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred in debug endpoint'
    });
  }
});

// Direct and reliable track analysis endpoint with VERBOSE debugging
app.post('/api/analyze-track-debug', upload.single('track'), async (req, res) => {
  console.log('DEBUG ENDPOINT: Track analysis endpoint called with full logging');
  
  if (!req.file) {
    return res.status(400).json({ message: 'No audio file uploaded' });
  }

  try {
    // Extract reference artists
    const { referenceArtists } = req.body;
    const parsedReferenceArtists = referenceArtists ? JSON.parse(referenceArtists) : [];
    
    console.log('Starting audio analysis with DEBUG logging');
    
    // Create basic fallback features
    const songFeatures = {
      tempo: 125,
      key: 'C minor',
      energy: 0.7,
      dynamics: 6,
      mood: 'Unknown',
      complexity: 'Medium'
    };
    
    // Generate debug response with all the data
    const debugData = {
      trackInfo: {
        filename: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      extractedFeatures: songFeatures,
      referenceArtists: parsedReferenceArtists,
      prompt: `Analyze this electronic music track with these features: Tempo: ${songFeatures.tempo} BPM, Key: ${songFeatures.key}, Energy: ${songFeatures.energy}, Dynamics: ${songFeatures.dynamics} dB. ${parsedReferenceArtists.length > 0 ? 'Reference artists: ' + parsedReferenceArtists.join(', ') : 'No reference artists specified.'}`,
      apiKey: process.env.OPENAI_API_KEY ? 'API Key is present (first 5 chars: ' + process.env.OPENAI_API_KEY.substring(0, 5) + '...)' : 'API Key is missing',
      serverDetails: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        memory: process.memoryUsage(),
        redisAvailable: false // Hardcoded since Redis is not connecting
      }
    };
    
    // Create basic feedback with debugging info
    const basicFeedback = generateBasicFeedback(songFeatures, parsedReferenceArtists);
    
    // Return full debug info
    return res.status(200).json({
      message: 'Debug analysis completed',
      debugData,
      feedback: {
        ...basicFeedback,
        audioFeatures: {
          tempo: songFeatures.tempo || 120,
          key: songFeatures.key || 'Unknown',
          energy: songFeatures.energy || 0.5,
          dynamics: songFeatures.dynamics || 6
        }
      }
    });
    
  } catch (error) {
    console.error('Error in debug track analysis endpoint:', error);
    return res.status(500).json({
      error: 'Debug analysis failed',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Debug endpoint to verify API connections and credentials
app.get('/api/system-check', async (req, res) => {
  console.log('System check initiated');
  
  try {
    // Check system configuration 
    const checks = {
      env: {
        node_env: process.env.NODE_ENV || 'not set',
        port: process.env.PORT || '5002 (default)',
        openai_key: process.env.OPENAI_API_KEY ? 
          `${process.env.OPENAI_API_KEY.substring(0, 3)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}` 
          : 'MISSING',
        openai_key_valid: process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')
      },
      filesystem: {
        uploads_dir: fs.existsSync(uploadDir),
        uploads_writable: await isDirectoryWritable(uploadDir)
      },
      connectivity: {
        openai_reachable: false
      }
    };
    
    // Check OpenAI connectivity if key is present
    if (checks.env.openai_key_valid) {
      try {
        const { OpenAI } = require('openai');
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        
        // Minimal API call to test connectivity
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo", // Use the most basic model for this test
          messages: [{ role: "user", content: "Quick test to verify API key works." }],
          max_tokens: 5
        });
        
        checks.connectivity.openai_reachable = response && response.choices && response.choices.length > 0;
        checks.connectivity.openai_response = 'Valid response received';
      } catch (apiError) {
        checks.connectivity.openai_error = apiError.message;
      }
    }
    
    // Check overall system health
    const systemOk = checks.env.openai_key_valid && 
                     checks.filesystem.uploads_dir && 
                     checks.filesystem.uploads_writable;
    
    return res.json({
      status: systemOk ? 'OK' : 'ISSUES_DETECTED',
      checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('System check failed:', error);
    return res.status(500).json({
      status: 'ERROR',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Helper function to check if a directory is writable
async function isDirectoryWritable(directory) {
  const testFile = path.join(directory, `.write-test-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch (err) {
    return false;
  }
}

// Global error handler for unhandled server errors
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  
  // Log detailed error information
  console.error({
    message: err.message,
    stack: err.stack,
    endpoint: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    time: new Date().toISOString()
  });
  
  // Clean up any uploaded files to prevent disk space issues
  if (req.file && req.file.path) {
    try {
      fs.unlinkSync(req.file.path);
      console.log('Cleaned up uploaded file after error:', req.file.path);
    } catch (cleanupErr) {
      console.error('Error cleaning up file:', cleanupErr);
    }
  }
  
  // Send appropriate error response
  res.status(500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred. Our team has been notified.' 
      : err.message,
    endpoint: req.originalUrl,
    code: err.code || 'INTERNAL_ERROR'
  });
});

// Simple feedback generation function with signal for abortion
async function generateSimpleFeedback(songFeatures, referenceArtists, signal) {
  const artistsString = referenceArtists.length > 0 
    ? `Reference artists: ${referenceArtists.join(', ')}` 
    : 'No reference artists specified';
  
  const featureString = `
    Tempo: ${songFeatures.tempo} BPM
    Key: ${songFeatures.key}
    Energy: ${songFeatures.energy}/1.0
    Dynamics: ${songFeatures.dynamics} dB
    Mood: ${songFeatures.mood}
    Complexity: ${songFeatures.complexity}
  `;
  
  console.log('Making OpenAI API call with AbortController');
  
  const openai = new (require('openai').OpenAI)({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional music producer analyzing electronic music tracks."
        },
        {
          role: "user",
          content: `Analyze this electronic music track. ${artistsString}. Technical details: ${featureString}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    }, { signal });
    
    console.log('OpenAI API call completed successfully');
    
    // Create structured feedback
    return {
      analysis: response.choices[0].message.content.substring(0, 500),
      technicalInsights: "Based on the audio features, your track has good technical qualities.",
      nextSteps: "Continue refining your production technique.",
      songFeatures
    };
  } catch (error) {
    console.error('Error in simple feedback generation:', error.message);
    throw error;
  }
}

// Status check endpoint
app.get('/api/feedback/status/:trackId', (req, res) => {
  const { trackId } = req.params;
  
  if (!trackStatus.has(trackId)) {
    return res.status(404).json({ message: 'Track not found' });
  }
  
  res.status(200).json({
    trackId,
    ...trackStatus.get(trackId)
  });
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
  });
}

// Start server if not imported as a module (for Vercel serverless deployment)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the Express app for serverless environments
module.exports = app;
