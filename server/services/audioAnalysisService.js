const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const { EssentiaWASM, EssentiaModel } = require('essentia.js');
const ffmpeg = require('fluent-ffmpeg');

// Initialize essentia.js
let essentia;
let model;

async function initEssentia() {
  if (!essentia) {
    essentia = await EssentiaWASM();
    console.log('Essentia.js initialized');
    
    // Optional: Load TensorFlow models for more advanced analysis
    // This would be used for tasks like genre recognition, mood detection, etc.
    try {
      model = new EssentiaModel.TensorflowMusiCNN(essentia);
      await model.initialize();
      console.log('MusiCNN model loaded');
    } catch (err) {
      console.warn('Could not load TensorFlow model:', err.message);
    }
  }
  return essentia;
}

// Initialize on module load
initEssentia().catch(err => console.error('Error initializing Essentia:', err));

/**
 * Extract comprehensive audio features from a music track
 * @param {string} trackPath Path to the audio file
 * @returns {Object} Extracted audio features
 */
async function extractAudioFeatures(trackPath) {
  try {
    // Wait for essentia to be initialized
    const essentia = await initEssentia();
    
    // Parse basic metadata
    const metadata = await mm.parseFile(trackPath);
    
    // Normalize audio to WAV format for consistent processing
    const wavPath = await normalizeAudioToWav(trackPath);
    
    // Read audio file
    const audioData = fs.readFileSync(wavPath);
    const audioBuffer = essentia.arrayToVector(new Float32Array(audioData));
    
    // Extract basic features
    const features = {};
    
    // Tempo and rhythm features
    const rhythmExtractor = essentia.RhythmExtractor2013(audioBuffer, 44100);
    features.bpm = rhythmExtractor.bpm;
    features.beats = rhythmExtractor.beats.length;
    features.beatStrength = calculateBeatStrength(rhythmExtractor.ticks);
    
    // Loudness and dynamics
    const loudness = essentia.Loudness(audioBuffer);
    features.loudness = loudness.loudness;
    
    const dynamicComplexity = essentia.DynamicComplexity(audioBuffer);
    features.dynamicRange = dynamicComplexity.dynamicComplexity;
    
    // Spectral features
    const spectralContrast = essentia.SpectralContrast(audioBuffer);
    features.spectralContrast = calculateAverage(spectralContrast.spectralContrast);
    
    // Harmonic features
    const keyExtractor = essentia.KeyExtractor(audioBuffer);
    features.key = keyExtractor.key;
    features.scale = keyExtractor.scale;
    
    // Genre and mood classification if model is available
    if (model) {
      const activation = await model.predict(audioBuffer);
      features.genrePrediction = getTopGenres(activation);
      features.mood = deriveMoodFromFeatures(activation, features);
    }
    
    // Clean up temporary WAV file
    if (wavPath !== trackPath) {
      fs.unlinkSync(wavPath);
    }
    
    // Format and enhance the features for human-readable feedback
    return formatFeaturesForFeedback(features, metadata);
    
  } catch (error) {
    console.error('Error extracting audio features:', error);
    // Fallback to basic metadata if audio analysis fails
    return extractBasicMetadata(trackPath);
  }
}

/**
 * Normalize audio to WAV format for consistent processing
 * @param {string} filePath Original audio file path
 * @returns {Promise<string>} Path to normalized WAV file
 */
