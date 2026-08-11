import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import toast from 'react-hot-toast';

function ResetPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/invalid-email':
        return 'The email address is not valid. Please check and try again.';
      case 'auth/user-not-found':
        return 'No account found with this email. Please sign up first.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    setLoading(true);
    sendPasswordResetEmail(auth, email)
      .then(() => {
        toast.success('Password reset email sent! Check your inbox.');
        setEmail('');
        setLoading(false);
      })
      .catch((err) => {
        toast.error(getFriendlyErrorMessage(err.code));
        setLoading(false);
      });
  };

  return (
    <div className="min-h-[100dvh] bg-[#09090b] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full blur-[100px]" />
      </div>
      <div className="bg-[#18181b]/90 backdrop-blur-xl border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md relative z-10">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">Reset Password</h2>
        <p className="text-gray-400 mb-6 text-center text-sm sm:text-base">
          Enter your email address to receive a password reset link.
        </p>
        <form onSubmit={handleResetPassword}>
          <div className="mb-6">
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full p-4 bg-black/30 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm sm:text-base text-white placeholder-gray-500 transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-blue-600 text-white py-4 rounded-xl hover:bg-blue-500 transition-all text-sm sm:text-base font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)] active:scale-[0.98] ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? (
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
                Sending...
              </span>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>
        <div className="text-center mt-6">
          <Link to="/login" className="text-blue-500 hover:text-blue-400 hover:underline text-sm sm:text-base transition-colors">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;