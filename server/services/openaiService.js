require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

// Get API key from environment variables
const API_KEY = process.env.OPENAI_API_KEY || '';

if (!API_KEY) {
  console.error('WARNING: OpenAI API key is missing. Please set OPENAI_API_KEY in your .env file.');
}

// Initialize OpenAI client with key from environment variable
const openai = new OpenAI({
  apiKey: API_KEY
});

console.log('OpenAI client initialized with API key');

/**
 * Analyzes a music track and provides feedback based on reference artists
 * @param {string} trackPath Path to the uploaded track file
 * @param {Array} referenceArtists List of reference artists selected by the user
 * @param {Object} songFeatures Optional pre-extracted song features
 * @returns {Object} Detailed feedback object
 */
async function analyzeMusicTrack(trackPath, referenceArtists = [], songFeatures = {}) {
  console.log('Starting OpenAI feedback generation with timeout protection');
  
  // Add a timeout promise that will reject after 30 seconds
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('OPENAI_TIMEOUT')), 30000);
  });
  
  try {
    // If we didn't receive features, extract them now
    if (!songFeatures || Object.keys(songFeatures).length === 0) {
      console.log('No song features provided, extracting them now...');
      const { extractEnhancedAudioFeatures } = require('./enhancedAudioAnalysis');
      try {
        songFeatures = await extractEnhancedAudioFeatures(trackPath);
        console.log('Audio features extracted successfully');
      } catch (error) {
        console.error('Error extracting audio features:', error);
        songFeatures = createBasicFeatures();
      }
    } else {
      console.log('Audio features extracted successfully');
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

    // Create the OpenAI call but wrap it in a Promise.race with the timeout
    const openaiPromise = new Promise(async (resolve, reject) => {
      try {
        const model = "gpt-4o"; // Using gpt-4o model as requested by user
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

        const messages = [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ];
        
        const temperature = 0.7;
        
        // Direct reliable call to GPT-4o with error handling
        try {
          console.log(`Calling OpenAI API with model: ${model}`);
          
          // Always provide detailed information about what we're doing
          console.log('OpenAI request details:', {
            model,
            messageCount: messages.length,
            temperature,
            token_count: Math.ceil(messages.reduce((acc, m) => acc + m.content.length / 4, 0))
          });
          
          // Create a promise that will be rejected after the timeout
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('OPENAI_TIMEOUT')), 30000) // 30 second timeout
          );
          
          // The actual OpenAI API call
          const openaiPromise = openai.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: 3000,
          });
          
          // Race between the API call and the timeout
          const response = await Promise.race([openaiPromise, timeoutPromise]);
          
          // Verify we got a valid response with content
          if (response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
            console.log('OpenAI API call successful with valid response structure');
            resolve(response);
          } else {
            console.error('OpenAI API call succeeded but returned unexpected structure:', JSON.stringify(response));
            reject(new Error('Invalid response structure from OpenAI'));
          }
        } catch (error) {
          console.error('OpenAI API call failed:', error.message);
          // Simply rethrow the error to be handled by the caller
          reject(error);
        }
      } catch (err) {
        console.error('OpenAI API call failed:', err.message);
        reject(err);
      }
    });

    // Race between OpenAI API call and timeout
    const response = await Promise.race([openaiPromise, timeoutPromise]);
    console.log('OpenAI API call completed successfully');
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

// Function to create fallback feedback if OpenAI fails
function createFallbackFeedback(songFeatures, referenceArtists) {
  return {
    analysis: "We encountered an issue while generating detailed feedback for your track. Based on the basic analysis, we can provide the following general observations:\n\n" +
      "- Your track has been processed and basic audio features have been extracted\n" +
      "- We recommend focusing on clarity in your mix and ensuring proper balance between elements\n" +
      "- Consider checking your levels and making sure your dynamics processing isn't too aggressive",
    technicalInsights: "Technical analysis was unable to complete. Try uploading your track again or check if the server is experiencing high load.",
    nextSteps: "- Check your mix levels\n- Ensure proper EQ to avoid frequency masking\n- Consider subtle compression for cohesion",
    audioFeatures: {
      tempo: songFeatures?.tempo || 120,
      key: songFeatures?.key || 'Unknown',
      energy: songFeatures?.energy || 0.5,
      dynamics: songFeatures?.dynamics || 6
    }
  };
}

