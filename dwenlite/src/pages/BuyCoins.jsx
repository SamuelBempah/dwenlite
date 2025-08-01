import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

function BuyCoins() {
  const navigate = useNavigate();
  const [gCoinsAmount, setGCoinsAmount] = useState('');
  const [paystackEmail, setPaystackEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [paystackReady, setPaystackReady] = useState(false);
  const [currency, setCurrency] = useState({ symbol: '₵', code: 'GHS', rate: 1 }); // Default to GHS

  const predefinedPackages = [
    { gCoins: 5, amount: 5 },
    { gCoins: 10, amount: 10 },
    { gCoins: 25, amount: 25 },
    { gCoins: 50, amount: 50 },
  ];
  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

  // Static exchange rates (GHS to other currencies, approximate as of 2025)
  const currencyMap = {
    US: { symbol: '$', code: 'USD', rate: 0.064 }, // 1 GHS ≈ 0.064 USD
    GB: { symbol: '£', code: 'GBP', rate: 0.049 }, // 1 GHS ≈ 0.049 GBP
    EU: { symbol: '€', code: 'EUR', rate: 0.059 }, // 1 GHS ≈ 0.059 EUR
    GH: { symbol: '₵', code: 'GHS', rate: 1 }, // 1 GHS = 1 GHS
    NG: { symbol: '₦', code: 'NGN', rate: 103.45 }, // 1 GHS ≈ 103.45 NGN
  };

  // Load Paystack script, auth state, and detect user country
  useEffect(() => {
    console.log('Environment variables:', import.meta.env);
    console.log('Paystack Public Key:', paystackPublicKey);
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        console.log('User authenticated:', user.email);
        setCurrentUser(user);
        setPaystackEmail(user.email || '');
      } else {
        console.log('No user authenticated');
        toast.error('Please log in to buy G_COINS.');
        navigate('/login');
      }
    });

    // Detect user's country
    fetch('https://ipapi.co/json/')
      .then(response => response.json())
      .then(data => {
        console.log('Geolocation data:', data);
        const countryCode = data.country_code || 'GH'; // Fallback to Ghana
        const currencyInfo = currencyMap[countryCode] || currencyMap['GH']; // Default to GHS
        setCurrency(currencyInfo);
        console.log('Currency set:', currencyInfo);
      })
      .catch(err => {
        console.error('Geolocation error:', err);
        setCurrency(currencyMap['GH']); // Fallback to GHS
      });

    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => {
      console.log('Paystack SDK loaded successfully');
      setPaystackReady(true);
    };
    script.onerror = () => {
      console.error('Failed to load Paystack SDK');
      toast.error('Failed to load payment system. Please refresh and try again.');
      setPaystackReady(false);
    };
    document.body.appendChild(script);

    return () => {
      console.log('Cleaning up Paystack script and auth listener');
      document.body.removeChild(script);
      unsubscribe();
    };
  }, [navigate, paystackPublicKey]);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const updateUserGCoins = async (userId, additionalCoins) => {
    try {
      console.log('Updating G_COINS for user:', userId, 'with coins:', additionalCoins);
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        throw new Error('User document not found.');
      }
      const currentGCoins = userSnap.data().gCoins || 0;
      await updateDoc(userRef, { gCoins: currentGCoins + additionalCoins });
      console.log('G_COINS updated successfully');
    } catch (err) {
      console.error('Update G_COINS error:', err);
      throw new Error(`Failed to update G_COINS: ${err.message}`);
    }
  };

  const handlePaystackPayment = (amount, gCoins, email) => {
    console.log('Attempting Paystack payment:', { amount, gCoins, email, paystackReady, paystackPublicKey });
    if (!paystackPublicKey) {
      console.error('Paystack public key is missing');
      toast.error('Payment configuration error. Please contact support.');
      setLoading(false);
      return;
    }

    if (!paystackReady || !window.PaystackPop) {
      console.error('Paystack SDK not ready or not loaded');
      toast.error('Payment system not loaded. Please refresh and try again.');
      setLoading(false);
      return;
    }

    try {
      const handler = window.PaystackPop.setup({
        key: paystackPublicKey,
        email,
        amount: Math.round(amount * 100), // Convert GHS to pesewas
        currency: 'GHS', // Fixed to GHS
        ref: `GCOINS_${Math.floor(Math.random() * 1000000)}`,
        callback: (response) => {
          console.log('Paystack payment response:', response);
          updateUserGCoins(currentUser.uid, gCoins)
            .then(() => {
              toast.success(`Payment successful! Purchased ${gCoins} G_COINS. Reference: ${response.reference}`);
              setLoading(false);
              setGCoinsAmount('');
              setSelectedAmount(null);
            })
            .catch(err => {
              console.error('Payment callback error:', err);
              toast.error(`Failed to update G_COINS: ${err.message}`);
              setLoading(false);
            });
        },
        onClose: () => {
          console.log('Paystack payment window closed');
          toast.error('Payment cancelled.');
          setLoading(false);
          setSelectedAmount(null);
        },
      });
      console.log('Opening Paystack iframe');
      handler.openIframe();
    } catch (err) {
      console.error('Paystack payment initiation error:', err.message, err.stack);
      toast.error('Failed to initiate payment: ' + err.message);
      setLoading(false);
    }
  };

  const handlePurchase = (amount, gCoins, email) => {
    console.log('Handling purchase:', { amount, gCoins, email });
    setLoading(true);
    if (!validateEmail(email)) {
      console.error('Invalid email:', email);
      toast.error('Please enter a valid email address.');
      setLoading(false);
      return;
    }
    // Use original GHS amount for payment
    handlePaystackPayment(amount, gCoins, email);
  };

  const handleCustomPurchase = () => {
    console.log('Custom purchase initiated with amount:', gCoinsAmount);
    const amountInLocal = parseFloat(gCoinsAmount);
    if (!amountInLocal || amountInLocal < 5) {
      console.error('Invalid custom amount:', amountInLocal);
      toast.error(`Minimum purchase is 5 G_COINS for ${currency.symbol}5.`);
      setLoading(false);
      return;
    }
    // Convert local amount back to GHS for payment
    const amountInGHS = amountInLocal / currency.rate;
    const gCoins = Math.floor(amountInGHS);
    handlePurchase(amountInGHS, gCoins, paystackEmail);
  };

  const handlePredefinedPurchase = (pkg) => {
    console.log('Predefined purchase selected:', pkg);
    setGCoinsAmount((pkg.amount * currency.rate).toFixed(2).toString());
    setSelectedAmount(pkg.amount);
    // Use original GHS amount for payment
    handlePurchase(pkg.amount, pkg.gCoins, paystackEmail);
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 md:p-8">
      <style>
        {`
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 0 0 rgba(108, 43, 217, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(108, 43, 217, 0); }
            100% { box-shadow: 0 0 0 0 rgba(108, 43, 217, 0); }
          }
          @keyframes coinSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .pulse-glow {
            animation: pulseGlow 2s infinite;
          }
          .coin-icon {
            animation: coinSpin 2s linear infinite;
          }
          .card {
            background: linear-gradient(135deg, #2d3748, #1a202c);
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }
          .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 6px 20px rgba(108, 43, 217, 0.4);
          }
          .hover-scale {
            transition: transform 0.2s ease;
          }
          .hover-scale:hover {
            transform: scale(1.05);
          }
          @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
          }
          .animate-fade-in {
            animation: fadeInScale 0.3s ease-out forwards;
          }
        `}
      </style>

      {/* Header */}
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-purple-400">Buy G_COINS</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-300 hover:text-purple-300 text-sm md:text-base"
        >
          Back to Dashboard
        </button>
      </div>

      {/* Info Section */}
      <div className="text-center mb-8">
        <h2 className="text-lg md:text-xl font-semibold text-purple-300 mb-2">Power Up Your Learning</h2>
        <p className="text-gray-400 text-sm md:text-base max-w-md mx-auto">
          Purchase G_COINS to unlock notes, quizzes, and flashcards. The more you buy, the more you can create!
        </p>
      </div>

      {/* Payment Wall */}
      <div className="max-w-4xl mx-auto bg-gray-800 p-6 md:p-8 rounded-xl shadow-lg pulse-glow animate-fade-in">
        {/* Email Input */}
        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">Your Payment Email</h3>
          <input
            type="email"
            value={paystackEmail}
            onChange={(e) => setPaystackEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
            disabled={loading}
          />
        </div>

        {/* Predefined Packages */}
        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-4">Select a Package</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {predefinedPackages.map((pkg) => (
              <div
                key={pkg.gCoins}
                className="card p-4 text-center flex flex-col items-center justify-between h-32"
              >
                <span className="text-2xl md:text-3xl mb-2">
                  <span role="img" aria-label="coin" className="coin-icon">💰</span>
                </span>
                <h4 className="text-md md:text-lg font-semibold text-white">{pkg.gCoins} G_COINS</h4>
                <p className="text-gray-400 text-sm">{currency.symbol}{(pkg.amount * currency.rate).toFixed(2)}</p>
                <button
                  onClick={() => handlePredefinedPurchase(pkg)}
                  disabled={loading || !paystackReady}
                  className={`mt-2 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 hover-scale text-sm md:text-base ${
                    loading || !paystackReady ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading && selectedAmount === pkg.amount ? (
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
                      Processing...
                    </span>
                  ) : (
                    'Buy Now'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Purchase */}
        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">Custom Amount</h3>
          <div className="flex items-center gap-4">
            <input
              type="number"
              value={gCoinsAmount}
              onChange={(e) => setGCoinsAmount(e.target.value)}
              placeholder={`Enter amount in ${currency.code} (min ${(5 * currency.rate).toFixed(2)})`}
              min={(5 * currency.rate).toFixed(2)}
              step="0.01"
              className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
              disabled={loading}
            />
            <button
              onClick={handleCustomPurchase}
              disabled={loading || !paystackReady}
              className={`bg-purple-600 text-white py-2 px-6 rounded-lg hover:bg-purple-700 hover-scale text-sm md:text-base ${
                loading || !paystackReady ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading && selectedAmount === parseFloat(gCoinsAmount) / currency.rate ? (
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
                  Processing...
                </span>
              ) : (
                'Buy Now'
              )}
            </button>
          </div>
          <p className="text-gray-500 text-xs mt-2">
            Note: 1 {currency.code} = {(1 / currency.rate).toFixed(2)} G_COINS. Minimum purchase is {(5 * currency.rate).toFixed(2)} {currency.code} (5 GHS).
          </p>
        </div>

        {/* Note */}
        <p className="text-gray-400 text-sm text-center">
          Payments are processed securely via Paystack in GHS using mobile money, bank account, or credit/debit card. Check rates for Supported Currencies <Link className='text-purple-300 hover:underline' to="/community-support">Here</Link>.
        </p>
      </div>

      {/* Footer Note */}
      <div className="text-center mt-8 text-gray-400 text-sm">
        <p>
          Need help?{' '}
          <Link to="/community-support" className="text-purple-300 hover:underline">
            Contact Support
          </Link>
        </p>
      </div>
    </div>
  );
}

export default BuyCoins;