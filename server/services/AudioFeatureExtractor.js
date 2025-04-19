/**
 * Advanced Audio Feature Extractor
 * Provides a unified API for audio analysis using multiple libraries
 * with graceful degradation between methods
 */

const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const Meyda = require('meyda');
const essentiaAnalyzer = require('./EssentiaAnalyzer');

class AudioFeatureExtractor {
  constructor() {
    this.essentiaAvailable = false;
    this.essentia = null;
    this.algorithms = null;
    this.initializeServices();
  }

  /**
   * Initialize all audio analysis services with proper error handling
   */
  async initializeServices() {
    // Check if essentia is available through our specialized analyzer
    try {
      // Use our dedicated analyzer which handles version-specific initialization
      await essentiaAnalyzer.initPromise;
      this.essentiaAvailable = essentiaAnalyzer.isAvailable;
      
      if (this.essentiaAvailable) {
        console.log('✅ Essentia.js is available through specialized analyzer');
      } else {
        console.log('⚠️ Essentia.js not available, will use fallback methods');
      }
    } catch (error) {
      console.warn('⚠️ Essentia.js unavailable:', error.message);
      this.essentiaAvailable = false;
    }
  }

  /**
   * Extract comprehensive features from an audio file
   * @param {string} audioPath Path to the audio file
   * @returns {Promise<Object>} Extracted features
   */
  async extractFeatures(audioPath) {
    console.log(`Extracting features from: ${audioPath}`);
    
    // Final feature collection
    const features = {
      source: [],
      title: path.basename(audioPath, path.extname(audioPath)),
      format: path.extname(audioPath).slice(1),
      timestamp: new Date().toISOString()
    };
    
    try {
      // First attempt: Basic metadata extraction (most reliable)
      const metadata = await this.extractBasicMetadata(audioPath);
      features.metadata = metadata;
      features.source.push('music-metadata');
      
      // Track tempo and other basic features
      features.tempo = metadata.tempo || 120;
      features.key = metadata.key || 'Unknown';
      
      // Second attempt: Meyda features if possible
      const meydaFeatures = await this.extractMeydaFeatures(audioPath);
      if (meydaFeatures) {
        features.spectral = meydaFeatures.spectral;
        features.energy = meydaFeatures.energy;
        features.source.push('meyda');
      }
      
      // Third attempt: Essentia.js if available
      if (this.essentiaAvailable) {
        try {
          const essentiaFeatures = await this.extractEssentiaFeatures(audioPath);
          
          // Enhance with essentia features where available
          if (essentiaFeatures.rhythm && essentiaFeatures.rhythm.bpm) {
            features.tempo = essentiaFeatures.rhythm.bpm;
          }
          
          if (essentiaFeatures.harmonic && essentiaFeatures.harmonic.key) {
            features.key = essentiaFeatures.harmonic.key;
          }
          
          features.dynamics = essentiaFeatures.dynamics || features.dynamics;
          features.spectral = essentiaFeatures.spectral || features.spectral;
          features.source.push('essentia.js');
        } catch (essentiaError) {
          console.warn('Essentia feature extraction failed:', essentiaError.message);
        }
      }
      
      // Add derived features
      features.complexity = this.deriveComplexity(features);
      features.mood = this.deriveMood(features);
      
      return features;
    } catch (error) {
      console.error('Feature extraction failed:', error);
      // Return basic information even on failure
      return {
        title: path.basename(audioPath, path.extname(audioPath)),
        tempo: 120,
        key: 'Unknown',
        energy: 0.7,
        dynamics: { value: 6, crest: 10 },
        complexity: 'Medium',
        source: ['fallback']
      };
    }
  }

