const { v4: uuidv4 } = require('uuid');
const { analyzeMusicTrack } = require('./enhancedOpenAI');
const audioFeatureExtractor = require('./AudioFeatureExtractor');
const redisManager = require('./redisManager');

// In-memory queue for fallback when Redis is unavailable
const memoryQueue = [];

/**
 * Queue a track for analysis
 * @param {string} trackPath Path to the uploaded track
 * @param {Array} referenceArtists List of reference artists
 * @returns {Object} Job metadata
 */
async function queueTrackAnalysis(trackPath, referenceArtists = []) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    trackPath,
    referenceArtists,
    status: 'queued',
    createdAt: new Date().toISOString()
  };

  try {
    // Use Redis if available, otherwise use in-memory queue
    if (redisManager.isReady()) {
      // Store job data in Redis
      await redisManager.set(`job:${jobId}`, job);
      // Add job ID to processing queue
      await redisManager.addToList('track_queue', jobId);
      console.log(`Job ${jobId} added to Redis queue`);
      
      // Start Redis queue processor if not already running
      startRedisQueueProcessor();
    } else {
      // Use in-memory queue
      memoryQueue.push(job);
      console.log(`Job ${jobId} added to memory queue (Redis unavailable)`);
      
      // Process immediately when using memory queue
      processNextInMemoryQueue();
    }

    return {
      jobId,
      status: 'queued',
      message: redisManager.isReady() ? 
        'Track queued for analysis with Redis' : 
        'Track queued for analysis (using in-memory queue)'
    };
  } catch (error) {
    console.error('Error queueing job:', error);
    return {
      jobId,
      status: 'error',
      message: `Failed to queue track: ${error.message}`
    };
  }
}

// Redis queue processor flag and counter
let redisProcessorRunning = false;
let processingCount = 0;

/**
 * Start the Redis queue processor if not already running
 */
async function startRedisQueueProcessor() {
  if (redisProcessorRunning) {
    return;
  }
  
  redisProcessorRunning = true;
  console.log('Redis queue processor started');
  
  try {
    while (redisManager.isReady()) {
      // Get next job ID from queue
      const jobId = await redisManager.client.lPop('track_queue');
      
      if (!jobId) {
        // No more jobs, sleep before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Process the job
      processingCount++;
      console.log(`Processing job ${jobId} from Redis queue (${processingCount} active)`);
      
      // Get job data
      const job = await redisManager.get(`job:${jobId}`, true);
      if (!job) {
        console.error(`Job ${jobId} data not found in Redis`);
        continue;
      }
      
      // Update job status
      job.status = 'processing';
      await redisManager.set(`job:${jobId}`, job);
      
      try {
        // Extract audio features
        const songFeatures = await audioFeatureExtractor.extractFeatures(job.trackPath);
        
        // Generate AI feedback
        const feedback = await analyzeMusicTrack(job.trackPath, job.referenceArtists, songFeatures);
        
        // Update job with results
        job.status = 'completed';
        job.result = feedback;
        job.completedAt = new Date().toISOString();
        
        // Store results
        await redisManager.set(`job:${jobId}`, job);
        console.log(`Job ${jobId} completed successfully`);
      } catch (error) {
        console.error(`Error processing job ${jobId}:`, error);
        job.status = 'failed';
        job.error = error.message;
        await redisManager.set(`job:${jobId}`, job);
      }
      
      processingCount--;
    }
  } catch (error) {
    console.error('Redis queue processor error:', error);
  } finally {
    redisProcessorRunning = false;
    processingCount = 0;
    console.log('Redis queue processor stopped');
  }
}

/**
 * Process the next item in the in-memory queue
 */
async function processNextInMemoryQueue() {
  if (memoryQueue.length === 0) return;
  
  const job = memoryQueue[0]; // Get first job but don't remove yet
  
  try {
    console.log(`Processing job ${job.id} from memory queue`);
    job.status = 'processing';
    
    // Extract features using our new robust extractor
    const songFeatures = await audioFeatureExtractor.extractFeatures(job.trackPath);
    
    // Generate AI feedback
    const feedback = await analyzeMusicTrack(job.trackPath, job.referenceArtists, songFeatures);
    
    // Update job with results
    job.status = 'completed';
    job.result = feedback;
    job.completedAt = new Date().toISOString();
    
    console.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);
    job.status = 'failed';
    job.error = error.message;
  }
  
  // Remove job from queue (whether successful or failed)
  memoryQueue.shift();
  
  // Process next job if available
  if (memoryQueue.length > 0) {
    processNextInMemoryQueue();
  }
}

// Export functions
module.exports = {
  queueTrackAnalysis
};
