import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth, storage } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';
import axios from 'axios';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, UploadCloud, Mic, FileText, Trash2, 
  HelpCircle, BookOpen, Brain, Layers, File, 
  Video, Music, FileType, CheckCircle, X, ChevronRight,
  Loader2, Square
} from 'lucide-react';

function ViewFolder() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  
  // --- STATE ---
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // --- REFS ---
  const fileInputRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const documentsSectionRef = useRef(null);
  const studyMaterialsRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const acceptedFormats = [
    'pdf', 'docx', 'txt', 'pptx',
    'mp3', 'wav', 'm4a', 'ogg', 'flac',
    'mp4', 'mov', 'avi', 'mkv', 'webm'
  ];

  const tutorialSteps = [
    {
      title: "Welcome to Your Folder!",
      description: "This page lets you manage documents and study materials for this folder. Let's explore the features.",
      highlightRef: null,
    },
    {
      title: "Select a File",
      description: "Choose a file to upload here. You can upload PDF, Word, text, PowerPoint, audio, or video files.",
      highlightRef: fileInputRef,
    },
    {
      title: "Upload & Record",
      description: "Click to upload your selected file or record audio directly from your browser.",
      highlightRef: uploadButtonRef,
    },
    {
      title: "View Documents",
      description: "Your uploaded documents and recordings appear here. Click to view or delete them.",
      highlightRef: documentsSectionRef,
    },
    {
      title: "Study Materials",
      description: "Access AI-generated notes, quizzes, and flashcards based on your uploads here.",
      highlightRef: studyMaterialsRef,
    },
    {
      title: "You're Ready!",
      description: "You now know how to use this folder. Start uploading, recording, and studying!",
      highlightRef: null,
    },
  ];

  // --- EFFECTS ---
  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileDevice = /android|iphone|ipad|ipod|webos|blackberry|windows phone/i.test(userAgent);
    setIsMobile(isMobileDevice);

    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        toast.error('Please log in to view this folder.');
        navigate('/login');
        return;
      }
      fetchFolder(user.uid);
      if (!localStorage.getItem(`tutorialCompleted_folder_${folderId}`)) {
        setShowTutorial(true);
      }
    });
    return () => unsubscribe();
  }, [navigate, folderId]);

  // --- LOGIC ---
  const fetchFolder = async (userId) => {
    try {
      const folderRef = doc(db, 'folders', folderId);
      const folderSnap = await getDoc(folderRef);

      if (!folderSnap.exists()) {
        toast.error('Folder not found.');
        setLoading(false);
        navigate('/dashboard');
        return;
      }

      const folderData = { id: folderSnap.id, ...folderSnap.data() };
      if (folderData.user_id !== userId) {
        toast.error('You do not have permission to view this folder.');
        setLoading(false);
        navigate('/dashboard');
        return;
      }

      folderData.notes = folderData.notes || [];
      folderData.quizGroups = folderData.quizGroups || [];
      folderData.flashcardGroups = folderData.flashcardGroups || [];
      folderData.documents = folderData.documents || [];

      setFolder(folderData);
      setLoading(false);
    } catch (err) {
      console.error('Fetch folder error:', err);
      toast.error('Failed to fetch folder. Please try again.');
      setLoading(false);
      navigate('/dashboard');
    }
  };

  const extractPdfText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      const numPages = pdf.numPages;
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + ' ';
      }
      return fullText.trim() || 'No text found in the PDF.';
    } catch (error) {
      throw new Error('PDF text extraction failed: ' + error.message);
    }
  };

  const extractDocxText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      return result.value.trim() || 'No text found in the DOCX.';
    } catch (error) {
      throw new Error('DOCX text extraction failed: ' + error.message);
    }
  };

  const extractTxtText = async (file) => {
    try {
      const text = await file.text();
      return text.trim() || 'No text found in the TXT file.';
    } catch (error) {
      throw new Error('TXT text extraction failed: ' + error.message);
    }
  };

  const extractPptxText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      let text = '';
      const slideFiles = Object.keys(zip.files).filter(file => 
        file.match(/ppt\/slides\/slide\d+\.xml/)
      );
      for (const slideFile of slideFiles) {
        const xmlText = await zip.file(slideFile).async('string');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const textNodes = xmlDoc.getElementsByTagName('a:t');
        for (let i = 0; i < textNodes.length; i++) {
          text += textNodes[i].textContent + ' ';
        }
        text += '\n';
      }
      return text.trim() || 'No text found in the PPTX.';
    } catch (error) {
      throw new Error('PPTX text extraction failed: ' + error.message);
    }
  };

  const sendToDeepSeek = async (text) => {
    try {
      // Placeholder for actual DeepSeek integration
      const response = await axios.post(
        'https://api.deepseek.com/v1/process',
        { text },
        { headers: { 'Authorization': 'Bearer YOUR_DEEPSEEK_API_KEY', 'Content-Type': 'application/json' } }
      );
      return response.data.results || 'No results from Dwenlite Data Processor.';
    } catch (error) {
      console.warn('Dwenlite Data Processor API error:', error.message);
      return 'Failed to process text with Dwenlite Data Processor: ' + error.message;
    }
  };

  const extractImageBatchText = async (imageFiles) => {
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("Gemini API key is not configured.");
        }

        const parts = [
          { text: "I am providing you with multiple images. Extract and transcribe all handwritten and printed text from EACH image in order, starting from the first to the last. Do not skip any images, and clearly separate the text from each image. Ensure you capture the full context. If there are diagrams, describe them." }
        ];

        for (const file of imageFiles) {
          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
          });
          
          parts.push({
            inlineData: {
              mimeType: file.type || "image/jpeg",
              data: base64Data
            }
          });
        }

        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
          { contents: [{ parts }] },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || 'No text found in the images.';
      } catch (err) {
        console.error('Dwenlite Vision Model Error:', err.response?.data || err.message);
        const errMsg = err.response?.data?.error?.message || err.message;
        const isRateLimit = errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('503') || errMsg.toLowerCase().includes('capacity') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('unavailable') || errMsg.toLowerCase().includes('429');
        
        attempt++;
        if (isRateLimit && attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 3000));
          continue;
        }

        if (isRateLimit) {
          throw new Error('Our Dwenlite Vision Model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.');
        }
        throw new Error('Dwenlite Vision extraction failed: ' + errMsg);
      }
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileName = selectedFile.name.toLowerCase();
      const allowedExtensions = ['.pdf', '.docx', '.txt', '.pptx', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.png', '.jpg', '.jpeg', '.webp', '.heic'];
      const isValidFile = allowedExtensions.some(ext => fileName.endsWith(ext));
      if (!isValidFile) {
        toast.error('Invalid file type. Please check supported formats.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) { toast.error('Please select a file to upload.'); return; }
    if (folder.documents.length >= 1) { toast.error('Limit reached: 1 document per folder.'); setFile(null); return; }

    setUploading(true);
    try {
      let extractedText = '';
      let deepSeekResults = '';
      let isText = false;
      let isAudio = false;
      let isVideo = false;
      let extractedTextUrl = '';

      const fileExtension = file.name.split('.').pop().toLowerCase();
      const isImageExtension = ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(fileExtension);
      
      try {
        if (['pdf', 'docx', 'txt', 'pptx'].includes(fileExtension) || isImageExtension) {
          isText = true;
          if (isImageExtension) {
            extractedText = await extractImageBatchText([file]);
          } else {
            switch (fileExtension) {
              case 'pdf': extractedText = await extractPdfText(file); break;
              case 'docx': extractedText = await extractDocxText(file); break;
              case 'txt': extractedText = await extractTxtText(file); break;
              case 'pptx': extractedText = await extractPptxText(file); break;
            }
          }
          const txtBlob = new Blob([extractedText], { type: 'text/plain' });
          const txtStorageRef = ref(storage, `documents/${folderId}/extracted_${file.name}.txt`);
          await uploadBytes(txtStorageRef, txtBlob);
          extractedTextUrl = await getDownloadURL(txtStorageRef);
          deepSeekResults = await sendToDeepSeek(extractedText);
        } else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(fileExtension)) isAudio = true;
        else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExtension)) isVideo = true;
      } catch (err) {
        if (isText) {
          console.warn('Text extraction failed:', err.message);
          toast.error('Text extraction failed, but file will be uploaded.');
        }
      }

      const storageRef = ref(storage, `documents/${folderId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const documentData = {
        id: Date.now().toString(),
        name: file.name,
        url: downloadURL,
        extractedText: isText ? extractedText : '',
        extractedTextUrl: isText ? extractedTextUrl : '',
        deepSeekResults: isText ? deepSeekResults : '',
        uploadedAt: new Date().toISOString(),
        isText, isAudio, isVideo,
      };

      await updateDoc(doc(db, 'folders', folderId), { documents: [...(folder.documents || []), documentData] });
      setFolder(prev => ({ ...prev, documents: [...prev.documents, documentData] }));
      toast.success('Document uploaded successfully!');
      setFile(null);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const startAudioRecording = async () => {
    if (isMobile) { toast.error('Use your device recorder and upload the file instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      audioRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      audioRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      audioRecorderRef.current.onstop = async () => {
        const extension = mimeType === 'audio/webm' ? 'webm' : 'mp4';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadRecording(audioBlob, `audio_recording_${Date.now()}.${extension}`, false, true);
        stream.getTracks().forEach(track => track.stop());
      };

      audioRecorderRef.current.start();
      setIsRecordingAudio(true);
      toast.success('Recording started...');
    } catch (err) {
      toast.error('Check microphone permissions.');
    }
  };

  const stopAudioRecording = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      setIsRecordingAudio(false);
    }
  };

  const uploadRecording = async (blob, fileName, isVideo, isAudio) => {
    if (folder.documents.length >= 1) { toast.error('Limit reached: 1 document per folder.'); return; }
    setUploading(true);
    try {
      const storageRef = ref(storage, `documents/${folderId}/${fileName}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      const documentData = {
        id: Date.now().toString(), name: fileName, url: downloadURL,
        extractedText: '', extractedTextUrl: '', deepSeekResults: '',
        uploadedAt: new Date().toISOString(), isText: false, isAudio, isVideo,
      };

      await updateDoc(doc(db, 'folders', folderId), { documents: [...(folder.documents || []), documentData] });
      setFolder(prev => ({ ...prev, documents: [...prev.documents, documentData] }));
      toast.success('Recording uploaded!');
    } catch (err) {
      toast.error('Failed to upload recording.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId, docName, isVideo, isAudio, extractedTextUrl) => {
    try {
      await deleteObject(ref(storage, `documents/${folderId}/${docName}`));
      if (extractedTextUrl) await deleteObject(ref(storage, `documents/${folderId}/extracted_${docName}.txt`));
      
      const updatedDocuments = folder.documents.filter(doc => doc.id !== docId);
      await updateDoc(doc(db, 'folders', folderId), { documents: updatedDocuments });
      setFolder(prev => ({ ...prev, documents: updatedDocuments }));
      toast.success('Deleted successfully.');
    } catch (err) {
      toast.error('Failed to delete.');
    }
  };

  const handleNextStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) setTutorialStep(tutorialStep + 1);
    else { setShowTutorial(false); localStorage.setItem(`tutorialCompleted_folder_${folderId}`, 'true'); }
  };

  const handlePrevStep = () => { if (tutorialStep > 0) setTutorialStep(tutorialStep - 1); };

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
       <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );

  if (!folder) return null;

  return (
    <>

      {/* --- TUTORIAL OVERLAY --- */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-800 border border-purple-500/30 p-6 rounded-2xl w-full max-w-md shadow-2xl relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-t-2xl" />
              <div className="flex justify-between items-start mb-4">
                 <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <HelpCircle size={20} className="text-purple-400" />
                    {tutorialSteps[tutorialStep].title}
                 </h2>
                 <button onClick={() => setShowTutorial(false)} className="text-slate-500 hover:text-white">
                    <X size={20} />
                 </button>
              </div>
              
              <p className="text-slate-300 mb-8 leading-relaxed">
                {tutorialSteps[tutorialStep].description}
              </p>

              <div className="flex justify-between items-center">
                <button
                  onClick={handlePrevStep}
                  disabled={tutorialStep === 0}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    tutorialStep === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Previous
                </button>
                <div className="flex gap-1">
                  {tutorialSteps.map((_, idx) => (
                    <div key={idx} className={`w-2 h-2 rounded-full ${idx === tutorialStep ? 'bg-purple-500' : 'bg-slate-700'}`} />
                  ))}
                </div>
                <button
                  onClick={handleNextStep}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm font-semibold shadow-lg shadow-purple-900/20"
                >
                  {tutorialStep === tutorialSteps.length - 1 ? 'Get Started' : 'Next'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-6xl mx-auto p-4 md:p-8 pb-20">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Link 
              to="/dashboard"
              className="w-10 h-10 rounded-xl bg-slate-800/50 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-slate-700 transition-colors"
            >
              <ArrowLeft size={20} className="text-slate-300" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                 {folder.name}
              </h1>
              <p className="text-sm text-slate-400">Folder Management</p>
            </div>
          </div>

          <button
            onClick={() => setShowTutorial(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 hover:bg-slate-700 hover:border-purple-500/30 transition-all text-sm text-slate-300"
          >
            <HelpCircle size={16} /> Show Tutorial
          </button>
        </header>

        {/* --- UPLOAD SECTION --- */}
        <div ref={uploadButtonRef} className={`mb-8 ${tutorialStep === 2 ? 'ring-2 ring-purple-500 rounded-2xl ring-offset-4 ring-offset-slate-900' : ''}`}>
           <motion.div 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             className="bg-slate-800/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 md:p-8 relative overflow-hidden"
           >
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                 <UploadCloud size={120} />
              </div>

              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                 <UploadCloud className="text-purple-400" size={24} /> 
                 Add Content
              </h2>
              <p className="text-slate-400 mb-6 text-sm max-w-2xl">
                 Upload your study materials (.pdf, .docx, .txt, .pptx) or record lectures directly. 
                 Only 1 document allowed per folder.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {/* File Upload Box */}
                 <div className={`border-2 border-dashed border-slate-600 rounded-xl p-6 transition-all hover:border-purple-500/50 hover:bg-slate-800/50 group ${file ? 'border-purple-500 bg-purple-500/5' : ''}`}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="file-upload"
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.docx,.txt,.pptx,audio/*,video/*"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center h-full">
                       {file ? (
                          <>
                             <File className="text-purple-400 mb-2" size={32} />
                             <span className="font-semibold text-white text-center break-all">{file.name}</span>
                             <span className="text-xs text-purple-300 mt-1">Click to change</span>
                          </>
                       ) : (
                          <>
                             <UploadCloud className="text-slate-500 group-hover:text-purple-400 mb-3 transition-colors" size={32} />
                             <span className="text-slate-300 font-medium">Click to select file</span>
                             <span className="text-xs text-slate-500 mt-1">PDF, DOCX, Audio, Video</span>
                          </>
                       )}
                    </label>
                 </div>

                 {/* Action Buttons */}
                 <div className="flex flex-col gap-3 justify-center">
                    <button
                       onClick={handleUpload}
                       disabled={uploading || !file || isRecordingAudio}
                       className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/20"
                    >
                       {uploading ? (
                          <><Loader2 className="animate-spin" size={20} /> Uploading...</>
                       ) : (
                          <><UploadCloud size={20} /> Upload Selected File</>
                       )}
                    </button>

                    <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wider justify-center">
                       <div className="h-px bg-slate-700 w-12" /> OR <div className="h-px bg-slate-700 w-12" />
                    </div>

                    <button
                       onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
                       disabled={uploading}
                       className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border ${
                          isRecordingAudio 
                             ? 'bg-red-500/10 border-red-500 text-red-400 animate-pulse' 
                             : 'bg-slate-700 hover:bg-slate-600 border-transparent text-white'
                       }`}
                    >
                       {isRecordingAudio ? (
                          <><Square size={20} fill="currentColor" /> Stop Recording</>
                       ) : (
                          <><Mic size={20} /> Record Audio Note</>
                       )}
                    </button>
                 </div>
              </div>
           </motion.div>
        </div>

        {/* --- DOCUMENTS LIST --- */}
        <div ref={documentsSectionRef} className={`mb-8 ${tutorialStep === 3 ? 'ring-2 ring-purple-500 rounded-2xl ring-offset-4 ring-offset-slate-900' : ''}`}>
           <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                 <FileType className="text-purple-400" size={20} /> Attached Content
              </h2>
           </div>

           {folder.documents.length === 0 ? (
              <div className="bg-slate-800/30 border border-white/5 border-dashed rounded-xl p-8 text-center text-slate-500">
                 <p>No content uploaded yet.</p>
              </div>
           ) : (
              <div className="space-y-3">
                 {folder.documents.map((doc) => (
                    <motion.div 
                       initial={{ opacity: 0, x: -10 }}
                       animate={{ opacity: 1, x: 0 }}
                       key={doc.id}
                       className="bg-slate-800/60 border border-white/5 hover:border-purple-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors group"
                    >
                       <div className="flex items-center gap-3 overflow-hidden">
                          <div className="p-2 bg-slate-900 rounded-lg shrink-0 text-purple-400">
                             {doc.isAudio ? <Music size={20} /> : doc.isVideo ? <Video size={20} /> : <FileText size={20} />}
                          </div>
                          <div className="min-w-0">
                             <a 
                                href={doc.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="font-medium text-white hover:text-purple-400 truncate block transition-colors"
                             >
                                {doc.name}
                             </a>
                             <p className="text-xs text-slate-500">{new Date(doc.uploadedAt).toLocaleDateString()}</p>
                          </div>
                       </div>
                       
                       <button
                          onClick={() => handleDeleteDocument(doc.id, doc.name, doc.isVideo, doc.isAudio, doc.extractedTextUrl)}
                          className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0 self-start sm:self-center"
                       >
                          <Trash2 size={14} /> Delete
                       </button>
                    </motion.div>
                 ))}
              </div>
           )}
        </div>

        {/* --- STUDY MATERIALS GRID --- */}
        <div ref={studyMaterialsRef} className={`${tutorialStep === 4 ? 'ring-2 ring-purple-500 rounded-2xl ring-offset-4 ring-offset-slate-900' : ''}`}>
           <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <BookOpen className="text-purple-400" size={20} /> Study Tools
           </h2>
           
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link to={`/folder/${folderId}/notes`} className="group">
                 <div className="bg-slate-800/60 hover:bg-slate-800 border border-white/5 hover:border-purple-500/50 p-5 rounded-2xl transition-all h-full flex flex-col justify-between">
                    <div>
                       <div className="p-3 bg-blue-500/20 text-blue-400 w-fit rounded-xl mb-3">
                          <FileText size={24} />
                       </div>
                       <h3 className="font-bold text-lg mb-1">AI Notes</h3>
                       <p className="text-sm text-slate-400">Generate comprehensive summaries and study guides.</p>
                    </div>
                    <div className="mt-4 flex justify-end">
                       <ChevronRight className="text-slate-500 group-hover:text-white transition-colors" />
                    </div>
                 </div>
              </Link>

              <Link to={`/folder/${folderId}/quizzes`} className="group">
                 <div className="bg-slate-800/60 hover:bg-slate-800 border border-white/5 hover:border-purple-500/50 p-5 rounded-2xl transition-all h-full flex flex-col justify-between">
                    <div>
                       <div className="p-3 bg-green-500/20 text-green-400 w-fit rounded-xl mb-3">
                          <Brain size={24} />
                       </div>
                       <h3 className="font-bold text-lg mb-1">Quizzes</h3>
                       <p className="text-sm text-slate-400">Test your knowledge with AI-generated questions.</p>
                    </div>
                    <div className="mt-4 flex justify-end">
                       <ChevronRight className="text-slate-500 group-hover:text-white transition-colors" />
                    </div>
                 </div>
              </Link>

              <Link to={`/folder/${folderId}/flashcards`} className="group">
                 <div className="bg-slate-800/60 hover:bg-slate-800 border border-white/5 hover:border-purple-500/50 p-5 rounded-2xl transition-all h-full flex flex-col justify-between">
                    <div>
                       <div className="p-3 bg-orange-500/20 text-orange-400 w-fit rounded-xl mb-3">
                          <Layers size={24} />
                       </div>
                       <h3 className="font-bold text-lg mb-1">Flashcards</h3>
                       <p className="text-sm text-slate-400">Practice key concepts with spaced repetition.</p>
                    </div>
                    <div className="mt-4 flex justify-end">
                       <ChevronRight className="text-slate-500 group-hover:text-white transition-colors" />
                    </div>
                 </div>
              </Link>
           </div>
        </div>

      </div>
    </>
  );
}

export default ViewFolder;