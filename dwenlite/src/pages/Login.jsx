import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, googleProvider } from '../firebase';
import { signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

function Login() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate('/dashboard');
      }
    });

    return () => unsubscribe();
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/invalid-email':
        return 'The email address is not valid. Please check and try again.';
      case 'auth/user-not-found':
        return 'No account found with this email. Please sign up first.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please check your credentials and try again.';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled. Please contact support.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setSignInLoading(true);
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        setTimeout(() => {
          toast.success('Successfully logged in!');
          navigate('/dashboard');
          setSignInLoading(false);
        }, 3000); // 3-second delay
      })
      .catch((err) => {
        toast.error(getFriendlyErrorMessage(err.code));
        setSignInLoading(false);
      });
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    signInWithPopup(auth, googleProvider)
      .then(() => {
        setTimeout(() => {
          toast.success('Successfully logged in with Google!');
          navigate('/dashboard');
          setGoogleLoading(false);
        }, 3000); // 3-second delay
      })
      .catch((err) => {
        toast.error(getFriendlyErrorMessage(err.code));
        setGoogleLoading(false);
      });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 text-center">Sign In</h2>
        <form onSubmit={handleLogin}>
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
          <div className="mb-6">
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
          <button
            type="submit"
            disabled={signInLoading}
            className={`w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition text-sm sm:text-base ${
              signInLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {signInLoading ? (
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
                Loading...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        <div className="text-center mt-4">
          <Link to="/reset-password" className="text-purple-600 hover:underline text-sm sm:text-base">
            Forgot Password?
          </Link>
        </div>
        <div className="text-center mt-2">
          <span className="text-gray-500 text-sm sm:text-base">Need an account? </span>
          <Link to="/signup" className="text-purple-600 hover:underline text-sm sm:text-base">
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;