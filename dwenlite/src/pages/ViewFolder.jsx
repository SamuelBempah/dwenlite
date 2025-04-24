import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth, storage } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import toast from 'react-hot-toast';

function ViewFolder() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        toast.error('Please log in to view this folder.');
        navigate('/login');
        return;
      }
      fetchFolder(user.uid);
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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileName = selectedFile.name.toLowerCase();
      if (!fileName.endsWith('.txt')) {
        toast.error('Only .txt files are allowed. Please upload a .txt file.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
    }
  };

  const extractTextFromTextFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.trim());
      reader.onerror = () => reject(new Error('Failed to read text file.'));
      reader.readAsText(file);
    });
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload.');
      return;
    }

    // Check if a file already exists in the folder
    if (folder.documents.length >= 1) {
      toast.error('This folder already has a file. Only one file is allowed per folder. Delete the existing file to upload a new one.');
      setFile(null);
      return;
    }

    setUploading(true);
    try {
      let extractedText;
      try {
        extractedText = await extractTextFromTextFile(file);
      } catch (err) {
        console.warn('Text extraction failed:', err.message);
        extractedText = '';
        toast('Text extraction failed. File will still be uploaded.', {
          style: {
            background: '#fefcbf',
            color: '#744210',
          },
        });
      }

      const storageRef = ref(storage, `documents/${folderId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const documentData = {
        id: Date.now().toString(),
        name: file.name,
        url: downloadURL,
        extractedText: extractedText || '',
        uploadedAt: new Date().toISOString(),
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

  const handleDeleteDocument = async (docId, docName) => {
    try {
      // Delete the file from Firebase Storage
      const storageRef = ref(storage, `documents/${folderId}/${docName}`);
      await deleteObject(storageRef);

      // Update Firestore by removing the document from the documents array
      const updatedDocuments = folder.documents.filter(doc => doc.id !== docId);
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        documents: updatedDocuments,
      });

      // Update local state
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
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">{folder.name}</h1>
        <Link
          to="/dashboard"
          className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="mb-6">
        <p className="text-gray-400 text-sm md:text-base">Created on {new Date(folder.createdAt).toLocaleDateString()}</p>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Upload Document - .txt Only</h2>
        <div className="bg-gray-800 p-3 md:p-4 rounded-lg">
          <input
            type="file"
            onChange={handleFileChange}
            className="mb-3 text-sm md:text-base text-gray-300"
            accept=".txt"
          />
          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className={`w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base flex items-center justify-center ${
              uploading || !file ? 'opacity-50 cursor-not-allowed' : ''
            }`}
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
        </div>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Uploaded Documents</h2>
        {folder.documents.length === 0 ? (
          <p className="text-gray-400 text-sm md:text-base">No documents uploaded yet.</p>
        ) : (
          folder.documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-gray-800 p-3 md:p-4 rounded-lg mb-3 md:mb-4 flex justify-between items-center"
            >
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline text-sm md:text-base"
              >
                {doc.name}
              </a>
              <div className="flex items-center space-x-3">
                <span className="text-gray-400 text-sm">
                  Uploaded on {new Date(doc.uploadedAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleDeleteDocument(doc.id, doc.name)}
                  className="bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mb-6 md:mb-8">
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