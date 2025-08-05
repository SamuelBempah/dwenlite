import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors()); // Enable CORS for frontend requests
app.use(express.json()); // Parse JSON bodies

const ARKESEL_API_KEY = process.env.ARKESEL_API_KEY;
const SMS_ENDPOINT = 'https://sms.arkesel.com/sms/api';

// Endpoint to send SMS notification
app.post('/send-sms', async (req, res) => {
  const { phoneNumber, bundleName, network, gCoins } = req.body;

  if (!phoneNumber || !bundleName || !network || !gCoins) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const message = `New Purchase: ${bundleName} (${network}) for ${gCoins} G_COINS to ${phoneNumber}.`;

  try {
    const response = await axios.get(SMS_ENDPOINT, {
      params: {
        action: 'send-sms',
        api_key: ARKESEL_API_KEY,
        to: '233532095500', // Fixed recipient number
        from: 'SBMind Tech',
        sms: message,
      },
    });

    if (response.data.code === 'ok') {
      res.status(200).json({});
    } else {
      throw new Error(response.data.message || 'Failed to send SMS');
    }
  } catch (error) {
    console.error('SMS sending error:', error.message);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});