/**
 * Provides reliable basic feedback for tracks when other analysis methods fail
 */

// Generate a complete backup feedback in case OpenAI fails
function generateBasicFeedback(songFeatures, referenceArtists = []) {
  const tempo = songFeatures.tempo || 125;
  const key = songFeatures.key || 'Unknown';
  const energy = songFeatures.energy || 0.7;
  const dynamics = songFeatures.dynamics || 6;
  
  // Build a detailed analysis based on the available features
  const analysis = `Track Analysis

Your track has a tempo of approximately ${tempo} BPM, which places it in the ${describeTempo(tempo)} range for electronic music. The detected key is ${key}.

Mix Balance
The track shows dynamics of around ${dynamics}dB, which is ${dynamics < 6 ? 'somewhat compressed' : 'fairly dynamic'} for modern electronic music. 

Energy and Impact
With an energy rating of ${Math.round(energy * 100)}%, your track has a ${energy > 0.7 ? 'high' : 'moderate'} energy profile that would work well in ${energy > 0.8 ? 'peak time club sets' : 'warm-up or more relaxed listening contexts'}.

Sound Design
Based on the analysis, focus on ensuring your drums have enough punch through compression and EQ. Make sure high-frequency elements like hi-hats and cymbals have enough presence without being harsh.

Arrangement
Consider the overall flow of your track - ensure there are moments of tension and release to maintain listener interest throughout the duration of the track.`;
  
  const technicalInsights = `Your track has the following technical characteristics:
- Tempo: ${tempo} BPM (${describeTempo(tempo)})
- Key: ${key}
- Dynamic Range: ${dynamics}dB
- Energy Level: ${Math.round(energy * 100)}%

Focus on frequency balance in your mix, ensuring that low, mid, and high frequencies are properly represented without masking each other.`;
  
  let comparisonToReference = null;
  if (referenceArtists && referenceArtists.length > 0) {
    comparisonToReference = `When comparing your track to artists like ${referenceArtists.join(', ')}, consider how they approach elements like:
- Sound design and timbral choices
- Mix density and arrangement techniques
- Dynamic processing and spatial effects
- Groove and rhythmic elements

Study their tracks in detail to better understand how to achieve a similar professional sound while maintaining your unique style.`;
  }
  
  const nextSteps = `Recommendations for Improvement

1. Focus on your mix balance - Ensure that all elements have their own space in the frequency spectrum.
2. Review your dynamics - Consider if your track would benefit from more dynamic range or more consistent loudness.
3. Refine your arrangement - Make sure your track has clear sections with proper builds and releases.
4. Polish your sound design - Pay attention to the quality of individual sounds and how they work together.
5. Reference professional tracks - Compare your mix to commercial releases in similar styles.`;
  
  return {
    analysis,
    technicalInsights,
    comparisonToReference,
    nextSteps
  };
}

// Helper function to describe tempo ranges
function describeTempo(bpm) {
  if (bpm < 90) return 'downtempo';
  if (bpm < 110) return 'mid-tempo';
  if (bpm < 125) return 'house tempo';
  if (bpm < 135) return 'techno tempo';
  if (bpm < 145) return 'fast techno/trance';
  if (bpm < 160) return 'drum & bass';
  return 'very fast';
}

module.exports = {
  generateBasicFeedback
};
