import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import welcomeVideo from '../videos/welcome.mp4'; // Adjust path if needed
import logo from '../assets/react.png'; // Logo path

function DwenLiteDownload() {
  const [androidLoading, setAndroidLoading] = useState(false);
  const [desktopLoading, setDesktopLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  const handleAndroidClick = (e) => {
    e.preventDefault();
    setAndroidLoading(true);
    setTimeout(() => {
      setAndroidLoading(false);
      window.location.href = 'https://play.google.com/store/apps/details?id=com.dwenlite.app'; // Replace with actual link
    }, 1000);
  };

  const handleDesktopClick = (e) => {
    e.preventDefault();
    setDesktopLoading(true);
    setShowThankYou(true);
    // Create a temporary anchor element to trigger direct download
    const link = document.createElement('a');
    link.href = 'https://github.com/SamuelBempah/dwenlite/raw/refs/heads/master/desktop-releases/DwenLite_Setup.exe'; // Replace with actual GitHub URL
    link.download = 'DwenLite_Setup.exe'; // Suggests filename to the browser
    document.body.appendChild(link);
    setTimeout(() => {
      link.click();
      document.body.removeChild(link);
      setDesktopLoading(false);
      // Hide thank you message after 5 seconds
      setTimeout(() => {
        setShowThankYou(false);
      }, 5000);
    }, 1000);
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 100, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 1, ease: 'easeOut' } },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: (i) => ({
      opacity: 1,
      scale: 1,
      transition: { duration: 0.6, delay: i * 0.2, ease: 'easeOut' },
    }),
  };

  return (
    <div className="relative flex flex-col snap-y snap-mandatory overflow-y-auto h-screen">
      {/* Video Background with Fallback */}
      {!videoError ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="fixed top-0 left-0 w-full h-full object-cover z-0"
          onError={() => setVideoError(true)}
        >
          <source src={welcomeVideo} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900 via-purple-900 to-black z-0"></div>
      )}
      <div className="fixed top-0 left-0 w-full h-full bg-black/60 z-10"></div>

      {/* Welcome Section */}
      <motion.div
        className="relative min-h-screen flex items-center justify-center text-center snap-start z-20"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.8 }}
      >
        <div className="container mx-auto px-4 sm:px-6">
          <img
            src={logo}
            alt="DwenLite Logo"
            className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4"
          />
          <motion.h2
            className="text-4xl sm:text-5xl font-extrabold text-white mb-4 drop-shadow-[0_0_10px_rgba(147,51,234,0.5)]"
            initial={{ scale: 0.8 }}
            whileInView={{ scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          >
            Welcome to DwenLite
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
          >
            Your ultimate AI-powered study companion designed to revolutionize learning. Scroll Down To Continue
          </motion.p>
        </div>
      </motion.div>

      {/* Description Section */}
      <motion.div
        className="relative min-h-screen flex items-center justify-center text-center snap-start z-20"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.8 }}
      >
        <div className="container mx-auto px-4 sm:px-6">
          <motion.h3
            className="text-3xl sm:text-4xl font-bold text-white mb-4 drop-shadow-[0_0_10px_rgba(147,51,234,0.5)]"
            initial={{ scale: 0.8 }}
            whileInView={{ scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          >
            About DwenLite
          </motion.h3>
          <motion.p
            className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
          >
            Transform your learning experience with AI-powered tools that generate notes, quizzes, and flashcards. Available on Android and Desktop, DwenLite helps you study smarter and faster.
          </motion.p>
        </div>
      </motion.div>

      {/* Features Section */}
      <motion.div
        className="relative min-h-screen flex items-center justify-center text-center snap-start z-20"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.8 }}
      >
        <div className="container mx-auto px-4 sm:px-6">
          <motion.h3
            className="text-3xl sm:text-4xl font-bold text-white mb-8 drop-shadow-[0_0_10px_rgba(147,51,234,0.5)]"
            initial={{ scale: 0.8 }}
            whileInView={{ scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          >
            Why DwenLite?
          </motion.h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {[
              { title: 'Smart Notes', desc: 'AI-generated summaries and flashcards for efficient studying.' },
              { title: 'Interactive Quizzes', desc: 'Customized quizzes to test and reinforce your knowledge.' },
              { title: 'Real-Time Assistance', desc: 'Instant answers to your study questions with AI.' },
            ].map((feature, index) => (
              <motion.div
                key={index}
                className="bg-indigo-800/50 p-4 sm:p-6 rounded-lg shadow-lg border border-purple-500/30"
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                custom={index}
                viewport={{ once: true }}
              >
                <h4 className="text-base sm:text-lg font-semibold text-white mb-2">{feature.title}</h4>
                <p className="text-gray-400 text-sm sm:text-base">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Download Section */}
      <motion.div
        className="relative min-h-screen flex items-center justify-center text-center snap-start z-20"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.8 }}
      >
        <div className="container mx-auto px-4 sm:px-6">
          <img
            src={logo}
            alt="DwenLite Logo"
            className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-2xl drop-shadow-[0_0_10px_rgba(147,51,234,0.7)]"
          />
          <motion.h3
            className="text-3xl sm:text-4xl font-bold text-white mb-8 drop-shadow-[0_0_10px_rgba(147,51,234,0.5)]"
            initial={{ scale: 0.8 }}
            whileInView={{ scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          >
            Download Now, It's Completely FREE!!
          </motion.h3>
          {showThankYou && (
            <motion.p
              className="text-lg sm:text-xl text-white mb-4 drop-shadow-[0_0_10px_rgba(147,51,234,0.5)]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              Thank you for downloading DwenLite! Your download should start shortly.
            </motion.p>
          )}
          <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <motion.a
              href="https://play.google.com/store/apps/details?id=com.dwenlite.app"
              onClick={handleAndroidClick}
              className={`bg-green-600 text-white px-6 py-3 sm:px-8 sm:py-3 rounded-full transition-all flex items-center justify-center space-x-2 ${androidLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-500'}`}
              whileHover={{ scale: androidLoading ? 1 : 1.1 }}
              whileTap={{ scale: androidLoading ? 1 : 0.95 }}
            >
              {androidLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 20.5v-17c0-.83.67-1.5 1.5-1.5h1.67l6 6 6-6h1.83c.83 0 1.5.67 1.5 1.5v17c0 .83-.67 1.5-1.5 1.5h-15c-.83 0-1.5-.67-1.5-1.5zM12 14l-6-6h12l-6 6z"/>
                  </svg>
                  <span>Download For Android</span>
                </>
              )}
            </motion.a>
            <motion.a
              href="#"
              onClick={handleDesktopClick}
              className={`bg-blue-600 text-white px-6 py-3 sm:px-8 sm:py-3 rounded-full transition-all ${desktopLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`}
              whileHover={{ scale: desktopLoading ? 1 : 1.1 }}
              whileTap={{ scale: desktopLoading ? 1 : 0.95 }}
            >
              {desktopLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                'Download for Windows'
              )}
            </motion.a>
          </div>
        </div>
      </motion.div>

      {/* Footer */}
      <footer className="relative text-center py-4 text-gray-400 text-sm sm:text-base z-20 snap-start">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          Developed And Published By{' '}
          <Link to="https://sbmindtechnologies.com" className="hover:text-purple-400 transition-colors">
            SBMind Technologies
          </Link>{' '}
          • DwenLite © 2025
        </motion.p>
      </footer>
    </div>
  );
}

export default DwenLiteDownload;