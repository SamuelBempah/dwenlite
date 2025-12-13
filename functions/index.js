const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cors = require("cors")({ origin: true });

// 1. INCREASE TIMEOUT TO 300s AND MEMORY TO 512MiB
exports.generateNotesProxy = onRequest(
  { timeoutSeconds: 300, memory: "512MiB" }, 
  (req, res) => {
    cors(req, res, async () => {
      // 2. Handle Preflight (OPTIONS) requests explicitly
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
      }

      try {
        const { prompt } = req.body;
        
        // Log the start of the request
        logger.info("Starting generation...", { promptLength: prompt?.length });

        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          throw new Error("API Key not found in environment variables.");
        }

        const response = await axios.post(
          'https://api.deepseek.com/v1/chat/completions',
          {
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: 'You are a helpful assistant for generating educational content.' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 4000,
            temperature: 0.7,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            // 3. Set Axios timeout slightly lower than function timeout
            timeout: 290000 
          }
        );

        res.status(200).json(response.data);

      } catch (error) {
        logger.error("API Error", error.message);
        
        // Send JSON error so frontend doesn't get a CORS/Network error
        res.status(500).json({ 
          error: "Failed to generate content", 
          details: error.response?.data || error.message 
        });
      }
    });
  }
);