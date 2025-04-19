const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const path = require('path');
const { extractEnhancedAudioFeatures } = require('./enhancedAudioAnalysis');
const { analyzeMusicTrack } = require('./openaiService');

// Flag to track Redis connection status
let redisAvailable = false;
let redisConnection = null;

// Try to connect to Redis, but handle failures gracefully
try {
  // Redis connection for BullMQ
  redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: 1, // Reduce retry attempts
    retryStrategy: (times) => {
      // No retry, fail immediately
      console.log('Redis connection failed, giving up immediately');
      return false; // Don't retry
    },
    connectTimeout: 1000, // Shorter timeout for faster failure
  });

  redisConnection.on('connect', () => {
    console.log('Successfully connected to Redis');
    redisAvailable = true;
  });

  redisConnection.on('error', (err) => {
    console.warn('Redis connection error:', err.message);
    redisAvailable = false;
    if (redisConnection) {
      redisConnection.disconnect();
    }
  });
} catch (error) {
  console.warn('Failed to initialize Redis connection:', error.message);
  redisAvailable = false;
}

// Only create queues if Redis is available
let audioProcessingQueue, feedbackGenerationQueue;
let audioProcessingWorker, feedbackGenerationWorker;

function initializeQueueIfPossible() {
  if (redisAvailable && redisConnection) {
    try {
      // Create queues for audio processing
      audioProcessingQueue = new Queue('audioProcessing', { connection: redisConnection });
      feedbackGenerationQueue = new Queue('feedbackGeneration', { connection: redisConnection });

      // Initialize workers to process jobs
      audioProcessingWorker = new Worker('audioProcessing', async job => {
        console.log(`[Worker] Processing audio analysis for track: ${job.data.trackId}`);
        
        try {
          // Extract audio features
          const features = await extractEnhancedAudioFeatures(job.data.trackPath);
          
          // Store the features for reference
          console.log(`[Worker] Features extracted for track: ${job.data.trackId}`);
          
          // If reference artists are provided, compare with them
          if (job.data.referenceArtists && job.data.referenceArtists.length > 0) {
            const comparisons = await compareWithReferenceTracks(features, job.data.referenceArtists);
            features.comparisons = comparisons;
          }
          
          // Queue feedback generation
          await feedbackGenerationQueue.add('generateFeedback', {
            trackId: job.data.trackId,
            trackPath: job.data.trackPath,
            features: features,
            referenceArtists: job.data.referenceArtists,
            originalJobId: job.id,
            userId: job.data.userId
          });
          
          // Return the features
          return { features };
        } catch (error) {
          console.error(`[Worker] Error processing audio: ${error}`);
          throw new Error(`Audio processing failed: ${error.message}`);
        }
      }, { connection: redisConnection });

      audioProcessingWorker.on('completed', (job, result) => {
        console.log(`Audio processing completed for job ${job.id}`);
      });

      audioProcessingWorker.on('failed', (job, err) => {
        console.error(`Audio processing failed for job ${job.id}:`, err);
      });

      feedbackGenerationWorker = new Worker('feedbackGeneration', async job => {
        console.log(`[Worker] Generating feedback for track: ${job.data.trackId}`);
        
        try {
          // Generate feedback using OpenAI
          const feedback = await analyzeMusicTrack(
            job.data.trackPath,
            job.data.referenceArtists,
            job.data.features
          );
          
          console.log(`[Worker] Feedback generated for track: ${job.data.trackId}`);
          
          // Return the complete results
          return {
            trackId: job.data.trackId,
            feedback: feedback
          };
        } catch (error) {
          console.error(`[Worker] Error generating feedback: ${error}`);
          throw new Error(`Feedback generation failed: ${error.message}`);
        }
      }, { connection: redisConnection });

      feedbackGenerationWorker.on('completed', (job, result) => {
        console.log(`Feedback generation completed for job ${job.id}`);
        
        // Here we would notify the client that their results are ready
        // This could be via WebSockets, server-sent events, or polling
      });

      feedbackGenerationWorker.on('failed', (job, err) => {
        console.error(`Feedback generation failed for job ${job.id}:`, err);
      });

      console.log('Queue services initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize queue services:', error);
      return false;
    }
  }
  return false;
}

/**
 * Queue a track for audio analysis and feedback generation
 * @param {string} trackPath Path to the audio file
 * @param {Array} referenceArtists Reference artists selected by the user
 * @param {string} userId User ID
 * @returns {Promise<Object>} Job information
 */
