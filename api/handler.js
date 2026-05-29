import http from 'node:http';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_API_URL = 'https://api.youpass.vn/v1/quizzes/id?included_vocabs=true';

function readConfig() {
  if (!existsSync('config.json')) {
    return {};
  }

  return JSON.parse(readFileSync('config.json', 'utf8'));
}

const config = readConfig();
const API_URL = process.env.E_LEARNING_API_URL || config.apiUrl || DEFAULT_API_URL;

// Import the rest of your server logic
// (Copy your entire server.js logic here, but adjust it for serverless)

export default async (req, res) => {
  // Your request handler logic here
  // This replaces the http.createServer callback
  
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ message: 'E-learning export server is running' });
};
