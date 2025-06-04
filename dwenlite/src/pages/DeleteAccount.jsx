import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

function DeleteAccount() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const requestDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'permission-denied':
        return 'You do not have permission to submit a deletion request. Please contact support.';
      case 'unavailable':
        return 'Network error. Please check your internet connection and try again.';
      case 'deadline-exceeded':
        return 'The operation took too long. Please try again.';
      default:
        return 'Failed to submit deletion request. Please try again.';
    }
  };

  const handleDeleteRequest = async (e) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please provide a valid email address.');
      return;
    }
    if (!firstName.trim()) {
      toast.error('Please provide your first name.');
      return;
    }
    if (!lastName.trim()) {
      toast.error('Please provide your last name.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason for deletion.');
      return;
    }
    if (!confirmDelete) {
      toast.error('Please confirm deletion.');
      return;
    }

    setSubmitLoading(true);
    try {
      const deletionRequest = {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        reason: reason.trim(),
        requestDate: new Date().toISOString(),
        status: 'pending',
      };
      console.log('Submitting deletion request:', deletionRequest);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('deadline-exceeded')), 10000);
      });

      await Promise.race([
        addDoc(collection(db, 'deletion_requests'), deletionRequest),
        timeoutPromise,
      ]);

      toast.success('Account deletion request submitted successfully! You will receive a confirmation email within 7 business days.');
      setEmail('');
      setFirstName('');
      setLastName('');
      setReason('');
      setConfirmDelete(false);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      const errorCode = err.code || err.message;
      console.error('Delete request error details:', err);
      toast.error(getFriendlyErrorMessage(errorCode));
      setSubmitLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-gray-800 p-4 md:p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center mb-6 md:mb-8">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-600 rounded-full flex items-center justify-center text-lg md:text-xl">
              U
            </div>
            <span className="ml-2 md:ml-3 text-base md:text-lg font-semibold">
              Guest
            </span>
          </div>
          <nav>
            <Link
              to="/dashboard"
              className="flex items-center mb-3 md:mb-4 text-purple-400 text-sm md:text-base"
            >
              <span className="mr-2">🏠</span> Dashboard
            </Link>
            <Link
              to="/support"
              className="flex items-center mb-3 md:mb-4 text-purple-400 text-sm md:text-base"
            >
              <span className="mr-2">💬</span> Support
            </Link>
            <Link
              to="/delete-account"
              className="flex items-center mb-3 md:mb-4 text-red-400 text-sm md:text-base"
            >
              <span className="mr-2">🗑️</span> Delete Account
            </Link>
          </nav>
        </div>
        <Link
          to="/login"
          className="text-gray-400 hover:text-white text-sm md:text-base"
        >
          Login
        </Link>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 md:mb-8">Delete Your Account</h1>
        <div className="bg-gray-800 p-4 md:p-6 rounded-lg">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Account Deletion</h2>
          <p className="text-gray-300 text-sm md:text-base mb-4">
            To delete your account for DwenLite, developed by SBMind Technologies, please fill out the form below. This will submit a request to permanently remove all associated data, including folders, notes, quizzes, and flashcards, from our servers.
          </p>
          <div className="max-w-md">
            <div className="mb-4">
              <label htmlFor="firstName" className="block text-sm md:text-base font-medium mb-2">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
                className="p-2 rounded-lg bg-gray-700 text-white w-full"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="lastName" className="block text-sm md:text-base font-medium mb-2">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
                className="p-2 rounded-lg bg-gray-700 text-white w-full"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm md:text-base font-medium mb-2">
                Your Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your account email"
                className="p-2 rounded-lg bg-gray-700 text-white w-full"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="reason" className="block text-sm md:text-base font-medium mb-2">
                Reason for Deletion
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please tell us why you are deleting your account"
                className="p-2 rounded-lg bg-gray-700 text-white w-full h-24 resize-none"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm md:text-base font-medium mb-2">
                Request Date
              </label>
              <input
                type="text"
                value={requestDate}
                readOnly
                className="p-2 rounded-lg bg-gray-600 text-gray-300 w-full cursor-not-allowed"
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center text-sm md:text-base">
                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.checked)}
                  className="mr-2"
                />
                I confirm that I want to permanently delete my account and all associated data.
              </label>
            </div>
            <button
              onClick={handleDeleteRequest}
              disabled={submitLoading}
              className={`bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 text-sm md:text-base w-full ${
                submitLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {submitLoading ? (
                <span className="flex items-center justify-center">
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
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Submitting...
                </span>
              ) : (
                'Submit Deletion Request'
              )}
            </button>
          </div>
          <p className="text-gray-400 text-sm md:text-base mt-4">
            After submitting, your request will be processed within 7 business days. You will receive a confirmation email once your account has been deleted.
          </p>
        </div>
      </div>
    </div>
  );
}

export default DeleteAccount;