import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Folder, Mic, Video, FileText, Plus, LogOut, 
  HelpCircle, MoreVertical, Edit2, Trash2, 
  LayoutDashboard, Coins, Star, Sparkles, ArrowRight, GraduationCap
} from 'lucide-react';

function Dashboard() {
  const navigate = useNavigate();
  
  // State Management
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [createFolderLoading, setCreateFolderLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [editFolderId, setEditFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [gCoins, setGCoins] = useState(0);
  const [gCoinsAnimating, setGCoinsAnimating] = useState(false);
  const [ratingStats, setRatingStats] = useState({ average: 0, count: 0 });

  // Refs for Tutorial
  const folderInputRef = useRef(null);
  const createButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const uploadSectionRef = useRef(null);
  const foldersSectionRef = useRef(null);

  const tutorialSteps = [
    { title: "Welcome to Your Study Hub!", description: "This is your dashboard. Let's get you oriented.", highlightRef: null },
    { title: "Navigation", description: "Use the sidebar (desktop) or bottom bar (mobile) to move around.", highlightRef: sidebarRef },
    { title: "Upload Content", description: "Quickly upload lectures, videos, or PDFs to generate notes.", highlightRef: uploadSectionRef },
    { title: "Name Your Folder", description: "Type a name here to organize your subject.", highlightRef: folderInputRef },
    { title: "Create It", description: "Click here to add the folder to your library.", highlightRef: createButtonRef },
    { title: "Your Library", description: "Access all your generated notes and quizzes here.", highlightRef: foldersSectionRef },
    { title: "Ready to Learn?", description: "You are all set. Start studying!", highlightRef: null },
  ];

  // --- LOGIC SECTION ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setCurrentUser(user);
        fetchFolders(user.uid);
        fetchUserGCoins(user.uid);
        fetchRatingStats();
        if (!localStorage.getItem('tutorialCompleted')) setShowTutorial(true);
      } else {
        navigate('/login');
      }
    });
    return unsubscribe;
  }, [navigate]);

  const fetchUserGCoins = async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      let userData = userSnap.exists() ? userSnap.data() : { gCoins: 30, lastCoinDrop: null };
      const today = new Date().toDateString();
      const lastCoinDrop = userData.lastCoinDrop ? new Date(userData.lastCoinDrop).toDateString() : null;
      let newGCoins = userData.gCoins || 30;

      if (newGCoins <= 30 && (!lastCoinDrop || lastCoinDrop !== today)) {
        newGCoins = Math.min(newGCoins + 3, 30);
        await setDoc(userRef, { gCoins: newGCoins, lastCoinDrop: new Date().toISOString() }, { merge: true });
        if (userData.gCoins !== newGCoins) {
          setGCoinsAnimating(true);
          setTimeout(() => setGCoinsAnimating(false), 1000);
          toast.success('Daily Bonus: +3 G_COINS!');
        }
      }
      setGCoins(newGCoins);
    } catch (err) { console.error(err); }
  };

  const fetchRatingStats = async () => {
    try {
      const q = query(collection(db, 'ratings'));
      const snap = await getDocs(q);
      const ratings = snap.docs.map(doc => doc.data().rating);
      const count = ratings.length;
      const average = count > 0 ? (ratings.reduce((a, b) => a + b, 0) / count).toFixed(1) : 0;
      setRatingStats({ average, count });
    } catch (err) { console.error(err); }
  };

  const fetchFolders = async (userId) => {
    setFoldersLoading(true);
    try {
      const q = query(collection(db, 'folders'), where('user_id', '==', userId));
      const snap = await getDocs(q);
      
      // Map through docs and sanitize createdAt to ensure it's a string, not a Timestamp object
      const loadedFolders = snap.docs.map(doc => {
        const data = doc.data();
        let createdDate = data.createdAt;
        
        // Check if createdAt is a Firestore Timestamp (object with seconds)
        if (createdDate && typeof createdDate === 'object' && 'seconds' in createdDate) {
          createdDate = new Date(createdDate.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        
        return { 
          id: doc.id, 
          ...data,
          createdAt: createdDate
        };
      });

      setFolders(loadedFolders);
    } catch (err) { 
      console.error(err);
      toast.error('Failed to load folders'); 
    } 
    finally { setTimeout(() => setFoldersLoading(false), 800); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentUser) return toast.error('Name required');
    setCreateFolderLoading(true);
    try {
      const newFolder = {
        user_id: currentUser.uid,
        name: newFolderName,
        createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        notes: [], quizzes: [], flashcards: [], documents: [],
      };
      await addDoc(collection(db, 'folders'), newFolder);
      toast.success('Folder created!');
      setNewFolderName('');
      fetchFolders(currentUser.uid);
    } catch (err) { toast.error('Error creating folder'); }
    finally { setCreateFolderLoading(false); }
  };

  const handleEditFolder = async (folderId) => {
    if (!editFolderName) return;
    setEditLoading(true);
    try {
      await updateDoc(doc(db, 'folders', folderId), { name: editFolderName });
      toast.success('Updated!');
      setEditFolderId(null);
      fetchFolders(currentUser.uid);
    } catch (err) { toast.error('Update failed'); }
    finally { setEditLoading(false); }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm('Delete this folder?')) return;
    setDeleteLoading(true);
    try {
      await deleteDoc(doc(db, 'folders', folderId));
      toast.success('Deleted!');
      fetchFolders(currentUser.uid);
    } catch (err) { toast.error('Delete failed'); }
    finally { setDeleteLoading(false); }
  };

  const handleLogout = () => {
    setLogoutLoading(true);
    setTimeout(() => {
      auth.signOut().then(() => navigate('/login'));
    }, 1000);
  };

  // Mock handlers
  const handleMockUpload = (type, setter) => {
    setter(true);
    setTimeout(() => {
      setter(false);
      toast.success(`Select a folder to upload ${type}!`);
    }, 1500);
  };

  // --- ANIMATION VARIANTS ---
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  
  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-purple-500 selection:text-white overflow-hidden relative">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full blur-[100px]" />
      </div>

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl"
            >
              <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                {tutorialSteps[tutorialStep].title}
              </h2>
              <p className="text-slate-300 mb-6">{tutorialSteps[tutorialStep].description}</p>
              <div className="flex justify-between items-center">
                <div className="flex gap-1">
                  {tutorialSteps.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === tutorialStep ? 'w-6 bg-purple-500' : 'w-2 bg-slate-600'}`} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => tutorialStep > 0 && setTutorialStep(p => p - 1)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${tutorialStep === 0 ? 'text-slate-600' : 'text-slate-300 hover:bg-slate-700'}`}
                  >
                    Back
                  </button>
                  <button 
                    onClick={() => {
                      if (tutorialStep < tutorialSteps.length - 1) setTutorialStep(p => p + 1);
                      else { setShowTutorial(false); localStorage.setItem('tutorialCompleted', 'true'); }
                    }}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    {tutorialStep === tutorialSteps.length - 1 ? 'Finish' : 'Next'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-screen relative z-10">
        
        {/* Desktop Sidebar */}
        <aside ref={sidebarRef} className="hidden md:flex flex-col w-72 bg-slate-900/50 backdrop-blur-xl border-r border-white/10 p-6 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-lg font-bold shadow-lg shadow-purple-500/30">
                {currentUser.displayName?.[0] || 'D'}
              </div>
              <div>
                <h3 className="font-semibold text-sm">{currentUser.displayName || 'Student'}</h3>
                <div className="flex items-center gap-1 text-xs text-yellow-400">
                  <Star size={12} fill="currentColor" />
                  <span>{ratingStats.average} Rating</span>
                </div>
              </div>
            </div>

            <nav className="space-y-2">
              <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active />
              <NavItem icon={<GraduationCap size={20} />} label="AI Teacher" to="/ai-teacher" />
              <NavItem icon={<HelpCircle size={20} />} label="Support" to="/community-support" />
              <div onClick={() => navigate('/buy-coins')} className="cursor-pointer group">
                <NavItem icon={<Coins size={20} className="text-yellow-400 group-hover:text-yellow-300" />} label="Buy G_COINS" />
              </div>
            </nav>
          </div>

          <div className="space-y-3">
             {/* G Coins Card */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Balance</span>
                <Coins className={`w-4 h-4 text-yellow-400 ${gCoinsAnimating ? 'animate-bounce' : ''}`} />
              </div>
              <div className="text-2xl font-bold text-white font-mono">{gCoins} <span className="text-sm text-slate-500">GC</span></div>
            </div>

            <button 
              onClick={handleLogout} 
              disabled={logoutLoading}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
            >
              {logoutLoading ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/> : <LogOut size={16} />}
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          
          {/* Mobile Header */}
          <header className="md:hidden flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center font-bold">
                {currentUser.displayName?.[0]}
              </div>
              <span className="font-semibold">Dashboard</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-white/10">
              <Coins size={14} className="text-yellow-400" />
              <span className="text-sm font-bold">{gCoins}</span>
            </div>
          </header>

          <div className="max-w-6xl mx-auto space-y-8">

            {/* --- NEW EXAM PREPARATION ANNOUNCEMENT --- */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate('/exams-preparation')}
              className="p-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 cursor-pointer shadow-lg shadow-purple-500/20"
            >
              <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 group hover:bg-slate-900/90 transition-colors">
                <div className="flex items-center gap-4 text-center md:text-left">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-yellow-400 to-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/30">
                    <Sparkles size={28} className="text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg md:text-xl flex items-center gap-2 justify-center md:justify-start">
                      Exam Prep AI <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">New</span>
                    </h3>
                    <p className="text-slate-300 text-sm md:text-base mt-1 max-w-xl">
                      Upload all your study materials and our AI will create full-fledged exams with smart marking for you.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-white font-medium bg-white/10 px-4 py-2 rounded-lg group-hover:bg-white/20 transition-all whitespace-nowrap">
                  <span>Start Now</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.div>
            {/* ----------------------------------------- */}
            
            {/* Quick Actions */}
            <section ref={uploadSectionRef}>
              <h2 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Plus size={18} className="text-purple-400" /> Quick Upload
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ActionCard 
                  icon={<Mic size={24} />} 
                  label="Record Audio" 
                  sub="Lecture to Notes" 
                  color="bg-orange-500" 
                  onClick={() => handleMockUpload('audio', setAudioLoading)}
                  loading={audioLoading}
                />
                <ActionCard 
                  icon={<Video size={24} />} 
                  label="Video Link" 
                  sub="YouTube to Flashcards" 
                  color="bg-red-500" 
                  onClick={() => handleMockUpload('video', setYoutubeLoading)}
                  loading={youtubeLoading}
                />
                <ActionCard 
                  icon={<FileText size={24} />} 
                  label="Upload PDF" 
                  sub="Document Summarizer" 
                  color="bg-blue-500" 
                  onClick={() => handleMockUpload('document', setDocumentLoading)}
                  loading={documentLoading}
                />
              </div>
            </section>

            {/* Folders Section */}
            <section ref={foldersSectionRef} className="space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Folder size={24} className="text-purple-400" /> Your Library
                </h2>
                
                {/* Create Folder Input */}
                <div ref={folderInputRef} className="flex w-full md:w-auto bg-slate-800/50 backdrop-blur-sm p-1 rounded-xl border border-white/10 focus-within:border-purple-500/50 transition-colors">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New Folder Name..."
                    className="bg-transparent border-none outline-none text-sm px-3 w-full md:w-64 placeholder:text-slate-500"
                  />
                  <button
                    ref={createButtonRef}
                    onClick={handleCreateFolder}
                    disabled={createFolderLoading}
                    className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {createFolderLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={20} />}
                  </button>
                </div>
              </div>

              {foldersLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4" />
                  <p>Loading your library...</p>
                </div>
              ) : (
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                  {folders.length === 0 ? (
                    <div className="col-span-full border border-dashed border-slate-700 rounded-2xl p-10 text-center text-slate-500">
                      <Folder size={48} className="mx-auto mb-4 opacity-50" />
                      <p>No folders yet. Create one to get started!</p>
                    </div>
                  ) : (
                    folders.map((folder) => (
                      <FolderCard 
                        key={folder.id}
                        folder={folder}
                        isEditing={editFolderId === folder.id}
                        editName={editFolderName}
                        setEditName={setEditFolderName}
                        onSave={() => handleEditFolder(folder.id)}
                        onEditStart={() => {
                          setEditFolderId(folder.id);
                          setEditFolderName(folder.name);
                          setDropdownOpen(null);
                        }}
                        onDelete={() => handleDeleteFolder(folder.id)}
                        dropdownOpen={dropdownOpen === folder.id}
                        toggleDropdown={() => setDropdownOpen(dropdownOpen === folder.id ? null : folder.id)}
                        editLoading={editLoading}
                        deleteLoading={deleteLoading}
                      />
                    ))
                  )}
                </motion.div>
              )}
            </section>
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/5 px-6 py-4 flex justify-between items-center z-50">
          <Link to="/dashboard" className="text-purple-400 flex flex-col items-center gap-1">
            <LayoutDashboard size={24} />
            <span className="text-[10px]">Home</span>
          </Link>
          <div onClick={() => navigate('/buy-coins')} className="text-slate-400 flex flex-col items-center gap-1">
            <Coins size={24} />
            <span className="text-[10px]">Store</span>
          </div>
          <Link to="/ai-teacher" className="text-slate-400 flex flex-col items-center gap-1">
            <GraduationCap size={24} />
            <span className="text-[10px]">AI Teacher</span>
          </Link>
          <Link to="/community-support" className="text-slate-400 flex flex-col items-center gap-1">
            <HelpCircle size={24} />
            <span className="text-[10px]">Help</span>
          </Link>
          <button onClick={handleLogout} className="text-red-400 flex flex-col items-center gap-1">
            <LogOut size={24} />
            <span className="text-[10px]">Exit</span>
          </button>
        </nav>

      </div>
    </div>
  );
}

