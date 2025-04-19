import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';

const Header = () => {
  return (
    <AppBar position="static" color="transparent" elevation={0}>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <MusicNoteIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
            Sonic Mentor
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