// Function to parse different sections from the AI feedback
function parseFeedbackSections(feedback) {
  // Default sections
  const sections = {
    analysis: feedback, // Default is to use the entire feedback as analysis
    comparison: '',
    technical: '',
    recommendations: ''
  };
  
  // Try to extract sections based on common headings
  const comparisonMatch = feedback.match(/(?:##?\s*Comparison to Reference Artists[\s\S]*?)(?=##?\s|$)/i);
  if (comparisonMatch) {
    sections.comparison = comparisonMatch[0].trim();
  }
  
  const technicalMatch = feedback.match(/(?:##?\s*Technical Analysis|##?\s*Technical Insights)[\s\S]*?(?=##?\s|$)/i);
  if (technicalMatch) {
    sections.technical = technicalMatch[0].trim();
  }
  
  const recommendationsMatch = feedback.match(/(?:##?\s*Recommendations|##?\s*Next Steps|##?\s*Areas for Improvement)[\s\S]*?(?=##?\s|$)/i);
  if (recommendationsMatch) {
    sections.recommendations = recommendationsMatch[0].trim();
  }
  
  // If we extracted specific sections, update the main analysis
  if (comparisonMatch || technicalMatch || recommendationsMatch) {
    // Remove the extracted sections from the main analysis if they were found
    let analysisText = feedback;
    [comparisonMatch, technicalMatch, recommendationsMatch].forEach(match => {
      if (match) {
        analysisText = analysisText.replace(match[0], '');
      }
    });
    
    // Clean up and use the remaining text as the main analysis
    sections.analysis = analysisText.trim();
  }
  
  return sections;
}

/**
 * Prepares a human-readable summary of audio features for the OpenAI prompt
 * @param {Object} features Extracted audio features
 * @returns {String} Formatted summary of features
 */
function prepareFeatureSummaryForPrompt(features) {
  // Create a concise text summary of the features for the AI prompt
  let summary = [];
  
  // Add track metadata
  if (features.title && features.title !== 'Unknown Title') {
    summary.push(`Title: ${features.title}`);
  }
  if (features.artist && features.artist !== 'Unknown Artist') {
    summary.push(`Artist: ${features.artist}`);
  }
  
  // Add genre
  if (features.genre) {
    summary.push(`Genre: ${features.genre}`);
  }
  
  // Add tempo
  if (features.tempo && features.tempo.description) {
    summary.push(`Tempo: ${features.tempo.description} (${features.tempo.value} BPM)`);
  }
  
  // Add dynamics
  if (features.dynamics && features.dynamics.description) {
    summary.push(`Dynamics: ${features.dynamics.description}`);
  }
  
  // Add mix balance
  if (features.mixBalance && features.mixBalance.description) {
    summary.push(`Mix balance: ${features.mixBalance.description}`);
  }
  
  // Add loudness
  if (features.loudness && features.loudness.description) {
    summary.push(`Loudness: ${features.loudness.description}`);
  }
  
  // Add complexity
  if (features.complexity && features.complexity.description) {
    summary.push(`Complexity: ${features.complexity.description}`);
  }
  
  // Add key
  if (features.harmonic && features.harmonic.key) {
    summary.push(`Key: ${features.harmonic.key}`);
  }
  
  // Add mood
  if (features.mood) {
    summary.push(`Mood: ${features.mood}`);
  }
  
  return summary.join('\n');
}

/**
 * Prepares a summary of feature comparisons with reference artists
 * @param {Object} comparisons Comparison results
 * @param {Array} referenceArtists Reference artist names
 * @returns {String} Formatted comparison summary
 */
function prepareComparisonSummaryForPrompt(comparisons, referenceArtists) {
  if (!comparisons || referenceArtists.length === 0) {
    return '';
  }
  
  let comparisonText = ['COMPARISON TO REFERENCE ARTISTS:'];
  
  // Overall similarity score
  if (comparisons.similarity_score) {
    comparisonText.push(`Overall similarity to reference artists: ${comparisons.similarity_score}%`);
  }
  
  // Closest match
  if (comparisons.closest_match && comparisons.closest_match.artist) {
    comparisonText.push(`Closest matching artist: ${comparisons.closest_match.artist} (${comparisons.closest_match.score}% similarity)`);
  }
  
  // Tempo comparison
  if (comparisons.tempo) {
    const direction = comparisons.tempo.delta > 0 ? 'faster than' : 'slower than';
    comparisonText.push(`Tempo: ${Math.abs(Math.round(comparisons.tempo.delta))} BPM ${direction} reference artists (${comparisons.tempo.value} vs average ${Math.round(comparisons.tempo.reference_avg)} BPM)`);
  }
  
  // Loudness comparison
  if (comparisons.loudness) {
    const direction = comparisons.loudness.delta > 0 ? 'louder than' : 'quieter than';
    comparisonText.push(`Loudness: ${Math.abs(comparisons.loudness.delta.toFixed(1))} LUFS ${direction} reference artists (${comparisons.loudness.value.toFixed(1)} vs average ${comparisons.loudness.reference_avg.toFixed(1)} LUFS)`);
  }
  
  // Dynamics comparison
  if (comparisons.dynamics) {
    const direction = comparisons.dynamics.delta > 0 ? 'more dynamic than' : 'less dynamic than';
    comparisonText.push(`Dynamic range: ${direction} reference artists (${comparisons.dynamics.value.toFixed(1)} vs average ${comparisons.dynamics.reference_avg.toFixed(1)})`);
  }
  
  return comparisonText.join('\n');
}

module.exports = {
  analyzeMusicTrack
};
