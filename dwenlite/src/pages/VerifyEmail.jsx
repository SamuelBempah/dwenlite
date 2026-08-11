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
    <div className="min-h-[100dvh] bg-[#09090b] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full blur-[100px]" />
      </div>
      <div className="bg-[#18181b]/90 backdrop-blur-xl border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md relative z-10">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">Verify Your Email</h2>
        <p className="text-gray-400 text-center mb-6 text-sm sm:text-base">
          We've sent a verification email to <span className="font-semibold text-white">{email}</span>.
          Please check your inbox (and spam/junk folder) and click the verification link.
        </p>
        <div className="space-y-4">
          <button
            onClick={handleCheckVerification}
            disabled={isVerifying}
            className={`w-full bg-blue-600 text-white py-4 rounded-xl hover:bg-blue-500 transition-all text-sm sm:text-base font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)] active:scale-[0.98] ${
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
            className={`w-full mt-4 bg-transparent border border-white/20 text-gray-300 py-4 rounded-xl hover:bg-white/5 transition-all text-sm sm:text-base font-semibold flex items-center justify-center active:scale-[0.98] ${
              isVerifying ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isVerifying ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
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
            className="text-blue-500 hover:text-blue-400 hover:underline text-sm sm:text-base transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;