function normalizeAudioToWav(filePath) {
  const outputPath = path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}_normalized.wav`);
  
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .output(outputPath)
      .audioFrequency(44100)
      .audioChannels(1)
      .format('wav')
      .on('error', err => {
        console.error('Error converting audio:', err);
        reject(err);
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .run();
  });
}

/**
 * Calculate average of an array
 * @param {Array} array Array of numbers
 * @returns {number} Average
 */
function calculateAverage(array) {
  return array.reduce((a, b) => a + b, 0) / array.length;
}

/**
 * Calculate beat strength from beat ticks
 * @param {Array} ticks Beat ticks array
 * @returns {string} Qualitative assessment of beat strength
 */
function calculateBeatStrength(ticks) {
  const mean = calculateAverage(ticks);
  if (mean > 0.8) return 'Strong';
  if (mean > 0.5) return 'Moderate';
  return 'Weak';
}

/**
 * Get top predicted genres from model activation
 * @param {Array} activation Model activation values
 * @returns {Array} Top 3 genres with confidence scores
 */
function getTopGenres(activation) {
  // This would process the activation from the neural network
  // to determine the most likely genres
  
  // Simulating for now - would be based on actual model activations
  const genreMap = {
    'electronic': 0.8,
    'techno': 0.7,
    'house': 0.5,
    'ambient': 0.3,
    'experimental': 0.2
  };
  
  return Object.entries(genreMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre, confidence]) => ({ genre, confidence }));
}

/**
 * Derive mood from audio features
 * @param {Array} activation Model activation
 * @param {Object} features Extracted features
 * @returns {Object} Mood assessment
 */
function deriveMoodFromFeatures(activation, features) {
  // Simplified mood derivation based on features
  const energy = features.loudness > -20 ? 'high' : 'low';
  const complexity = features.spectralContrast > 0.6 ? 'complex' : 'simple';
  
  // This would be more sophisticated with a real neural network model
  return {
    energy,
    complexity,
    // Other mood dimensions would be added here
  };
}

/**
 * Format extracted features into human-readable feedback
 * @param {Object} features Raw extracted features
 * @param {Object} metadata Track metadata 
 * @returns {Object} Formatted features for feedback
 */
function formatFeaturesForFeedback(features, metadata) {
  // Process the raw technical features into meaningful descriptions for the user
  return {
    // Track metadata
    title: metadata.common.title || 'Unknown Title',
    artist: metadata.common.artist || 'Unknown Artist',
    
    // Tempo and rhythm
    tempo: {
      value: Math.round(features.bpm),
      description: describeTempo(features.bpm),
      quality: qualifyTempo(features.bpm, features.beatStrength)
    },
    
    // Loudness and dynamics
    dynamics: {
      description: describeDynamics(features.dynamicRange),
      quality: features.dynamicRange > 0.5 ? 'Good dynamic range' : 'Limited dynamic range',
      improvementNeeded: features.dynamicRange < 0.5
    },
    
    // Mix balance
    mixBalance: {
      description: describeSpectralBalance(features.spectralContrast),
      quality: features.spectralContrast > 0.6 ? 'Well-balanced' : 'Could be more balanced'
    },
    
    // Harmonic content
    harmonic: {
      key: `${features.key} ${features.scale}`,
      description: `Track is in ${features.key} ${features.scale}`
    },
    
    // Genre prediction
    genre: features.genrePrediction 
      ? features.genrePrediction.map(g => g.genre).join(', ')
      : 'Electronic/Dance',
    
    // Overall loudness assessment
    loudness: {
      description: describeLoudness(features.loudness),
      quality: assessLoudnessQuality(features.loudness)
    },
    
    // Arrangement complexity
    complexity: {
      value: features.spectralContrast,
      description: features.spectralContrast > 0.6 
        ? 'Track has complex and varied elements' 
        : 'Track could benefit from more variation'
    },
    
    // Overall mood
    mood: features.mood 
      ? describeMood(features.mood) 
      : 'Electronic with moderate energy'
  };
}

/**
 * Extract basic metadata as fallback
 * @param {string} trackPath Audio file path
 * @returns {Promise<Object>} Basic metadata
 */
async function extractBasicMetadata(trackPath) {
  try {
    const metadata = await mm.parseFile(trackPath);
    
    return {
      title: metadata.common.title || 'Unknown Title',
      artist: metadata.common.artist || 'Unknown Artist',
      genre: metadata.common.genre?.[0] || 'Electronic',
      tempo: {
        value: metadata.common.bpm || 'Unknown',
        description: metadata.common.bpm ? describeTempo(metadata.common.bpm) : 'Moderate tempo'
      },
      format: metadata.format.container,
      duration: metadata.format.duration,
      bitrate: metadata.format.bitrate,
      // Add fallback values for other features
      dynamics: {
        description: 'Could not analyze dynamics',
        quality: 'Unknown'
      },
      mixBalance: {
        description: 'Could not analyze mix balance',
        quality: 'Unknown'
      },
      loudness: {
        description: 'Could not analyze loudness',
        quality: 'Unknown'
      }
    };
  } catch (error) {
    console.error('Error extracting basic metadata:', error);
    // Return minimum placeholder data if everything fails
    return {
      title: 'Unknown Title',
      artist: 'Unknown Artist',
      genre: 'Electronic',
      tempo: {
        value: 'Unknown',
        description: 'Could not determine tempo'
      },
      dynamics: {
        description: 'Could not analyze dynamics',
        quality: 'Unknown'
      },
      mixBalance: {
        description: 'Could not analyze mix balance',
        quality: 'Unknown'
      },
      loudness: {
        description: 'Could not analyze loudness',
        quality: 'Unknown'
      }
    };
  }
}

// Helper functions to describe audio features in human terms

function describeTempo(bpm) {
  if (bpm < 70) return 'Very slow tempo';
  if (bpm < 90) return 'Slow tempo';
  if (bpm < 120) return 'Moderate tempo';
  if (bpm < 140) return 'Energetic tempo';
  if (bpm < 160) return 'Fast tempo';
  return 'Very fast tempo';
}

function qualifyTempo(bpm, beatStrength) {
  if (beatStrength === 'Strong') {
    return 'Solid and consistent beat';
  } else if (beatStrength === 'Moderate') {
    return 'Decent beat presence';
  } else {
    return 'Beat could be more pronounced';
  }
}

function describeDynamics(dynamicRange) {
  if (dynamicRange > 0.8) return 'Excellent dynamic range with great contrast between quiet and loud parts';
  if (dynamicRange > 0.6) return 'Good dynamic range';
  if (dynamicRange > 0.4) return 'Moderate dynamic range';
  return 'Limited dynamic range, could benefit from more variation in volume';
}

function describeSpectralBalance(spectralContrast) {
  if (spectralContrast > 0.8) return 'Excellent frequency balance with clear separation between elements';
  if (spectralContrast > 0.6) return 'Good balance across frequency spectrum';
  if (spectralContrast > 0.4) return 'Decent frequency balance but some elements might mask others';
  return 'Frequency spectrum could be more balanced, some frequency masking issues';
}

function describeLoudness(loudness) {
  if (loudness > -10) return 'Very loud mix, possibly over-compressed';
  if (loudness > -14) return 'Loud modern mix';
  if (loudness > -18) return 'Well-balanced loudness';
  return 'Relatively quiet mix, could benefit from careful mastering';
}

function assessLoudnessQuality(loudness) {
  if (loudness > -8) return 'Too loud, dynamic range is likely compromised';
  if (loudness > -14) return 'Good loudness for modern electronic music';
  if (loudness > -20) return 'Good loudness with preserved dynamics';
  return 'Could be louder while maintaining dynamics';
}

function describeMood(mood) {
  const { energy, complexity } = mood;
  
  if (energy === 'high' && complexity === 'complex') {
    return 'Energetic and sophisticated';
  } else if (energy === 'high' && complexity === 'simple') {
    return 'Energetic and straightforward';
  } else if (energy === 'low' && complexity === 'complex') {
    return 'Atmospheric and nuanced';
  } else {
    return 'Relaxed and accessible';
  }
}

module.exports = {
  extractAudioFeatures
};
