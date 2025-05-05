import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth, storage } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';
import axios from 'axios';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';

function AudioPlayer({ src, className }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const progressRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', () => setIsPlaying(false));
    };
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e) => {
    const progressBar = progressRef.current;
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e) => {
    const newVolume = e.target.value;
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === '0');
  };

  const toggleMute = () => {
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className={`bg-gray-800 p-4 rounded-lg flex flex-col space-y-3 ${className}`}>
      <div className="flex items-center space-x-4">
        <button
          onClick={togglePlay}
          className="bg-green-500 text-white p-3 rounded-full hover:bg-green-600 transition-colors"
        >
          {isPlaying ? <FaPause size={16} /> : <FaPlay size={16} />}
        </button>
        <div className="flex-1">
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            className="h-1 bg-gray-600 rounded-full cursor-pointer relative"
          >
            <div
              className="h-1 bg-green-500 rounded-full absolute"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
        </div>
        <div className="text-gray-400 text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <button onClick={toggleMute} className="text-gray-300 hover:text-white">
          {isMuted || volume === 0 ? <FaVolumeMute size={16} /> : <FaVolumeUp size={16} />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-20 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
        />
      </div>
      <audio ref={audioRef} src={src} />
    </div>
  );
}

function Podcast() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [podcast, setPodcast] = useState(null);
  const [coverImage, setCoverImage] = useState('/src/podcast-cover.png');
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const generateButtonRef = useRef(null);
  const playerRef = useRef(null);

  const tutorialSteps = [
    {
      title: 'Welcome to Podcast Generation!',
      description: 'This page lets you generate a podcast from your folder’s document with background music.',
      highlightRef: null,
    },
    {
      title: 'Generate Podcast',
      description: 'Click here to create a podcast based on your latest document.',
      highlightRef: generateButtonRef,
    },
    {
      title: 'Podcast Player',
      description: 'Listen to your podcast with a Spotify-style player, including play, pause, and volume controls.',
      highlightRef: playerRef,
    },
    {
      title: 'You’re Ready!',
      description: 'Start generating and listening to your podcast!',
      highlightRef: null,
    },
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        toast.error('Please log in to view this folder.');
        navigate('/login');
        return;
      }
      fetchFolder(user.uid);
      if (!localStorage.getItem(`tutorialCompleted_podcast_${folderId}`)) {
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

      folderData.documents = folderData.documents || [];
      folderData.podcast = folderData.podcast || null;
      setFolder(folderData);
      setPodcast(folderData.podcast);
      if (folderData.podcast) {
        setCoverImage('/src/podcast-cover.png');
      }
      setLoading(false);
    } catch (err) {
      console.error('Fetch folder error:', err);
      toast.error('Failed to fetch folder. Please try again.');
      setLoading(false);
      navigate('/dashboard');
    }
  };

  const transcribeAudio = async (audioUrl) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) {
        throw new Error('AssemblyAI API key not found.');
      }

      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        {
          audio_url: audioUrl,
          auto_highlights: false,
          sentiment_analysis: false,
          content_safety: false,
          iab_categories: false,
          auto_chapters: false,
          format_text: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 30;
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
          throw new Error(`Audio transcription failed: ${checkResponse.data.error}`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) {
        throw new Error('Audio transcription timed out.');
      }
      if (!transcribedText) {
        throw new Error('Audio transcription returned empty text.');
      }
      return transcribedText;
    } catch (err) {
      throw new Error(`Audio transcription failed: ${err.message}`);
    }
  };

  const transcribeVideo = async (videoUrl) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) {
        throw new Error('AssemblyAI API key not found.');
      }

      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        {
          audio_url: videoUrl,
          auto_highlights: false,
          sentiment_analysis: false,
          content_safety: false,
          iab_categories: false,
          auto_chapters: false,
          format_text: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 60;
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
          throw new Error(`Video transcription failed: ${checkResponse.data.error}`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) {
        throw new Error('Video transcription timed out.');
      }
      if (!transcribedText) {
        throw new Error('Video transcription returned empty text.');
      }
      return transcribedText;
    } catch (err) {
      throw new Error(`Video transcription failed: ${err.message}`);
    }
  };

  const generatePodcast = async () => {
    if (!folder.documents.length) {
      toast.error('No documents available to generate a podcast.');
      return;
    }
    if (podcast) {
      toast.error('A podcast already exists. Delete it to generate a new one.');
      return;
    }

    setGenerating(true);
    try {
      const latestDocument = folder.documents.reduce((latest, doc) => {
        return new Date(doc.uploadedAt) > new Date(latest.uploadedAt) ? doc : latest;
      }, folder.documents[0]);

      let content = folder.name;
      if (latestDocument.isAudio) {
        content = await transcribeAudio(latestDocument.url);
      } else if (latestDocument.isVideo) {
        content = await transcribeVideo(latestDocument.url);
      } else {
        content = latestDocument.extractedText || folder.name;
      }

      // Generate podcast audio using gTTS via backend
      console.log('Generating podcast audio...');
      const ttsResponse = await axios.post(
        'http://localhost:3001/generate-tts',
        { text: content },
        { responseType: 'arraybuffer' }
      );

      const podcastBlob = new Blob([ttsResponse.data], { type: 'audio/mp3' });

      // Fetch background music (mixed in backend)
      const backgroundMusicUrl = await getDownloadURL(ref(storage, 'background_music/track1.mp3'));
      console.log('Background music URL:', backgroundMusicUrl);
      // Note: Background music is mixed and looped in the backend with fluent-ffmpeg.

      // Upload podcast to Firebase Storage
      const podcastRef = ref(storage, `podcasts/${folderId}/podcast.mp3`);
      await uploadBytes(podcastRef, podcastBlob);
      const downloadURL = await getDownloadURL(podcastRef);

      // Set cover image
      setCoverImage('/src/podcast-cover.png');

      // Save podcast metadata
      const podcastData = {
        id: Date.now().toString(),
        name: `${folder.name}_Podcast`,
        url: downloadURL,
        createdAt: new Date().toISOString(),
      };

      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, { podcast: podcastData });

      setFolder(prev => ({ ...prev, podcast: podcastData }));
      setPodcast(podcastData);
      toast.success('Podcast generated successfully!');
    } catch (err) {
      console.error('Podcast generation error:', err.message);
      toast.error(`Failed to generate podcast: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePodcast = async () => {
    try {
      const storageRef = ref(storage, `podcasts/${folderId}/podcast.mp3`);
      await deleteObject(storageRef);

      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, { podcast: null });

      setFolder(prev => ({ ...prev, podcast: null }));
      setPodcast(null);
      setCoverImage('/src/podcast-cover.png');
      toast.success('Podcast deleted successfully!');
    } catch (err) {
      console.error('Delete podcast error:', err);
      toast.error('Failed to delete podcast. Please try again.');
    }
  };

  const handleNextStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setShowTutorial(false);
      localStorage.setItem(`tutorialCompleted_podcast_${folderId}`, 'true');
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
          tutorialStep === 1 || tutorialStep === 2 ? 'items-start pt-4' : 'items-center'
        }`}>
          <div className="bg-gray-800 historic:p-4 sm:p-6 rounded-lg w-full max-w-sm sm:max-w-md">
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
        <h1 className="text-2xl md:text-3xl font-bold">{folder.name} - Podcast</h1>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowTutorial(true)}
            className="text-purple-400 hover:text-purple-300 text-sm md:text-base"
          >
            Show Tutorial
          </button>
          <Link
            to={`/folder/${folderId}`}
            className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base"
          >
            Back to Folder
          </Link>
        </div>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Generate Podcast</h2>
        <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
          Generate a podcast from your latest document with background music. Generation may take a few seconds.
        </p>
        <button
          ref={generateButtonRef}
          onClick={generatePodcast}
          disabled={generating || podcast}
          className={`bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full ${
            generating || podcast ? 'opacity-50 cursor-not-allowed' : ''
          } ${tutorialStep === 1 ? 'ring-4 ring-purple-500' : ''}`}
        >
          {generating ? (
            <span className="flex items-center">
              <svg
                className="animate-spin h-4 w-4 md:h-5 md:w-5 mr-2 text-white"
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
              Generating...
            </span>
          ) : (
            <>
              <span>Generate Podcast</span>
              <span>➔</span>
            </>
          )}
        </button>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Your Podcast</h2>
        {!podcast ? (
          <p className="text-gray-400 text-sm md:text-base">No podcast generated yet.</p>
        ) : (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 p-3 md:p-4 rounded-xl shadow-lg max-w-sm mx-auto">
            <img
              src={`${coverImage}?t=${Date.now()}`}
              alt="Podcast Cover"
              className="w-full max-w-[200px] mx-auto mb-3 rounded-lg shadow-md hover:shadow-xl transition-shadow aspect-square object-cover"
            />
            <div className="text-center mb-3">
              <h3 className="text-base md:text-lg font-semibold text-white">{podcast.name}</h3>
              <p className="text-gray-400 text-xs md:text-sm">
                Generated on {new Date(podcast.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div ref={playerRef} className={`mb-3 ${tutorialStep === 2 ? 'ring-4 ring-purple-500' : ''}`}>
              <AudioPlayer src={podcast.url} />
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleDeletePodcast}
                className="bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                Delete Podcast
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Podcast;