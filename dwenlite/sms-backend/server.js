import express from 'express';
import axios from 'axios';
import cors from 'cors';

// Hardcoded Arkesel API key (temporary for debugging)
const ARKESEL_API_KEY = 'OmNQR2VuT1RqR29qZDk1aDE=';
const SMS_ENDPOINT = 'https://sms.arkesel.com/sms/api';

const app = express();
app.use(cors()); // Enable CORS for frontend requests
app.use(express.json()); // Parse JSON bodies

// Log API key presence and partial key for verification (first 8 chars for safety)
console.log('ARKESEL_API_KEY is', ARKESEL_API_KEY ? 'set' : 'not set');
console.log('ARKESEL_API_KEY (partial):', ARKESEL_API_KEY ? ARKESEL_API_KEY.slice(0, 8) + '...' : 'not set');

// Endpoint to send SMS notification
app.post('/send-sms', async (req, res) => {
  const { message, phoneNumber, bundleName, network, gCoins } = req.body;

  let smsMessage;
  if (message) {
    // Handle requests from DwenliteHelpdesk.jsx
    smsMessage = message;
  } else if (phoneNumber && bundleName && network && gCoins !== undefined) {
    // Handle requests from Bundles.jsx
    smsMessage = `Request for Purchase of ${bundleName} bundle for ${network} (${phoneNumber}) for ${gCoins} G_COINS has been made.`;
  } else {
    console.error('Missing required fields in request body:', req.body);
    return res.status(400).json({ error: 'Missing required fields: either "message" or "phoneNumber, bundleName, network, gCoins" must be provided' });
  }

  if (!ARKESEL_API_KEY) {
    console.error('ARKESEL_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error: Missing API key' });
  }

  try {
    console.log('Sending SMS with API key (partial):', ARKESEL_API_KEY.slice(0, 8) + '...', 'Message:', smsMessage);
    const response = await axios.get(SMS_ENDPOINT, {
      params: {
        action: 'send-sms',
        api_key: ARKESEL_API_KEY,
        to: phoneNumber || '233532095500', // Use phoneNumber from Bundles.jsx or fallback to default
        from: 'SBMind Tech',
        sms: smsMessage,
      },
      timeout: 10000, // 10-second timeout
    });

    console.log('Arkesel API response:', response.data);

    if (response.data.code === 'ok') {
      console.log('SMS sent successfully:', { message: smsMessage });
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
    console.error('SMS sending error:', errorMessage, 'Request details:', { message: smsMessage });
    res.status(500).json({ error: `Failed to send SMS: ${errorMessage}` });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});