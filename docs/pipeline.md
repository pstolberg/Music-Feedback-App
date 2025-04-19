# AI Music Feedback Pipeline

This document outlines the data processing pipeline for the AI Music Feedback application, including the newly added artist sound profile ingestion feature.

## Overview

The AI Music Feedback pipeline consists of several stages:

1. **Track Upload**: User uploads an audio track for analysis
2. **Audio Feature Extraction**: Extracting technical audio features from the track
3. **Artist Sound Profile Ingestion**: Collecting reference data for comparison artists
4. **LLM Prompt Construction**: Building a comprehensive prompt with track and artist features
5. **LLM Inference**: Generating professional feedback using OpenAI GPT-4o
6. **Result Presentation**: Displaying the feedback to the user with metrics and comparisons

## New Component: Artist Sound Profile Ingestion

The latest addition to the pipeline is the Artist Sound Profile Ingestion module, which enhances the music feedback by providing artist-specific context for comparisons.

### Data Sources

| Source | API Endpoint | Rate Limits | Data Retrieved |
|--------|--------------|-------------|----------------|
| Deezer | `https://api.deezer.com/track/isrc:{isrc}` | 50 req/min | BPM, gain (loudness) |
| TheAudioDB | `https://theaudiodb.com/api/v1/json/{api_key}/searchtrack.php` | 1 req/sec | Key, mode, tempo |
| AcousticBrainz | `https://acousticbrainz.org/api/v1/high-level` | None stated | Danceability, moods |

### Integration Flow

```
User Track ──┐
             │
Reference    │
Artist Names ┴──> ArtistFeatureHarvester ──> Aggregate Stats ──> LLM Context
```

### Artist Feature Harvester

The `ArtistFeatureHarvester` facade coordinates data collection from multiple sources:

1. For each reference artist, collects data for their top tracks
2. Aggregates track-level features into artist-level statistics
3. Generates a consistent JSON output with artist sound profile

### Aggregation Rules

- **BPM**: Median value across tracks
- **Loudness**: Median gain (LUFS) across tracks
- **Key/Mode**: Histogram of most common keys (top 5)
- **Danceability**: Mean value across tracks
- **Mood**: Top 3 most frequent moods across all tracks

## JSON Schema

The Artist Sound Profile follows this schema:

```json
{
  "artist": "Artist Name",
  "track_count": 5,
  "median_bpm": 120.5,
  "median_loudness": -8.5,
  "key_histogram": [
    {"C Minor": 3},
    {"G Major": 1},
    {"D Minor": 1}
  ],
  "mean_danceability": 0.78,
  "top_moods": ["electronic", "happy", "party"]
}
```

## Integration with LLM Prompt

The Artist Sound Profile is integrated into the LLM prompt as follows:

```
# Music Production Analysis Request

## User Track Information
- Track Name: {track_name}
- BPM: {track_bpm}
- Key: {track_key}
- Energy: {track_energy}
- Dynamic Range: {track_dynamics}

## Reference Artist Profile: {artist_name}
- Typical BPM Range: {median_bpm}
- Typical Loudness: {median_loudness} LUFS
- Common Keys: {key_histogram}
- Danceability: {mean_danceability}
- Characteristic Moods: {top_moods}

## Request
Please provide professional music production feedback comparing the user's track to {artist_name}'s sound...
```

## API Licensing & Attribution

- **Deezer**: Allows non-commercial usage of numeric metadata
- **TheAudioDB**: Free for non-commercial use with attribution
- **AcousticBrainz**: CC0 license, no restrictions on data usage

## Performance Considerations

- All API requests implement exponential backoff with 3 retries
- 24-hour caching for Deezer responses
- Graceful handling of timeouts and missing data
- Batch processing of artists to minimize blocking time

## Environment Configuration

Required environment variables:
- `DEEZER_APP_ID`: Deezer API application ID
- `DEEZER_APP_SECRET`: Deezer API secret key
- `AUDIO_DB_API_KEY`: TheAudioDB API key

These should be stored in Vault or the project's `.env` file, never committed to the repository.
