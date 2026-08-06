import React, { useState, useEffect, useRef } from 'react';
import { Filter } from 'bad-words';
import { Volume2, User, ArrowLeft, Upload, X, Mic } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import axios from 'axios';

const filter = new Filter();

const AITeacher = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const stepRef = useRef(0);
  const userNameRef = useRef('');
  const studyMaterialRef = useRef('');
  const messagesRef = useRef([]);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Realtime Audio Data
  const [speakerVolume, setSpeakerVolume] = useState(0);
  const [micVolume, setMicVolume] = useState(0);

  // File Upload State
  const [uiStep, setUiStep] = useState(0);
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const initializedRef = useRef(false);

  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);

  const audioCtxRef = useRef(null);
  const speakerAnalyserRef = useRef(null);

  // Create AudioContext ONCE on interaction (for Mic only)
  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
    }
  };

  useEffect(() => {
    if (isMobile) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        // Read the most recent transcript, not the first one in the buffer
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript;
        handleUserSpeech(transcript);
      };

      recognition.onerror = (event) => {
        if (event.error !== 'no-speech') {
          console.error('Speech recognition error', event.error);
        }
      };

      recognition.onend = () => {
        // Persistent Listening Logic
        if (!isSpeakingRef.current && stepRef.current !== 2 && stepRef.current !== 4 && !showUploadDrawer) {
          try {
            recognitionRef.current.start();
          } catch (e) { }
        } else {
          setIsListening(false);
          isListeningRef.current = false;
        }
      };

      recognitionRef.current = recognition;
    } else {
      toast.error('Your browser does not support speech recognition. Please use Chrome.');
    }

    const storedName = localStorage.getItem('aiTeacherUserName');
    if (storedName) {
      userNameRef.current = storedName;
      stepRef.current = 2;
      setUiStep(2);
      speakAndAdvance(`Welcome back, ${storedName}! Please upload the study materials you want to review today using the drawer below.`, 2);
    } else {
      speakAndAdvance("Welcome! I am your personal AI Teacher. What should I call you?", 1);
    }

    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (recognitionRef.current) recognitionRef.current.abort();
      setIsListening(false);
      isListeningRef.current = false;
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const startListening = () => {
    if (stepRef.current === 2) return;
    if (recognitionRef.current) {
      if (isSpeakingRef.current) return;
      setIsListening(true);
      isListeningRef.current = true;
      try {
        if (recognitionRef.current) recognitionRef.current.start();
      } catch (e) {
        // already started
      }    // Start Mic Audio Visualization
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        }).then(stream => {
          if (!audioCtxRef.current) initAudioContext();
          if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

          const micCtx = audioCtxRef.current;
          const micSource = micCtx.createMediaStreamSource(stream);
          const micAnalyser = micCtx.createAnalyser();
          micAnalyser.fftSize = 256;
          micSource.connect(micAnalyser);
          // DO NOT connect to destination (no echo)

          const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
          const updateMicVol = () => {
            if (!isListeningRef.current) {
              stream.getTracks().forEach(t => t.stop());
              setMicVolume(0);
              return;
            }
            micAnalyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            let avg = sum / dataArray.length;
            // Noise gate: ignore subtle background noise
            if (avg < 5) avg = 0;
            setMicVolume(avg);
            requestAnimationFrame(updateMicVol);
          };
          updateMicVol();
        }).catch(err => console.error('Mic access denied:', err));
      }

    }
  };

  const extractPdfText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + ' ';
      }
      return fullText.trim() || 'No text found in the PDF.';
    } catch (error) {
      throw new Error('PDF extraction failed: ' + error.message);
    }
  };

  const transcribeMedia = async (url, type) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) throw new Error('AssemblyAI API key not found.');

      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        { audio_url: url },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = type === 'Video' ? 60 : 30;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        status = checkResponse.data.status;
        if (status === 'completed') {
          transcribedText = checkResponse.data.text || '';
        } else if (status === 'error') {
          throw new Error(`Transcription failed.`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) throw new Error(`${type} transcription timed out.`);
      return transcribedText;
    } catch (err) {
      throw new Error(`Failed to process ${type}: ${err.message}`);
    }
  };

  const handleFileUpload = async () => {
    if (files.length === 0) return;

    setShowUploadDrawer(false);
    await speakAndAdvance("Checking out your materials, please wait a moment while I process them.", 2);
    setUploadLoading(true);

    try {
      let combinedText = '';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStatus(`Processing ${file.name}...`);

        const fileType = file.type;
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const isAudio = fileType.startsWith('audio/') || ['mp3', 'wav', 'm4a'].includes(fileExtension);
        const isVideo = fileType.startsWith('video/') || ['mp4', 'mov', 'avi'].includes(fileExtension);
        const isText = fileType === 'text/plain' || fileType === 'application/pdf' || ['txt', 'pdf'].includes(fileExtension);

        if (!isAudio && !isVideo && !isText) {
          toast.error(`Skipped ${file.name}: Unsupported type.`);
          continue;
        }

        const userUid = auth.currentUser?.uid || 'guest';
        const storageRef = ref(storage, `ai_teacher/${userUid}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        let extractedText = '';
        if (isAudio) extractedText = await transcribeMedia(downloadURL, 'Audio');
        else if (isVideo) extractedText = await transcribeMedia(downloadURL, 'Video');
        else if (isText) {
          if (fileExtension === 'txt') extractedText = await file.text();
          else if (fileExtension === 'pdf') extractedText = await extractPdfText(file);
        }

        combinedText += `\n\n--- Content from ${file.name} ---\n${extractedText}`;
      }

      if (!combinedText.trim()) throw new Error("No readable text was found in the uploaded files.");

      // Step 2: Generate detailed notes
      setUploadStatus('Getting ready, please wait...');
      const notesPrompt = `You are an expert teacher. Summarize the following raw material into detailed, structured study notes. This will be your knowledge base. Material: "${combinedText.slice(0, 30000)}"`;
      const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';

      const notesResponse = await axios.post(functionUrl, { prompt: notesPrompt });
      let generatedNotes = combinedText;
      if (notesResponse.data.choices?.[0]?.message?.content) {
        generatedNotes = notesResponse.data.choices[0].message.content.trim();
      } else if (notesResponse.data.choices?.[0]?.text) {
        generatedNotes = notesResponse.data.choices[0].text.trim();
      }

      studyMaterialRef.current = generatedNotes;
      setFiles([]);

      stepRef.current = 3;
      setUiStep(3);

      const aiPrompt = `The user ${userNameRef.current} has provided study materials. You synthesized them into these notes: "${generatedNotes.slice(0, 5000)}". Acknowledge that the notes are ready. Then, teach the VERY FIRST core concept from the notes in 2-3 short, friendly sentences. Finally, ask a single question to test their understanding of it. ALWAYS end your turn after the question so the student can answer.`;

      await generateAIResponse(aiPrompt, [
        { role: 'system', content: `You are an incredibly friendly, empathetic, and human-like personal AI teacher for ${userNameRef.current}. Keep your responses relatively short, conversational and encouraging.` }
      ]);

    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error processing files.');
      setShowUploadDrawer(true);
    } finally {
      setUploadLoading(false);
      setUploadStatus('');
    }
  };

  const handleUserSpeech = async (text) => {
    if (stepRef.current === 2) return;

    messagesRef.current.push({ role: 'user', content: text });

    if (stepRef.current === 1) {
      if (filter.isProfane(text)) {
        speakAndAdvance("I'm sorry, I cannot use that name. Please tell me your real name.", 1);
        return;
      }
      userNameRef.current = text;
      localStorage.setItem('aiTeacherUserName', text);
      speakAndAdvance(`Nice to meet you, ${text}. Please upload the study materials you would like me to test you on today using the drawer below.`, 2);
    }
    else if (stepRef.current === 3) {
      await generateAIResponse(text, [
        {
          role: 'system', content: `You are an incredibly friendly, empathetic, and human-like personal AI teacher for ${userNameRef.current}. 
Your goal is to teach the following study material chunk by chunk, then test their understanding.
STUDY MATERIAL: ${studyMaterialRef.current.slice(0, 8000)}

RULES:
1. ALWAYS wait for the student to speak. NEVER answer your own questions.
2. Evaluate the student's previous answer. Be encouraging and friendly!
3. Teach the next core concept from the notes in 2-3 short, conversational sentences.
4. Immediately after teaching the concept, ask ONE question to test their understanding. Stop speaking immediately after asking.
5. If the material is fully covered and the student demonstrates clear understanding, conclude by saying "[SESSION COMPLETE]".` },
        ...messagesRef.current.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      ]);
    }
  };

  const startSpeakerVisualizer = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!speakerAnalyserRef.current) {
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      try {
        const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(audioCtxRef.current.destination);
        speakerAnalyserRef.current = analyser;
      } catch (err) {
        console.error("Could not create media element source:", err);
      }
    }

    if (!speakerAnalyserRef.current) return;

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    const analyser = speakerAnalyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateSpeakerVol = () => {
      if (!isSpeakingRef.current) {
        setSpeakerVolume(0);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      let avg = sum / dataArray.length;
      if (avg < 5) avg = 0; // Noise gate
      setSpeakerVolume(avg);
      requestAnimationFrame(updateSpeakerVol);
    };
    updateSpeakerVol();
  };

  const speakAndAdvance = async (text, nextStep) => {
    setIsSpeaking(true);
    isSpeakingRef.current = true;

    if (recognitionRef.current && isListening) {
      recognitionRef.current.abort();
      setIsListening(false);
      isListeningRef.current = false;
    }

    messagesRef.current.push({ role: 'ai', content: text });
    if (nextStep !== undefined) {
      stepRef.current = nextStep;
      setUiStep(nextStep);
    }

    try {
      // Clean newlines, double quotes, and special shell characters so it doesn't crash the Node server's exec()
      const safeTextForTTS = text.replace(/[\n\r]+/g, ' ').replace(/"/g, "'").replace(/[$\\]/g, '');
      const response = await fetch('https://dwenlite-backend.fly.dev/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: safeTextForTTS })
      });

      if (!response.ok) throw new Error('TTS failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        initAudioContext();
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }

        audioRef.current.src = url;
        startSpeakerVisualizer();
        audioRef.current.play().catch(err => {
          console.error("Audio playback prevented:", err);
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          if (stepRef.current === 2) {
            setShowUploadDrawer(true);
          } else {
            startListening();
          }
        });

        audioRef.current.onended = () => {
          setIsSpeaking(false);
          isSpeakingRef.current = false;

          if (stepRef.current === 2) {
            setShowUploadDrawer(true);
          } else if (stepRef.current !== 2 && stepRef.current !== 4) {
            startListening();
          }
        };
      }
    } catch (error) {
      console.error('TTS Error:', error);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      toast.error('Failed to generate audio.');
      if (stepRef.current === 2) {
        setShowUploadDrawer(true);
      } else {
        startListening();
      }
    }
  };

  const generateAIResponse = async (prompt, history) => {
    setIsSpeaking(true);
    isSpeakingRef.current = true;
    try {
      const formattedHistory = history.map(h => `${h.role === 'system' ? 'System' : h.role === 'user' ? 'Student' : 'Teacher'}: ${h.content}`).join('\n');
      const finalPrompt = `${formattedHistory}\nStudent: ${prompt}\nTeacher:`;

      const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';
      const response = await axios.post(functionUrl, { prompt: finalPrompt });

      let aiText;
      if (response.data.choices?.[0]?.message?.content) {
        aiText = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        aiText = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid API response');
      }

      // Stop the AI from hallucinating both sides of the conversation
      const stopTokens = ['\nStudent:', '\nUser:', 'Student:', 'User:'];
      for (const token of stopTokens) {
        const idx = aiText.indexOf(token);
        if (idx !== -1 && idx > 0) {
          aiText = aiText.substring(0, idx).trim();
        }
      }

      if (aiText.startsWith('Teacher:')) {
        aiText = aiText.substring('Teacher:'.length).trim();
      }

      if (aiText.includes('[SESSION COMPLETE]')) {
        aiText = aiText.replace(/\[SESSION COMPLETE\]/g, '').trim();
        stepRef.current = 4;
        setUiStep(4);
        toast.success("Session completed successfully!");
      }

      await speakAndAdvance(aiText);

    } catch (error) {
      console.error('AI generation error:', error);
      toast.error('Failed to get AI response.');
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      if (stepRef.current !== 2 && stepRef.current !== 4) startListening();
    }
  };

  // Map 0-255 volume to a visual scale/size
  const pulseScale = isListening ? 1 + (micVolume / 255) * 0.7 : (isSpeaking ? 1 + (speakerVolume / 255) * 0.7 : 1);
  const pulseOpacity = isListening ? Math.min(1, 0.3 + (micVolume / 255)) : (isSpeaking ? Math.min(1, 0.3 + (speakerVolume / 255)) : 0.5);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center text-white gap-4 relative">
        <Link to="/dashboard" className="absolute top-6 left-6 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={32} />
        </Link>
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-gray-700">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Desktop Only</h2>
          <p className="text-lg text-gray-300">This functionality is only exclusive to desktop and PC devices not mobile or tablets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between w-full">
          <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div className="flex items-center gap-2">
            <Volume2 className="text-purple-400" />
            <span className="text-xl font-bold text-white tracking-tight">AI Teacher</span>
          </div>
        </div>

        {/* Status Indicator */}
        <AnimatePresence>
          {uploadLoading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="bg-indigo-600/20 text-indigo-300 text-center py-2 border-b border-indigo-500/20 text-sm font-medium animate-pulse relative z-10"
            >
              {uploadStatus || 'Processing files...'}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Visualizer / Avatar Area */}
        <div className="flex-1 min-h-[22rem] py-8 flex flex-col items-center justify-center bg-gray-900 relative">

          <div className="text-gray-400 text-sm h-8 font-medium animate-pulse">
            {isSpeaking
              ? 'Dwenlite is speaking...'
              : isListening && stepRef.current !== 2 && stepRef.current !== 4
                ? 'Listening...'
                : uiStep === 4
                  ? 'Session Complete!'
                  : 'Idle'}
          </div>

          <div className="relative flex items-center justify-center w-64 h-64">
            {/* Realtime Audio Pulses (For BOTH AI and User) */}
            {((isListening && stepRef.current !== 2 && stepRef.current !== 4) || isSpeaking) && (
              <>
                <motion.div
                  className={`absolute rounded-full ${isSpeaking ? 'bg-purple-500/40' : 'bg-green-500/40'}`}
                  style={{ width: 160 * pulseScale, height: 160 * pulseScale, opacity: pulseOpacity }}
                  transition={{ duration: 0.1 }}
                />
                <motion.div
                  className={`absolute rounded-full ${isSpeaking ? 'bg-purple-400/20' : 'bg-green-400/20'}`}
                  style={{ width: 160 * (pulseScale + 0.3), height: 160 * (pulseScale + 0.3), opacity: pulseOpacity * 0.7 }}
                  transition={{ duration: 0.1 }}
                />
              </>
            )}

            {/* Main Avatar Circle (Clean Fade Transition) */}
            <div
              className={`relative z-10 w-40 h-40 rounded-full flex items-center justify-center overflow-hidden transition-colors duration-500 ${isSpeaking ? 'bg-purple-600 shadow-[0_0_80px_rgba(168,85,247,0.8)]' : isListening ? 'bg-green-600 shadow-[0_0_50px_rgba(34,197,94,0.5)]' : 'bg-gray-800 border border-gray-700 shadow-xl'}`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSpeaking ? 'speak' : isListening ? 'listen' : 'idle'}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center justify-center w-full h-full"
                >
                  {/* Content inside the circle */}
                  {isSpeaking ? (
                    <motion.div
                      className="bg-white rounded-full shadow-[0_0_30px_rgba(255,255,255,0.8)]"
                      animate={{
                        width: 48 + (speakerVolume / 255) * 32,
                        height: 48 + (speakerVolume / 255) * 32
                      }}
                      transition={{ duration: 0.1 }}
                    />
                  ) : isListening ? (
                    null
                  ) : (
                    null
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Text Status Indicator below circle */}
          <div className="h-10 mt-6 flex items-center justify-center">
            {isListening && stepRef.current !== 2 && (
              <span className="text-green-400 font-medium tracking-wide">Listening...</span>
            )}
          </div>

        </div>

        {/* Upload Drawer Transition (Moved Below Avatar) */}
        <AnimatePresence>
          {showUploadDrawer && (
            <motion.div
              key="upload-drawer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-gray-800 border-t border-gray-700 overflow-hidden relative z-10"
            >
              <div className="p-8 flex flex-col items-center gap-4">
                <input
                  type="file"
                  multiple
                  onChange={(e) => setFiles([...files, ...Array.from(e.target.files)])}
                  className="hidden"
                  id="material-upload"
                />
                <label htmlFor="material-upload" className="cursor-pointer flex flex-col items-center justify-center w-full max-w-md h-40 border-2 border-dashed border-purple-500/50 rounded-xl bg-purple-500/5 hover:bg-purple-500/10 transition">
                  <Upload className="text-purple-400 mb-2 animate-bounce" size={40} />
                  <span className="text-slate-300 font-medium">Click to upload study materials</span>
                  <span className="text-xs text-slate-500 mt-1">Supports PDF, TXT, Video, Audio</span>
                </label>

                {files.length > 0 && (
                  <div className="flex flex-col gap-2 w-full max-w-md mt-4">
                    {files.map((f, i) => (
                      <div key={i} className="flex justify-between items-center bg-gray-700/50 px-4 py-2 rounded-lg border border-white/5">
                        <span className="text-sm truncate max-w-[200px] text-slate-300">{f.name}</span>
                        <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 transition p-1">
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleFileUpload}
                      disabled={uploadLoading}
                      className="mt-4 w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl transition shadow-lg shadow-purple-500/30"
                    >
                      Upload & Continue
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
    </div>
  );
};

export default AITeacher;
