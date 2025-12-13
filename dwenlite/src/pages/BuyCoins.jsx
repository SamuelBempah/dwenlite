import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { 
  Coins, CreditCard, ArrowLeft, LogOut, LayoutDashboard, 
  LifeBuoy, ShieldCheck, Globe, Loader2, Zap, Check, Wallet
} from 'lucide-react';

function BuyCoins() {
  const navigate = useNavigate();
  
  // --- RESTORED LOGIC FROM OLD CODE ---
  const [gCoinsAmount, setGCoinsAmount] = useState('');
  const [paystackEmail, setPaystackEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [paystackReady, setPaystackReady] = useState(false);
  const [currency, setCurrency] = useState({ symbol: '₵', code: 'GHS', rate: 1 }); // Default to GHS

  // Enhanced with 'popular' flag for the new UI, but keeping values identical
  const predefinedPackages = [
    { gCoins: 5, amount: 5, popular: false },
    { gCoins: 10, amount: 10, popular: true },
    { gCoins: 25, amount: 25, popular: false },
    { gCoins: 50, amount: 50, popular: false },
  ];
  
  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

  // Static exchange rates (GHS to other currencies, approximate as of 2025)
  const currencyMap = {
    US: { symbol: '$', code: 'USD', rate: 0.064 }, // 1 GHS ≈ 0.064 USD
    GB: { symbol: '£', code: 'GBP', rate: 0.049 }, // 1 GHS ≈ 0.049 GBP
    EU: { symbol: '€', code: 'EUR', rate: 0.059 }, // 1 GHS ≈ 0.059 EUR
    GH: { symbol: '₵', code: 'GHS', rate: 1 }, // 1 GHS = 1 GHS
    NG: { symbol: '₦', code: 'NGN', rate: 103.45 }, // 1 GHS ≈ 103.45 NGN
    AU: { symbol: '$', code: 'AUD', rate: 0.096 }, // 1 GHS ≈ 0.096 AUD
    CA: { symbol: '$', code: 'CAD', rate: 0.087 }, // 1 GHS ≈ 0.087 CAD
    JP: { symbol: '¥', code: 'JPY', rate: 9.50 }, // 1 GHS ≈ 9.50 JPY
    IN: { symbol: '₹', code: 'INR', rate: 5.36 }, // 1 GHS ≈ 5.36 INR
    ZA: { symbol: 'R', code: 'ZAR', rate: 1.15 }, // 1 GHS ≈ 1.15 ZAR
  };

  // Load Paystack script, auth state, and detect user country (Restored exact useEffect)
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
      const currentData = userSnap.data();
      const currentGCoins = currentData.gCoins || 0;
      const currentPurchasedGCoins = currentData.purchasedGCoins || 0; // Ensure field exists
      await updateDoc(userRef, { 
        gCoins: currentGCoins + additionalCoins,
        purchasedGCoins: currentPurchasedGCoins + additionalCoins // Increment purchased G_COINS
      });
      console.log('G_COINS updated successfully');
    } catch (err) {
      console.error('Update G_COINS error:', err);
      throw new Error(`Failed to update G_COINS: ${err.message}`);
    }
  };

  const handlePaystackPayment = (amount, gCoins, email) => {
    console.log('Attempting Paystack payment:', { amount, gCoins, email, paystackReady, paystackPublicKey });
    
    // Using the specific error handling from old code
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

  const handleLogout = () => {
    setLoading(true);
    setTimeout(() => {
      auth.signOut()
        .then(() => {
          toast.success('Logged out successfully!');
          navigate('/login');
        })
        .catch((err) => {
          toast.error('Failed to log out. Please try again.');
          console.error('Logout error:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 3000);
  };

  if (!currentUser) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
       <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-purple-500 selection:text-white relative overflow-x-hidden flex flex-col md:flex-row">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 opacity-30 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-purple-900/40 to-transparent" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        
        {/* HEADER */}
        <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 p-4 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Coins size={20} className="text-yellow-400" />
             </div>
             <span className="text-xl font-bold">Buy G_COINS</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="hidden md:flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white py-2 px-4 rounded-lg transition-colors text-sm"
            >
              <ArrowLeft size={16} /> Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </nav>
        </header>

        {/* MAIN CONTENT */}
        <div className="max-w-4xl mx-auto p-4 sm:p-8 w-full pb-24">
          
          {/* Hero / Info */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
             <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-yellow-200 to-yellow-500">
               Invest in Your Knowledge
             </h1>
             <p className="text-slate-400 text-lg max-w-xl mx-auto">
               G_COINS unlock powerful AI features. Generate instant notes, quizzes, and flashcards to supercharge your study sessions.
             </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT: Packages Grid */}
            <div className="lg:col-span-2 space-y-6">
               <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-300">
                    <Zap size={18} className="text-purple-400" /> Popular Packages
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full border border-white/5">
                     <Globe size={12} />
                     <span>Prices in {currency.code}</span>
                  </div>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {predefinedPackages.map((pkg) => (
                    <motion.button
                      key={pkg.gCoins}
                      whileHover={{ scale: 1.02, translateY: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handlePredefinedPurchase(pkg)}
                      disabled={loading || !paystackReady}
                      className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 group overflow-hidden ${
                         pkg.popular 
                         ? 'bg-purple-900/20 border-purple-500/50 shadow-lg shadow-purple-900/20' 
                         : 'bg-slate-800/40 border-white/10 hover:bg-slate-800/60 hover:border-purple-500/30'
                      }`}
                    >
                       {/* Background Shine Effect */}
                       <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                       
                       {pkg.popular && (
                          <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-lg">
                             BEST VALUE
                          </div>
                       )}

                       <div className="mb-4 relative">
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${pkg.popular ? 'bg-yellow-500/20' : 'bg-slate-700/50'}`}>
                             <Coins size={32} className="text-yellow-400" />
                          </div>
                          {pkg.popular && (
                             <motion.div 
                               animate={{ rotate: 360 }}
                               transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                               className="absolute inset-0 border-2 border-dashed border-yellow-500/30 rounded-full"
                             />
                          )}
                       </div>

                       <h3 className="text-2xl font-bold text-white mb-1">
                          {pkg.gCoins} <span className="text-sm font-normal text-slate-400">G_COINS</span>
                       </h3>
                       <p className="text-purple-300 font-medium mb-4">
                          {currency.symbol}{(pkg.amount * currency.rate).toFixed(2)}
                       </p>

                       <div className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                          pkg.popular ? 'bg-purple-600 text-white group-hover:bg-purple-500' : 'bg-slate-700 text-slate-300 group-hover:bg-slate-600 group-hover:text-white'
                       }`}>
                          {loading && selectedAmount === pkg.amount ? <Loader2 className="animate-spin" size={16} /> : "Buy Now"}
                       </div>
                    </motion.button>
                  ))}
               </div>
            </div>

            {/* RIGHT: Custom Amount & Email */}
            <div className="space-y-6">
               <motion.div 
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: 0.1 }}
                 className="bg-slate-800/40 backdrop-blur-md border border-white/10 rounded-2xl p-6"
               >
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-300 mb-6">
                     <CreditCard size={18} className="text-purple-400" /> Payment Details
                  </h3>

                  {/* Email Input */}
                  <div className="mb-5">
                     <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Receipt Email</label>
                     <div className="relative">
                        <input
                           type="email"
                           value={paystackEmail}
                           onChange={(e) => setPaystackEmail(e.target.value)}
                           className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none transition-all pl-10"
                           placeholder="name@example.com"
                        />
                        <div className="absolute left-3 top-3.5 text-slate-500">
                           <Wallet size={16} />
                        </div>
                     </div>
                  </div>

                  {/* Custom Amount */}
                  <div className="mb-6">
                     <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Custom Amount</label>
                     <div className="flex gap-2">
                        <div className="relative flex-1">
                           <input
                              type="number"
                              value={gCoinsAmount}
                              onChange={(e) => setGCoinsAmount(e.target.value)}
                              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none transition-all pl-8"
                              placeholder="0.00"
                              min={(5 * currency.rate).toFixed(2)}
                           />
                           <span className="absolute left-3 top-3.5 text-slate-400 text-sm">{currency.symbol}</span>
                        </div>
                        <button
                           onClick={handleCustomPurchase}
                           disabled={loading || !paystackReady}
                           className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 rounded-xl font-bold transition-colors"
                        >
                           {loading && selectedAmount === parseFloat(gCoinsAmount) / currency.rate ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        </button>
                     </div>
                     <p className="text-[10px] text-slate-500 mt-2">
                        Min purchase: {(5 * currency.rate).toFixed(2)} {currency.code}. <br/>
                        Rate: 1 {currency.code} ≈ {(1 / currency.rate).toFixed(2)} G_COINS
                     </p>
                  </div>

                  {/* Trust Footer */}
                  <div className="pt-4 border-t border-white/5 text-center">
                     <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                        <ShieldCheck size={12} className="text-green-500" />
                        Secured by Paystack
                     </p>
                     <p className="text-[10px] text-slate-600 mt-1">
                        We support Cards, Mobile Money & Bank Transfers.
                     </p>
                  </div>
               </motion.div>
            </div>

          </div>

          <div className="text-center mt-12">
            <Link to="/community-support" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-purple-400 transition-colors">
               <LifeBuoy size={16} /> Have billing questions? Contact Support
            </Link>
          </div>

        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 p-4 z-40 flex justify-around items-center pb-6">
        <Link to="/dashboard" className="flex flex-col items-center gap-1 text-slate-400 hover:text-purple-400 transition-colors">
           <LayoutDashboard size={20} />
           <span className="text-[10px]">Home</span>
        </Link>
        <Link to="/community-support" className="flex flex-col items-center gap-1 text-slate-400 hover:text-purple-400 transition-colors">
           <LifeBuoy size={20} />
           <span className="text-[10px]">Support</span>
        </Link>
        <button className="flex flex-col items-center gap-1 text-purple-400">
           <Coins size={20} />
           <span className="text-[10px]">Coins</span>
        </button>
        <button onClick={handleLogout} className="flex flex-col items-center gap-1 text-slate-400 hover:text-red-400 transition-colors">
           <LogOut size={20} />
           <span className="text-[10px]">Logout</span>
        </button>
      </div>

    </div>
  );
}

export default BuyCoins;