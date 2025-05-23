import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App';
// Removing unused import
// import reportWebVitals from './reportWebVitals';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
