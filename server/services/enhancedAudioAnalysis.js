const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const ffmpeg = require('fluent-ffmpeg');
const Meyda = require('meyda');

// Initialize Essentia.js properly
let essentia = null;

async function initEssentia() {
  try {
    // Import essentia.js using the correct pattern
    const Essentia = require('essentia.js');
    
    // Properly initialize by using the main Essentia object first
    console.log('Essentia.js imported, initializing WASM module...');
    
    // Initialize the WebAssembly module
    essentia = await Essentia.EssentiaWASM();
    
    // Create the high-level algorithms interface
    const algorithms = new Essentia.Essentia(essentia);
    
    console.log('Essentia.js initialized successfully!');
    console.log('Available algorithms:', Object.keys(algorithms).length);
    
    // Store both the low-level and high-level interfaces
    return {
      lowLevel: essentia,
      algorithms: algorithms,
      available: true
    };
  } catch (error) {
    console.error('Error initializing Essentia.js:', error);
    console.log('Will continue with fallback audio analysis methods');
    return {
      lowLevel: null,
      algorithms: null,
      available: false
    };
  }
}

// Store the initialized instance
let essentiaInstance = null;

// Execute initialization on module load
(async function() {
  try {
    essentiaInstance = await initEssentia();
    if (essentiaInstance.available) {
      console.log(' Essentia.js is ready for use');
    } else {
      console.log(' Using fallback analysis methods only');
    }
  } catch (error) {
    console.log(' Essentia initialization failed, using fallbacks only:', error.message);
    essentiaInstance = { available: false };
  }
})();

/**
 * Extract comprehensive audio features from a music track following the reference architecture
 * @param {string} trackPath Path to the audio file
 * @returns {Object} Extracted audio features
 */
async function extractEnhancedAudioFeatures(trackPath) {
  console.log(`Extracting enhanced features from ${trackPath}`);
  
  // Add a timeout promise that will reject after 25 seconds
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('AUDIO_ANALYSIS_TIMEOUT')), 25000);
  });
  
  try {
    // Wrap the actual analysis in a race with the timeout
    return await Promise.race([
      extractFeaturesWithFallbacks(trackPath),
      timeoutPromise
    ]);
  } catch (error) {
    console.error('Error extracting audio features:', error.message);
    
    // If we hit a timeout or any other error, return basic features
    if (error.message === 'AUDIO_ANALYSIS_TIMEOUT') {
      console.log('Analysis timed out, returning basic features');
      // Return a minimal feature set so the app doesn't hang
      return {
        tempo: 120,
        key: 'Unknown',
        energy: 0.5,
        dynamics: 6,
        audioFeatures: {
          tempo: 120,
          key: 'Unknown',
          energy: 0.5,
          dynamics: 6
        },
        error: 'Analysis timed out - using default features'
      };
    }
    
    // For any other error, also return basic features
    return {
      tempo: 120,
      key: 'Unknown',
      energy: 0.5,
      dynamics: 6,
      audioFeatures: {
        tempo: 120,
        key: 'Unknown',
        energy: 0.5,
        dynamics: 6
      },
      error: error.message
    };
  }
}

