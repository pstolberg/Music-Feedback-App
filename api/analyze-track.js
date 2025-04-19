// Ultra-minimal test function for debugging Vercel deployment
const OpenAI = require('openai');

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

  try {
    // Log environment information
    console.log('Node environment:', process.env.NODE_ENV);
    console.log('API Key defined:', !!process.env.OPENAI_API_KEY);
    console.log('API Key prefix:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 5) : 'undefined');
    
    // Create a basic response with diagnostic info
    const diagnosticInfo = {
      environment: process.env.NODE_ENV,
      apiKeyDefined: !!process.env.OPENAI_API_KEY,
      apiKeyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 5) : 'undefined'
    };
    
    // Try to initialize OpenAI client
    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      
      diagnosticInfo.openaiInitialized = true;
      
      // Try a simple completion request
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "user", content: "Hello, this is a test." }
          ],
          max_tokens: 10
        });
        
        diagnosticInfo.apiCallSuccess = true;
        diagnosticInfo.apiResponse = completion.choices[0].message.content;
      } catch (apiError) {
        diagnosticInfo.apiCallSuccess = false;
        diagnosticInfo.apiError = apiError.message;
      }
    } catch (initError) {
      diagnosticInfo.openaiInitialized = false;
      diagnosticInfo.initError = initError.message;
    }
    
    // Return diagnostic information
    return res.status(200).json({
      analysis: "# Diagnostic Mode\n\nThis is a diagnostic response to troubleshoot deployment issues.",
      technicalInsights: "Diagnostic information included in the response.",
      diagnosticInfo: diagnosticInfo,
      audioFeatures: {
        tempo: 120,
        key: 'C Major',
        energy: 0.75,
        dynamics: 7.5
      }
    });
    
  } catch (error) {
    console.error('General error:', error.message, error.stack);
    return res.status(500).json({ 
      error: 'Diagnostic failed', 
      message: error.message,
      stack: error.stack,
      env: {
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.OPENAI_API_KEY
      }
    });
  }
};
