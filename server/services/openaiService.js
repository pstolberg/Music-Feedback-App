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
async function analyzeMusicTrack(trackPath, referenceArtists = [], songFeatures = null) {
  console.log('Starting OpenAI feedback generation with timeout protection');
  
  // Add a timeout promise that will reject after 30 seconds
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      console.log('OpenAI API call timed out after 30 seconds');
      reject(new Error('OPENAI_TIMEOUT'));
    }, 30000);
  });

  try {
    // If song features weren't provided, they need to be extracted
    if (!songFeatures) {
      console.log('No pre-extracted features provided. This should not happen in the new architecture.');
      // Import here to avoid circular dependency
      const { extractEnhancedAudioFeatures } = require('./enhancedAudioAnalysis');
      console.log('Extracting audio features from:', trackPath);
      songFeatures = await extractEnhancedAudioFeatures(trackPath);
      console.log('Audio features extracted successfully');
    }
    
    const artistsString = referenceArtists.length > 0 
      ? `The user wants their track to sound similar to: ${referenceArtists.join(', ')}.` 
      : 'No specific reference artists were selected.';
    
    // Prepare the feature summary for OpenAI prompt
    const featureSummary = prepareFeatureSummaryForPrompt(songFeatures);
    
    // Include reference artist comparison if available
    let comparisonString = '';
    if (songFeatures.comparisons) {
      comparisonString = prepareComparisonSummaryForPrompt(songFeatures.comparisons, referenceArtists);
    }
    
    // Create the OpenAI call but wrap it in a Promise.race with the timeout
    const openaiPromise = new Promise(async (resolve, reject) => {
      try {
        const model = "gpt-4o";  // Using gpt-4o model as requested by user
        const messages = [
          {
            role: "system",
            content: `You are a professional music producer and mixing engineer specializing in electronic music. You analyze tracks and provide detailed technical feedback on production quality, mixing, arrangement and sound design.\n
          ${artistsString}\n
          Focus heavily on technical aspects like dynamics, spectral balance, stereo image, and arrangement techniques that are specific to electronic music production.\n
          In your analysis, use a supportive but direct tone. Don't be afraid to point out areas that need improvement, but frame constructive criticism in a helpful way.`
          },
          {
            role: "user",
            content: `I've just analyzed a music track. Here are the technical details:\n\n${featureSummary}\n\n${comparisonString}\n\nProvide a comprehensive technical analysis focused on mixing, sound design, and arrangement. Include specific recommendations for improvement based on the technical data.`
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
    
    // Race the OpenAI call against the timeout
    console.log('Starting Promise.race for OpenAI call...');
    let response;
    try {
      response = await Promise.race([openaiPromise, timeoutPromise]);
      console.log('Promise.race completed: API call won the race');
    } catch (raceError) {
      console.error('Promise.race error:', raceError.message);
      if (raceError.message === 'OPENAI_TIMEOUT') {
        console.log('OpenAI API call timed out, using fallback');
        return createFallbackFeedback(songFeatures, referenceArtists);
      }
      throw raceError; // Re-throw if it's not a timeout
    }
    
    // Process the feedback as normal if we didn't time out
    const feedback = response.choices[0]?.message?.content || '';
    
    // Parse different sections from feedback
    const sections = parseFeedbackSections(feedback);
    
    return {
      analysis: sections.analysis,
      comparisonToReference: sections.comparison,
      technicalInsights: sections.technical,
      nextSteps: sections.recommendations,
      songFeatures,
      audioFeatures: {
        tempo: songFeatures.tempo || 120,
        key: songFeatures.key || 'Unknown',
        energy: songFeatures.energy || 0.5,
        dynamics: songFeatures.dynamics || 6
      }
    };
  } catch (error) {
    console.error('Error generating feedback with OpenAI:', error.message);
    
    // Provide fallback feedback when OpenAI fails
    console.log('Using fallback feedback generation');
    return createFallbackFeedback(songFeatures, referenceArtists);
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
