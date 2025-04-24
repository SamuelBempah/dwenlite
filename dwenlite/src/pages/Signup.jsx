import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, googleProvider } from '../firebase';
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import toast from 'react-hot-toast';
import Confetti from 'react-confetti';

function Signup() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const navigate = useNavigate();

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please log in or use a different email.';
      case 'auth/invalid-email':
        return 'The email address is not valid. Please check and try again.';
      case 'auth/weak-password':
        return 'Your password is too weak. Please use a stronger password (at least 6 characters).';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled. Please contact support.';
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please check your credentials and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000); // Confetti for 5 seconds
  };

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
            setTimeout(() => {
              toast.success('Successfully signed up!');
              triggerConfetti();
              navigate('/dashboard');
              setSignupLoading(false);
            }, 3000); // 3-second delay
          })
          .catch((err) => {
            toast.error(getFriendlyErrorMessage(err.code));
            setSignupLoading(false);
          });
      })
      .catch((err) => {
        toast.error(getFriendlyErrorMessage(err.code));
        setSignupLoading(false);
      });
  };

  const handleGoogleSignup = () => {
    setGoogleLoading(true);
    signInWithPopup(auth, googleProvider)
      .then(() => {
        setTimeout(() => {
          toast.success('Successfully signed up with Google!');
          triggerConfetti();
          navigate('/dashboard');
          setGoogleLoading(false);
        },

3000); // 3-second delay
      })
      .catch((err) => {
        toast.error(getFriendlyErrorMessage(err.code));
        setGoogleLoading(false);
      });
  };

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
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 text-center">Sign Up</h2>
        <button
          onClick={handleGoogleSignup}
          disabled={googleLoading}
          className={`w-full bg-white border border-gray-300 text-gray-800 py-3 rounded-lg mb-4 flex items-center justify-center hover:bg-gray-50 text-sm sm:text-base ${googleLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {googleLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin h-5 w-5 mr-2 text-gray-800" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading...
            </span>
          ) : (
            <>
              <span className="mr-2">G</span> Continue with Google
            </>
          )}
        </button>
        <div className="text-center text-gray-500 mb-6 text-sm sm:text-base">or create manually</div>
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
            disabled={signupLoading}
            className={`w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition text-sm sm:text-base ${signupLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {signupLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading...
              </span>
            ) : (
              'Continue'
            )}
          </button>
        </form>
        <div className="text-center mt-4 text-gray-500 text-xs sm:text-sm">
          By signing up you agree to our{' '}
          <a href="/legal" className="text-purple-600 hover:underline">Terms of Service</a> and{' '}
          <a href="./legal" className="text-purple-600 hover:underline">Privacy Policy.</a> They're all the same either way 😂
        </div>
        <div className="text-center mt-2">
          <span className="text-gray-500 text-sm sm:text-base">Already have an account? </span>
          <Link to="/login" className="text-purple-600 hover:underline text-sm sm:text-base">Log In</Link>
        </div>
      </div>
    </div>
  );
}

export default Signup;