// --- SUB COMPONENTS ---

const NavItem = ({ icon, label, to, active }) => {
  const navigate = useNavigate();
  return (
    <div 
      onClick={() => to && navigate(to)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all ${
        active 
          ? 'bg-purple-600/20 text-purple-300 border border-purple-500/20' 
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </div>
  );
};

const ActionCard = ({ icon, label, sub, color, onClick, loading }) => (
  <motion.button
    whileHover={{ y: -5 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    disabled={loading}
    className="bg-slate-800/40 backdrop-blur-sm border border-white/5 p-4 rounded-2xl flex items-center gap-4 text-left hover:bg-slate-800/60 transition-colors group relative overflow-hidden"
  >
    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-white shadow-lg`}>
      {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : icon}
    </div>
    <div>
      <h3 className="font-bold text-slate-200">{label}</h3>
      <p className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors">{sub}</p>
    </div>
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity ${color}`} />
  </motion.button>
);

const FolderCard = ({ folder, isEditing, editName, setEditName, onSave, onEditStart, onDelete, dropdownOpen, toggleDropdown, editLoading, deleteLoading }) => {
  return (
    <motion.div 
      variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
      className="bg-slate-800/40 backdrop-blur-md border border-white/5 p-5 rounded-2xl relative group hover:border-purple-500/30 transition-all"
    >
      {/* Folder Tab Visual */}
      <div className="absolute -top-3 left-6 bg-slate-700/50 w-20 h-4 rounded-t-lg z-0" />
      
      <div className="relative z-10 flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-slate-400 shadow-inner">
          <Folder size={20} />
        </div>
        <div className="relative">
          <button onClick={toggleDropdown} className="p-1 hover:bg-white/10 rounded-full text-slate-400 transition-colors">
            <MoreVertical size={16} />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-36 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-20">
              <button onClick={onEditStart} className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/5 flex items-center gap-2 text-slate-300">
                <Edit2 size={12} /> Rename
              </button>
              <button onClick={onDelete} disabled={deleteLoading} className="w-full text-left px-4 py-2.5 text-xs hover:bg-red-500/10 text-red-400 flex items-center gap-2">
                {deleteLoading ? <span className="animate-spin">⌛</span> : <Trash2 size={12} />} Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2">
          <input 
            value={editName} 
            onChange={(e) => setEditName(e.target.value)} 
            className="w-full bg-slate-900/50 border border-purple-500/50 rounded-md px-2 py-1 text-sm focus:outline-none"
            autoFocus
          />
          <button onClick={onSave} disabled={editLoading} className="text-purple-400 p-1 hover:bg-purple-500/10 rounded">
            {editLoading ? '...' : '✓'}
          </button>
        </div>
      ) : (
        <Link to={`/folder/${folder.id}`} className="block group-hover:text-purple-400 transition-colors">
          <h3 className="font-bold truncate text-lg mb-1">{folder.name}</h3>
        </Link>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5 text-xs text-slate-500">
        <span>{folder.createdAt}</span>
        <span className="bg-slate-700/30 px-2 py-0.5 rounded text-[10px] text-slate-400">
          {(folder.notes?.length || 0) + (folder.quizzes?.length || 0)} Items
        </span>
      </div>
    </motion.div>
  );
};

export default Dashboard;