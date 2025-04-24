import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

function SupportMe() {
  const navigate = useNavigate();
  const [donationAmount, setDonationAmount] = useState('');
  const [paystackEmail, setPaystackEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('paystack');

  const predefinedAmounts = [50, 100, 250, 500];
  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

  // Load Paystack script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handlePaystackPayment = (amount, email) => {
    if (!paystackPublicKey) {
      toast.error('Paystack configuration error. Please contact support.');
      return;
    }

    if (!window.PaystackPop) {
      toast.error('Paystack SDK not loaded. Please try again.');
      return;
    }

    const handler = window.PaystackPop.setup({
      key: paystackPublicKey,
      email: email,
      amount: amount * 100, // Convert GHS to pesewas
      currency: 'GHS',
      ref: `DONATION_${Math.floor(Math.random() * 1000000)}`,
      callback: (response) => {
        toast.success(`Payment successful! Reference: ${response.reference}`);
        setLoading(false);
        setDonationAmount('');
        setPaystackEmail('');
        setSelectedAmount(null);
      },
      onClose: () => {
        toast('Payment cancelled.');
        setLoading(false);
        setSelectedAmount(null);
      },
    });
    handler.openIframe();
  };

  const handlePaypalPayment = (amount) => {
    setDonationAmount(amount.toString());
    setSelectedAmount(amount);
    toast('Please click "Donate Now" to proceed with PayPal.');
    setLoading(false);
  };

  const handleDonation = (amount, email) => {
    setLoading(true);
    if (paymentMethod === 'paystack') {
      if (!validateEmail(email)) {
        toast.error('Please enter a valid email address.');
        setLoading(false);
        return;
      }
      handlePaystackPayment(amount, email);
    } else if (paymentMethod === 'paypal') {
      handlePaypalPayment(amount);
    }
  };

  const handleCustomDonation = () => {
    const amount = parseFloat(donationAmount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid donation amount.');
      return;
    }
    handleDonation(amount, paystackEmail);
  };

  const handlePredefinedAmount = (amount) => {
    setDonationAmount(amount.toString());
    handleDonation(amount, paystackEmail);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 md:p-8">
      <style>
        {`
          .pp-EWMP32Y69EYQA {
            text-align: center;
            border: none;
            border-radius: 0.25rem;
            min-width: 11.625rem;
            padding: 0 2rem;
            height: 2.625rem;
            font-weight: bold;
            background-color: #FFD140;
            color: #000000;
            font-family: "Helvetica Neue", Arial, sans-serif;
            font-size: 1rem;
            line-height: 1.25rem;
            cursor: pointer;
          }
          .pp-EWMP32Y69EYQA:hover {
            background-color: #FFC107;
          }
        `}
      </style>

      {/* Header */}
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Support the Project</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-400 hover:text-white text-sm md:text-base"
        >
          Back to Dashboard
        </button>
      </div>

      {/* Donation Section */}
      <div className="text-center mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-2">Make a Donation</h2>
        <p className="text-gray-400 text-sm md:text-base max-w-md mx-auto">
          Your support helps keep this project alive and growing. Every little bit counts!
        </p>
      </div>

      <div className="max-w-md md:max-w-lg mx-auto bg-gray-800 p-4 md:p-6 rounded-lg shadow-lg">
        {/* Payment Method Selector */}
        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold mb-3">Select Payment Method</h3>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setPaymentMethod('paystack')}
              className={`py-2 px-4 rounded-lg text-sm md:text-base ${
                paymentMethod === 'paystack'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Paystack (GHS)
            </button>
            <button
              onClick={() => setPaymentMethod('paypal')}
              className={`py-2 px-4 rounded-lg text-sm md:text-base ${
                paymentMethod === 'paypal'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              PayPal (USD)
            </button>
          </div>
        </div>

        {/* Predefined Donation Amounts */}
        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold mb-3">
            Choose an Amount ({paymentMethod === 'paystack' ? 'GHS' : 'USD'})
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            {predefinedAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => handlePredefinedAmount(amount)}
                disabled={loading && selectedAmount === amount}
                className={`bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base ${
                  loading && selectedAmount === amount ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {paymentMethod === 'paystack' ? '₵' : '$'}{amount}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Donation Input */}
        <div className="mb-6">
          <h3 className="text-base md:text-lg font-semibold mb-3">Or Enter Custom Amount</h3>
          {paymentMethod === 'paystack' ? (
            <div className="flex flex-col gap-3">
              <input
                type="email"
                value={paystackEmail}
                onChange={(e) => setPaystackEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="p-2 rounded-lg bg-gray-700 text-white w-full text-sm md:text-base"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  placeholder="Enter amount in GHS"
                  min="1"
                  step="0.01"
                  className="p-2 rounded-lg bg-gray-700 text-white w-full text-sm md:text-base"
                />
                <button
                  onClick={handleCustomDonation}
                  disabled={loading && selectedAmount === parseFloat(donationAmount)}
                  className={`bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base ${
                    loading && selectedAmount === parseFloat(donationAmount) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading && selectedAmount === parseFloat(donationAmount) ? (
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
                    'Donate'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                placeholder="Enter amount in USD"
                min="1"
                step="0.01"
                className="p-2 rounded-lg bg-gray-700 text-white w-full text-sm md:text-base"
              />
            </div>
          )}
        </div>

        {/* PayPal Form */}
        {paymentMethod === 'paypal' && donationAmount && (
          <div className="mb-6 text-center">
            <h3 className="text-base md:text-lg font-semibold mb-3">Complete Payment</h3>
            <form
              action="https://www.paypal.com/ncp/payment/EWMP32Y69EYQA"
              method="post"
              target="_blank"
              style={{
                display: 'inline-grid',
                justifyItems: 'center',
                alignContent: 'start',
                gap: '0.5rem',
              }}
            >
              <input className="pp-EWMP32Y69EYQA" type="submit" value={`Donate $${donationAmount}`} />
              <img
                src="https://www.paypalobjects.com/images/Debit_Credit_APM.svg"
                alt="cards"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
              <section style={{ fontSize: '0.75rem' }}>
                Powered by{' '}
                <img
                  src="https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-wordmark-color.svg"
                  alt="paypal"
                  style={{ height: '0.875rem', verticalAlign: 'middle' }}
                />
              </section>
            </form>
            <p className="text-gray-400 text-sm mt-2">
              Click "Donate Now" to complete your ${donationAmount} payment via PayPal.
            </p>
          </div>
        )}

        {/* Note */}
        <p className="text-gray-400 text-sm text-center">
          {paymentMethod === 'paystack'
            ? 'Pay with mobile money or card via Paystack.'
            : 'Pay with PayPal in USD.'}
        </p>
      </div>

      {/* Footer Note */}
      <div className="text-center mt-8 text-gray-400 text-sm">
        <p>
          Need help?{' '}
          <a href="mailto:samuelbempah@sbmindtechnologies.com" className="text-purple-400 hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}

export default SupportMe;