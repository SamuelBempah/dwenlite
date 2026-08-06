import sys
import asyncio
import edge_tts

async def generate_tts(text, output_file):
    try:
        # Generate the audio in one go for maximum speed
        communicate = edge_tts.Communicate(text, "en-US-AvaNeural")
        await communicate.save(output_file)
        print(f"Audio generated successfully: {output_file}")
    except Exception as e:
        print(f"Error generating audio: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python generate_tts.py <text> <output_file>")
        sys.exit(1)
    
    input_text = sys.argv[1]
    output_file = sys.argv[2]
    
    asyncio.run(generate_tts(input_text, output_file))