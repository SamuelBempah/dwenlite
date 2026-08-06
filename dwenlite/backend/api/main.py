from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import edge_tts

app = FastAPI()

# Allow frontend to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str

@app.post("/api/tts")
async def generate_tts_api(request: TTSRequest):
    communicate = edge_tts.Communicate(request.text, "en-US-AvaNeural")
    audio_data = b""
    
    # Stream audio directly into memory (No temp files needed!)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
            
    return Response(content=audio_data, media_type="audio/mpeg")
