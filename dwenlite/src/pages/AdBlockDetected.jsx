import { Link } from 'react-router-dom';

function AdBlockDetected() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full text-center">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">Ad Blocker Detected</h1>
        <p className="text-gray-300 text-sm md:text-base mb-6">
          We’ve detected that you’re using an ad blocker. To keep our services free for all users, we rely on advertising revenue to cover the costs of server maintenance, hosting, and development. Please consider disabling your ad blocker to support our platform and continue enjoying our services uninterrupted or download our desktop version to enjoy an ad free experience.
        </p>
        <Link
          to="/dashboard"
          className="inline-block bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default AdBlockDetected;