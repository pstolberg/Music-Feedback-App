"""
Unit tests for the ArtistFeatureHarvester facade class
"""
import unittest
from unittest.mock import patch, MagicMock
import json
import statistics
from collections import Counter

from artist_feature_harvester import ArtistFeatureHarvester

class TestArtistFeatureHarvester(unittest.TestCase):
    """Test cases for the ArtistFeatureHarvester class"""
    
    def setUp(self):
        """Set up test environment before each test"""
        # Mock the individual clients
        self.deezer_patcher = patch('artist_feature_harvester.DeezerClient')
        self.audiodb_patcher = patch('artist_feature_harvester.AudioDBClient')
        self.acousticbrainz_patcher = patch('artist_feature_harvester.AcousticBrainzClient')
        
        # Start the patches
        self.mock_deezer = self.deezer_patcher.start()
        self.mock_audiodb = self.audiodb_patcher.start()
        self.mock_acousticbrainz = self.acousticbrainz_patcher.start()
        
        # Set up the mock client instances
        self.deezer_client = MagicMock()
        self.audiodb_client = MagicMock()
        self.acousticbrainz_client = MagicMock()
        
        # Configure the mocks to return our mock instances
        self.mock_deezer.return_value = self.deezer_client
        self.mock_audiodb.return_value = self.audiodb_client
        self.mock_acousticbrainz.return_value = self.acousticbrainz_client
        
        # Test data
        self.artist_name = "Tame Impala"
        self.track_data = [
            {
                'title': 'The Less I Know The Better',
                'isrc': 'AUUM71500463',
                'mbid': '9b0a3376-472d-4a99-81f0-b713c5a42bd2',
                'bpm': 117.5,
                'gain': -10.2,
                'key': 'C',
                'mode': 'Minor',
                'danceability': 0.78,
                'mood_top3': ['electronic', 'happy', 'party']
            },
            {
                'title': 'Let It Happen',
                'isrc': 'AUUM71500454',
                'mbid': '02e96794-46b4-4a10-b899-533f3c5b114a',
                'bpm': 125.0,
                'gain': -9.8,
                'key': 'F#',
                'mode': 'Major',
                'danceability': 0.82,
                'mood_top3': ['electronic', 'party', 'aggressive']
            },
            {
                'title': 'Borderline',
                'isrc': 'AUUM71900654',
                'mbid': '0dcd2a7a-7d22-4a0f-9cb1-5db3c944e8a3',
                'bpm': 120.0,
                'gain': -11.5,
                'key': 'C',
                'mode': 'Minor',
                'danceability': 0.75,
                'mood_top3': ['electronic', 'relaxed', 'acoustic']
            }
        ]
        
        # Initialize the harvester
        self.harvester = ArtistFeatureHarvester(self.artist_name)
        
        # Replace the real clients with our mocks
        self.harvester.deezer_client = self.deezer_client
        self.harvester.audiodb_client = self.audiodb_client
        self.harvester.acousticbrainz_client = self.acousticbrainz_client
    
    def tearDown(self):
        """Clean up after each test"""
        # Stop all the patches
        self.deezer_patcher.stop()
        self.audiodb_patcher.stop()
        self.acousticbrainz_patcher.stop()
    
    def test_collect_top_tracks(self):
        """Test collection of top tracks"""
        # Set up mock for _collect_track_features
        with patch.object(self.harvester, '_collect_track_features') as mock_collect:
            # Configure mock to return our test data
            mock_collect.side_effect = self.track_data
            
            # Call the method
            result = self.harvester.collect_top_tracks(limit=3)
            
            # Verify the result
            self.assertTrue(result)
            self.assertEqual(len(self.harvester.track_data), 3)
            
            # Verify _collect_track_features was called for each track
            self.assertEqual(mock_collect.call_count, 3)
    
    def test_collect_track_features(self):
        """Test collection of features for a single track"""
        # Set up mocks for each client
        track_title = "Let It Happen"
        isrc = "AUUM71500454"
        mbid = "02e96794-46b4-4a10-b899-533f3c5b114a"
        
        # Configure Deezer client mock
        self.deezer_client.get_track_by_isrc.return_value = {
            'bpm': 125.0,
            'gain': -9.8
        }
        
        # Configure AudioDB client mock
        self.audiodb_client.search_track.return_value = {
            'key': 'F#',
            'mode': 'Major',
            'tempo': 125.0
        }
        
        # Configure AcousticBrainz client mock
        self.acousticbrainz_client.get_highlevel.return_value = {'some': 'data'}
        self.acousticbrainz_client.extract_mood_features.return_value = {
            'danceability': 0.82,
            'mood_top3': ['electronic', 'party', 'aggressive']
        }
        
        # Call the method
        result = self.harvester._collect_track_features(track_title, isrc, mbid)
        
        # Verify the result contains all features
        self.assertEqual(result['title'], track_title)
        self.assertEqual(result['isrc'], isrc)
        self.assertEqual(result['mbid'], mbid)
        self.assertEqual(result['bpm'], 125.0)
        self.assertEqual(result['gain'], -9.8)
        self.assertEqual(result['key'], 'F#')
        self.assertEqual(result['mode'], 'Major')
        self.assertEqual(result['danceability'], 0.82)
        self.assertEqual(result['mood_top3'], ['electronic', 'party', 'aggressive'])
        
        # Verify each client was called correctly
        self.deezer_client.get_track_by_isrc.assert_called_once_with(isrc)
        self.audiodb_client.search_track.assert_called_once_with(self.artist_name, track_title)
        self.acousticbrainz_client.get_highlevel.assert_called_once_with(mbid)
        self.acousticbrainz_client.extract_mood_features.assert_called_once_with({'some': 'data'})
    
    def test_aggregate(self):
        """Test aggregation of track features to artist stats"""
        # Inject test track data
        self.harvester.track_data = self.track_data
        
        # Call the method
        result = self.harvester.aggregate()
        
        # Verify the aggregated stats
        self.assertEqual(result['artist'], self.artist_name)
        self.assertEqual(result['track_count'], 3)
        
        # Verify median BPM
        expected_bpm = statistics.median([t['bpm'] for t in self.track_data])
        self.assertEqual(result['median_bpm'], expected_bpm)
        
        # Verify median loudness
        expected_loudness = statistics.median([t['gain'] for t in self.track_data])
        self.assertEqual(result['median_loudness'], expected_loudness)
        
        # Verify key histogram
        keys = [f"{t['key']} {t['mode']}" for t in self.track_data]
        key_counts = Counter(keys).most_common(5)
        expected_histogram = [{key: count} for key, count in key_counts]
        self.assertEqual(result['key_histogram'], expected_histogram)
        
        # Verify mean danceability
        expected_danceability = statistics.mean([t['danceability'] for t in self.track_data])
        self.assertAlmostEqual(result['mean_danceability'], expected_danceability)
        
        # Verify top moods
        all_moods = []
        for track in self.track_data:
            all_moods.extend(track['mood_top3'])
        top_moods = [mood for mood, _ in Counter(all_moods).most_common(3)]
        self.assertEqual(result['top_moods'], top_moods)
    
    def test_get_artist_stats_calls_aggregate_if_empty(self):
        """Test that get_artist_stats calls aggregate if stats are empty"""
        # Set up a spy on aggregate
        with patch.object(self.harvester, 'aggregate', wraps=self.harvester.aggregate) as spy_aggregate:
            # Inject test track data to avoid collect_top_tracks logic
            self.harvester.track_data = self.track_data
            
            # First call should trigger aggregate
            result1 = self.harvester.get_artist_stats()
            
            # Second call should use cached result
            result2 = self.harvester.get_artist_stats()
            
            # Verify aggregate was called once
            spy_aggregate.assert_called_once()
            
            # Verify both calls returned the same result
            self.assertEqual(result1, result2)
    
    def test_end_to_end_tame_impala(self):
        """
        End-to-end test using Tame Impala that verifies the complete flow
        with mocked API responses to test integration with the LLM pipeline
        """
        # Mock collect_top_tracks to inject our test data
        with patch.object(self.harvester, 'collect_top_tracks') as mock_collect:
            mock_collect.return_value = True
            self.harvester.track_data = self.track_data
            
            # Get the artist stats
            stats = self.harvester.get_artist_stats()
            
            # Verify the stats contain expected fields
            expected_fields = [
                'artist', 'track_count', 'median_bpm', 'median_loudness',
                'key_histogram', 'mean_danceability', 'top_moods'
            ]
            
            for field in expected_fields:
                self.assertIn(field, stats)
            
            # Verify the JSON schema for LLM integration
            # This would verify that the output matches the expected format
            # for the LLM prompt construction
            json_output = json.dumps(stats)
            self.assertIsNotNone(json_output)
            
            # Verify the schema matches what would be sent to the LLM
            parsed_json = json.loads(json_output)
            self.assertEqual(parsed_json['artist'], self.artist_name)
            self.assertIn('median_bpm', parsed_json)
            self.assertIn('median_loudness', parsed_json)
            self.assertIn('key_histogram', parsed_json)
            self.assertIn('mean_danceability', parsed_json)
            self.assertIn('top_moods', parsed_json)

if __name__ == '__main__':
    unittest.main()
