# Sonic Mentor - Music Production Feedback App

A web application that gives amateur music producers professional feedback on their tracks, with references to artists they want to sound like.

## Features

- Upload audio tracks (MP3, WAV, M4A, AAC, OGG)
- Select reference artists for style comparison
- Receive detailed, actionable feedback on:
  - Overall impression
  - Mix quality
  - Sound design and instrument selection
  - Arrangement and structure
  - Comparison to reference artists
  - Specific improvement suggestions

## Tech Stack

- **Frontend**: React.js with Material UI
- **Backend**: Node.js with Express
- **AI**: OpenAI API for generating feedback
- **File Handling**: Multer for file uploads

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository
2. Install dependencies:

```bash
# Install server dependencies
cd music-feedback-app/server
npm install

# Install client dependencies
cd ../client
npm install
```

3. Create a `.env` file in the server directory (copy from `.env.example`):

```
PORT=5000
OPENAI_API_KEY=your_openai_api_key_here
```

### Running the Application

1. Start the backend server:

```bash
cd server
npm run dev
```

2. Start the frontend client:

```bash
cd client
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Future Enhancements

- Audio waveform visualization
- User accounts to track feedback history
- More detailed audio analysis using specialized AI models
- Genre-specific feedback options
- Community features to share feedback