async function queueTrackAnalysis(trackPath, referenceArtists = [], userId = 'anonymous') {
  const trackId = path.basename(trackPath, path.extname(trackPath));
  
  // If Redis is not available, return an error that we'll go with immediate processing
  if (!redisAvailable) {
    console.warn('Redis not available. Queue functionality disabled.');
    throw new Error('QUEUE_UNAVAILABLE');
  }
  
  // Initialize the queue if not already done
  if (!audioProcessingQueue) {
    const initialized = initializeQueueIfPossible();
    if (!initialized) {
      throw new Error('QUEUE_INITIALIZATION_FAILED');
    }
  }
  
  // Add job to the audio processing queue
  const job = await audioProcessingQueue.add('analyzeTrack', {
    trackId,
    trackPath,
    referenceArtists,
    userId
  });
  
  console.log(`Queued track analysis job: ${job.id}`);
  
  return {
    jobId: job.id,
    trackId
  };
}

/**
 * Compare track features with reference tracks
 * @param {Object} trackFeatures Features of the user's track
 * @param {Array} referenceArtists List of reference artists
 * @returns {Promise<Object>} Comparison results
 */
async function compareWithReferenceTracks(trackFeatures, referenceArtists) {
  // In a production system, we would fetch pre-computed features for these artists
  // For this demo, we'll simulate reference track features
  
  const referenceFeatures = getReferenceArtistsFeatures(referenceArtists);
  
  // Calculate delta metrics
  const tempoComparison = trackFeatures.tempo ? {
    value: trackFeatures.tempo.value,
    reference_avg: calculateAverage(referenceFeatures.map(r => r.tempo)),
    delta: trackFeatures.tempo.value - calculateAverage(referenceFeatures.map(r => r.tempo))
  } : null;
  
  const loudnessComparison = trackFeatures.loudness ? {
    value: trackFeatures.loudness.value,
    reference_avg: calculateAverage(referenceFeatures.map(r => r.loudness)),
    delta: trackFeatures.loudness.value - calculateAverage(referenceFeatures.map(r => r.loudness))
  } : null;
  
  const dynamicsComparison = trackFeatures.dynamics ? {
    value: trackFeatures.dynamics.value,
    reference_avg: calculateAverage(referenceFeatures.map(r => r.dynamics)),
    delta: trackFeatures.dynamics.value - calculateAverage(referenceFeatures.map(r => r.dynamics))
  } : null;
  
  // Calculate overall similarity score (0-100)
  const similarityScore = calculateSimilarityScore(trackFeatures, referenceFeatures);
  
  return {
    tempo: tempoComparison,
    loudness: loudnessComparison,
    dynamics: dynamicsComparison,
    similarity_score: similarityScore,
    closest_match: getClosestMatch(trackFeatures, referenceFeatures, referenceArtists)
  };
}

/**
 * Get reference features for selected artists
 * @param {Array} referenceArtists List of artist names
 * @returns {Array} Features for reference artists
 */
function getReferenceArtistsFeatures(referenceArtists) {
  // This would fetch from a database in production
  // For demonstration, we'll return simulated data
  
  // Map of simulated artist features
  const artistFeatures = {
    // Techno artists
    'Ben Klock': { 
      tempo: 132, 
      loudness: -12, 
      dynamics: 6.2,
      spectralBalance: 0.82,
      complexity: 0.65,
      key: 'F minor'
    },
    'Marcel Dettmann': { 
      tempo: 135, 
      loudness: -11.5, 
      dynamics: 5.8,
      spectralBalance: 0.76,
      complexity: 0.72,
      key: 'C minor'
    },
    'Nina Kraviz': { 
      tempo: 128, 
      loudness: -10.8, 
      dynamics: 7.1,
      spectralBalance: 0.79,
      complexity: 0.68,
      key: 'G minor'
    },
    
    // Experimental artists
    'Aphex Twin': { 
      tempo: 125, 
      loudness: -14.2, 
      dynamics: 8.4,
      spectralBalance: 0.86,
      complexity: 0.91,
      key: 'B minor'
    },
    'Four Tet': { 
      tempo: 122, 
      loudness: -13.1, 
      dynamics: 7.6,
      spectralBalance: 0.84,
      complexity: 0.82,
      key: 'D minor'
    },
    'Jon Hopkins': { 
      tempo: 118, 
      loudness: -12.7, 
      dynamics: 8.9,
      spectralBalance: 0.88,
      complexity: 0.85,
      key: 'A minor'
    },
    
    // Default for unknown artists
    'default': { 
      tempo: 125, 
      loudness: -12, 
      dynamics: 7,
      spectralBalance: 0.8,
      complexity: 0.7,
      key: 'A minor'
    }
  };
  
  // Return features for the selected artists, or default if not found
  return referenceArtists.map(artist => 
    artistFeatures[artist] || artistFeatures['default']
  );
}

