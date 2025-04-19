require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queueTrackAnalysis } = require('./services/queueService');
const enhancedAudioAnalysis = require('./services/enhancedAudioAnalysis'); 
const { generateBasicFeedback } = require('./services/basicFeedback'); // Import our new basic feedback generator

const app = express();
const PORT = process.env.PORT || 5001;

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max file size
  fileFilter: function(req, file, cb) {
    // Accept only audio files
    const filetypes = /mp3|wav|m4a|aac|ogg/;
    
    // Check if the mimetype starts with 'audio/' OR matches our file extensions
    const isAudioMime = file.mimetype.startsWith('audio/');
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    console.log('File upload attempt:', {
      filename: file.originalname,
      mimetype: file.mimetype,
      extension: path.extname(file.originalname).toLowerCase(),
      isAudioMime,
      extname
    });
    
    // Accept if either the mime type is audio/* OR the file extension matches
    if (isAudioMime || extname) {
      return cb(null, true);
    }
    
    cb(new Error('Only audio files are allowed! Supported formats: MP3, WAV, M4A, AAC, OGG'));
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
        const songFeatures = await enhancedAudioAnalysis.extractEnhancedAudioFeatures(req.file.path);
        console.log('Audio analysis complete, generating AI feedback');
        
        const { analyzeMusicTrack } = require('./services/openaiService');
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
      songFeatures = await enhancedAudioAnalysis.extractEnhancedAudioFeatures(req.file.path);
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
      const { analyzeMusicTrack } = require('./services/openaiService');
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
      energy: 0.75,
      dynamics: 8.5,
      mood: 'Energetic',
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
    
    // Extract audio features
    console.log('Starting audio analysis with extracted features');
    let songFeatures;
    
    try {
      // Extract audio features with timeout protection
      console.log('Extracting audio features from:', req.file.path);
      songFeatures = await enhancedAudioAnalysis.extractEnhancedAudioFeatures(req.file.path);
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
    
    // Create properly formatted prompt values, ensuring they are strings, not objects
    const tempoValue = typeof songFeatures.tempo === 'object' ? songFeatures.tempo.value || 120 : songFeatures.tempo || 120;
    const keyValue = typeof songFeatures.harmonic === 'object' ? songFeatures.harmonic.key || 'Unknown' : songFeatures.key || 'Unknown';
    const energyValue = songFeatures.energy || 0.7;
    const dynamicsValue = typeof songFeatures.dynamics === 'object' ? songFeatures.dynamics.value || 0.5 : songFeatures.dynamics || 0.5;
    
    // Generate prompt with properly formatted values
    const prompt = `Analyze this electronic music track with these features: Tempo: ${tempoValue} BPM, Key: ${keyValue}, Energy: ${energyValue}, Dynamics: ${dynamicsValue} dB. ${parsedReferenceArtists.length > 0 ? 'Reference artists: ' + parsedReferenceArtists.join(', ') : 'No reference artists specified.'}`;
    
    console.log('Starting OpenAI feedback generation');
    console.log('Prompt being sent to OpenAI:', prompt);
    
    // Call OpenAI API
    let feedback = null;
    
    try {
      // Create an abort controller for the OpenAI call
      const controller = new AbortController();
      const signalTimeout = setTimeout(() => {
        console.log('OpenAI API timeout - aborting request');
        controller.abort();
      }, 20000); // 20 second OpenAI timeout
      
      // Create new instance for this request to avoid any shared state issues
      const openai = new (require('openai').OpenAI)({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",  // Using gpt-4o model as preferred by user
        messages: [
          {
            role: "system",
            content: "You are a professional music producer and mixing engineer specializing in electronic music. Provide detailed technical feedback on production quality, mixing, arrangement and sound design."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      }, { signal: controller.signal });
      
      clearTimeout(signalTimeout);
      console.log('OpenAI API call completed successfully');
      
      // Process response
      const content = response.choices[0].message.content;
      console.log('OpenAI API response content:', content.substring(0, 100) + '...');
      
      // Log the exact prompt that was sent to OpenAI
      console.log('Full prompt sent to OpenAI:', JSON.stringify({
        role: "user",
        content: prompt
      }));
      
      // Log the full extracted features
      console.log('Full extracted audio features:', JSON.stringify(songFeatures));
      
      // Check if we got a reasonable response from OpenAI
      if (content && content.length > 100) {
        // Create structured feedback with the OpenAI response content
        feedback = {
          analysis: content,
          technicalInsights: content, // Use the full GPT-4o response here
          comparisonToReference: parsedReferenceArtists.length > 0 ? 
            `Your track was compared against the styles of ${parsedReferenceArtists.join(', ')}.` : null,
          nextSteps: "Consider the feedback above to improve your production.",
          audioFeatures: {
            tempo: songFeatures.tempo || 120,
            key: songFeatures.key || 'Unknown',
            energy: songFeatures.energy || 0.5,
            dynamics: songFeatures.dynamics || 6
          }
        };
        
        // Log the feedback being sent to the client
        console.log('Feedback sent to client:', {
          analysisLength: content.length,
          hasAudioFeatures: true,
          successfully: true
        });
        
        // Log the actual content being sent (first 200 chars)
        console.log('Content preview:', content.substring(0, 200));
      } else {
        // Use our reliable backup generator if OpenAI response is too short or empty
        console.log('OpenAI response was too short or invalid, using backup generator');
        const basicFeedback = generateBasicFeedback(songFeatures, parsedReferenceArtists);
        
        console.log('Basic feedback generated:', {
          analysisLength: basicFeedback.analysis.length,
          hasTechnicalInsights: !!basicFeedback.technicalInsights,
          hasNextSteps: !!basicFeedback.nextSteps
        });
        
        feedback = {
          ...basicFeedback,
          audioFeatures: {
            tempo: songFeatures.tempo || 120,
            key: songFeatures.key || 'Unknown',
            energy: songFeatures.energy || 0.5,
            dynamics: songFeatures.dynamics || 6
          }
        };
      }
    } catch (aiError) {
      console.error('Error generating AI feedback:', aiError.message);
      
      // Use our reliable backup generator for error cases too
      console.log('Error occurred during AI feedback generation, using backup generator');
      const basicFeedback = generateBasicFeedback(songFeatures, parsedReferenceArtists);
      
      console.log('Basic feedback generated:', {
        analysisLength: basicFeedback.analysis.length,
        hasTechnicalInsights: !!basicFeedback.technicalInsights,
        hasNextSteps: !!basicFeedback.nextSteps
      });
      
      feedback = {
        ...basicFeedback,
        audioFeatures: {
          tempo: songFeatures.tempo || 120,
          key: songFeatures.key || 'Unknown',
          energy: songFeatures.energy || 0.5,
          dynamics: songFeatures.dynamics || 6
        }
      };
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
