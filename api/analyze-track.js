// Minimal serverless function for Vercel deployment
const multer = require('multer');
const OpenAI = require('openai');

// Configure storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function for multer in serverless
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('API endpoint called: /api/analyze-track');
    
    // Process the uploaded file
    await runMiddleware(req, res, upload.single('track'));
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    console.log('File received:', req.file.originalname, 'Size:', req.file.size);
    
    // Basic audio features (simplest possible implementation)
    const audioFeatures = {
      tempo: 120,
      key: 'C Major',
      energy: 0.75,
      dynamics: 7.5
    };
    
    // Initialize OpenAI (using environment variable)
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    console.log('OpenAI initialized, API Key starts with:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 5) + '...' : 'undefined');
    
    // Test if we can make a simple OpenAI API call
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Using a simpler model for testing
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant."
          },
          {
            role: "user",
            content: "Hello, this is a test message to ensure the OpenAI API is working."
          }
        ],
        max_tokens: 50
      });
      
      console.log('OpenAI test call successful, response:', completion.choices[0].message.content);
      
      // Since the test call worked, we'll return a simplified response
      return res.status(200).json({
        analysis: "# Track Analysis\n\nYour track analysis was successful! The OpenAI API connection is working properly.",
        technicalInsights: "This is a test response to verify API connectivity.",
        audioFeatures: audioFeatures
      });
      
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError.message);
      throw new Error(`OpenAI API error: ${openaiError.message}`);
    }
    
  } catch (error) {
    console.error('Error in serverless function:', error.message, error.stack);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message,
      details: error.stack,
      audioFeatures: {
        tempo: 120,
        key: 'C Major',
        energy: 0.7,
        dynamics: 7.0
      }
    });
  }
};
