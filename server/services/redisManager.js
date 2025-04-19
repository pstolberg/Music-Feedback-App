/**
 * Redis Manager - Provides robust Redis connectivity with proper setup/teardown
 * With auto-recovery and comprehensive error handling
 */

const { createClient } = require('redis');

class RedisManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    this.retryInterval = 2000; // 2 seconds
    this.initializeClient();
  }

  /**
   * Initialize Redis client with proper error handling
   */
  initializeClient() {
    try {
      // Create Redis client with configuration from environment or defaults
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => {
            // Exponential backoff with max number of retries
            if (retries > this.maxRetries) {
              console.warn(`Redis max retries (${this.maxRetries}) exceeded, stopping reconnection attempts`);
              this.isConnected = false;
              return false; // stop retrying
            }
            
            const delay = Math.min(2000 * Math.pow(2, retries), 30000);
            console.log(`Redis reconnecting in ${delay}ms...`);
            return delay;
          }
        }
      });

      // Set up event handlers for connection status
      this.client.on('connect', () => {
        console.log('Redis client connected');
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.client.on('ready', () => {
        console.log('Redis client ready for commands');
      });

      this.client.on('error', (err) => {
        console.error('Redis error:', err.message);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('Redis connection ended');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.connectionAttempts++;
        console.log(`Redis reconnecting... (attempt ${this.connectionAttempts})`);
      });

      // Connect to Redis
      this.connect();
    } catch (error) {
      console.error('Error creating Redis client:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Connect to Redis server
   */
  async connect() {
    try {
      if (!this.client) {
        this.initializeClient();
      }
      
      if (!this.isConnected) {
        await this.client.connect();
        console.log('Redis connection established');
        this.isConnected = true;
      }
    } catch (error) {
      console.error('Redis connection failed:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Gracefully disconnect from Redis
   */
  async disconnect() {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
        console.log('Redis client gracefully disconnected');
      }
      this.isConnected = false;
    } catch (error) {
      console.error('Error disconnecting from Redis:', error.message);
    }
  }

  /**
   * Set a key-value pair in Redis with error handling
   * @param {string} key Key to set
   * @param {string|object} value Value to store (objects will be JSON stringified)
   * @param {number} expireSeconds Optional expiration in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, expireSeconds = null) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
      
      if (expireSeconds) {
        await this.client.setEx(key, expireSeconds, valueToStore);
      } else {
        await this.client.set(key, valueToStore);
      }
      
      return true;
    } catch (error) {
      console.error(`Redis set error for key [${key}]:`, error.message);
      return false;
    }
  }

  /**
   * Get a value from Redis with error handling
   * @param {string} key Key to retrieve
   * @param {boolean} parseJson Whether to parse result as JSON
   * @returns {Promise<any>} Retrieved value or null
   */
  async get(key, parseJson = false) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const value = await this.client.get(key);
      
      if (value && parseJson) {
        try {
          return JSON.parse(value);
        } catch (e) {
          console.warn(`Failed to parse Redis value as JSON for key [${key}]`);
          return value;
        }
      }
      
      return value;
    } catch (error) {
      console.error(`Redis get error for key [${key}]:`, error.message);
      return null;
    }
  }

  /**
   * Add a value to a Redis list
   * @param {string} key List key
   * @param {string|object} value Value to add
   * @param {boolean} addToLeft Whether to add to left (beginning) of list
   * @returns {Promise<boolean>} Success status
   */
  async addToList(key, value, addToLeft = true) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
      
      if (addToLeft) {
        await this.client.lPush(key, valueToStore);
      } else {
        await this.client.rPush(key, valueToStore);
      }
      
      return true;
    } catch (error) {
      console.error(`Redis list operation error for key [${key}]:`, error.message);
      return false;
    }
  }

  /**
   * Get a range of values from a Redis list
   * @param {string} key List key
   * @param {number} start Start index (0-based)
   * @param {number} end End index (-1 for all)
   * @param {boolean} parseJson Whether to parse results as JSON
   * @returns {Promise<Array>} List values or empty array
   */
  async getListRange(key, start = 0, end = -1, parseJson = false) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const values = await this.client.lRange(key, start, end);
      
      if (parseJson) {
        return values.map(item => {
          try {
            return JSON.parse(item);
          } catch (e) {
            return item;
          }
        });
      }
      
      return values;
    } catch (error) {
      console.error(`Redis list range error for key [${key}]:`, error.message);
      return [];
    }
  }

  /**
   * Get Redis connection status
   * @returns {boolean} Whether Redis is connected
   */
  isReady() {
    return this.isConnected;
  }
}

// Singleton instance
const redisManager = new RedisManager();

module.exports = redisManager;