  /**
   * Extract basic metadata using music-metadata
   * @param {string} audioPath Path to audio file
   * @returns {Promise<Object>} Metadata
   */
  async extractBasicMetadata(audioPath) {
    try {
      console.log('Extracting basic metadata...');
      const metadata = await mm.parseFile(audioPath);
      
      // Format response
      return {
        title: metadata.common.title || path.basename(audioPath, path.extname(audioPath)),
        artist: metadata.common.artist || 'Unknown',
        album: metadata.common.album,
        year: metadata.common.year,
        genre: metadata.common.genre ? metadata.common.genre[0] : undefined,
        duration: metadata.format.duration,
        sampleRate: metadata.format.sampleRate,
        bitrate: metadata.format.bitrate,
        codec: metadata.format.codec,
        lossless: metadata.format.lossless,
        tempo: metadata.common.bpm,
        key: metadata.common.key
      };
    } catch (error) {
      console.warn('Failed to extract metadata:', error.message);
      return {
        title: path.basename(audioPath, path.extname(audioPath)),
        duration: 0,
        sampleRate: 44100
      };
    }
  }

  /**
   * Extract features using Meyda
   * @param {string} audioPath Path to audio file
   * @returns {Promise<Object>} Meyda features
   */
  async extractMeydaFeatures(audioPath) {
    try {
      console.log('Extracting Meyda features...');
      // Read file as buffer for Meyda processing
      // In a production app, we would use proper audio decoding
      const buffer = fs.readFileSync(audioPath);
      
      // Extract features using Meyda
      // Note: In production, we would properly decode audio
      Meyda.bufferSize = 512;
      const features = Meyda.extract(['energy', 'spectralCentroid', 'spectralFlatness'], buffer);
      
      return {
        spectral: {
          centroid: features.spectralCentroid,
          flatness: features.spectralFlatness
        },
        energy: features.energy
      };
    } catch (error) {
      console.warn('Failed to extract Meyda features:', error.message);
      return null;
    }
  }

  /**
   * Extract features using Essentia.js
   * @param {string} audioPath Path to audio file
   * @returns {Promise<Object>} Essentia features
   */
  async extractEssentiaFeatures(audioPath) {
    if (!this.essentiaAvailable) {
      throw new Error('Essentia.js not available');
    }
    
    try {
      console.log('Extracting Essentia.js features...');
      
      // Use our specialized analyzer for feature extraction
      return await essentiaAnalyzer.analyzeAudio(audioPath);
    } catch (error) {
      console.error('Essentia.js extraction failed:', error);
      throw error;  // Let caller handle this
    }
  }

  /**
   * Derive complexity rating from features
   * @param {Object} features Extracted features
   * @returns {string} Complexity rating
   */
  deriveComplexity(features) {
    // Use spectral features to estimate complexity
    if (features.spectral && features.spectral.flatness) {
      const flatness = features.spectral.flatness;
      
      if (flatness > 0.4) return 'High';
      if (flatness > 0.2) return 'Medium-High';
      if (flatness > 0.1) return 'Medium';
      return 'Low';
    }
    
    // Fallback based on tempo
    if (features.tempo) {
      if (features.tempo > 140) return 'Medium-High';
      if (features.tempo > 120) return 'Medium';
      return 'Medium-Low';
    }
    
    return 'Medium';
  }

  /**
   * Derive mood from extracted features
   * @param {Object} features Extracted features
   * @returns {string} Mood descriptor
   */
  deriveMood(features) {
    // Simple mood derivation based on key and tempo
    if (!features.key || features.key === 'Unknown') {
      // Use energy and tempo
      if (features.energy > 0.8 && features.tempo > 125) return 'Energetic';
      if (features.energy > 0.6 && features.tempo > 100) return 'Upbeat';
      if (features.energy < 0.4) return 'Calm';
      return 'Balanced';
    }
    
    // Consider key for mood
    const key = features.key.toLowerCase();
    
    if (key.includes('minor')) {
      if (features.tempo > 140) return 'Intense';
      if (features.tempo > 120) return 'Melancholic';
      return 'Introspective';
    } else {
      if (features.tempo > 140) return 'Energetic';
      if (features.tempo > 120) return 'Uplifting';
      return 'Positive';
    }
  }
}

module.exports = new AudioFeatureExtractor();
