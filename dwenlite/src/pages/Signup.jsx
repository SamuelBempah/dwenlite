import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, googleProvider } from '../firebase';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';
import Confetti from 'react-confetti';

function Signup({ setShowBanPopup }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for existing user session
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('onAuthStateChanged:', user ? user.uid : null); // Debug log
      if (user) {
        navigate('/dashboard');
      }
      setCheckingStatus(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/user-disabled':
        return null; // Handled by popup
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please log in or use a different email.';
      case 'auth/invalid-email':
        return 'The email address is not valid. Please check and try again.';
      case 'auth/weak-password':
        return 'Your password is too weak. Please use a stronger password (at least 6 characters).';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled. Please contact support.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/popup-closed-by-user':
        return 'The Google sign-in popup was closed. Please try again.';
      case 'auth/cancelled-popup-request':
        return 'The sign-in request was cancelled. Please try again.';
      case 'auth/auth-domain-config-required':
        return 'Firebase configuration error. Please contact support.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for Google sign-in. Check Firebase Console settings.';
      case 'auth/network-request-failed':
        return 'Network error. Check your internet connection, disable any ad blockers, and try again.';
      default:
        return `An unexpected error occurred: ${errorCode}. Please try again or contact support.`;
    }
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000); // Confetti for 5 seconds
  };

  // Handle email/password sign-up
  const handleSignup = (e) => {
    e.preventDefault();
    setSignupLoading(true);
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      setSignupLoading(false);
      return;
    }

    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        // Update user profile with first and last name
        updateProfile(user, {
          displayName: `${firstName} ${lastName}`,
        })
          .then(() => {
            // Send email verification
            sendEmailVerification(user)
              .then(() => {
                setTimeout(() => {
                  toast.success('Sign-up successful! Please verify your email.');
                  triggerConfetti();
                  navigate('/verify-email');
                  setSignupLoading(false);
                }, 3000); // 3-second delay
              })
              .catch((err) => {
                console.error('Email verification error:', err.code, err.message); // Debug log
                if (err.code === 'auth/user-disabled') {
                  setShowBanPopup(true);
                } else {
                  toast.error('Failed to send verification email. Please try again.');
                }
                setSignupLoading(false);
              });
          })
          .catch((err) => {
            console.error('Profile update error:', err.code, err.message); // Debug log
            if (err.code === 'auth/user-disabled') {
              setShowBanPopup(true);
            } else {
              const message = getFriendlyErrorMessage(err.code);
              if (message) toast.error(message);
            }
            setSignupLoading(false);
          });
      })
      .catch((err) => {
        console.error('Email sign-up error:', err.code, err.message); // Debug log
        if (err.code === 'auth/user-disabled') {
          setShowBanPopup(true);
        } else {
          const message = getFriendlyErrorMessage(err.code);
          if (message) toast.error(message);
        }
        setSignupLoading(false);
      });
  };

  // Handle Google sign-up with popup
  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      if (!navigator.onLine) {
        throw new Error('auth/network-request-failed');
      }
      console.log('Attempting Google sign-up with popup'); // Debug log
      const result = await signInWithPopup(auth, googleProvider);
      console.log('signInWithPopup:', result.user.uid); // Debug log
      setTimeout(() => {
        toast.success('Successfully signed up with Google!');
        triggerConfetti();
        navigate('/dashboard'); // Google users may not need email verification
        setGoogleLoading(false);
      }, 3000); // 3-second delay
    } catch (err) {
      console.error('Google sign-up error:', err.code, err.message); // Debug log
      if (err.code === 'auth/user-disabled') {
        setShowBanPopup(true);
      } else {
        const message = getFriendlyErrorMessage(err.code);
        if (message) toast.error(message);
      }
      setGoogleLoading(false);
    }
  };

  if (checkingStatus || signupLoading || googleLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 flex items-center justify-center px-4">
        {showConfetti && (
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={200}
            gravity={0.1}
          />
        )}
        <div className="bg-white p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md text-center">
          <span className="flex items-center justify-center">
            <svg
              className="animate-spin h-5 w-5 mr-2 text-purple-600"
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
            {googleLoading ? 'Validating Google sign-up...' : signupLoading ? 'Signing Up...' : 'Checking status...'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 text-center">Sign Up</h2>
        <form onSubmit={handleSignup}>
          <div className="mb-4">
            <input
              type="text"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name"
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm sm:text-base"
              required
            />
          </div>
          <div className="mb-4">
            <input
              type="text"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last Name"
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm sm:text-base"
              required
            />
          </div>
          <div className="mb-4">
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm sm:text-base"
              required
            />
          </div>
          <div className="mb-4">
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm sm:text-base"
              required
            />
          </div>
          <div className="mb-6">
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm sm:text-base"
              required
            />
          </div>
          <button
            type="submit"
            disabled={signupLoading || googleLoading}
            className={`w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition text-sm sm:text-base ${
              signupLoading || googleLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {signupLoading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin h-5 w-5 mr-2 text-white"
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
                Signing Up...
              </span>
            ) : (
              'Continue'
            )}
          </button>
        </form>
        <button
          onClick={handleGoogleSignup}
          disabled={signupLoading || googleLoading}
          className={`w-full mt-4 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition text-sm sm:text-base flex items-center justify-center ${
            signupLoading || googleLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {googleLoading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin h-5 w-5 mr-2 text-gray-700"
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
              Signing Up...
            </span>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.02.68-2.33 1.09-3.71 1.09-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign up with Google
            </>
          )}
        </button>
        <div className="text-center mt-4 text-gray-500 text-xs sm:text-sm">
          By signing up you agree to our{' '}
          <Link to="/terms" className="text-purple-600 hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/terms" className="text-purple-600 hover:underline">
            Privacy Policy
          </Link>
        </div>
        <div className="text-center mt-2">
          <span className="text-gray-500 text-sm sm:text-base">Already have an account? </span>
          <Link to="/login" className="text-purple-600 hover:underline text-sm sm:text-base">
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Signup;