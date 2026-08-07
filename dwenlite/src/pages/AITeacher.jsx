import React, { useState, useEffect, useRef } from 'react';
import { Filter } from 'bad-words';
import { Volume2, User, ArrowLeft, Upload, X, Mic, Pause, Play, Edit2, Check, PhoneOff, Hand, Users, Copy } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import axios from 'axios';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

const filter = new Filter();
const BACKEND_URL = 'https://dwenlite-backend.fly.dev';

const AITeacher = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCodeParam = searchParams.get('room');

  const [isHost, setIsHost] = useState(!roomCodeParam);
  const [roomCode, setRoomCode] = useState(roomCodeParam || '');
  
  // Multiplayer State
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const [participants, setParticipants] = useState([]);
  const participantsRef = useRef([]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  const [peers, setPeers] = useState({});
  const localStreamRef = useRef(null);
  const visualizerStreamRef = useRef(null);
  const remoteAudioRefs = useRef([]); // Prevents Audio garbage collection

  // Classroom State
  const [aiClassState, setAiClassState] = useState('idle'); // idle, teaching, waiting-hands, listening
  const aiClassStateRef = useRef('idle');
  const [raisedHands, setRaisedHands] = useState([]);
  const [currentSpeakerId, setCurrentSpeakerId] = useState(null);
  const currentSpeakerIdRef = useRef(null);
  const [attempts, setAttempts] = useState(0);

  // Original State
  const stepRef = useRef(0);
  const userNameRef = useRef('');
  const studyMaterialRef = useRef('');
  const messagesRef = useRef([]);

  const [sessionTime, setSessionTime] = useState(0);
  const sessionTimeRef = useRef(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [showNameEditModal, setShowNameEditModal] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRaisingHand, setIsRaisingHand] = useState(false);
  const [isHumanTalking, setIsHumanTalking] = useState(false);
  const isHumanTalkingRef = useRef(false);

  const [speakerVolume, setSpeakerVolume] = useState(0);
  const [micVolume, setMicVolume] = useState(0);

  const [uiStep, setUiStep] = useState(0);
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const showUploadDrawerRef = useRef(false);
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
  const micVisualizerRunningRef = useRef(false);

  // Sync state to refs for closures
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  
  // Forward declare handleUserSpeech ref
  const handleUserSpeechRef = useRef();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // INIT MULTIPLAYER & SOCKET
  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
       if (stepRef.current >= 2 && roomCodeRef.current && userNameRef.current) {
           newSocket.emit('join-room', roomCodeRef.current, { userName: userNameRef.current });
       }
    });

    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
      // Clone stream for visualizer before muting the original
      visualizerStreamRef.current = stream.clone();
      
      // Mute default audio so humans don't hear each other until Push to Talk
      stream.getAudioTracks().forEach(t => t.enabled = false);
      localStreamRef.current = stream;
      
      newSocket.on('user-connected', (userData) => {
        toast.success(`${userData.userName} joined the class!`);
        setParticipants(p => {
           if(!p.find(u => u.id === userData.id)) return [...p, userData];
           return p;
        });
        
        // Host initiates peer connection to new user
        if (isHostRef.current) {
          const peer = createPeer(userData.id, newSocket.id, stream, newSocket);
          setPeers(prev => ({ ...prev, [userData.id]: peer }));
          // Sync timer with new user using ai-state channel
          newSocket.emit('ai-state', roomCodeRef.current, { type: 'sync-time', time: sessionTimeRef.current });
        }
      });

      newSocket.on('user-disconnected', (userId) => {
        setParticipants(p => p.filter(u => u.id !== userId));
        setPeers(prev => {
           if(prev[userId]) prev[userId].destroy();
           const newPeers = {...prev};
           delete newPeers[userId];
           return newPeers;
        });
      });

      newSocket.on('signal', data => {
        if (data.from === newSocket.id) return; // ignore self
        
        setPeers(prev => {
          let peer = prev[data.from];
          if (!peer || peer.destroyed) {
            if (peer && peer.destroyed) peer = null;
            peer = addPeer(data.signal, data.from, stream, newSocket);
            setParticipants(p => {
               if(!p.find(u => u.id === data.from)) return [...p, {id: data.from, userName: data.userData.userName}];
               return p;
            });
            return { ...prev, [data.from]: peer };
          } else {
            try {
               peer.signal(data.signal);
            } catch(e) {
               console.warn("Error signaling peer", e);
            }
            return prev;
          }
        });
      });

      newSocket.on('ai-speak', (text) => {
         // Guest plays audio
         if(!isHost) speakAndAdvance(text);
      });

      newSocket.on('ai-state', (payload) => {
         if (typeof payload === 'object') {
             if (payload.type === 'sync-time') {
                 setSessionTime(payload.time);
                 sessionTimeRef.current = payload.time;
                 setIsTimerActive(true);
             } else if (payload.type === 'pause') {
                 if (audioRef.current) audioRef.current.pause();
                 setIsPaused(true);
                 isPausedRef.current = true;
                 setIsSpeaking(false);
                 isSpeakingRef.current = false;
             } else if (payload.type === 'resume') {
                 if (audioRef.current) {
                     audioRef.current.play().catch(e => {});
                     setIsPaused(false);
                     isPausedRef.current = false;
                     setIsSpeaking(true);
                     isSpeakingRef.current = true;
                     startSpeakerVisualizer();
                 }
             } else if (payload.type === 'class-state') {
                 setAiClassState(payload.state);
                 aiClassStateRef.current = payload.state;
             }
             return;
         }
         
         // Fallback for old simple state string format
         setAiClassState(payload);
         aiClassStateRef.current = payload;
      });

      newSocket.on('called-on', (userId) => {
         setCurrentSpeakerId(userId);
         currentSpeakerIdRef.current = userId;
         if(userId === newSocket.id) {
            toast.success("It's your turn to speak!");
            startListening(true); // force listen
         } else {
            const user = participants.find(p => p.id === userId);
            toast(`${user?.userName || 'Someone'} is speaking...`);
            if(recognitionRef.current) recognitionRef.current.abort();
         }
      });

      newSocket.on('guest-spoken', (text) => {
          if(isHostRef.current) {
              handleUserSpeechRef.current(text); // Host processes guest's speech
          }
      });

      newSocket.on('raise-hand', (user) => {
         toast(`${user.userName} raised their hand!`);
         setRaisedHands(prev => {
            if (!prev.includes(user.id)) return [...prev, user.id];
            return prev;
         });
      });
    });

    return () => {
      newSocket.disconnect();
      if(localStreamRef.current) localStreamRef.current.getTracks().forEach(t=>t.stop());
    }
  }, [isMobile, isHost]);

  const createPeer = (userToSignal, callerID, stream, socketInstance) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });
    peer.on('signal', signal => {
      socketInstance.emit('signal', { to: userToSignal, signal, userData: { userName: userNameRef.current } });
    });
    peer.on('stream', stream => {
      playRemoteStream(stream);
    });
    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream, socketInstance) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });
    peer.on('signal', signal => {
      socketInstance.emit('signal', { to: callerID, signal, userData: { userName: userNameRef.current } });
    });
    peer.signal(incomingSignal);
    peer.on('stream', stream => {
      playRemoteStream(stream);
    });
    return peer;
  };

  const playRemoteStream = (stream) => {
     const audio = new Audio();
     audio.srcObject = stream;
     audio.autoplay = true;
     remoteAudioRefs.current.push(audio);
     audio.play().catch(e => console.error("Remote audio play error", e));
  };


  // Audio Context (Local visualizer)
  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
    }
  };

  // SPEECH RECOGNITION SETUP
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let silenceTimer = null;
      let finalTranscript = '';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
          else interimTranscript += event.results[i][0].transcript;
        }
        
        const currentText = (finalTranscript + interimTranscript).trim();
        clearTimeout(silenceTimer);
        
        if (currentText) {
          if (isHumanTalkingRef.current) {
             finalTranscript = ''; // flush transcript while human talking
             return;
          }
          
          silenceTimer = setTimeout(() => {
            if (currentText && !isHumanTalkingRef.current) {
              const textToSend = currentText;
              finalTranscript = '';
              recognition.stop();
              
              if (isHostRef.current) {
                 updateAiClassState('evaluating');
                 handleUserSpeechRef.current(textToSend);
              } else if (currentSpeakerIdRef.current === socketRef.current?.id) {
                socketRef.current?.emit('guest-spoken', roomCodeRef.current, textToSend);
                setCurrentSpeakerId(null);
                currentSpeakerIdRef.current = null;
                updateAiClassState('evaluating');
              }
            }
          }, 2000);
        }
      };

      recognition.onend = () => {
        const shouldListen = stepRef.current === 1 || currentSpeakerIdRef.current === socket?.id || (!currentSpeakerIdRef.current && isHost);
        if (shouldListen && !isSpeakingRef.current && stepRef.current !== 2 && stepRef.current !== 4 && !showUploadDrawerRef.current && aiClassStateRef.current !== 'waiting-hands') {
          try { recognitionRef.current.start(); } catch (e) { }
        } else {
          setIsListening(false);
          isListeningRef.current = false;
        }
      };
      recognitionRef.current = recognition;
    }

    const storedName = localStorage.getItem('aiTeacherUserName');
    if (storedName) {
      userNameRef.current = storedName;
      if(isHost) {
        stepRef.current = 2;
        setUiStep(2);
        let rc = localStorage.getItem('aiTeacherRoomCode');
        if (!rc) {
           rc = Math.random().toString(36).substring(2, 8).toUpperCase();
           localStorage.setItem('aiTeacherRoomCode', rc);
        }
        setRoomCode(rc);
        if (socketRef.current) socketRef.current.emit('join-room', rc, { userName: storedName });
        speakAndAdvance(`Welcome back, ${storedName}! Since you are the host, please upload the study materials using the upload button below.`, 2);
      } else {
        stepRef.current = 3;
        setUiStep(3);
        if (socketRef.current) socketRef.current.emit('join-room', roomCode, { userName: storedName });
      }
    } else {
      speakAndAdvance("Welcome to Dwenlite Teacher! What should I call you?", 1);
    }

    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (recognitionRef.current) recognitionRef.current.abort();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, [isHost, socket]);


  // Timer
  useEffect(() => {
    let interval;
    if (isTimerActive) {
      interval = setInterval(() => {
         setSessionTime(p => {
           const next = p + 1;
           sessionTimeRef.current = next;
           return next;
         });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerActive]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startListening = (force = false) => {
    if (stepRef.current === 2) return;
    if (recognitionRef.current) {
      if (isSpeakingRef.current && !force) return;
      setIsListening(true);
      isListeningRef.current = true;
      try { recognitionRef.current.start(); } catch (e) {}

      // Mic visualizer
      if (navigator.mediaDevices && localStreamRef.current) {
         initAudioContext();
         if (!micAnalyserRef.current) {
             const micCtx = audioCtxRef.current;
             if(micCtx.state === 'suspended') micCtx.resume();
             const micSource = micCtx.createMediaStreamSource(visualizerStreamRef.current || localStreamRef.current);
             const micAnalyser = micCtx.createAnalyser();
             micAnalyser.fftSize = 256;
             micSource.connect(micAnalyser);
             micAnalyserRef.current = micAnalyser;
         }
         
         if (!micVisualizerRunningRef.current) {
             micVisualizerRunningRef.current = true;
             const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
             const updateMicVol = () => {
                if (!isListeningRef.current) {
                  setMicVolume(0);
                  micVisualizerRunningRef.current = false;
                  return;
                }
                micAnalyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                let avg = sum / dataArray.length;
                if (avg < 5) avg = 0;
                setMicVolume(avg);
                requestAnimationFrame(updateMicVol);
             };
             updateMicVol();
         }
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
    showUploadDrawerRef.current = false;
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
      updateAiClassState('teaching');

      const aiPrompt = `The host ${userNameRef.current} has uploaded materials. Acknowledge the materials. Teach the VERY FIRST concept. Ask ONE question. ALWAYS end your response with exactly "[WAIT_FOR_HANDS]" so I know to wait for hands.`;
      
      messagesRef.current.push({ role: 'user', content: aiPrompt });
      await generateAIResponse(aiPrompt);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error processing files.');
      setShowUploadDrawer(true);
      showUploadDrawerRef.current = true;
    } finally {
      setUploadLoading(false);
      uploadLoadingRef.current = false;
      setUploadStatus('');
    }
  };


  const handleUserSpeech = async (text) => {
    if (stepRef.current === 2) return;
    messagesRef.current.push({ role: 'user', content: text });

    if (stepRef.current === 1) {
      if (pendingName) {
        if (text.toLowerCase().includes('yes')) {
          userNameRef.current = pendingName;
          localStorage.setItem('aiTeacherUserName', pendingName);
          setPendingName('');
          
          if(isHost) {
             const rc = Math.random().toString(36).substring(2, 8).toUpperCase();
             localStorage.setItem('aiTeacherRoomCode', rc);
             setRoomCode(rc);
             if (socketRef.current) socketRef.current.emit('join-room', rc, { userName: pendingName });
             speakAndAdvance(`Nice to meet you, ${pendingName}. You are the host. Room code is ${rc}. Upload materials when ready!`, 2);
          } else {
             if (socketRef.current) socketRef.current.emit('join-room', roomCode, { userName: pendingName });
             stepRef.current = 3;
             setUiStep(3);
          }
        } else {
          setPendingName('');
          speakAndAdvance("My apologies. Could you please tell me your name again?", 1);
        }
      } else {
        let proposedName = text.replace(/my name is/i, '').replace(/i am/i, '').trim();
        setPendingName(proposedName || text);
        speakAndAdvance(`Did you say your name is ${proposedName || text}?`, 1);
      }
    }
    else if (stepRef.current === 3) {
      messagesRef.current.push({ role: 'user', content: text });
      await generateAIResponse(text);
    }
  };
  
  handleUserSpeechRef.current = handleUserSpeech;

  const generateAIResponse = async (userText) => {
    updateAiClassState('teaching');
    try {
      const allNames = participants.map(p => p.userName).join(', ');
      
      // Ensure the AI always has the study materials and rules as context
      const systemPrompt = `You are an empathetic AI teacher for a multiplayer classroom. Names of students: ${userNameRef.current} (Host), ${allNames}.
Your goal is to teach ALL of the following study material segment by segment, testing their understanding along the way.
STUDY MATERIAL: ${studyMaterialRef.current}

RULES:
1. Wait for students to speak.
2. If they are INCORRECT, explain gently and output exactly "[INCORRECT]" at the end.
3. Teach short concepts.
4. When you ask a question to the class, ALWAYS end with exactly "[WAIT_FOR_HANDS]".
5. Only say [SESSION COMPLETE] when everything is fully taught.`;

      let formattedHistory = `System: ${systemPrompt}\n`;
      messagesRef.current.forEach(m => {
        formattedHistory += `${m.role === 'user' ? 'Student' : 'Teacher'}: ${m.content}\n`;
      });
      formattedHistory += `Teacher:`;

      const response = await axios.post('https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy', { prompt: formattedHistory });
      let aiText = response.data.choices?.[0]?.message?.content || response.data.choices?.[0]?.text || "I didn't quite catch that.";
      
      // Strip out hallucinations where AI outputs "Student:"
      const stopTokens = ['\nStudent:', '\nUser:', 'Student:', 'User:'];
      for (const token of stopTokens) {
        const idx = aiText.indexOf(token);
        if (idx !== -1 && idx > 0) aiText = aiText.substring(0, idx).trim();
      }
      if (aiText.startsWith('Teacher:')) aiText = aiText.substring('Teacher:'.length).trim();
      
      let waitingHands = false;
      if (aiText.includes('[WAIT_FOR_HANDS]')) {
         aiText = aiText.replace(/\[WAIT_FOR_HANDS\]/g, '').trim();
         waitingHands = true;
      }
      
      let incorrect = false;
      if (aiText.includes('[INCORRECT]')) {
         aiText = aiText.replace(/\[INCORRECT\]/g, '').trim();
         incorrect = true;
      }

      if (aiText.includes('[SESSION COMPLETE]')) {
        aiText = aiText.replace(/\[SESSION COMPLETE\]/g, '').trim();
        stepRef.current = 4;
        setUiStep(4);
        setIsTimerActive(false);
      }

      await speakAndAdvance(aiText, null, { waitingHands, incorrect });
    } catch (error) {
      console.error('Error generating AI response:', error);
      updateAiClassState('idle');
      speakAndAdvance("I'm having trouble thinking right now. Give me a moment.");
    }
  };

  const startSpeakerVisualizer = () => {
    initAudioContext();
    if (!speakerAnalyserRef.current) {
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      try {
        const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(audioCtxRef.current.destination);
        speakerAnalyserRef.current = analyser;
      } catch (err) {}
    }
    if (!speakerAnalyserRef.current) return;
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

    const dataArray = new Uint8Array(speakerAnalyserRef.current.frequencyBinCount);
    const updateSpeakerVol = () => {
      if (!isSpeakingRef.current) {
        setSpeakerVolume(0);
        return;
      }
      speakerAnalyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      let avg = sum / dataArray.length;
      setSpeakerVolume(avg > 5 ? avg : 0);
      requestAnimationFrame(updateSpeakerVol);
    };
    updateSpeakerVol();
  };

  const speakAndAdvance = async (text, nextStep = null, options = {}) => {
    try {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      if(isHost) socketRef.current?.emit('ai-speak', roomCodeRef.current, text);
      
      const response = await axios.post(`${BACKEND_URL}/api/tts`, { text }, { responseType: 'blob' });
      const audioUrl = URL.createObjectURL(response.data);
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
        audioRef.current.onended = () => {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          if (nextStep) {
            setUiStep(nextStep);
            stepRef.current = nextStep;
          }

          if (options.incorrect) {
              const newAttempts = attempts + 1;
              setAttempts(newAttempts);
              const maxAttempts = participantsRef.current.length > 0 ? Math.min(3, participantsRef.current.length + 1) : 2;
              if (newAttempts >= maxAttempts) {
                  generateAIResponse("They didn't get it. Explain the correct answer and move on.");
                  setAttempts(0);
                  return;
              }
          } else if (options.hasOwnProperty('incorrect')) {
              setAttempts(0);
          }

          if (options.waitingHands) {
             updateAiClassState('waiting-hands');
             
             // 10 Second Timer for Hands
             setTimeout(() => {
                 updateAiClassState('idle');
                 if(isHostRef.current) {
                     setRaisedHands(currentHands => {                         
                         let chosenUser = null;
                         if (currentHands.length > 0) {
                             chosenUser = currentHands[0];
                         } else {
                             // Prioritize guests over host
                             const guests = participantsRef.current.map(p=>p.id);
                             if (guests.length > 0) {
                                 chosenUser = guests[Math.floor(Math.random() * guests.length)];
                             } else {
                                 chosenUser = socketRef.current?.id; // Fallback to host
                             }
                         }
                         
                         setCurrentSpeakerId(chosenUser);
                         currentSpeakerIdRef.current = chosenUser;
                         socketRef.current?.emit('called-on', roomCodeRef.current, chosenUser);
                         
                         const userName = chosenUser === socketRef.current?.id ? userNameRef.current : participantsRef.current.find(p=>p.id === chosenUser)?.userName;
                         speakAndAdvance(`Let's hear from ${userName || 'you'}. Go ahead!`);
                         return []; // clear hands
                     });
                 }
             }, 10000);
          } else {
             updateAiClassState('idle');
          }
        };
        startSpeakerVisualizer();
      }
    } catch (e) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }
  };

  const raiseHand = () => {
    setIsRaisingHand(true);
    if(isHost) {
        setRaisedHands(prev => {
           if (!prev.includes(socket.id)) return [...prev, socket.id];
           return prev;
        });
    } else {
        if (socketRef.current) socketRef.current.emit('raise-hand', roomCode, { userName: userNameRef.current });
    }
  };

  const togglePause = () => {
    if (audioRef.current) {
      if (isPaused) {
        audioRef.current.play().then(() => {
          setIsPaused(false);
          isPausedRef.current = false;
          setIsSpeaking(true);
          isSpeakingRef.current = true;
          startSpeakerVisualizer();
          socketRef.current?.emit('ai-state', roomCodeRef.current, { type: 'resume' });
        }).catch(err => console.error(err));
      } else {
        audioRef.current.pause();
        setIsPaused(true);
        isPausedRef.current = true;
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        socketRef.current?.emit('ai-state', roomCodeRef.current, { type: 'pause' });
      }
    }
  };

  const leaveSession = () => {
    window.location.href = '/dashboard';
  };

  const endSession = () => {
    stepRef.current = 4;
    setUiStep(4);
    setShowEndSessionModal(false);
    setIsTimerActive(false);
    if(isHost) speakAndAdvance("Class dismissed! Great job everyone.", 4);
  };

  const startHumanTalk = () => {
     if (localStreamRef.current) {
         localStreamRef.current.getAudioTracks().forEach(t => t.enabled = true);
         setIsHumanTalking(true);
         isHumanTalkingRef.current = true;
     }
  };

  const stopHumanTalk = () => {
     if (localStreamRef.current) {
         localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
         setIsHumanTalking(false);
         isHumanTalkingRef.current = false;
     }
  };

  const pulseScale = isListening ? 1 + (micVolume / 255) * 0.7 : (isSpeaking ? 1 + (speakerVolume / 255) * 0.7 : 1);
  const pulseOpacity = isListening ? Math.min(1, 0.3 + (micVolume / 255)) : (isSpeaking ? Math.min(1, 0.3 + (speakerVolume / 255)) : 0.5);

  const displayEntities = [
     { id: 'ai', type: 'ai', name: 'Dwenlite Teacher' },
     { id: socketRef.current?.id || 'self', type: 'user', name: userNameRef.current + ' (You)', isSelf: true },
     ...participants.map(p => ({ id: p.id, type: 'user', name: p.userName }))
  ];

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-[#0E0E0E] text-white flex flex-col font-sans">
      <div className="flex items-center justify-between px-6 py-4 bg-[#1A1A1A] border-b border-gray-800 z-50">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div className="flex items-center gap-2">
            <Volume2 className="text-blue-500" />
            <span className="text-lg font-bold text-white tracking-tight">Dwenlite Teacher Classroom</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {roomCode && isHost && (
             <button onClick={() => {navigator.clipboard.writeText(window.location.origin + '/ai-teacher?room='+roomCode); toast.success('Link copied!')}} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold transition-all shadow-lg shadow-blue-500/30">
                <Copy size={16} />
                <span>Share Invite Link</span>
             </button>
          )}

          {uiStep >= 3 && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-800 rounded-md border border-gray-700">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="font-mono text-gray-200">{formatTime(sessionTime)}</span>
            </div>
          )}

          <div className="flex items-center gap-3 relative">
            <div onClick={() => setShowNameEditModal(!showNameEditModal)} className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 px-3 py-1.5 rounded-lg transition border border-transparent hover:border-gray-700">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold shadow-lg">
                {userNameRef.current ? userNameRef.current.charAt(0).toUpperCase() : <User size={16} />}
              </div>
              <span className="font-medium text-gray-300 hidden sm:block">{userNameRef.current || 'Guest'}</span>
              <Edit2 size={14} className="text-gray-500" />
            </div>

            <AnimatePresence>
               {showNameEditModal && (
                 <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute top-14 right-0 w-64 bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-2xl z-50">
                   <h4 className="text-sm font-semibold mb-3 text-gray-200">Change your name</h4>
                   <div className="flex gap-2">
                     <input type="text" value={newNameInput} onChange={(e) => setNewNameInput(e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                     <button onClick={() => {if(newNameInput.trim()) {userNameRef.current = newNameInput.trim(); localStorage.setItem('aiTeacherUserName', newNameInput.trim());} setShowNameEditModal(false); setNewNameInput('');}} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg"><Check size={16} /></button>
                   </div>
                 </motion.div>
               )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 flex flex-col items-center justify-center relative bg-[#0E0E0E] overflow-hidden min-h-0">
        <AnimatePresence>
          {uploadLoading && (
            <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600/90 backdrop-blur-md text-white px-8 py-3 rounded-full border border-blue-500/50 text-base font-bold animate-pulse z-50 shadow-2xl">
              {uploadStatus || 'Processing files...'}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full h-full max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-auto-fit gap-4 md:gap-6 auto-rows-fr">
           {displayEntities.map((entity) => {
              const isAI = entity.type === 'ai';
              const isSpeakingNow = isAI ? isSpeaking : currentSpeakerIdRef.current === entity.id;
              const hasHandRaised = raisedHands.includes(entity.id);
              
              return (
                 <div key={entity.id} className={`relative bg-[#18181B] rounded-3xl border ${isSpeakingNow ? (isAI ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]') : 'border-gray-800 shadow-[0_4px_20px_rgba(0,0,0,0.5)]'} overflow-hidden flex flex-col items-center justify-center min-h-[250px] transition-all duration-300`}>
                                         {isAI ? (
                       <div className="relative flex items-center justify-center w-full h-full">
                         {((isListening && stepRef.current !== 2 && stepRef.current !== 4) || isSpeaking || aiClassState === 'evaluating') && (
                           <>
                             <motion.div className={`absolute rounded-full ${isSpeaking ? 'bg-blue-500/30' : (aiClassState === 'evaluating' ? 'bg-yellow-500/20' : 'bg-emerald-500/30')}`} style={{ width: 140 * (aiClassState === 'evaluating' ? 1.1 : pulseScale), height: 140 * (aiClassState === 'evaluating' ? 1.1 : pulseScale), opacity: (aiClassState === 'evaluating' ? 0.4 : pulseOpacity) }} transition={{ duration: 0.1 }} />
                             <motion.div className={`absolute rounded-full ${isSpeaking ? 'bg-blue-400/10' : (aiClassState === 'evaluating' ? 'bg-yellow-400/10' : 'bg-emerald-400/10')}`} style={{ width: 140 * (aiClassState === 'evaluating' ? 1.4 : pulseScale + 0.3), height: 140 * (aiClassState === 'evaluating' ? 1.4 : pulseScale + 0.3), opacity: (aiClassState === 'evaluating' ? 0.3 : pulseOpacity * 0.7) }} transition={{ duration: 0.1 }} />
                           </>
                         )}
                         <div className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center overflow-hidden transition-colors duration-500 ${isSpeaking ? 'bg-blue-600 shadow-[0_0_40px_rgba(59,130,246,0.6)]' : isListening && stepRef.current !== 2 ? 'bg-emerald-600 shadow-[0_0_30px_rgba(16,185,129,0.4)]' : aiClassState === 'evaluating' ? 'bg-yellow-600 shadow-[0_0_30px_rgba(234,179,8,0.4)] animate-pulse' : 'bg-[#27272A] border border-gray-700 shadow-xl'}`}>
                            {isSpeaking ? (
                              <motion.div className="bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.9)]" animate={{ width: 32 + (speakerVolume / 255) * 32, height: 32 + (speakerVolume / 255) * 32 }} transition={{ duration: 0.1 }} />
                            ) : isListening && stepRef.current !== 2 ? (
                              <Mic size={32} className="text-white opacity-90 drop-shadow-lg" />
                            ) : (
                              <Volume2 size={32} className={aiClassState === 'evaluating' ? "text-white" : "text-gray-500"} />
                            )}
                         </div>
                       </div>
                    ) : (
                       <div className="flex flex-col items-center justify-center">
                          <div className={`w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-xl ${entity.isSelf ? 'bg-gradient-to-tr from-blue-500 to-purple-500' : 'bg-gradient-to-tr from-gray-600 to-gray-500'}`}>
                             {entity.name.charAt(0).toUpperCase()}
                          </div>
                          {hasHandRaised && (
                             <div className="absolute top-4 right-4 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg border-2 border-gray-900">
                                <Hand size={20} className="text-white" />
                             </div>
                          )}
                       </div>
                    )}
                    
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                      {isAI ? <Volume2 size={14} className="text-blue-400" /> : <User size={14} className="text-gray-400" />}
                      <span className="text-xs font-semibold text-gray-200">{entity.name}</span>
                    </div>
                 </div>
              );
           })}
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-6 bg-[#1A1A1A] border-t border-gray-800 z-50">
         <div className="flex items-center gap-4">
            
            <div className="flex flex-col items-center gap-1.5 w-16">
              <button className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${isListening && stepRef.current !== 2 && stepRef.current !== 4 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                <Mic size={24} />
              </button>
              <span className="text-[11px] text-gray-400 font-medium tracking-wide">
                {isListening && stepRef.current !== 2 && stepRef.current !== 4 ? 'Listening' : 'Mic Off'}
              </span>
            </div>

            {stepRef.current === 3 && (
              <>
                <div className="w-px h-10 bg-gray-700 mx-1"></div>
                
                {aiClassState === 'waiting-hands' && (
                    <div className="flex flex-col items-center gap-1.5 w-16">
                      <button onClick={isRaisingHand ? null : raiseHand} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${isRaisingHand ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50 opacity-70 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white animate-bounce'}`}>
                        <Hand size={24} />
                      </button>
                      <span className="text-[11px] text-blue-400 font-medium tracking-wide">Raise Hand</span>
                    </div>
                )}
                {aiClassState !== 'waiting-hands' && isHost && (
                    <div className="flex flex-col items-center gap-1.5 w-16">
                      <button onClick={togglePause} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${isPaused ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                        {isPaused ? <Play size={24} className="ml-1" /> : <Pause size={24} />}
                      </button>
                      <span className="text-[11px] text-gray-400 font-medium tracking-wide">{isPaused ? 'Resume' : 'Pause'}</span>
                    </div>
                )}

                <div className="w-px h-10 bg-gray-700 mx-1"></div>

                <div className="flex flex-col items-center gap-1.5 w-16">
                  <button onClick={() => isHost ? setShowEndSessionModal(true) : leaveSession()} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-all shadow-lg shadow-red-600/20">
                    <PhoneOff size={24} />
                  </button>
                  <span className="text-[11px] text-red-400 font-medium tracking-wide">{isHost ? 'End' : 'Leave'}</span>
                </div>
              </>
            )}

            {stepRef.current === 2 && isHost && (
              <>
                <div className="w-px h-10 bg-gray-700 mx-1"></div>
                <div className="flex flex-col items-center gap-1.5 w-16">
                  <button onClick={() => { setShowUploadDrawer(!showUploadDrawer); showUploadDrawerRef.current = !showUploadDrawer; }} className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white transition-all shadow-lg shadow-blue-600/20">
                    <Upload size={24} />
                  </button>
                  <span className="text-[11px] text-blue-400 font-medium tracking-wide">Upload</span>
                </div>
              </>
            )}

            {stepRef.current >= 2 && (
              <>
                <div className="w-px h-10 bg-gray-700 mx-1"></div>
                <div className="flex flex-col items-center gap-1.5 w-16">
                   <button onMouseDown={startHumanTalk} onMouseUp={stopHumanTalk} onMouseLeave={stopHumanTalk} onTouchStart={startHumanTalk} onTouchEnd={stopHumanTalk} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${isHumanTalking ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                     <Users size={24} />
                   </button>
                   <span className="text-[11px] text-gray-400 font-medium tracking-wide">
                     {isHumanTalking ? 'Talking' : 'Hold to Talk'}
                   </span>
                </div>
              </>
            )}
         </div>
      </div>

      <AnimatePresence>
        {showUploadDrawer && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="absolute bottom-32 left-1/2 -translate-x-1/2 w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 z-40">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-100">Study Materials</h3>
              <button onClick={() => setShowUploadDrawer(false)} className="text-gray-400 hover:text-white transition"><X size={24} /></button>
            </div>
            <input type="file" multiple onChange={(e) => setFiles([...files, ...Array.from(e.target.files)])} className="hidden" id="material-upload" />
            <label htmlFor="material-upload" className="cursor-pointer flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-blue-500/40 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 transition group">
              <Upload className="text-blue-400 mb-3 group-hover:scale-110 transition-transform" size={36} />
              <span className="text-sm text-gray-300 font-medium">Click to browse files</span>
            </label>
            {files.length > 0 && (
              <button onClick={handleFileUpload} disabled={uploadLoading} className="mt-6 w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition shadow-lg shadow-blue-600/30 text-lg">
                Start Session
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />
    </div>
  );
};
export default AITeacher;
