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

```bash
# Start the server
cd server
npm run dev

# In another terminal, start the client
cd client
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Deployment Instructions with Vercel

This application is configured for deployment with Vercel using GitHub:

### 1. Push to GitHub

```bash
# Initialize Git repository (if not already done)
git init
git add .
git commit -m "Initial commit for Vercel deployment"

# Create a repository on GitHub and push your code
git remote add origin https://github.com/yourusername/ai-track-feedback.git
git push -u origin main
```

### 2. Deploy with Vercel

1. Log in to [Vercel](https://vercel.com/)
2. Click "Import Project" or "New Project"
3. Select your GitHub repository
4. Configure the deployment:
   - Set Framework Preset to "Other"
   - Ensure the root directory is set correctly
   - Add the following environment variables:
     - `OPENAI_API_KEY`: Your OpenAI API key
     - `NODE_ENV`: Set to "production"

5. Click "Deploy"

### Important Notes for Deployment

- The app uses GPT-4o for professional music feedback generation
- Redis should be configured in Vercel with an external provider (Upstash recommended)
- Audio file analysis uses fallback mechanisms if advanced libraries aren't available

## Features & Technology

### Audio Analysis
- Multi-library approach for robust feature extraction
- Tempo, key, dynamics, and spectral analysis
- Fallback mechanisms for consistent results

### AI Feedback
- GPT-4o model integration for professional-level feedback
- Structured prompt engineering for consistent results
- Reference artist comparisons

### Queue Management
- Redis for robust queue handling
- Automatic fallback to in-memory queue when needed

## Future Enhancements

- Audio waveform visualization
- User accounts to track feedback history
- More detailed audio analysis using specialized AI models
- Genre-specific feedback options
- Community features to share feedback
- User accounts and feedback history
- Customizable feedback parameters
- Reference track comparison
- Integration with DAW plugins
