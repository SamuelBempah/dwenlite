import React, { useState, useEffect, useRef } from 'react';
import { Filter } from 'bad-words';
import { Volume2, User, ArrowLeft, Upload, X, Mic, Pause, Play, Edit2, Check, PhoneOff, Hand, Maximize, Minimize } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import axios from 'axios';

const filter = new Filter();

const AITeacher = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const isMobileRef = useRef(window.innerWidth < 1024);
  const [isSpeechSupported, setIsSpeechSupported] = useState(
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      isMobileRef.current = window.innerWidth < 1024;
    };
    window.addEventListener('resize', handleResize);

    // 1. Check for Brave browser (reports having the API but blocks it)
    if (navigator.brave && navigator.brave.isBrave) {
      navigator.brave.isBrave().then(isBrave => {
        if (isBrave) setIsSpeechSupported(false);
      });
    }

    // 2. Check for Firefox or other browsers with known broken implementations
    // Even if users enable the about:config flag in Firefox, it lacks a default cloud backend
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('firefox') || ua.includes('tor')) {
      setIsSpeechSupported(false);
    }

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const stepRef = useRef(0);
  const userNameRef = useRef('');
  const studyMaterialRef = useRef('');
  const messagesRef = useRef([]);

  // New States
  const [sessionTime, setSessionTime] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [showNameEditModal, setShowNameEditModal] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentCaption, setCurrentCaption] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Timer Effect
  useEffect(() => {
    let interval;
    if (isTimerActive) {
      interval = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerActive]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const saveSessionState = () => {
    if (stepRef.current >= 3) {
      try {
        localStorage.setItem('aiTeacherSession', JSON.stringify({
          step: stepRef.current,
          userName: userNameRef.current,
          studyMaterial: studyMaterialRef.current,
          messages: messagesRef.current,
          sessionTime: sessionTime
        }));
      } catch (e) {
        console.warn("Could not save session state (likely quota exceeded)", e);
      }
    }
  };

  const clearSessionState = () => {
    localStorage.removeItem('aiTeacherSession');
    setIsTimerActive(false);
    setSessionTime(0);
  };

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRaisingHand, setIsRaisingHand] = useState(false);

  const togglePause = () => {
    if (audioRef.current) {
      if (isPaused) {
        audioRef.current.play().then(() => {
          setIsPaused(false);
          isPausedRef.current = false;
          setIsSpeaking(true);
          isSpeakingRef.current = true;
          startSpeakerVisualizer();
        }).catch(err => console.error(err));
      } else {
        audioRef.current.pause();
        setIsPaused(true);
        isPausedRef.current = true;
        setIsSpeaking(false);
        isSpeakingRef.current = false;
      }
    }
  };

  const raiseHand = () => {
    setIsRaisingHand(true);
    currentAudioSessionRef.current += 1; // abort current queue
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPaused(false);
    isPausedRef.current = false;
    speakAndAdvance("I see you have a question! What's on your mind?", stepRef.current);
  };

  // Realtime Audio Data
  const [speakerVolume, setSpeakerVolume] = useState(0);
  const [micVolume, setMicVolume] = useState(0);

  // File Upload State
  const [uiStep, setUiStep] = useState(0);
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const uploadLoadingRef = useRef(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const initializedRef = useRef(false);

  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isPausedRef = useRef(false);

  const audioQueueRef = useRef([]);
  const currentAudioSessionRef = useRef(0);

  const audioCtxRef = useRef(null);
  const speakerAnalyserRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const micStreamRef = useRef(null);

  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const silenceTimerRef = useRef(null);
  const isHoldingMicRef = useRef(false);

  // Create AudioContext ONCE on interaction (for Mic only)
  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = !isMobileRef.current;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        interimTranscriptRef.current = interimTranscript;
        const currentText = (finalTranscriptRef.current + interimTranscript).trim();

        if (!isMobileRef.current) {
          clearTimeout(silenceTimerRef.current);
          if (currentText.length > 0) {
            silenceTimerRef.current = setTimeout(() => {
              if (currentText.length > 0) {
                const textToSend = currentText;
                finalTranscriptRef.current = '';
                recognition.stop();
                handleUserSpeech(textToSend);
              }
            }, 2000);
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error('Speech recognition error', event.error);
        }
      };

      recognition.onend = () => {
        if (isMobileRef.current) {
          // If the browser auto-stopped the mic due to silence, but the user is STILL holding the button, restart it!
          if (isHoldingMicRef.current) {
            try {
              recognition.start();
            } catch(e) {}
            return;
          }

          const currentText = (finalTranscriptRef.current + (interimTranscriptRef.current || '')).trim();
          if (currentText.length > 0 && isListeningRef.current) {
            const textToSend = currentText;
            finalTranscriptRef.current = '';
            interimTranscriptRef.current = '';
            setIsListening(false);
            isListeningRef.current = false;
            stopMicVisualizer();
            handleUserSpeech(textToSend);
          } else {
             // If they just tapped it and no speech was recorded, keep it in listening mode so they can try again.
             // We still clear the transcript just in case.
             finalTranscriptRef.current = '';
             interimTranscriptRef.current = '';
          }
        } else {
          // Persistent Listening Logic for Desktop
          if (!isSpeakingRef.current && stepRef.current !== 2 && stepRef.current !== 4 && !showUploadDrawer) {
            try {
              recognitionRef.current.start();
            } catch (e) { }
          } else {
            setIsListening(false);
            isListeningRef.current = false;
            stopMicVisualizer();
          }
        }
      };

      recognitionRef.current = recognition;
    } else {
      toast.error('Your browser does not support speech recognition. Please use Chrome.');
    }

    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (recognitionRef.current) recognitionRef.current.abort();
      setIsListening(false);
      isListeningRef.current = false;
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const handleStartSession = () => {
    setHasStarted(true);
    initAudioContext();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    const storedSessionJSON = localStorage.getItem('aiTeacherSession');
    if (storedSessionJSON) {
      try {
        const storedSession = JSON.parse(storedSessionJSON);
        userNameRef.current = storedSession.userName || localStorage.getItem('aiTeacherUserName') || '';
        if (storedSession.step === 3 && storedSession.studyMaterial) {
          stepRef.current = 3;
          setUiStep(3);
          setSessionTime(storedSession.sessionTime || 0);
          setIsTimerActive(true);
          studyMaterialRef.current = storedSession.studyMaterial;
          messagesRef.current = storedSession.messages || [];
          speakAndAdvance(`Welcome back, ${userNameRef.current}! We didn't finish our last session, so let's pick up right where we left off.`, 3);
          return;
        }
      } catch (e) {
        console.error("Error parsing session state", e);
      }
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

  const extractPptxText = async (file) => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      let fullText = '';

      const slideRegex = /ppt\/slides\/slide\d+\.xml/;
      const slidePaths = Object.keys(contents.files).filter(path => slideRegex.test(path));

      for (const slidePath of slidePaths) {
        const xmlString = await contents.file(slidePath).async('text');
        const textMatches = xmlString.match(/<a:t>([\s\S]*?)<\/a:t>/g);
        if (textMatches) {
          const slideText = textMatches.map(tag => tag.replace(/<\/?a:t>/g, '')).join(' ');
          fullText += slideText + '\n\n';
        }
      }

      return fullText.trim() || 'No text found in the PPTX.';
    } catch (error) {
      throw new Error('PPTX extraction failed: ' + error.message);
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
    uploadLoadingRef.current = true;

    try {
      let combinedText = '';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStatus(`Processing ${file.name}...`);

        const fileType = file.type;
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const isAudio = fileType.startsWith('audio/') || ['mp3', 'wav', 'm4a'].includes(fileExtension);
        const isVideo = fileType.startsWith('video/') || ['mp4', 'mov', 'avi'].includes(fileExtension);
        const isPptx = fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || fileType === 'application/vnd.ms-powerpoint' || ['ppt', 'pptx'].includes(fileExtension);
        const isText = fileType === 'text/plain' || fileType === 'application/pdf' || ['txt', 'pdf'].includes(fileExtension) || isPptx;

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
          if (fileExtension === 'txt' || fileType === 'text/plain') extractedText = await file.text();
          else if (fileExtension === 'pdf' || fileType === 'application/pdf') extractedText = await extractPdfText(file);
          else if (isPptx) extractedText = await extractPptxText(file);
        }

        combinedText += `\n\n--- Content from ${file.name} ---\n${extractedText}`;
      }

      if (!combinedText.trim()) throw new Error("No readable text was found in the uploaded files.");

      // Step 2: Generate detailed notes
      setUploadStatus('Getting ready, please wait...');
      const notesPrompt = `You are an expert teacher. Restructure the following raw material into detailed, comprehensive study notes. Ensure you do not leave any important information out, as this will be your entire knowledge base. Material: "${combinedText}"`;
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
      setIsTimerActive(true);

      const aiPrompt = `The user ${userNameRef.current} has provided study materials. You synthesized them into these notes: "${generatedNotes}". Acknowledge that the notes are ready. Then, teach the VERY FIRST core concept from the notes in 2-3 short, friendly sentences. Finally, ask a single question to test their understanding of it. ALWAYS end your turn after the question so the student can answer.`;

      await generateAIResponse(aiPrompt, [
        { role: 'system', content: `You are an incredibly friendly, empathetic, and human-like personal AI teacher for ${userNameRef.current}. You are the absolute best at teaching, especially for students with ADHD. You make learning highly engaging, memorable, and easy to digest. Your goal is to cover ALL of the study materials comprehensively. Express emotions naturally using your words. NEVER use emojis, asterisks (like *smiles*), brackets for actions, markdown formatting, or underscores (like __bold__) as the text-to-speech engine will read them out loud. Keep your responses relatively short, conversational and encouraging. IMPORTANT STT RULE: The student's input is from a Speech-to-Text engine. If a sentence contains words that sound similar but make no contextual sense (e.g., 'eye sea' instead of 'I see'), you MUST infer their true phonetic meaning and respond to what they actually meant. Don't point out the typo, just answer naturally. BACKGROUND NOISE RULE: If the student's transcript contains random background chatter from other people that is irrelevant to the study material, completely ignore it and only focus on the student's actual question or answer.` }
      ]);

    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error processing files.');
      setShowUploadDrawer(true);
    } finally {
      setUploadLoading(false);
      uploadLoadingRef.current = false;
      setUploadStatus('');
    }
  };

  const handleUserSpeech = async (text) => {
    if (stepRef.current === 2) return;

    messagesRef.current.push({ role: 'user', content: text });
    saveSessionState();

    if (stepRef.current === 1) {
      if (pendingName) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('yes') || lowerText.includes('yeah') || lowerText.includes('correct') || lowerText.includes('right') || lowerText.includes('yep')) {
          userNameRef.current = pendingName;
          localStorage.setItem('aiTeacherUserName', pendingName);
          setPendingName('');
          speakAndAdvance(`Nice to meet you, ${pendingName}. Please upload the study materials you would like me to test you on today using the upload button below.`, 2);
        } else {
          setPendingName('');
          speakAndAdvance("My apologies. Could you please tell me your name again?", 1);
        }
      } else {
        if (filter.isProfane(text)) {
          speakAndAdvance("I'm sorry, I cannot use that name. Please tell me your real name.", 1);
          return;
        }

        let proposedName = text.replace(/my name is/i, '').replace(/i am/i, '').replace(/i'm/i, '').replace(/call me/i, '').trim();
        if (!proposedName) proposedName = text;

        setPendingName(proposedName);
        speakAndAdvance(`Did you say your name is ${proposedName}?`, 1);
      }
    }
    else if (stepRef.current === 3) {
      await generateAIResponse(text, [
        {
          role: 'system', content: `You are an incredibly friendly, empathetic, and human-like personal AI teacher for ${userNameRef.current}. 
You are the absolute best at teaching, especially for students with ADHD. You make learning highly engaging, memorable, and easy to digest.
Your goal is to teach ALL of the following study material segment by segment, testing their understanding along the way.
STUDY MATERIAL: ${studyMaterialRef.current}

RULES:
1. ALWAYS wait for the student to speak. NEVER answer your own questions.
2. Evaluate the student's answer. Be encouraging! If they struggle or answer incorrectly, simplify the concept drastically. Use vivid real-world examples, fun acronyms, or mnemonics to make it stick in their long-term memory.
3. Teach the next core concept from the notes in 2-3 short, punchy, conversational sentences. Keep their attention!
4. Periodically, ask the student if they truly understand the concept. If they say no, ask them exactly what part is confusing, and reteach it from a completely new angle until it clicks.
5. Express emotions naturally in your speech (e.g., happiness, encouragement). NEVER use emojis, asterisks (like *smiles*), brackets for actions, markdown formatting, or underscores (like __bold__) as the text-to-speech engine reads them out loud.
6. Immediately after teaching a concept, ask ONE question to test their understanding. Stop speaking immediately after asking.
7. Only when ALL material from the notes is fully covered AND you are confident the student has demonstrated clear understanding of everything, conclude by saying exactly "[SESSION COMPLETE]". Do not say this prematurely.
8. STT TRANSLATOR: The student is speaking via a Speech-to-Text engine. If their words sound phonetically similar to something else that makes sense in context, assume they meant that (e.g. "eye sea" -> "I see"). Do not point out the typo, just answer their true meaning naturally.
9. BACKGROUND NOISE FILTER: If the transcript contains random fragments of background conversations from other people that do not pertain to the study material, completely ignore them and focus only on the relevant parts of the student's input.` },
        ...messagesRef.current.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      ]);
    }
  };

  const handleMicTouchStart = (e) => {
    if (!isMobileRef.current || stepRef.current === 2 || isSpeakingRef.current || isThinking) return;

    setIsHoldingMic(true);
    isHoldingMicRef.current = true;
    if (recognitionRef.current) {
      try {
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        recognitionRef.current.start();
      } catch (err) { }
    }
  };

  const handleMicTouchEnd = (e) => {
    if (!isMobileRef.current) return;

    setIsHoldingMic(false);
    isHoldingMicRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) { }
    }
  };

  const startListening = () => {
    if (stepRef.current === 2) return;
    if (isSpeakingRef.current) return;

    setIsListening(true);
    isListeningRef.current = true;
    finalTranscriptRef.current = '';
    clearTimeout(silenceTimerRef.current);

    if (!isMobileRef.current) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) { }
      }
      startMicVisualizer();
    }
  };

  const stopSpeakerVisualizer = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!speakerAnalyserRef.current) {
      // ...
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

  const startMicVisualizer = async () => {
    if (isMobileRef.current) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMicVolume = () => {
        if (!isListeningRef.current) {
          setMicVolume(0);
          return;
        }
        if (micAnalyserRef.current) {
           micAnalyserRef.current.getByteFrequencyData(dataArray);
           let sum = 0;
           for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
           setMicVolume(sum / dataArray.length);
           requestAnimationFrame(updateMicVolume);
        }
      };
      updateMicVolume();
    } catch (err) {
      console.error("Mic visualizer error:", err);
    }
  };

  const stopMicVisualizer = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    setMicVolume(0);
  };

  const fetchAudioForSentence = async (sentence) => {
    const response = await fetch('https://dwenlite-backend.fly.dev/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentence })
    });
    if (!response.ok) throw new Error('TTS failed');
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  };

  const playAudioUrl = (url, sessionId) => {
    return new Promise((resolve, reject) => {
      initAudioContext();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      audioRef.current.src = url;
      startSpeakerVisualizer();

      const onEnded = () => {
        cleanup();
        resolve();
      };

      const onError = (e) => {
        cleanup();
        reject(e);
      };

      const cleanup = () => {
        audioRef.current.removeEventListener('ended', onEnded);
        audioRef.current.removeEventListener('error', onError);
      };

      audioRef.current.addEventListener('ended', onEnded);
      audioRef.current.addEventListener('error', onError);

      audioRef.current.play().catch(err => {
        cleanup();
        reject(err);
      });
    });
  };

  const processAudioQueue = async (sentences, sessionId) => {
    if (sentences.length === 0) return;

    let currentSentence = sentences.shift();
    let nextAudioPromise = fetchAudioForSentence(currentSentence);

    while (nextAudioPromise) {
      if (currentAudioSessionRef.current !== sessionId) break;

      try {
        const url = await nextAudioPromise;
        if (!url || currentAudioSessionRef.current !== sessionId) break;

        setCurrentCaption(currentSentence);

        let nextSentence = sentences.shift();
        nextAudioPromise = nextSentence ? fetchAudioForSentence(nextSentence) : null;
        currentSentence = nextSentence;

        await playAudioUrl(url, sessionId);
        URL.revokeObjectURL(url);

      } catch (err) {
        console.error("Audio queue error", err);
        break;
      }
    }

    if (currentAudioSessionRef.current === sessionId) {
      setCurrentCaption('');
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsPaused(false);
      isPausedRef.current = false;
      if (stepRef.current === 2 && !uploadLoadingRef.current) {
        setShowUploadDrawer(true);
      } else if (stepRef.current !== 2 && stepRef.current !== 4) {
        startListening();
      }
    }
  };

  const speakAndAdvance = async (text, nextStep) => {
    setIsSpeaking(true);
    isSpeakingRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;

    currentAudioSessionRef.current += 1;
    const sessionId = currentAudioSessionRef.current;

    if (recognitionRef.current && isListening) {
      recognitionRef.current.abort();
      finalTranscriptRef.current = '';
      clearTimeout(silenceTimerRef.current);
      setIsListening(false);
      isListeningRef.current = false;
    }

    messagesRef.current.push({ role: 'ai', content: text });
    if (nextStep !== undefined) {
      stepRef.current = nextStep;
      setUiStep(nextStep);
    }

    saveSessionState();

    try {
      const safeTextForTTS = text
        .replace(/[\n\r]+/g, ' ')
        .replace(/"/g, "'")
        .replace(/[$\\*_]/g, '')
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');

      const sentenceRegex = /[^.!?]+[.!?]+["']?(?=\s|$)/g;
      let sentences = safeTextForTTS.match(sentenceRegex);

      if (!sentences || sentences.length === 0) {
        sentences = [safeTextForTTS];
      }

      sentences = sentences.map(s => s.trim()).filter(s => s.length > 0);

      processAudioQueue(sentences, sessionId);

    } catch (error) {
      console.error('TTS Setup Error:', error);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsPaused(false);
      toast.error('Failed to start audio.');
      if (stepRef.current === 2) {
        setShowUploadDrawer(true);
      } else {
        startListening();
      }
    }
  };

  const generateAIResponse = async (prompt, history) => {
    setIsThinking(true);
    setIsRaisingHand(false);

    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.abort();
      finalTranscriptRef.current = '';
      clearTimeout(silenceTimerRef.current);
      setIsListening(false);
      isListeningRef.current = false;
    }

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
        setIsTimerActive(false);
        toast.success("Session completed successfully!");
        clearSessionState();
      }

      setIsThinking(false);
      await speakAndAdvance(aiText);

    } catch (error) {
      console.error('AI generation error:', error);
      toast.error('Failed to get AI response.');
      setIsThinking(false);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsPaused(false);
      if (stepRef.current !== 2 && stepRef.current !== 4) startListening();
    }
  };

  const endSession = () => {
    clearSessionState();
    stepRef.current = 4;
    setUiStep(4);
    setShowEndSessionModal(false);
    speakAndAdvance("Session ended. Great job studying today!", 4);
  };

  // Map 0-255 volume to a visual scale/size
  const pulseScale = isListening ? 1 + (micVolume / 255) * 0.7 : (isSpeaking ? 1 + (speakerVolume / 255) * 0.7 : 1);
  const pulseOpacity = isListening ? Math.min(1, 0.3 + (micVolume / 255)) : (isSpeaking ? Math.min(1, 0.3 + (speakerVolume / 255)) : 0.5);

  if (!isSpeechSupported) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center text-white gap-4 relative">
        <Link to="/dashboard" className="absolute top-6 left-6 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={32} />
        </Link>
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-gray-700">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Browser Not Supported</h2>
          <p className="text-lg text-gray-300">This browser does not support the voice recognition needed to use Dwenlite Teacher. Please install a different browser.</p>
        </div>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 text-center text-white relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-blue-900/10 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
        <Link to="/dashboard" className="absolute top-6 left-6 text-gray-500 hover:text-white transition-colors z-20">
          <ArrowLeft size={32} />
        </Link>
        <div className="max-w-md w-full flex flex-col items-center gap-8 z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-32 h-32 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-full flex items-center justify-center mb-4 shadow-[0_0_80px_rgba(59,130,246,0.3)]"
          >
            <Mic size={56} className="text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]" />
          </motion.div>
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight bg-gradient-to-r from-blue-100 to-blue-400 bg-clip-text text-transparent">Ready to Study?</h2>
            <p className="text-lg md:text-xl text-gray-400 font-medium">Turn up your volume and tap below to begin.</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStartSession}
            className="w-full bg-white text-black font-bold py-5 px-8 rounded-2xl transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] text-xl flex items-center justify-center gap-3 mt-4"
          >
            <Play size={28} fill="currentColor" />
            Start Session
          </motion.button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0E0E0E] text-white flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 bg-[#0E0E0E] z-50">
        <div className="flex items-center gap-4">
          <Link 
            to="/dashboard" 
            onClick={() => {
              if (isFullscreen && document.exitFullscreen) {
                document.exitFullscreen().catch(()=>{});
                setIsFullscreen(false);
              }
            }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="flex items-center gap-2">
            <Volume2 className="text-blue-500" />
            <span className="text-lg font-bold text-white tracking-tight hidden sm:block">DwenLite Teacher Session</span>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-4">
          <button onClick={toggleFullscreen} className="text-gray-400 hover:text-white transition-colors">
            {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
          </button>

          {/* Timer */}
          <AnimatePresence>
            {uiStep >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-1.5 bg-gray-800 rounded-md border border-gray-700"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                <span className="font-mono text-gray-200">{formatTime(sessionTime)}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* User Profile / Name */}
          <div className="flex items-center gap-3 relative">
            <div
              onClick={() => setShowNameEditModal(!showNameEditModal)}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 px-3 py-1.5 rounded-lg transition border border-transparent hover:border-gray-700"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold shadow-lg">
                {userNameRef.current ? userNameRef.current.charAt(0).toUpperCase() : <User size={16} />}
              </div>
              <span className="font-medium text-gray-300 hidden sm:block">
                {userNameRef.current || 'Guest'}
              </span>
              <Edit2 size={14} className="text-gray-500" />
            </div>

            {/* Name Edit Modal (Absolute) */}
            <AnimatePresence>
              {showNameEditModal && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute top-14 right-0 w-64 bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-2xl z-50"
                >
                  <h4 className="text-sm font-semibold mb-3 text-gray-200">Change your name</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newNameInput}
                      onChange={(e) => setNewNameInput(e.target.value)}
                      placeholder="New name..."
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-white"
                    />
                    <button
                      onClick={() => {
                        if (newNameInput.trim()) {
                          userNameRef.current = newNameInput.trim();
                          localStorage.setItem('aiTeacherUserName', newNameInput.trim());
                        }
                        setShowNameEditModal(false);
                        setNewNameInput('');
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Stage (Zoom-like Video Area) */}
      <div className="flex-1 p-4 md:p-6 flex flex-col items-center justify-center relative bg-[#0E0E0E] overflow-hidden min-h-0">

        <AnimatePresence>
          {uploadLoading && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: -20, x: "-50%" }}
              className="fixed top-24 left-1/2 bg-blue-600/20 text-blue-300 px-6 py-2 rounded-full border border-blue-500/20 text-sm font-medium animate-pulse z-[60] shadow-lg whitespace-nowrap"
            >
              {uploadStatus || 'Processing files...'}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Stage Container */}
        <div className="relative w-full h-full flex flex-col items-center justify-center">

          {/* Avatar Container inside Video Frame */}
          <div className="relative flex-1 flex items-center justify-center w-full min-h-0">
            {/* Realtime Audio Pulses (For BOTH AI and User) */}
            {((isListening && stepRef.current !== 2 && stepRef.current !== 4) || isSpeaking) && (
              <>
                <motion.div
                  className={`absolute rounded-full ${isSpeaking ? 'bg-blue-500/30' : 'bg-emerald-500/30'}`}
                  style={!(isMobile && isHoldingMic) ? { width: 240 * pulseScale, height: 240 * pulseScale, opacity: pulseOpacity } : undefined}
                  animate={isMobile && isHoldingMic ? { width: [240, 280, 240], height: [240, 280, 240], opacity: [0.5, 0.8, 0.5] } : undefined}
                  transition={isMobile && isHoldingMic ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.1 }}
                />
                <motion.div
                  className={`absolute rounded-full ${isSpeaking ? 'bg-blue-400/10' : 'bg-emerald-400/10'}`}
                  style={!(isMobile && isHoldingMic) ? { width: 240 * (pulseScale + 0.3), height: 240 * (pulseScale + 0.3), opacity: pulseOpacity * 0.7 } : undefined}
                  animate={isMobile && isHoldingMic ? { width: [240, 310, 240], height: [240, 310, 240], opacity: [0.3, 0.6, 0.3] } : undefined}
                  transition={isMobile && isHoldingMic ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.1 }}
                />
              </>
            )}

            {/* Emerging Floating Icons */}
            <AnimatePresence>
              {isPaused && (
                <motion.div
                  key="floating-pause"
                  initial={{ y: 0, opacity: 0, scale: 0.5 }}
                  animate={{ y: -160, opacity: 1, scale: 1.2 }}
                  exit={{ y: 0, opacity: 0, scale: 0.5 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                  className="absolute z-0 flex flex-col items-center justify-center text-yellow-500 drop-shadow-2xl"
                >
                  <Pause size={80} fill="currentColor" />
                </motion.div>
              )}

              {isRaisingHand && (
                <motion.div
                  key="floating-hand"
                  initial={{ y: 0, opacity: 0, scale: 0.5 }}
                  animate={{ y: -160, opacity: 1, scale: 2.5 }}
                  exit={{ y: 0, opacity: 0, scale: 0.5 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                  className="absolute z-0 flex flex-col items-center justify-center drop-shadow-2xl origin-bottom"
                >
                  <motion.span
                    animate={{ rotate: [0, 20, -20, 20, -20, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
                  >
                    ✋
                  </motion.span>
                </motion.div>
              )}

              {/* Thinking Glowing Spinner */}
              {(isThinking || uploadLoading) && (
                <motion.svg
                  key="thinking-spinner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, rotate: 360 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    rotate: { duration: 1.5, repeat: Infinity, ease: "linear" },
                    opacity: { duration: 0.3 }
                  }}
                  className="absolute z-0 drop-shadow-[0_0_15px_rgba(59,130,246,1)]"
                  width="220" height="220" viewBox="0 0 220 220"
                >
                  <circle
                    cx="110" cy="110" r="104"
                    fill="none"
                    stroke="url(#glow-gradient)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="160 600"
                  />
                  <defs>
                    <linearGradient id="glow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </motion.svg>
              )}
            </AnimatePresence>

            {/* Main Avatar Circle */}
            <div
              className={`relative z-10 w-48 h-48 rounded-full flex items-center justify-center overflow-hidden transition-all duration-500 ${isMobile && isListening && stepRef.current !== 2 ? 'cursor-pointer select-none ' : ''}${isHoldingMic ? 'bg-red-500 scale-95 shadow-[0_0_80px_rgba(239,68,68,0.6)]' : isSpeaking ? 'bg-blue-600 shadow-[0_0_80px_rgba(59,130,246,0.6)]' : isListening && stepRef.current !== 2 ? 'bg-emerald-600 shadow-[0_0_50px_rgba(16,185,129,0.4)]' : 'bg-[#27272A] border border-gray-700 shadow-xl'}`}
            >
              {/* TOUCH OVERLAY - Captures all events and never unmounts so touchend is guaranteed */}
              <div 
                className="absolute inset-0 z-50 rounded-full touch-none"
                onPointerDown={isMobile ? handleMicTouchStart : undefined}
                onPointerUp={isMobile ? handleMicTouchEnd : undefined}
                onPointerCancel={isMobile ? handleMicTouchEnd : undefined}
                onPointerLeave={isMobile ? handleMicTouchEnd : undefined}
              />
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSpeaking ? 'speak' : isHoldingMic ? 'recording' : isListening && stepRef.current !== 2 ? 'listen' : 'idle'}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center justify-center w-full h-full"
                >
                  {isSpeaking ? (
                    <motion.div
                      className="bg-white rounded-full shadow-[0_0_40px_rgba(255,255,255,0.9)]"
                      animate={{
                        width: 64 + (speakerVolume / 255) * 48,
                        height: 64 + (speakerVolume / 255) * 48
                      }}
                      transition={{ duration: 0.1 }}
                    />
                  ) : isHoldingMic ? (
                    <div className="flex flex-col items-center gap-2">
                       <Mic size={48} className="text-white drop-shadow-lg animate-pulse" />
                       <span className="text-white font-bold tracking-widest text-sm uppercase">Recording</span>
                    </div>
                  ) : isListening && stepRef.current !== 2 ? (
                    <div className="flex flex-col items-center gap-2">
                       <Mic size={isMobile ? 48 : 64} className="text-white opacity-90 drop-shadow-lg" />
                       {isMobile && <span className="text-white font-bold tracking-widest text-[11px] uppercase">Hold to Speak</span>}
                    </div>
                  ) : (
                    <Volume2 size={64} className="text-gray-500" />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Realtime Animated Captions */}
          <div className="w-full max-w-4xl px-6 pb-8 pt-4 text-center z-30 min-h-[5rem] flex flex-col justify-end pointer-events-none shrink-0">
            <AnimatePresence mode="wait">
              {currentCaption && (
                <motion.div
                  key={currentCaption}
                  initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
                  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                  className="inline-block"
                >
                  <p className="text-sm md:text-base font-medium tracking-wide bg-gradient-to-r from-blue-200 via-gray-100 to-purple-200 bg-clip-text text-transparent drop-shadow-md leading-relaxed pb-2 opacity-80">
                    {currentCaption}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-center px-4 md:px-6 py-4 md:py-6 bg-[#0E0E0E] z-50">
        <div className="flex items-center justify-between w-full max-w-md md:justify-center md:gap-4 md:w-auto">

          {/* Mic Button (Desktop Continuous Listening Indicator) */}
          {!isMobile && (
            <div className="flex flex-col items-center gap-1.5 w-16">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                   isListening && stepRef.current !== 2 && stepRef.current !== 4 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
              >
                <Mic size={24} />
              </div>
              <span className="text-[11px] text-gray-400 font-medium tracking-wide whitespace-nowrap">
                {isListening && stepRef.current !== 2 && stepRef.current !== 4 ? 'Listening' : 'Mic Off'}
              </span>
            </div>
          )}

          {stepRef.current === 3 && (
            <>
              <div className="hidden md:block w-px h-10 bg-gray-700 mx-1"></div>

              {/* Pause/Resume */}
              <div className="flex flex-col items-center gap-1.5 w-16">
                <button
                  onClick={togglePause}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${isPaused ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                >
                  {isPaused ? <Play size={24} className="ml-1" /> : <Pause size={24} />}
                </button>
                <span className="text-[11px] text-gray-400 font-medium tracking-wide">{isPaused ? 'Resume' : 'Pause'}</span>
              </div>

              {/* Raise Hand */}
              <div className="flex flex-col items-center gap-1.5 w-16">
                <button
                  onClick={isRaisingHand ? null : raiseHand}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${isRaisingHand ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50 opacity-70 cursor-default' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                >
                  <Hand size={24} />
                </button>
                <span className="text-[11px] text-gray-400 font-medium tracking-wide whitespace-nowrap">Raise Hand</span>
              </div>

              <div className="w-px h-10 bg-gray-700 mx-1"></div>

              {/* End Session */}
              <div className="flex flex-col items-center gap-1.5 w-16">
                <button
                  onClick={() => setShowEndSessionModal(true)}
                  className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-all shadow-lg shadow-red-600/20"
                >
                  <PhoneOff size={24} />
                </button>
                <span className="text-[11px] text-red-400 font-medium tracking-wide">End</span>
              </div>
            </>
          )}

          {stepRef.current === 2 && (
            <>
              <div className="w-px h-10 bg-gray-700 mx-1"></div>
              {/* Upload Button */}
              <div className="flex flex-col items-center gap-1.5 w-16">
                <button
                  onClick={() => setShowUploadDrawer(!showUploadDrawer)}
                  className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white transition-all shadow-lg shadow-blue-600/20"
                >
                  <Upload size={24} />
                </button>
                <span className="text-[11px] text-blue-400 font-medium tracking-wide">Upload</span>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Upload Drawer Overlay */}
      <AnimatePresence>
        {showUploadDrawer && (
          <motion.div
            key="upload-drawer"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-32 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:right-auto md:max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 z-[60]"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-100">Study Materials</h3>
              <button onClick={() => setShowUploadDrawer(false)} className="text-gray-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <input
              type="file"
              multiple
              onChange={(e) => setFiles([...files, ...Array.from(e.target.files)])}
              className="hidden"
              id="material-upload"
            />
            <label htmlFor="material-upload" className="cursor-pointer flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-blue-500/40 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 transition group">
              <Upload className="text-blue-400 mb-3 group-hover:scale-110 transition-transform" size={36} />
              <span className="text-sm text-gray-300 font-medium">Click to browse files</span>
              <span className="text-xs text-gray-500 mt-1">PDF, TXT, PPTX, Video, Audio</span>
            </label>

            {files.length > 0 && (
              <div className="flex flex-col gap-2 mt-6 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {files.map((f, i) => (
                  <div key={i} className="flex justify-between items-center bg-gray-800 px-4 py-3 rounded-xl border border-gray-700">
                    <span className="text-sm truncate max-w-[200px] text-gray-200 font-medium">{f.name}</span>
                    <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 transition p-1.5 rounded-lg hover:bg-red-400/10">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <button
                onClick={handleFileUpload}
                disabled={uploadLoading}
                className="mt-6 w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition shadow-lg shadow-blue-600/30 text-lg"
              >
                Start Session
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* End Session Modal Overlay */}
      <AnimatePresence>
        {showEndSessionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-gray-700 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <PhoneOff size={32} className="text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">End Session?</h3>
              <p className="text-gray-400 mb-8 text-sm">Are you sure you want to end this study session early? Your progress will be cleared.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndSessionModal(false)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={endSession}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold transition shadow-lg shadow-red-600/20"
                >
                  End Session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
    </div>
  );
};

export default AITeacher;
