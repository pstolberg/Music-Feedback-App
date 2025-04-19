"""
Unit tests for the Deezer API client
"""
import os
import json
import unittest
from unittest.mock import patch, MagicMock
import tempfile
import shutil
import time
import requests

from clients.deezer_client import DeezerClient

class TestDeezerClient(unittest.TestCase):
    """Test cases for the DeezerClient class"""
    
    def setUp(self):
        """Set up test environment before each test"""
        # Create a temporary directory for cache
        self.temp_dir = tempfile.mkdtemp()
        self.cache_patcher = patch('clients.deezer_client.CACHE_DIR', self.temp_dir)
        self.cache_patcher.start()
        
        # Set up test environment variables
        os.environ['DEEZER_APP_ID'] = 'test_app_id'
        os.environ['DEEZER_APP_SECRET'] = 'test_app_secret'
        
        # Initialize the client
        self.client = DeezerClient()
        
        # Sample test data
        self.test_isrc = 'USQX91300108'  # Daft Punk - Get Lucky
        self.test_response = {
            'id': 67238735,
            'title': 'Get Lucky',
            'bpm': 116.0,
            'gain': -12.4,
            'artist': {'name': 'Daft Punk'},
            'album': {'title': 'Random Access Memories'}
        }
    
    def tearDown(self):
        """Clean up after each test"""
        # Stop patches
        self.cache_patcher.stop()
        
        # Remove temporary directory
        shutil.rmtree(self.temp_dir)
    
    @patch('clients.deezer_client.requests.get')
    def test_get_track_by_isrc_success(self, mock_get):
        """Test successful track retrieval by ISRC"""
        # Set up mock response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = self.test_response
        mock_get.return_value = mock_response
        
        # Call the method
        result = self.client.get_track_by_isrc(self.test_isrc)
        
        # Verify the result
        self.assertIsNotNone(result)
        self.assertEqual(result['bpm'], 116.0)
        self.assertEqual(result['gain'], -12.4)
        
        # Verify the API was called correctly
        mock_get.assert_called_once_with(
            f"https://api.deezer.com/track/isrc:{self.test_isrc}",
            params={'output': 'json'}
        )
    
    @patch('clients.deezer_client.requests.get')
    def test_get_track_by_isrc_not_found(self, mock_get):
        """Test track not found by ISRC"""
        # Set up mock response
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        # Call the method
        result = self.client.get_track_by_isrc('INVALID_ISRC')
        
        # Verify the result
        self.assertIsNone(result)
    
    @patch('clients.deezer_client.requests.get')
    def test_get_track_by_isrc_server_error_retries(self, mock_get):
        """Test retry behavior on server error"""
        # Set up mock responses (first fails, second succeeds)
        mock_error_response = MagicMock()
        mock_error_response.status_code = 500
        mock_error_response.raise_for_status.side_effect = requests.exceptions.RequestException("Server error")
        
        mock_success_response = MagicMock()
        mock_success_response.status_code = 200
        mock_success_response.json.return_value = self.test_response
        
        mock_get.side_effect = [mock_error_response, mock_success_response]
        
        # Call the method
        with patch('clients.deezer_client.time.sleep') as mock_sleep:  # Patch sleep to avoid waiting
            result = self.client.get_track_by_isrc(self.test_isrc)
        
        # Verify the result
        self.assertIsNotNone(result)
        self.assertEqual(result['bpm'], 116.0)
        
        # Verify the API was called twice (retry)
        self.assertEqual(mock_get.call_count, 2)
        
        # Verify sleep was called for backoff
        mock_sleep.assert_called_once()
    
    def test_caching(self):
        """Test caching functionality"""
        # Write test data to cache
        cache_path = os.path.join(self.temp_dir, f"deezer_{self.test_isrc}.json")
        with open(cache_path, 'w') as f:
            json.dump(self.test_response, f)
        
        # Mock to ensure API is not called
        with patch('clients.deezer_client.requests.get') as mock_get:
            # Call the method
            result = self.client.get_track_by_isrc(self.test_isrc)
            
            # Verify the result from cache
            self.assertIsNotNone(result)
            self.assertEqual(result['bpm'], 116.0)
            self.assertEqual(result['gain'], -12.4)
            
            # Verify API was not called (used cache)
            mock_get.assert_not_called()
    
    def test_rate_limiting(self):
        """Test rate limiting functionality"""
        # Only test the rate limiting by directly calling _enforce_rate_limit
        deezer_client = DeezerClient()
        
        # Mock time.sleep to avoid waiting in tests
        with patch('clients.deezer_client.time.sleep') as mock_sleep:
            # Scenario 1: Below rate limit - shouldn't sleep
            deezer_client.request_timestamps = [time.time() - 10 for _ in range(45)]  # Below limit
            deezer_client._enforce_rate_limit()
            mock_sleep.assert_not_called()
            
            # Verify timestamp was appended
            self.assertEqual(len(deezer_client.request_timestamps), 46)
            
            # Scenario 2: At rate limit - should sleep
            deezer_client.request_timestamps = [time.time() - 10 for _ in range(50)]  # At limit
            deezer_client._enforce_rate_limit()
            mock_sleep.assert_called_once()

if __name__ == '__main__':
    unittest.main()
