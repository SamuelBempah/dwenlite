import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if dismissed previously
    if (localStorage.getItem('pwaPromptDismissed')) {
      setDismissed(true);
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwaPromptDismissed', 'true');
  };

  if (isStandalone || dismissed) {
    return null;
  }

  if (isInstallable) {
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 md:bottom-6 md:right-6 md:left-auto md:transform-none bg-gray-800 border border-purple-500 text-white p-4 rounded-xl shadow-2xl z-50 flex items-center gap-4 max-w-sm w-11/12">
        <div className="flex-1">
          <h4 className="font-bold text-lg mb-1">Install DwenLite</h4>
          <p className="text-sm text-gray-300">Get the best experience by installing DwenLite on your device!</p>
        </div>
        <div className="flex flex-col gap-2">
          <button 
            onClick={handleInstallClick}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold transition flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Install
          </button>
          <button 
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white text-xs text-center"
          >
            Maybe later
          </button>
        </div>
        <button onClick={handleDismiss} className="absolute -top-2 -right-2 bg-gray-900 rounded-full p-1 border border-gray-600 hover:text-red-400">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (isIOS && !isStandalone) {
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 md:bottom-6 md:right-6 md:left-auto md:transform-none bg-gray-800 border border-purple-500 text-white p-4 rounded-xl shadow-2xl z-50 max-w-sm w-11/12">
        <h4 className="font-bold text-lg mb-2">Install DwenLite on iOS</h4>
        <p className="text-sm text-gray-300">
          Tap the <strong>Share</strong> button at the bottom of your screen, then select <strong>"Add to Home Screen"</strong> to install DwenLite as an app.
        </p>
        <div className="mt-3 flex justify-end">
           <button 
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default PwaInstallPrompt;
