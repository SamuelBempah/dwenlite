import { useState, useEffect } from 'react';
import { auth, db, storage } from '../firebase';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';

function Reports() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gig, setGig] = useState('');
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    const checkOperatingHours = () => {
      const now = new Date();
      const hours = now.getHours();
      const isSunday = now.getDay() === 0; // 0 represents Sunday
      // Closed on Sundays or at exactly 9:00 PM (21:00) until 8:00 AM (08:00)
      setIsClosed(isSunday || hours >= 21 || hours < 8);
    };

    checkOperatingHours();
    const interval = setInterval(checkOperatingHours, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setCurrentUser(user);
        fetchUserName(user.uid);
      } else {
        toast.error('Please log in to submit a report.');
        navigate('/login');
      }
    });
    return () => unsubscribeAuth();
  }, [navigate]);

  const fetchUserName = async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const name = userData.name || userData.displayName || userData.email || `User_${userId.slice(0, 8)}`;
        setUserName(name);
      } else {
        console.warn(`User document not found for UID: ${userId}`);
        setUserName(`User_${userId.slice(0, 8)}`);
      }
    } catch (err) {
      console.error('Fetch user name error:', err.code, err.message);
      setUserName(`User_${userId.slice(0, 8)}`);
      toast.error('Failed to fetch user data. Using fallback name.');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.type.includes('image') || file.type === 'application/pdf')) {
      setScreenshot(file);
    } else {
      toast.error('Please upload a valid image or PDF file.');
      setScreenshot(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isClosed) {
      toast.error('We are closed for the day. Please come back at 8 AM (Monday to Saturday).');
      return;
    }
    if (!reportType) {
      toast.error('Please select a report type.');
      return;
    }
    if (!phoneNumber || !/^\+233\d{9}$/.test(phoneNumber)) {
      toast.error('Please enter a valid Ghanaian phone number (e.g., +233XXXXXXXXX).');
      return;
    }
    if (!gig || !time || !date || !orderStatus) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (!screenshot) {
      toast.error('Please upload a screenshot or PDF as proof.');
      return;
    }

    setLoading(true);
    try {
      // Upload screenshot to Firebase Storage
      const storageRef = ref(storage, `data_reports/${currentUser.uid}/${Date.now()}_${screenshot.name}`);
      await uploadBytes(storageRef, screenshot);
      const screenshotURL = await getDownloadURL(storageRef);

      // Save report to Firestore data_reports collection
      const reportData = {
        userId: currentUser.uid,
        userName,
        reportType,
        phoneNumber,
        gig,
        time,
        date,
        orderStatus,
        screenshotURL,
        timestamp: new Date(),
        status: 'Pending',
      };

      await addDoc(collection(db, 'data_reports'), reportData);

      // Send SMS notification to admin
      try {
        await axios.post('https://sms-backend.fly.dev/send-sms', {
          phoneNumber: '+233532095500',
          message: `${userName} reported unreceived ${gig} bundle for ${reportType} on ${phoneNumber}. Order Status: ${orderStatus}.`,
        });
      } catch (smsError) {
        console.error('SMS notification error:', smsError.message);
      }

      toast.success('Report submitted successfully! We will review it soon.');
      setReportType('');
      setPhoneNumber('');
      setGig('');
      setTime('');
      setDate('');
      setOrderStatus('');
      setScreenshot(null);
    } catch (err) {
      console.error('Report submission error:', err.message);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
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
          @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
          }
          .pulse-glow {
            animation: pulseGlow 2s infinite;
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
        `}
      </style>

      {isClosed && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg mb-6 flex items-center gap-3">
          <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l2 2m-2-10a9 9 0 100 18 9 9 0 000-18z"/>
          </svg>
          <p className="text-sm md:text-base">
            <strong>Notice:</strong> We are closed for the day. Please come back at 8 AM (Monday to Saturday).
          </p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-purple-400">Report Unreceived Bundles</h1>
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
        {!isClosed && (
          <div className="bg-gray-900/50 border border-gray-700 text-gray-200 p-4 rounded-lg mb-6 flex items-center gap-3">
            <svg className="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p className="text-sm md:text-base">
              <strong>Notice:</strong> For AirtelTigo, please check your balance with *504# (iShare) as delivery is instant. For MTN (*124# and *138#) or Telecel (*124# and *126#), submit the required details below.
            </p>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">Select Report Type</h3>
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setReportType('MTN')}
              className={`px-4 py-2 rounded-lg ${reportType === 'MTN' ? 'bg-purple-600' : 'bg-gray-700'} ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'}`}
              disabled={loading || isClosed}
            >
              MTN
            </button>
            <button
              onClick={() => setReportType('Telecel')}
              className={`px-4 py-2 rounded-lg ${reportType === 'Telecel' ? 'bg-purple-600' : 'bg-gray-700'} ${isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'}`}
              disabled={loading || isClosed}
            >
              Telecel
            </button>
          </div>
        </div>

        {reportType && !isClosed && (
          <div className="card p-6 mb-6">
            <h3 className="text-base md:text-lg font-semibold text-purple-300 mb-3">{reportType} Report Form</h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm md:text-base text-gray-300 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g., +233XXXXXXXXX"
                  className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
                  disabled={loading}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm md:text-base text-gray-300 mb-2">Gig</label>
                <input
                  type="text"
                  value={gig}
                  onChange={(e) => setGig(e.target.value)}
                  placeholder="e.g., 1GB"
                  className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
                  disabled={loading}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm md:text-base text-gray-300 mb-2">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
                  disabled={loading}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm md:text-base text-gray-300 mb-2">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
                  disabled={loading}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm md:text-base text-gray-300 mb-2">Order Status</label>
                <select
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}
                  className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
                  disabled={loading}
                >
                  <option value="">Select status</option>
                  <option value="Pending">Pending</option>
                  <option value="Processing">Processing</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm md:text-base text-gray-300 mb-2">
                  {reportType === 'MTN' ? 'Data Balance Screenshot (*124# and *138#)' : 
                   'Data Balance Screenshot (*124# and *126#)'}
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-purple-500 focus:outline-none text-sm md:text-base"
                  disabled={loading}
                />
                {screenshot && <p className="text-gray-400 text-sm mt-2">Selected: {screenshot.name}</p>}
              </div>
              <div className="text-center">
                <button
                  type="submit"
                  disabled={loading || isClosed}
                  className={`bg-purple-600 text-white py-3 px-6 rounded-lg ${loading || isClosed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700 hover-scale'} text-sm md:text-base`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Submitting...
                    </span>
                  ) : (
                    'Submit Report'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="text-center mt-8 text-gray-400 text-sm">
          <p>
            Need further assistance?{' '}
            <Link to="/community-support" className="text-purple-300 hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Reports;