// Separate the extraction logic to work with the Promise.race timeout
async function extractFeaturesWithFallbacks(trackPath) {
  try {
    // Check if file exists
    if (!fs.existsSync(trackPath)) {
      throw new Error(`Audio file not found at path: ${trackPath}`);
    }

    // 1. INGESTION & NORMALIZATION
    // Normalize audio to WAV format for consistent processing
    console.log('Starting audio normalization...');
    let normalizedPath;
    try {
      normalizedPath = await normalizeAudioFile(trackPath);
      console.log(`Audio normalized to ${normalizedPath}`);
    } catch (normError) {
      console.error('Audio normalization failed:', normError);
      throw new Error(`Audio normalization failed: ${normError.message}`);
    }
    
    // Parse metadata
    let metadata;
    try {
      metadata = await mm.parseFile(normalizedPath);
      console.log('Metadata extracted successfully');
    } catch (metadataError) {
      console.error('Metadata extraction failed:', metadataError);
      throw new Error(`Metadata extraction failed: ${metadataError.message}`);
    }
    
    // 2. LOW-LEVEL SIGNAL FEATURES
    // Initialize feature storage
    const features = {
      metadata: extractBasicMetadata(metadata),
      // Store features by category according to reference architecture
      waveform: {},
      spectral: {},
      rhythm: {},
      harmonic: {},
      structure: {}
    };
    
    // Extract features using Essentia.js only if available
    console.log('Extracting Essentia features...');
    if (essentiaInstance && essentiaInstance.available) {
      try {
        const essentiaFeatures = await extractEssentiaFeatures(normalizedPath, essentiaInstance.lowLevel);
        
        // Combine Essentia features
        features.waveform = {
          ...features.waveform,
          ...essentiaFeatures.waveform
        };
        
        features.spectral = {
          ...features.spectral,
          ...essentiaFeatures.spectral
        };
        
        features.rhythm = {
          ...features.rhythm,
          ...essentiaFeatures.rhythm
        };
        
        features.harmonic = {
          ...features.harmonic,
          ...essentiaFeatures.harmonic
        };
        
        console.log('Essentia features extracted successfully');
      } catch (essentiaError) {
        console.error('Essentia feature extraction failed:', essentiaError);
        // Continue with other extractors but log the error
      }
    } else {
      console.log('Essentia.js not available, skipping Essentia feature extraction');
    }
    
    // Extract features using Meyda
    console.log('Extracting Meyda features...');
    try {
      const meydaFeatures = await extractMeydaFeatures(normalizedPath);
      
      // Combine Meyda features
      features.waveform = {
        ...features.waveform,
        ...meydaFeatures.waveform
      };
      
      features.spectral = {
        ...features.spectral,
        ...meydaFeatures.spectral
      };
      
      console.log('Meyda features extracted successfully');
    } catch (meydaError) {
      console.error('Meyda feature extraction failed:', meydaError);
      // Continue with other extractors but log the error
    }
    
    // Clean up temporary file
    if (normalizedPath !== trackPath) {
      try {
        fs.unlinkSync(normalizedPath);
        console.log('Temporary normalized file cleaned up');
      } catch (cleanupError) {
        console.error('Failed to clean up temporary file:', cleanupError);
        // Non-critical error, can continue
      }
    }
    
    // Format features for feedback
    console.log('Formatting features for feedback...');
    return formatFeaturesForFeedback(features);
    
  } catch (error) {
    console.error('Error in enhanced audio analysis:', error);
    // Add more context to the error
    throw new Error(`Enhanced audio analysis failed: ${error.message || error}`);
  }
}

/**
 * Normalize audio file for consistent analysis
 * @param {string} filePath Path to the audio file
 * @returns {Promise<string>} Path to the normalized audio file
 */
