"""
Unit tests for the AcousticBrainz API client
"""
import os
import json
import unittest
from unittest.mock import patch, MagicMock
import tempfile
import shutil
import requests

from clients.acousticbrainz_client import AcousticBrainzClient

class TestAcousticBrainzClient(unittest.TestCase):
    """Test cases for the AcousticBrainzClient class"""
    
    def setUp(self):
        """Set up test environment before each test"""
        # Create a temporary directory for cache
        self.temp_dir = tempfile.mkdtemp()
        self.cache_patcher = patch('clients.acousticbrainz_client.CACHE_DIR', self.temp_dir)
        self.cache_patcher.start()
        
        # Initialize the client
        self.client = AcousticBrainzClient()
        
        # Sample test data
        self.test_mbid = '2cfad0f7-d015-4183-a9e2-f334bcca4a15'  # Daft Punk - Get Lucky
        self.test_response = {
            self.test_mbid: {
                'highlevel': {
                    'danceability': {
                        'all': {
                            'danceable': 0.85,
                            'not_danceable': 0.15
                        }
                    },
                    'mood_electronic': {
                        'all': {
                            'electronic': 0.9,
                            'not_electronic': 0.1
                        }
                    },
                    'mood_happy': {
                        'all': {
                            'happy': 0.75,
                            'not_happy': 0.25
                        }
                    },
                    'mood_party': {
                        'all': {
                            'party': 0.6,
                            'not_party': 0.4
                        }
                    },
                    'mood_acoustic': {
                        'all': {
                            'acoustic': 0.3,
                            'not_acoustic': 0.7
                        }
                    }
                }
            }
        }
    
    def tearDown(self):
        """Clean up after each test"""
        # Stop patches
        self.cache_patcher.stop()
        
        # Remove temporary directory
        shutil.rmtree(self.temp_dir)
    
    @patch('clients.acousticbrainz_client.requests.get')
    def test_get_highlevel_success(self, mock_get):
        """Test successful high-level data retrieval"""
        # Set up mock response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = self.test_response
        mock_get.return_value = mock_response
        
        # Call the method
        result = self.client.get_highlevel(self.test_mbid)
        
        # Verify the result
        self.assertIsNotNone(result)
        self.assertIn('danceability', result)
        self.assertIn('mood_acoustic', result)
        
        # Verify the API was called correctly
        mock_get.assert_called_once_with(
            "https://acousticbrainz.org/api/v1/high-level",
            params={'recording_ids': self.test_mbid},
            timeout=5.0
        )
    
    @patch('clients.acousticbrainz_client.requests.get')
    def test_get_highlevel_not_found(self, mock_get):
        """Test handling of MBID not found"""
        # Set up mock response with no data for the MBID
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}  # Empty response
        mock_get.return_value = mock_response
        
        # Call the method
        result = self.client.get_highlevel(self.test_mbid)
        
        # Verify the result
        self.assertIsNone(result)
    
    @patch('clients.acousticbrainz_client.requests.get')
    def test_get_highlevel_timeout(self, mock_get):
        """Test handling of request timeout"""
        # Set up mock to raise timeout
        mock_get.side_effect = requests.Timeout("Request timed out")
        
        # Call the method
        result = self.client.get_highlevel(self.test_mbid)
        
        # Verify graceful handling (returns None on timeout)
        self.assertIsNone(result)
    
    @patch('clients.acousticbrainz_client.requests.get')
    def test_get_highlevel_server_error(self, mock_get):
        """Test handling of server error with retry"""
        # Set up mock to raise server error then succeed
        mock_error_response = MagicMock()
        mock_error_response.status_code = 500
        mock_error_response.raise_for_status.side_effect = requests.exceptions.RequestException("Server error")
        
        mock_success_response = MagicMock()
        mock_success_response.status_code = 200
        mock_success_response.json.return_value = self.test_response
        
        mock_get.side_effect = [mock_error_response, mock_success_response]
        
        # Call the method with retry patched to avoid real waiting
        with patch('clients.acousticbrainz_client.time.sleep'):
            result = self.client.get_highlevel(self.test_mbid)
        
        # Verify the result after retry
        self.assertIsNotNone(result)
        self.assertIn('danceability', result)
        
        # Verify get was called twice (retry)
        self.assertEqual(mock_get.call_count, 2)
    
    def test_extract_mood_features(self):
        """Test extraction of mood features from highlevel data"""
        # Use the test highlevel data
        highlevel_data = self.test_response[self.test_mbid]['highlevel']
        
        # Call the method
        result = self.client.extract_mood_features(highlevel_data)
        
        # Verify the extracted features
        self.assertIn('danceability', result)
        self.assertAlmostEqual(result['danceability'], 0.85)
        
        # Verify mood_top3 extraction (sorted by probability)
        self.assertIn('mood_top3', result)
        self.assertEqual(len(result['mood_top3']), 3)
        self.assertEqual(result['mood_top3'][0], 'electronic')  # Highest probability
        self.assertEqual(result['mood_top3'][1], 'happy')
        self.assertEqual(result['mood_top3'][2], 'party')
    
    def test_caching(self):
        """Test caching functionality"""
        # Write test data to cache
        cache_path = os.path.join(self.temp_dir, f"acousticbrainz_{self.test_mbid}.json")
        highlevel_data = self.test_response[self.test_mbid]['highlevel']
        with open(cache_path, 'w') as f:
            json.dump(highlevel_data, f)
        
        # Mock to ensure API is not called
        with patch('clients.acousticbrainz_client.requests.get') as mock_get:
            # Call the method
            result = self.client.get_highlevel(self.test_mbid)
            
            # Verify the result from cache
            self.assertIsNotNone(result)
            self.assertIn('danceability', result)
            self.assertIn('mood_acoustic', result)
            
            # Verify API was not called (used cache)
            mock_get.assert_not_called()

if __name__ == '__main__':
    unittest.main()
