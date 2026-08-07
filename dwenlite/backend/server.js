const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, userData) => {
        socket.join(roomId);
        // Let everyone in the room know someone joined
        socket.to(roomId).emit('user-connected', { id: socket.id, ...userData });

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', socket.id);
        });
    });

    // WebRTC Signaling
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal,
            userData: data.userData
        });
    });

    // AI Teacher Sync
    socket.on('ai-speak', (roomId, text) => {
        socket.to(roomId).emit('ai-speak', text);
    });

    socket.on('ai-state', (roomId, state) => {
        socket.to(roomId).emit('ai-state', state);
    });

    socket.on('raise-hand', (roomId, userData) => {
        socket.to(roomId).emit('raise-hand', { id: socket.id, ...userData });
    });
    
    socket.on('called-on', (roomId, userId) => {
        socket.to(roomId).emit('called-on', userId);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