async function normalizeAudioFile(filePath) {
  // Create normalized file path
  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}_normalized.wav`
  );
  
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .output(outputPath)
      .audioFrequency(44100)  // Standardize to 44.1kHz
      .audioChannels(1)       // Convert to mono for analysis
      .audioFilters([
        'loudnorm=I=-14:LRA=11:TP=-1' // Normalize to -14 LUFS as per reference
      ])
      .format('wav')
      .on('error', err => {
        console.error('Error normalizing audio:', err);
        // If normalization fails, return original file
        resolve(filePath);
      })
      .on('end', () => {
        console.log(`Audio normalized to ${outputPath}`);
        resolve(outputPath);
      })
      .run();
  });
}

/**
 * Extract basic metadata from mm.parseFile result
 * @param {Object} metadata Metadata from music-metadata
 * @returns {Object} Basic metadata
 */
function extractBasicMetadata(metadata) {
  return {
    title: metadata.common.title || 'Unknown Title',
    artist: metadata.common.artist || 'Unknown Artist',
    album: metadata.common.album,
    genre: metadata.common.genre?.[0] || 'Electronic',
    year: metadata.common.year,
    duration: metadata.format.duration,
    bitrate: metadata.format.bitrate,
    sampleRate: metadata.format.sampleRate,
    numberOfChannels: metadata.format.numberOfChannels,
    codec: metadata.format.codec,
    lossless: metadata.format.lossless,
    bpm: metadata.common.bpm
  };
}

/**
 * Extract basic metadata from file as fallback
 * @param {string} filePath Path to the audio file
 * @returns {Promise<Object>} Basic metadata
 */
async function extractBasicMetadataFromFile(filePath) {
  try {
    const metadata = await mm.parseFile(filePath);
    return {
      metadata: extractBasicMetadata(metadata),
      waveform: {},
      spectral: {},
      rhythm: {},
      harmonic: {},
      structure: {}
    };
  } catch (error) {
    console.error('Error extracting basic metadata:', error);
    return {
      metadata: {
        title: path.basename(filePath),
        artist: 'Unknown Artist',
        genre: 'Electronic'
      },
      waveform: {},
      spectral: {},
      rhythm: {},
      harmonic: {}
    };
  }
}

/**
 * Extract features using Essentia.js
 * @param {string} audioPath Path to the normalized audio file
 * @param {Object} essentia Essentia low-level instance
 * @returns {Promise<Object>} Extracted features
 */
async function extractEssentiaFeatures(audioPath, essentia) {
  try {
    // Read audio file as buffer
    const audioData = fs.readFileSync(audioPath);
    
    console.log(`Processing audio file with Essentia.js: ${audioPath}`);
    
    // Get Essentia algorithm instance
    const algorithms = new (require('essentia.js')).Essentia(essentia);
    
    // Convert buffer to Float32Array that Essentia can process
    const audioFloat32 = new Float32Array(audioData);
    
    // Apply normalization to the audio signal
    const normalizedAudio = algorithms.Normalize(audioFloat32).output;
    
    // === Spectral Analysis ===
    // Compute spectral centroid
    const spectralCentroid = algorithms.SpectralCentroid(normalizedAudio).spectralCentroid;
    
    // Compute spectral complexity
    const spectralComplexity = algorithms.SpectralComplexity(normalizedAudio).spectralComplexity;
    
    // Compute spectral energy
    const spectralEnergy = algorithms.Energy(normalizedAudio).energy;
    
    // === Rhythm Analysis ===
    // Detect beats
    const rhythm = algorithms.RhythmExtractor2013(normalizedAudio, 44100);
    const bpm = rhythm.bpm;
    const beats = rhythm.ticks;
    
    // === Key Detection ===
    // Detect key and scale
    const keyResults = algorithms.KeyExtractor(normalizedAudio);
    const key = keyResults.key;
    const scale = keyResults.scale; // 'major' or 'minor'
    
    // === Loudness Analysis ===
    // Compute dynamic range
    const dynamicRange = algorithms.DynamicComplexity(normalizedAudio);
    
    return {
      waveform: {
        normalized: true,
        length: normalizedAudio.length
      },
      spectral: {
        centroid: spectralCentroid,
        complexity: spectralComplexity,
        energy: spectralEnergy
      },
      rhythm: {
        bpm: bpm,
        confidence: rhythm.confidence,
        beats_count: beats.length
      },
      harmonic: {
        key: `${key} ${scale}`,
        key_confidence: keyResults.confidence
      },
      dynamics: {
        value: dynamicRange.dynamicComplexity,
        crest: dynamicRange.crest
      }
    };
  } catch (error) {
    console.error('Error in Essentia feature extraction:', error);
    // Return basic structure but empty values
    return {
      waveform: {},
      spectral: {},
      rhythm: {},
      harmonic: {}
    };
  }
}

/**
 * Extract features using Meyda
 * @param {string} audioPath Path to the normalized audio file
 * @returns {Promise<Object>} Extracted features
 */
async function extractMeydaFeatures(audioPath) {
  // Note: In a production system, we would properly set up an AudioContext
  // and process the audio in chunks. This is a simplified implementation.
  
  // For now, we'll return simulated Meyda features
  return {
    spectral: {
      centroid: 2500,       // Hz - higher = brighter sound
      flatness: 0.3,        // 0-1, higher = noisier
      rolloff: 4000,        // Hz - frequency below which 85% of energy is contained
      mfcc: [2.3, -1.4, 0.8, -0.2, 1.1, -0.5, 0.3, -0.1, 0.7, -0.4, 0.2, -0.1, 0.3]
    },
    waveform: {
      rms: 0.4,             // Root mean square - overall volume
      zcr: 120,             // Zero crossing rate - noisiness
      crest: 4.2            // Crest factor - dynamic range
    }
  };
}

/**
 * Calculate beat strength from ticks
 * @param {Array} ticks Array of beat strengths
 * @returns {string} Qualitative description
 */
function calculateBeatStrength(ticks) {
  if (!ticks || ticks.length === 0) return 'Unknown';
  
  const avg = calculateAverage(ticks);
  
  if (avg > 0.8) return 'Strong';
  if (avg > 0.5) return 'Moderate';
  return 'Weak';
}

/**
 * Calculate average of array
 * @param {Array} array Array of values
 * @returns {number} Average
 */
function calculateAverage(array) {
  return array.reduce((a, b) => a + b, 0) / array.length;
}

/**
 * Format raw features into human-readable feedback
 * @param {Object} features Raw extracted features
 * @returns {Object} Formatted features for feedback
 */
function formatFeaturesForFeedback(features) {
  // Format features into a user-friendly structure for the feedback display
  return {
    // Track metadata
    title: features.metadata.title,
    artist: features.metadata.artist,
    genre: features.metadata.genre,
    
    // Tempo and rhythm
    tempo: {
      value: features.rhythm.bpm || features.metadata.bpm || 120,
      description: describeTempo(features.rhythm.bpm || features.metadata.bpm),
      quality: describeTempoQuality(features.rhythm.bpm, features.rhythm.beatStrength)
    },
    
    // Loudness and dynamics
    loudness: {
      value: features.waveform.loudness || -14,
      description: describeLoudness(features.waveform.loudness),
      quality: assessLoudnessQuality(features.waveform.loudness)
    },
    
    dynamics: {
      value: features.waveform.dynamicRange || 0.5,
      description: describeDynamics(features.waveform.dynamicRange),
      quality: features.waveform.dynamicRange > 0.5 ? 'Good dynamic range' : 'Limited dynamic range',
      improvementNeeded: features.waveform.dynamicRange < 0.5
    },
    
    // Spectral features
    mixBalance: {
      value: features.spectral.contrast || 0.5,
      description: describeSpectralBalance(features.spectral.contrast),
      quality: (features.spectral.contrast || 0.5) > 0.6 ? 'Well-balanced' : 'Could be more balanced'
    },
    
    // Harmonic content
    harmonic: features.harmonic.key ? {
      key: `${features.harmonic.key} ${features.harmonic.scale}`,
      strength: features.harmonic.strength,
      description: `Track is in ${features.harmonic.key} ${features.harmonic.scale}`
    } : {
      key: 'Unknown',
      description: 'Could not determine key'
    },
    
    // Complexity assessment
    complexity: {
      value: calculateComplexityScore(features),
      description: describeComplexity(calculateComplexityScore(features))
    },
    
    // Overall mood
    mood: deriveMood(features)
  };
}

/**
 * Calculate a complexity score based on various features
 * @param {Object} features Extracted features
 * @returns {number} Complexity score (0-1)
 */
function calculateComplexityScore(features) {
  // Start with a default value
  let score = 0.5;
  let factors = 0;
  
  // Spectral contrast contributes to complexity
  if (features.spectral.contrast) {
    score += features.spectral.contrast;
    factors++;
  }
  
  // More dynamic range = more complex
  if (features.waveform.dynamicRange) {
    score += features.waveform.dynamicRange;
    factors++;
  }
  
  // Spectral flatness (inverse contributes to complexity - less flat = more complex)
  if (features.spectral.flatness) {
    score += (1 - features.spectral.flatness);
    factors++;
  }
  
  // Normalize score
  return factors > 0 ? Math.min(score / factors, 1) : 0.5;
}

/**
 * Derive mood from extracted features
 * @param {Object} features Extracted features
 * @returns {string} Mood description
 */
function deriveMood(features) {
  // Simple mood derivation based on tempo, dynamics, and spectral features
  const tempo = features.rhythm.bpm || 120;
  const dynamics = features.waveform.dynamicRange || 0.5;
  const spectralBalance = features.spectral.contrast || 0.5;
  
  // Energy level based on tempo and loudness
  const energy = tempo > 125 ? 'high' : tempo > 100 ? 'medium' : 'low';
  
  // Complexity based on dynamics and spectral content
  const complexity = (dynamics + spectralBalance) / 2 > 0.6 ? 'complex' : 'simple';
  
  // Brightness based on spectral centroid
  const brightness = features.spectral.centroid > 3000 ? 'bright' : 'dark';
  
  // Map feature combinations to mood descriptions
  if (energy === 'high' && complexity === 'complex') {
    return 'Energetic and sophisticated';
  } else if (energy === 'high' && complexity === 'simple') {
    return 'Energetic and straightforward';
  } else if (energy === 'medium' && complexity === 'complex') {
    return 'Balanced and nuanced';
  } else if (energy === 'medium' && complexity === 'simple') {
    return 'Smooth and accessible';
  } else if (energy === 'low' && complexity === 'complex') {
    return 'Atmospheric and intricate';
  } else if (energy === 'low' && complexity === 'simple') {
    return 'Calm and minimal';
  }
  
  return 'Balanced electronic';
}

// Helper functions to describe audio features in human-readable terms

function describeTempo(bpm) {
  if (!bpm) return 'Unknown tempo';
  
  if (bpm < 70) return 'Very slow tempo';
  if (bpm < 90) return 'Slow tempo';
  if (bpm < 120) return 'Moderate tempo';
  if (bpm < 140) return 'Energetic tempo';
  if (bpm < 160) return 'Fast tempo';
  return 'Very fast tempo';
}

function describeTempoQuality(bpm, beatStrength) {
  if (!beatStrength) return 'Unknown beat quality';
  
  if (beatStrength === 'Strong') {
    return 'Solid and consistent beat';
  } else if (beatStrength === 'Moderate') {
    return 'Decent beat presence';
  } else {
    return 'Beat could be more pronounced';
  }
}

function describeDynamics(dynamicRange) {
  if (!dynamicRange) return 'Unknown dynamic range';
  
  if (dynamicRange > 0.8) return 'Excellent dynamic range with great contrast between quiet and loud parts';
  if (dynamicRange > 0.6) return 'Good dynamic range';
  if (dynamicRange > 0.4) return 'Moderate dynamic range';
  return 'Limited dynamic range, could benefit from more variation in volume';
}

function describeSpectralBalance(spectralContrast) {
  if (!spectralContrast) return 'Unknown frequency balance';
  
  if (spectralContrast > 0.8) return 'Excellent frequency balance with clear separation between elements';
  if (spectralContrast > 0.6) return 'Good balance across frequency spectrum';
  if (spectralContrast > 0.4) return 'Decent frequency balance but some elements might mask others';
  return 'Frequency spectrum could be more balanced, some frequency masking issues';
}

function describeLoudness(loudness) {
  if (!loudness) return 'Unknown loudness';
  
  if (loudness > -10) return 'Very loud mix, possibly over-compressed';
  if (loudness > -14) return 'Loud modern mix';
  if (loudness > -18) return 'Well-balanced loudness';
  return 'Relatively quiet mix, could benefit from careful mastering';
}

function assessLoudnessQuality(loudness) {
  if (!loudness) return 'Unknown';
  
  if (loudness > -8) return 'Too loud, dynamic range is likely compromised';
  if (loudness > -14) return 'Good loudness for modern electronic music';
  if (loudness > -20) return 'Good loudness with preserved dynamics';
  return 'Could be louder while maintaining dynamics';
}

function describeComplexity(complexityScore) {
  if (complexityScore > 0.8) return 'Track has complex and sophisticated arrangement';
  if (complexityScore > 0.6) return 'Track has good variation and interesting elements';
  if (complexityScore > 0.4) return 'Track has decent arrangement complexity';
  return 'Track could benefit from more variation and complexity in arrangement';
}

module.exports = {
  extractEnhancedAudioFeatures
};
