import express from 'express';
import axios from 'axios';
import cors from 'cors';

// Hardcoded Arkesel API key (temporary for debugging)
const ARKESEL_API_KEY = 'OmNQR2VuT1RqR29qZDk1aDE='; // Restored trailing = for Base64
const SMS_ENDPOINT = 'https://sms.arkesel.com/sms/api';

const app = express();
app.use(cors()); // Enable CORS for frontend requests
app.use(express.json()); // Parse JSON bodies

// Log API key presence and partial key for verification (first 8 chars for safety)
console.log('ARKESEL_API_KEY is', ARKESEL_API_KEY ? 'set' : 'not set');
console.log('ARKESEL_API_KEY (partial):', ARKESEL_API_KEY ? ARKESEL_API_KEY.slice(0, 8) + '...' : 'not set');

// Endpoint to send SMS notification
app.post('/send-sms', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    console.error('Missing message field in request body:', req.body);
    return res.status(400).json({ error: 'Missing message field' });
  }

  if (!ARKESEL_API_KEY) {
    console.error('ARKESEL_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error: Missing API key' });
  }

  try {
    console.log('Sending SMS with API key (partial):', ARKESEL_API_KEY.slice(0, 8) + '...');
    const response = await axios.get(SMS_ENDPOINT, {
      params: {
        action: 'send-sms',
        api_key: ARKESEL_API_KEY,
        to: '233532095500',
        from: 'SBMind Tech',
        sms: message,
      },
      timeout: 10000, // 10-second timeout
    });

    console.log('Arkesel API response:', response.data);

    if (response.data.code === 'ok') {
      console.log('SMS sent successfully:', { message });
      res.status(200).json({});
    } else {
      throw new Error(response.data.message || 'Failed to send SMS');
    }
  } catch (error) {
    const errorMessage = error.response
      ? `Arkesel API responded with status ${error.response.status}: ${JSON.stringify(error.response.data)}`
      : error.request
      ? 'No response received from Arkesel API. Check network or API availability.'
      : error.message;
    console.error('SMS sending error:', errorMessage, 'Request details:', { message });
    res.status(500).json({ error: `Failed to send SMS: ${errorMessage}` });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});