/**
 * Calculate simple average of an array of numbers
 * @param {Array} values Array of numbers
 * @returns {number} Average value
 */
function calculateAverage(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate similarity score between user track and reference tracks
 * @param {Object} trackFeatures User track features
 * @param {Array} referenceFeatures Reference track features
 * @returns {number} Similarity score (0-100)
 */
function calculateSimilarityScore(trackFeatures, referenceFeatures) {
  // In a real system, this would use vector similarity
  // Here we'll use a simple weighted average of feature differences
  
  let score = 0;
  let totalWeight = 0;
  
  // Compare tempo if available
  if (trackFeatures.tempo && trackFeatures.tempo.value) {
    const refTempoAvg = calculateAverage(referenceFeatures.map(r => r.tempo));
    const tempoDiff = Math.abs(trackFeatures.tempo.value - refTempoAvg) / refTempoAvg;
    // Closer tempo = higher score (max 25 points)
    score += 25 * (1 - Math.min(tempoDiff, 0.5) / 0.5);
    totalWeight += 25;
  }
  
  // Compare loudness if available
  if (trackFeatures.loudness && trackFeatures.loudness.value) {
    const refLoudnessAvg = calculateAverage(referenceFeatures.map(r => r.loudness));
    const loudnessDiff = Math.abs(trackFeatures.loudness.value - refLoudnessAvg) / Math.abs(refLoudnessAvg);
    // Closer loudness = higher score (max 25 points)
    score += 25 * (1 - Math.min(loudnessDiff, 0.3) / 0.3);
    totalWeight += 25;
  }
  
  // Compare dynamics if available
  if (trackFeatures.dynamics && trackFeatures.dynamics.value) {
    const refDynamicsAvg = calculateAverage(referenceFeatures.map(r => r.dynamics));
    const dynamicsDiff = Math.abs(trackFeatures.dynamics.value - refDynamicsAvg) / refDynamicsAvg;
    // Closer dynamics = higher score (max 25 points)
    score += 25 * (1 - Math.min(dynamicsDiff, 0.5) / 0.5);
    totalWeight += 25;
  }
  
  // Compare spectral balance if available
  if (trackFeatures.mixBalance && trackFeatures.mixBalance.value) {
    const refBalanceAvg = calculateAverage(referenceFeatures.map(r => r.spectralBalance));
    const balanceDiff = Math.abs(trackFeatures.mixBalance.value - refBalanceAvg) / refBalanceAvg;
    // Closer spectral balance = higher score (max 25 points)
    score += 25 * (1 - Math.min(balanceDiff, 0.5) / 0.5);
    totalWeight += 25;
  }
  
  // Normalize score to 0-100
  return totalWeight > 0 ? Math.round(score / totalWeight * 100) : 50;
}

/**
 * Find the closest matching reference artist
 * @param {Object} trackFeatures User track features
 * @param {Array} referenceFeatures Reference track features
 * @param {Array} referenceArtists Reference artist names
 * @returns {Object} Closest match information
 */
function getClosestMatch(trackFeatures, referenceFeatures, referenceArtists) {
  let closestArtist = null;
  let closestScore = -1;
  
  // Calculate similarity with each reference artist
  referenceFeatures.forEach((refFeature, index) => {
    const artistName = referenceArtists[index];
    
    // Simple feature difference scoring (would be more sophisticated in production)
    let similarity = 0;
    let count = 0;
    
    // Compare tempo
    if (trackFeatures.tempo && trackFeatures.tempo.value) {
      const tempoDiff = Math.abs(trackFeatures.tempo.value - refFeature.tempo) / refFeature.tempo;
      similarity += (1 - Math.min(tempoDiff, 0.5) / 0.5);
      count++;
    }
    
    // Compare loudness
    if (trackFeatures.loudness && trackFeatures.loudness.value) {
      const loudnessDiff = Math.abs(trackFeatures.loudness.value - refFeature.loudness) / Math.abs(refFeature.loudness);
      similarity += (1 - Math.min(loudnessDiff, 0.3) / 0.3);
      count++;
    }
    
    // Normalize score
    const score = count > 0 ? similarity / count : 0;
    
    // Keep track of closest match
    if (score > closestScore) {
      closestScore = score;
      closestArtist = artistName;
    }
  });
  
  return {
    artist: closestArtist,
    score: Math.round(closestScore * 100)
  };
}

module.exports = {
  queueTrackAnalysis,
  audioProcessingQueue,
  feedbackGenerationQueue
};
