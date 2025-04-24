import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { sendEmailVerification, onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

function VerifyEmail() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setEmail(user.email || '');
        // Check if email is already verified
        if (user.emailVerified) {
          toast.success('Email verified successfully!');
          navigate('/dashboard');
        }
      } else {
        // If no user is logged in, redirect to login
        navigate('/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleResendVerification = async () => {
    setIsVerifying(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await sendEmailVerification(user);
        toast.success('Verification email sent! Please check your inbox.');
      }
    } catch (error) {
      toast.error('Failed to send verification email. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsVerifying(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await user.reload(); // Refresh user data
        if (user.emailVerified) {
          toast.success('Email verified successfully!');
          navigate('/dashboard');
        } else {
          toast.error('Email not verified yet. Please check your email.');
        }
      }
    } catch (error) {
      toast.error('Error checking verification status.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 text-center">Verify Your Email</h2>
        <p className="text-gray-600 text-center mb-4 text-sm sm:text-base">
          We've sent a verification email to <span className="font-semibold">{email}</span>.
          Please check your inbox (and spam/junk folder) and click the verification link.
        </p>
        <div className="space-y-4">
          <button
            onClick={handleCheckVerification}
            disabled={isVerifying}
            className={`w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition text-sm sm:text-base ${
              isVerifying ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isVerifying ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Checking...
              </span>
            ) : (
              "I've Verified My Email"
            )}
          </button>
          <button
            onClick={handleResendVerification}
            disabled={isVerifying}
            className={`w-full bg-white border border-gray-300 text-gray-800 py-3 rounded-lg hover:bg-gray-50 text-sm sm:text-base ${
              isVerifying ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isVerifying ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-gray-800" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Sending...
              </span>
            ) : (
              'Resend Verification Email'
            )}
          </button>
        </div>
        <div className="text-center mt-6">
          <button
            onClick={() => auth.signOut().then(() => navigate('/login'))}
            className="text-purple-600 hover:underline text-sm sm:text-base"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;