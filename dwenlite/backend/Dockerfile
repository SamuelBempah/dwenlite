# Use an official Node runtime as a parent image
FROM node:20-bullseye-slim

# Install Python, pip, and ffmpeg (edge-tts sometimes needs ffmpeg)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory to /app
WORKDIR /app

# Copy the requirements file and install Python dependencies
COPY requirements.txt ./
# --break-system-packages is needed in modern Debian to install pip packages globally without venv (not needed for bullseye)
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (Fly will route traffic here)
EXPOSE 3001

# Command to run the application
CMD ["npm", "start"]
