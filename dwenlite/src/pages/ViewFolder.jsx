import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth, storage } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';
import axios from 'axios';
import JSZip from 'jszip';

function ViewFolder() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
      description: "Choose a file to upload here. You can upload PDF (.pdf), Word (.docx), text (.txt), PowerPoint (.pptx), audio, or video files.",
      highlightRef: fileInputRef,
    },
    {
      title: "Upload the File",
      description: "Click to upload your file. Text files will be extracted and saved as .txt for processing.",
      highlightRef: uploadButtonRef,
    },
    {
      title: "Record Audio",
      description: "Record live audio as an alternative way to add content. Note: Audio recording is only available on desktop devices.",
      highlightRef: uploadButtonRef,
    },
    {
      title: "View Documents",
      description: "Your uploaded documents and recordings appear here. Click to view or delete them.",
      highlightRef: documentsSectionRef,
    },
    {
      title: "Study Materials",
      description: "Access notes, quizzes, flashcards, and podcasts for this folder from these links.",
      highlightRef: studyMaterialsRef,
    },
    {
      title: "You're Ready!",
      description: "You now know how to use this folder. Start uploading, recording, and studying!",
      highlightRef: null,
    },
  ];

  useEffect(() => {
    // Detect mobile devices
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
      const response = await axios.post(
        'https://api.deepseek.com/v1/process',
        { text },
        {
          headers: {
            'Authorization': 'Bearer YOUR_DEEPSEEK_API_KEY',
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data.results || 'No results from DeepSeek.';
    } catch (error) {
      console.warn('DeepSeek API error:', error.message);
      return 'Failed to process text with DeepSeek: ' + error.message;
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileName = selectedFile.name.toLowerCase();
      const allowedExtensions = [
        '.pdf', '.docx', '.txt', '.pptx',
        '.mp3', '.wav', '.m4a', '.ogg', '.flac',
        '.mp4', '.mov', '.avi', '.mkv', '.webm'
      ];
      const isValidFile = allowedExtensions.some(ext => fileName.endsWith(ext));
      if (!isValidFile) {
        toast.error('Only .pdf, .docx, .txt, .pptx, audio (mp3, wav, m4a, ogg, flac), or video (mp4, mov, avi, mkv, webm) files are allowed.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload.');
      return;
    }

    if (folder.documents.length >= 1) {
      toast.error('This folder already has a document. Only one document is allowed per folder. Delete the existing document to upload a new one.');
      setFile(null);
      return;
    }

    setUploading(true);
    try {
      let extractedText = '';
      let deepSeekResults = '';
      let isText = false;
      let isAudio = false;
      let isVideo = false;
      let extractedTextUrl = '';

      const fileExtension = file.name.split('.').pop().toLowerCase();
      try {
        if (['pdf', 'docx', 'txt', 'pptx'].includes(fileExtension)) {
          isText = true;
          switch (fileExtension) {
            case 'pdf':
              extractedText = await extractPdfText(file);
              break;
            case 'docx':
              extractedText = await extractDocxText(file);
              break;
            case 'txt':
              extractedText = await extractTxtText(file);
              break;
            case 'pptx':
              extractedText = await extractPptxText(file);
              break;
          }
          const txtBlob = new Blob([extractedText], { type: 'text/plain' });
          const txtFileName = `extracted_${file.name}.txt`;
          const txtStorageRef = ref(storage, `documents/${folderId}/${txtFileName}`);
          await uploadBytes(txtStorageRef, txtBlob);
          extractedTextUrl = await getDownloadURL(txtStorageRef);
          deepSeekResults = await sendToDeepSeek(extractedText);
        } else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(fileExtension)) {
          isAudio = true;
        } else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExtension)) {
          isVideo = true;
        }
      } catch (err) {
        if (isText) {
          console.warn('Text extraction or DeepSeek processing failed:', err.message);
          toast('Text extraction or processing failed. File will still be uploaded.', {
            style: {
              background: '#fefcbf',
              color: '#744210',
            },
          });
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
        isText,
        isAudio,
        isVideo,
      };

      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        documents: [...(folder.documents || []), documentData],
      });

      setFolder(prev => ({
        ...prev,
        documents: [...prev.documents, documentData],
      }));

      toast.success('Document uploaded successfully!');
      setFile(null);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.message || 'Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const startAudioRecording = async () => {
    if (isMobile) {
      toast.error('Audio recording is only available on desktop devices. Please use your device\'s built-in recorder and upload the file.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      audioRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      audioRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      audioRecorderRef.current.onstop = async () => {
        const extension = mimeType === 'audio/webm' ? 'webm' : 'mp4';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadRecording(audioBlob, `audio_recording_${Date.now()}.${extension}`, false, true);
        stream.getTracks().forEach(track => track.stop());
      };

      audioRecorderRef.current.start();
      setIsRecordingAudio(true);
      toast.success('Audio recording started!');
    } catch (err) {
      console.error('Audio recording error:', err);
      toast.error('Failed to start audio recording. Please check microphone permissions.');
    }
  };

  const stopAudioRecording = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      setIsRecordingAudio(false);
    }
  };

  const uploadRecording = async (blob, fileName, isVideo, isAudio) => {
    if (folder.documents.length >= 1) {
      toast.error('This folder already has a document. Only one document is allowed per folder. Delete the existing document to upload a new one.');
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `documents/${folderId}/${fileName}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      const documentData = {
        id: Date.now().toString(),
        name: fileName,
        url: downloadURL,
        extractedText: '',
        extractedTextUrl: '',
        deepSeekResults: '',
        uploadedAt: new Date().toISOString(),
        isText: false,
        isAudio,
        isVideo,
      };

      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        documents: [...(folder.documents || []), documentData],
      });

      setFolder(prev => ({
        ...prev,
        documents: [...prev.documents, documentData],
      }));

      toast.success('Audio recording uploaded successfully!');
    } catch (err) {
      console.error('Recording upload error:', err);
      toast.error('Failed to upload recording. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId, docName, isVideo, isAudio, extractedTextUrl) => {
    try {
      const storageRef = ref(storage, `documents/${folderId}/${docName}`);
      await deleteObject(storageRef);

      if (extractedTextUrl) {
        const txtStorageRef = ref(storage, `documents/${folderId}/extracted_${docName}.txt`);
        await deleteObject(txtStorageRef);
      }

      const updatedDocuments = folder.documents.filter(doc => doc.id !== docId);
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        documents: updatedDocuments,
      });

      setFolder(prev => ({
        ...prev,
        documents: updatedDocuments,
      }));

      toast.success('Document deleted successfully!');
    } catch (err) {
      console.error('Delete document error:', err);
      toast.error('Failed to delete document. Please try again.');
    }
  };

  const handleNextStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setShowTutorial(false);
      localStorage.setItem(`tutorialCompleted_folder_${folderId}`, 'true');
    }
  };

  const handlePrevStep = () => {
    if (tutorialStep > 0) {
      setTutorialStep(tutorialStep - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="flex items-center">
          <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Unable to load folder.</p>
          <Link
            to="/dashboard"
            className="mt-4 inline-block bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      {showTutorial && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 flex justify-center z-50 px-4 ${
          tutorialStep === 1 || tutorialStep === 2 || tutorialStep === 3 || tutorialStep === 4 ? 'items-start pt-4' : 'items-center'
        }`}>
          <div className="bg-gray-800 p-4 sm:p-6 rounded-lg w-full max-w-sm sm:max-w-md">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">{tutorialSteps[tutorialStep].title}</h2>
            <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">{tutorialSteps[tutorialStep].description}</p>
            <div className="flex justify-between items-center">
              <button
                onClick={handlePrevStep}
                disabled={tutorialStep === 0}
                className={`py-1 px-3 sm:py-2 sm:px-4 rounded-lg text-xs sm:text-sm ${
                  tutorialStep === 0
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                Previous
              </button>
              <span className="text-gray-400 text-xs sm:text-sm">
                {tutorialStep + 1} / {tutorialSteps.length}
              </span>
              <button
                onClick={handleNextStep}
                className="bg-purple-600 text-white py-1 px-3 sm:py-2 sm:px-4 rounded-lg hover:bg-purple-700 text-xs sm:text-sm"
              >
                {tutorialStep === tutorialSteps.length - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">{folder.name}</h1>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowTutorial(true)}
            className="text-purple-400 hover:text-purple-300 text-sm md:text-base"
          >
            Show Tutorial
          </button>
          <Link
            to="/dashboard"
            className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
      <div className={`mb-6 md:mb-8 ${tutorialStep === 1 || tutorialStep === 2 || tutorialStep === 3 ? 'ring-4 ring-purple-500' : ''}`}>
        <h2 className="text-lg md:text-xl font-semibold mb-2 md:mb-3">Upload Document, Audio, or Video</h2>
        <p className="text-purple-400 text-sm md:text-base mb-3 animate-pulse-glow">
          Accepted formats: {acceptedFormats.map(fmt => `.${fmt}`).join(', ')}
        </p>
        <div className="bg-gray-800 p-3 md:p-4 rounded-lg">
          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className={`mb-3 text-sm md:text-base text-gray-300 ${tutorialStep === 1 ? 'ring-4 ring-purple-500' : ''}`}
              accept=".pdf,.docx,.txt,.pptx,audio/*,video/*"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:space-x-3 space-y-3 sm:space-y-0">
            <button
              ref={uploadButtonRef}
              onClick={handleUpload}
              disabled={uploading || !file || isRecordingAudio}
              className={`flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base flex items-center justify-center ${
                uploading || !file || isRecordingAudio ? 'opacity-50 cursor-not-allowed' : ''
              } ${tutorialStep === 2 ? 'ring-4 ring-purple-500' : ''}`}
            >
              {uploading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin h-4 w-4 mr-2 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Uploading...
                </span>
              ) : (
                'Upload Document'
              )}
            </button>
            <button
              onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
              disabled={uploading}
              className={`flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 text-sm md:text-base flex items-center justify-center ${
                uploading ? 'opacity-50 cursor-not-allowed' : ''
              } ${tutorialStep === 3 ? 'ring-4 ring-purple-500' : ''}`}
            >
              {isRecordingAudio ? (
                <span className="flex items-center">
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop Audio
                </span>
              ) : (
                <span className="flex items-center">
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="2" />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                  Record Audio
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div ref={documentsSectionRef} className={`mb-6 md:mb-8 ${tutorialStep === 4 ? 'ring-4 ring-purple-500' : ''}`}>
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Uploaded Documents and Recordings</h2>
        {folder.documents.length === 0 ? (
          <p className="text-gray-400 text-sm md:text-base">No documents or recordings uploaded yet.</p>
        ) : (
          folder.documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-gray-800 p-3 md:p-4 rounded-lg mb-3 md:mb-4 w-full overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline text-sm md:text-base truncate max-w-[70%] sm:max-w-[60%]"
                >
                  {doc.name} {doc.isAudio ? '(Audio)' : doc.isVideo ? '(Video)' : `(${doc.name.split('.').pop().toUpperCase()})`}
                </a>
                <div className="flex items-center space-x-3 shrink-0">
                  <span className="text-gray-400 text-sm truncate">
                    Uploaded on {new Date(doc.uploadedAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleDeleteDocument(doc.id, doc.name, doc.isVideo, doc.isAudio, doc.extractedTextUrl)}
                    className="bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700 text-sm shrink-0"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div ref={studyMaterialsRef} className={`mb-6 md:mb-8 ${tutorialStep === 5 ? 'ring-4 ring-purple-500' : ''}`}>
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Study Materials</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <Link
            to={`/folder/${folderId}/notes`}
            className="bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base"
          >
            <span>Notes</span>
            <span>➔</span>
          </Link>
          <Link
            to={`/folder/${folderId}/quizzes`}
            className="bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base"
          >
            <span>Quizzes</span>
            <span>➔</span>
          </Link>
          <Link
            to={`/folder/${folderId}/flashcards`}
            className="bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base"
          >
            <span>Flashcards</span>
            <span>➔</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ViewFolder;