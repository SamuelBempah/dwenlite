const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/tts', (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).send('Text is required');
    }
    const timestamp = Date.now();
    const outputFile = path.join(__dirname, `tts_${timestamp}.mp3`);
    
    // Using edge-tts
    const safeText = text.replace(/"/g, '\\"');
    const command = `python3 generate_tts.py "${safeText}" "${outputFile}"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error generating TTS: ${error.message}`);
            return res.status(500).send('Error generating TTS');
        }
        
        res.download(outputFile, (err) => {
            if (err) {
                console.error("Error downloading file", err);
            }
            // Delete file after sending to avoid filling disk
            fs.unlink(outputFile, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting temp file:", unlinkErr);
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
