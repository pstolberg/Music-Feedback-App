/**
 * Essentia.js Audio Analysis Module
 * Specialized implementation for essentia.js v0.1.3
 */

const fs = require('fs');
const path = require('path');
const EssentiaModule = require('essentia.js');

class EssentiaAnalyzer {
  constructor() {
    this.essentia = null;
    this.isAvailable = false;
    this.initPromise = this.initialize();
  }

  /**
   * Initialize the Essentia.js instance with proper version handling
   */
  async initialize() {
    try {
      console.log('Initializing Essentia.js v0.1.3...');
     
      // The correct way to initialize Essentia.js v0.1.3
      this.essentia = await EssentiaModule.EssentiaWASM();
      
      // Verify the initialization worked
      if (!this.essentia || typeof this.essentia !== 'object') {
        throw new Error('Essentia instance not properly initialized');
      }
      
      // Check if we have basic algorithms to confirm it's working
      const algCount = Object.keys(this.essentia).filter(k => 
        typeof this.essentia[k] === 'function').length;
        
      if (algCount < 10) {
        throw new Error('Essentia has too few algorithms available');
      }
      
      console.log(`✅ Essentia.js initialized successfully with ${algCount} algorithms`);
      this.isAvailable = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Essentia.js:', error.message);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Extract audio features from a file using Essentia.js
   * @param {string} audioPath Path to audio file
   * @returns {Promise<Object>} Extracted features
   */
  async analyzeAudio(audioPath) {
    // Make sure initialization is complete
    await this.initPromise;
    
    if (!this.isAvailable) {
      throw new Error('Essentia.js is not available');
    }
    
    try {
      console.log(`Analyzing audio with Essentia.js: ${path.basename(audioPath)}`);
      
      // Read audio file
      const audioBuffer = await this.readAudioFile(audioPath);
      
      // Extract features
      return this.extractFeatures(audioBuffer);
    } catch (error) {
      console.error('Error in Essentia.js analysis:', error.message);
      throw error;
    }
  }

  /**
   * Read audio file as a buffer suitable for Essentia.js processing
   * @param {string} audioPath Path to audio file
   * @returns {Promise<Float32Array>} Audio buffer
   */
  async readAudioFile(audioPath) {
    try {
      // Read the file
      const buffer = fs.readFileSync(audioPath);
      
      // Convert to Float32Array appropriate for Essentia.js v0.1.3
      return new Float32Array(buffer);
    } catch (error) {
      console.error('Error reading audio file:', error.message);
      throw error;
    }
  }

  /**
   * Extract features from audio buffer
   * @param {Float32Array} audioBuffer Audio data
   * @returns {Object} Extracted features
   */
  extractFeatures(audioBuffer) {
    try {
      // Convert to Essentia vector
      const audioVector = this.essentia.arrayToVector(audioBuffer);
      
      // Perform normalization
      const normalizedVector = this.essentia.Normalize(audioVector).normalizedArray;
      
      // Basic analysis
      const energy = this.essentia.Energy(normalizedVector).energy;
      const rms = this.essentia.RMS(normalizedVector).rms;
      
      // Spectral features
      const spectralCentroid = this.essentia.SpectralCentroid(normalizedVector).spectralCentroid;
      const spectralRolloff = this.essentia.RollOff(normalizedVector).rollOff;
      
      // Rhythm features - use proper params for v0.1.3
      const rhythm = this.essentia.RhythmExtractor2013(normalizedVector);
      
      // Key detection
      const key = this.essentia.KeyExtractor(normalizedVector);
      
      // Dynamic analysis
      const dynamics = this.essentia.DynamicComplexity(normalizedVector);
      
      // Return organized features
      return {
        tempo: {
          value: rhythm.bpm,
          confidence: rhythm.confidence,
          beats: rhythm.ticks ? rhythm.ticks.length : 0
        },
        key: {
          name: key.key,
          scale: key.scale,
          strength: key.strength
        },
        energy: {
          value: energy,
          rms: rms,
          perceived: Math.sqrt(energy) * 0.8 + rms * 0.2
        },
        spectral: {
          centroid: spectralCentroid,
          rolloff: spectralRolloff,
          balance: spectralCentroid < 3000 ? 'Bass heavy' : 
                  (spectralCentroid > 7000 ? 'Bright' : 'Balanced')
        },
        dynamics: {
          value: dynamics.dynamicComplexity,
          crest: dynamics.crest,
          range: dynamics.crest * 10 // simplified approximation
        }
      };
    } catch (error) {
      console.error('Error extracting Essentia.js features:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new EssentiaAnalyzer();
