const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize the OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log('OpenAI client initialized with API key');

// Function to create basic features if extraction fails
function createBasicFeatures() {
  return {
    title: "Unknown Title",
    artist: "Unknown Artist",
    tempo: 120,
    key: "Unknown",
    energy: 0.7,
    dynamics: 6,
    mood: "Unknown",
    complexity: "Medium"
  };
}

// Create a fallback response in case OpenAI fails
function createFallbackResponse(songFeatures = {}, referenceArtists = []) {
  const features = songFeatures || createBasicFeatures();
  
  return {
    choices: [
      {
        message: {
          content: `# Feedback Analysis\n\nI've analyzed your track with the following parameters:\n- Tempo: ${features.tempo || 120} BPM\n- Key: ${features.key || 'Unknown'}\n- Energy: ${features.energy || 0.7}\n- Dynamics: ${features.dynamics || 6} dB\n\n## Overall Vibe\nYour track has a ${features.energy > 0.6 ? 'high-energy' : 'moderate'} feel with ${features.complexity || 'medium'} complexity. The tempo of ${features.tempo || 120} BPM places it in the ${features.tempo > 125 ? 'faster' : features.tempo < 100 ? 'slower' : 'moderate'} range for electronic music.\n\n## Strengths\n- Good foundation with clear tempo structure\n- Reasonable energy level that can be built upon\n- Potential for interesting dynamic development\n\n## Technical Gaps\n- Mix balance could be improved\n- Dynamic range might need enhancement\n- Spectral content might need more attention\n\n## Suggestions\n1. Try using a multiband compressor to balance frequency ranges\n2. Consider adding more variation in your arrangement\n3. Experiment with subtle automations to add movement\n4. Use reference tracks to compare your frequency balance\n\n## Creative Experiment\nTry creating a breakdown section that completely changes the mood, then gradually build back to your original elements.`
        }
      }
    ]
  };
}

/**
 * Analyze a music track using the OpenAI API
 * @param {string} trackPath Path to the track file
 * @param {Array} referenceArtists List of reference artists for style comparison
 * @param {Object} songFeatures Audio features extracted from the track
 * @returns {Object} OpenAI API response or fallback response
 */
async function analyzeMusicTrack(trackPath, referenceArtists = [], songFeatures = {}) {
  console.log('Starting OpenAI feedback generation with timeout protection');
  
  // Add a timeout promise that will reject after 30 seconds
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('OPENAI_TIMEOUT')), 30000);
  });
  
  try {
    // Check if OpenAI API key is properly configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
      console.error('OpenAI API key is missing or empty');
      throw new Error('OPENAI_API_KEY_MISSING');
    }
    
    // If we didn't receive features, use default ones
    if (!songFeatures || Object.keys(songFeatures).length === 0) {
      console.log('No song features provided, using defaults');
      songFeatures = createBasicFeatures();
    }
    
    // Format features for the prompt
    // Extract basic info about the track
    const title = songFeatures.title || "Unknown Title";
    const tempo = typeof songFeatures.tempo === 'object' ? songFeatures.tempo.value || 120 : songFeatures.tempo || 120;
    const key = (typeof songFeatures.harmonic === 'object' && songFeatures.harmonic.key) ? 
                songFeatures.harmonic.key : songFeatures.key || "Unknown";
    const energy = songFeatures.energy || 0.7;
    const dynamics = typeof songFeatures.dynamics === 'object' ? 
                     songFeatures.dynamics.value || 6 : songFeatures.dynamics || 6;
    const loudness = songFeatures.loudness?.value || -14; // Default LUFS value
    const peakDb = songFeatures.loudness?.peak || -1; // Default peak in dBFS
    const spectralBalance = songFeatures.spectralBalance || "Unknown";
    const complexity = typeof songFeatures.complexity === 'object' ? 
                       songFeatures.complexity.description : songFeatures.complexity || "Medium";
    const mood = songFeatures.mood || "Unknown";
    
    // Format reference artists
    const artistsString = referenceArtists.length > 0 
      ? `The reference artist is: ${referenceArtists.join(', ')}.` 
      : "No reference artist was selected.";
    
    // Create the features summary
    const featureSummary = `Here are the extracted features of my track:
• Title: ${title}
• BPM: ${tempo}
• Key & mode: ${key}
• Dynamics: ${dynamics} dB
• RMS loudness (approx): ${loudness} LUFS
• Peak headroom: ${peakDb} dBFS
• Energy: ${energy}
• Complexity: ${complexity}
• Mood: ${mood}
${spectralBalance !== "Unknown" ? `• Spectral balance: ${spectralBalance}` : ''}`;

    const systemPrompt = `You are a seasoned audio engineer and music‑production coach specializing in electronic music. 
You give constructive, actionable feedback to producers wanting to improve their tracks.
Reference production styles accurately, explain technical concepts in plain language,
and always end with 3–5 specific next‑step tasks the producer can try in their DAW.
Be detailed and technical in your analysis, focusing on mix, arrangement, sound design, 
and production techniques common in electronic music.`;

    const userPrompt = `${featureSummary}

${artistsString}

Please:
1. Summarize the overall vibe you hear from the numbers above.
2. ${referenceArtists.length > 0 ? `Compare my track profile with common characteristics of ${referenceArtists.join(', ')}.` : "Analyze my track profile based on its technical parameters."}
3. Highlight 3–5 strengths of the track.
4. Point out the top technical gaps (mix, arrangement, loudness, spectral balance, etc.).
5. Give concrete, DAW-agnostic suggestions (plugins, techniques, settings ranges) for closing those gaps.
6. Suggest one creative experiment I could try to enhance my production.

Structure your answer with clear headings and concise bullet points.`;

    console.log('OpenAI request details:');
    console.log('- System prompt:', systemPrompt.substring(0, 100) + '...');
    console.log('- User prompt:', userPrompt.substring(0, 100) + '...');
    
    // The actual OpenAI API call
    const openaiPromise = openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });
    
    // Race between the API call and the timeout
    const response = await Promise.race([openaiPromise, timeoutPromise]);
    console.log('OpenAI API call completed successfully');
    
    // Verify we got a valid response with content
    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      console.error('OpenAI API returned unexpected structure:', JSON.stringify(response));
      throw new Error('Invalid response structure from OpenAI');
    }
    
    return response;
  } catch (error) {
    console.error('OpenAI API call failed or timed out:', error.message);
    
    // Return a fallback response
    if (error.message === 'OPENAI_TIMEOUT') {
      console.log('OpenAI API call timed out after 30 seconds');
    }
    
    // Return basic feedback in case of any error
    return createFallbackResponse(songFeatures, referenceArtists);
  }
}

module.exports = {
  analyzeMusicTrack,
  createFallbackResponse
};
