import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, collection, addDoc, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';

function Bundles() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [gCoins, setGCoins] = useState(0);
  const [gCoinsAnimating, setGCoinsAnimating] = useState(false);
  const [premiumGCoins, setPremiumGCoins] = useState(0);
  const [purchases, setPurchases] = useState([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isFireSale, setIsFireSale] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  const bundleData = {
    MTN: [
      { name: '1GB', cost: 4.54, gCoins: 5 },
      { name: '2GB', cost: 9.08, gCoins: 9 },
      { name: '3GB', cost: 13.6, gCoins: 14 },
      { name: '4GB', cost: 18.3, gCoins: 18 },
      { name: '5GB', cost: 22.2, gCoins: 22 },
      { name: '6GB', cost: 26.5, gCoins: 27 },
      { name: '8GB', cost: 36.0, gCoins: 36 },
      { name: '10GB', cost: 41.5, gCoins: 42 },
      { name: '15GB', cost: 61.0, gCoins: 61 },
      { name: '20GB', cost: 80.0, gCoins: 80 },
      { name: '25GB', cost: 99.0, gCoins: 99 },
      { name: '30GB', cost: 120.0, gCoins: 120 },
      { name: '50GB', cost: 196.0, gCoins: 196 },
    ],
    AirtelTigo: [
      { name: '1GB', cost: 4.0, gCoins: 4 },
      { name: '2GB', cost: 7.8, gCoins: 8 },
      { name: '3GB', cost: 11.6, gCoins: 12 },
      { name: '4GB', cost: 15.2, gCoins: 15 },
      { name: '5GB', cost: 19.0, gCoins: 19 },
      { name: '6GB', cost: 22.8, gCoins: 23 },
      { name: '7GB', cost: 26.6, gCoins: 27 },
      { name: '8GB', cost: 30.4, gCoins: 30 },
      { name: '9GB', cost: 34.2, gCoins: 34 },
      { name: '10GB', cost: 38.0, gCoins: 38 },
      { name: '12GB', cost: 45.6, gCoins: 46 },
      { name: '15GB', cost: 57.0, gCoins: 57 },
      { name: '20GB', cost: 76.0, gCoins: 76 },
      { name: '25GB', cost: 95.0, gCoins: 95 },
      { name: '30GB', cost: 114.0, gCoins: 114 },
      { name: '40GB', cost: 152.0, gCoins: 152 },
      { name: '50GB', cost: 190.0, gCoins: 190 },
    ],
    Telecel: [
      { name: '5GB', cost: 23.0, gCoins: 23 },
      { name: '10GB', cost: 40.0, gCoins: 40 },
      { name: '20GB', cost: 76.0, gCoins: 76 },
      { name: '30GB', cost: 114.0, gCoins: 114 },
      { name: '40GB', cost: 148.0, gCoins: 148 },
      { name: '50GB', cost: 185.0, gCoins: 185 },
    ],
  };

  const getDiscountedBundleData = () => {
    if (!isFireSale) return bundleData;
    const discountedData = JSON.parse(JSON.stringify(bundleData));
    Object.keys(discountedData).forEach(network => {
      discountedData[network] = discountedData[network].map(bundle => {
        // Apply 50% discount only to bundles from 1GB to 5GB
        const bundleSize = parseFloat(bundle.name);
        if (bundleSize >= 1 && bundleSize <= 5) {
          return {
            ...bundle,
            cost: bundle.cost * 0.5,
            gCoins: Math.ceil(bundle.gCoins * 0.5),
          };
        }
        return bundle;
      });
    });
    return discountedData;
  };

  const displayedBundleData = getDiscountedBundleData();

  useEffect(() => {
    const checkOperatingHours = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const isSunday = now.getDay() === 0; // 0 represents Sunday
      // Closed on Sundays or at exactly 9:00 PM (21:00) until 8:00 AM (08:00)
      setIsClosed(isSunday || hours >= 21 || hours < 8);
      // Fire sale from 8:00 PM (20:00) to 8:30 PM (20:30), not on Sundays
      setIsFireSale(!isSunday && hours === 20 && minutes >= 0 && minutes <= 29);
    };

    checkOperatingHours();
    const interval = setInterval(checkOperatingHours, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setCurrentUser(user);
        fetchUserGCoins(user.uid);
        const fetchPurchases = async () => {
          try {
            setIsLoadingPurchases(true);
            const purchasesRef = collection(db, 'purchases');
            const q = query(purchasesRef, where('userId', '==', user.uid));
            const querySnapshot = await getDocs(q);
            const userPurchases = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPurchases(userPurchases);
          } catch (err) {
            console.error('Fetch purchases error:', err);
            toast.error('Failed to load purchase history. Please try again.');
          } finally {
            setIsLoadingPurchases(false);
          }
        };
        fetchPurchases();

        const purchasesRef = collection(db, 'purchases');
        const q = query(purchasesRef, where('userId', '==', user.uid));
        const unsubscribePurchases = onSnapshot(q, (snapshot) => {
          const userPurchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setPurchases(userPurchases);
          setIsLoadingPurchases(false);
        }, (err) => {
          console.error('Purchase listener error:', err);
          toast.error('Failed to listen for purchase updates.');
        });

        return () => unsubscribePurchases();
      } else {
        toast.error('Please log in to buy bundles.');
        navigate('/login');
      }
    });
    return () => unsubscribeAuth();
  }, [navigate]);

  const fetchUserGCoins = async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : { gCoins: 0, purchasedGCoins: 0 };
      const totalGCoins = userData.gCoins || 0;
      const purchasedGCoins = userData.purchasedGCoins || 0;
      setGCoins(totalGCoins);
      setPremiumGCoins(purchasedGCoins);
    } catch (err) {
      console.error('Fetch G_COINS error:', err);
      toast.error('Failed to fetch G_COINS. Please try again.');
    }
  };

  const refreshGCoins = () => {
    if (currentUser) fetchUserGCoins(currentUser.uid);
  };

  const updateUserGCoins = async (userId, deduction) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : { gCoins: 0, purchasedGCoins: 0 };
      const totalGCoins = userData.gCoins || 0;
      const purchasedGCoins = userData.purchasedGCoins || 0;

      if (deduction > purchasedGCoins) {
        throw new Error('Insufficient premium G_COINS.');
      }

      await updateDoc(userRef, { gCoins: totalGCoins - deduction, purchasedGCoins: purchasedGCoins - deduction });
      setGCoins(totalGCoins - deduction);
      setPremiumGCoins(purchasedGCoins - deduction);
      setGCoinsAnimating(true);
      setTimeout(() => setGCoinsAnimating(false), 1000);
    } catch (err) {
      console.error('Update G_COINS error:', err);
      toast.error(`Failed to update G_COINS: ${err.message}`);
    }
  };

  const handlePurchase = async () => {
    if (isClosed) {
      toast.error('We are closed for the day. Please come back at 8 AM (Monday to Saturday).');
      return;
    }
    if (!phoneNumber || !selectedNetwork || !selectedBundle) {
      toast.error('Please fill in all fields and select a bundle.');
      return;
    }
    if (!/^\+233\d{9}$/.test(phoneNumber)) {
      toast.error('Please enter a valid Ghanaian phone number (e.g., +233XXXXXXXXX).');
      return;
    }

    const bundle = displayedBundleData[selectedNetwork].find(b => b.name === selectedBundle.name);
    if (premiumGCoins === 0) {
      toast.error('Free G_COINS cannot be used for bundles. Please buy premium G_COINS.');
      navigate('/buy-coins');
      return;
    }
    if (premiumGCoins < bundle.gCoins) {
      toast.error('Insufficient premium G_COINS. Please buy more G_COINS.');
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmPurchase = async () => {
    if (isClosed) {
      toast.error('We are closed for the day. Please come back at 8 AM (Monday to Saturday).');
      setShowConfirmModal(false);
      return;
    }
    setShowConfirmModal(false);
    setLoading(true);
    try {
      const bundle = displayedBundleData[selectedNetwork].find(b => b.name === selectedBundle.name);
      const purchaseRef = await addDoc(collection(db, 'purchases'), {
        userId: currentUser.uid,
        phoneNumber, // Store user's phone number for the bundle credit
        network: selectedNetwork,
        bundleName: selectedBundle.name,
        gCoins: bundle.gCoins,
        status: 'Pending',
        timestamp: new Date(),
      });

      await updateUserGCoins(currentUser.uid, bundle.gCoins);

      // Send SMS notification to admin
      try {
        await axios.post('https://sms-backend.fly.dev/send-sms', {
          phoneNumber: '+233532095500', // Fixed admin phone number for notification
          bundleName: selectedBundle.name,
          network: selectedNetwork,
          gCoins: bundle.gCoins,
        });
      } catch (smsError) {
        console.error('SMS notification error:', smsError);
      }

      toast.success(`Purchase successful! ${selectedBundle.name} will be credited to ${phoneNumber}. Processing time: ${selectedNetwork === 'MTN' ? '30 min - 1 hour' : 'instant'}.`);
      setSelectedBundle(null);
      refreshGCoins();
    } catch (err) {
      console.error('Purchase error:', err);
      toast.error('Failed to process purchase. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cancelPurchase = () => {
    setShowConfirmModal(false);
  };

  if (!currentUser) return null;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8">
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
          @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes fireFlicker {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(1); opacity: 0.8; }
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
          .status-pending {
            color: #f59e0b;
          }
          .status-processing {
            color: #3b82f6;
          }
          .status-completed {
            color: #10b981;
          }
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
          }
          .modal-content {
            background: linear-gradient(135deg, #2d3748, #1a202c);
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            animation: fadeInScale 0.3s ease;
          }
          .fire-icon {
            animation: fireFlicker 0.5s infinite;
          }
          .closed-icon {
            animation: fireFlicker 0.5s infinite;
          }
        `}
      </style>

      {isFireSale && !isClosed && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg mb-6 flex items-center gap-3">
          <svg className="fire-icon h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3c5.523 0 9 3.477 9 8s-3.477 6-9 6-9-6-9-6zm0 18c-5.523 0-9-3.477-9-8s3.477-9 9-9z"/>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5c3.866 0 7 2.134 7 6s-2.134 4-7 4-7-4-7-6z"/>
          </svg>
          <p className="text-sm md:text-base">
            🔥 FIRE SALE ALERT! Get 50% OFF on all 1GB to 5GB Non-Expiry bundles from now till 8:30PM. Don't miss out!
          </p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-purple-400">Buy Bundles</h1>
      </div>
      <div className="mb-6">
      <Link
        to="/dashboard"
        className="inline-block bg-purple-600 text-white py-1 px-3 rounded hover:bg-purple-700 text-xs"
      >
        Back to Dashboard
      </Link>
      </div>
      <div className="max-w-4xl mx-auto bg-gray-800 p-6 md:p-8 rounded-xl shadow-lg pulse-glow animate-fade-in">
        {isClosed ? (
          <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg mb-6 flex items-center gap-3">
            <svg className="closed-icon h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l2 2m-2-10a9 9 0 100 18 9 9 0 000-18z"/>
            </svg>
            <p className="text-sm md:text-base">
              <strong>Notice:</strong> We are closed for the day. Please come back at 8 AM (Monday to Saturday).
            </p>
          </div>
        ) : (
          <div className="bg-gray-900/50 border border-gray-700 text-gray-200 p-4 rounded-lg mb-6 flex items-center gap-3">
            <svg className="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p className="text-sm md:text-base">
              <strong>Notice:</strong> Ensure the phone number is correct and not a data SIM card. No refunds are allowed.
            </p>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">Enter Phone Number</h3>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g., +233XXXXXXXXX"
            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
            disabled={loading || isClosed}
          />
        </div>

        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">Select Network</h3>
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setSelectedNetwork('MTN')}
              className={`px-4 py-2 rounded-lg ${selectedNetwork === 'MTN' ? 'bg-purple-600' : 'bg-gray-700'} ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'}`}
              disabled={loading || isClosed}
            >
              MTN
            </button>
            <button
              onClick={() => setSelectedNetwork('Telecel')}
              className={`px-4 py-2 rounded-lg ${selectedNetwork === 'Telecel' ? 'bg-purple-600' : 'bg-gray-700'} ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'}`}
              disabled={loading || isClosed}
            >
              Telecel
            </button>
            <button
              onClick={() => setSelectedNetwork('AirtelTigo')}
              className={`px-4 py-2 rounded-lg ${selectedNetwork === 'AirtelTigo' ? 'bg-purple-600' : 'bg-gray-700'} ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'}`}
              disabled={loading || isClosed}
            >
              AirtelTigo
            </button>
          </div>
        </div>

        {selectedNetwork && !isClosed && (
          <div className="mb-6">
            <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">Select Bundle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedBundleData[selectedNetwork].map((bundle) => (
                <div
                  key={bundle.name}
                  className="card p-4 text-center flex flex-col items-center justify-between h-32"
                  onClick={() => !isClosed && setSelectedBundle(bundle)}
                >
                  <h4 className="text-md md:text-lg font-semibold text-white">{bundle.name}</h4>
                  <p className="text-gray-400 text-sm">Cost: {bundle.gCoins} G_COINS</p>
                  <button
                    className={`mt-2 ${selectedBundle?.name === bundle.name ? 'bg-purple-600' : 'bg-gray-600'} text-white py-2 px-4 rounded-lg ${isClosed || premiumGCoins < bundle.gCoins ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'}`}
                    disabled={loading || isClosed || premiumGCoins < bundle.gCoins}
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 text-center">
          <p className={`text-sm md:text-base ${gCoinsAnimating ? 'coins-deduct' : ''}`}>
            💰 Total G_COINS: {gCoins} (Premium: {premiumGCoins})
          </p>
          <button
            onClick={() => navigate('/buy-coins')}
            className={`mt-2 bg-purple-600 text-white py-2 px-4 rounded-lg ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'} text-sm md:text-base`}
            disabled={loading || isClosed}
          >
            Buy More G_COINS
          </button>
        </div>

        {selectedBundle && !isClosed && (
          <div className="text-center mb-6">
            <button
              onClick={handlePurchase}
              disabled={loading || !phoneNumber || !selectedNetwork || premiumGCoins < selectedBundle.gCoins || isClosed}
              className={`bg-purple-600 text-white py-3 px-6 rounded-lg ${isClosed || !phoneNumber || !selectedNetwork || premiumGCoins < selectedBundle.gCoins ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'} text-sm md:text-base`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                'Buy Bundle'
              )}
            </button>
          </div>
        )}

        {showConfirmModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 className="text-lg md:text-xl font-semibold text-purple-300 mb-4">Confirm Purchase</h3>
              <p className="text-gray-400 text-sm mb-4">
                Are you sure you want to purchase <strong>{selectedBundle.name}</strong> ({selectedNetwork}) for <strong>{selectedBundle.gCoins} G_COINS</strong>?
              </p>
              <p className="text-gray-400 text-sm mb-4">
                <strong>Note:</strong> No refunds are allowed. Bundles on MTN take approximately 30 minutes to an hour to reflect, while Telecel and AirtelTigo are instant.
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={cancelPurchase}
                  className={`bg-gray-600 text-white py-2 px-4 rounded-lg ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700 hover-scale'} text-sm md:text-base`}
                  disabled={loading || isClosed}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPurchase}
                  className={`bg-purple-600 text-white py-2 px-4 rounded-lg ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'} text-sm md:text-base ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={loading || isClosed}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">Purchase History</h3>
          {isLoadingPurchases ? (
            <p className="text-gray-400 text-sm">Loading purchase history...</p>
          ) : purchases.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="card p-4 flex justify-between items-center"
                >
                  <div>
                    <p className="text-sm md:text-base font-semibold">
                      {purchase.bundleName} ({purchase.network})
                    </p>
                    <p className="text-gray-400 text-sm">
                      Phone: {purchase.phoneNumber} | Cost: {purchase.gCoins} G_COINS
                    </p>
                    <p className="text-gray-400 text-sm">
                      Purchased: {new Date(purchase.timestamp.toDate()).toLocaleString()}
                    </p>
                  </div>
                  <p className={`text-sm md:text-base status-${purchase.status.toLowerCase()}`}>
                    Status: {purchase.status}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No purchases found.</p>
          )}
        </div>
      </div>
      
      {/* Footer Note */}
      <div className="text-center mt-8 text-gray-400 text-sm">
        <p>
          Haven't received your bundle yet?{' '}
          <Link to="/reports" className="text-purple-300 hover:underline">
            Report Your Case
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Bundles;