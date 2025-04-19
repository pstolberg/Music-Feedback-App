require('dotenv').config();
const { OpenAI } = require('openai');

// Check if API key exists
const API_KEY = process.env.OPENAI_API_KEY;
console.log('API Key exists:', !!API_KEY);
console.log('API Key length:', API_KEY ? API_KEY.length : 0);

if (!API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is missing from your .env file');
  process.exit(1);
}

async function testOpenAI() {
  try {
    console.log('Initializing OpenAI client...');
    const openai = new OpenAI({
      apiKey: API_KEY
    });
    
    console.log('Making a simple test request to OpenAI API...');
    const start = Date.now();
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "user", content: "Hello! This is a test of the OpenAI API connection." }
      ],
      max_tokens: 50
    });
    
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    
    console.log('OpenAI API test successful!');
    console.log(`Response received in ${duration} seconds`);
    console.log('Response content:', response.choices[0].message.content);
    return true;
    
  } catch (error) {
    console.error('ERROR testing OpenAI API:', error.message);
    console.error('Full error:', error);
    return false;
  }
}

// Run the test
testOpenAI()
  .then(success => {
    if (success) {
      console.log('Test completed successfully!');
    } else {
      console.error('Test failed!');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Unexpected error during test:', err);
    process.exit(1);
  });
