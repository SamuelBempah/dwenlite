import { Link } from 'react-router-dom';

function Legal() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 flex items-center justify-center py-8">
      <div className="bg-white p-6 sm:p-8 md:p-12 rounded-lg shadow-lg w-full max-w-md sm:max-w-lg md:max-w-3xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 md:mb-8 text-center">Terms & Privacy</h2>

        {/* Terms of Service */}
        <section className="mb-8 md:mb-12 border-b border-gray-200 pb-6">
          <h3 className="text-xl sm:text-2xl font-semibold text-purple-600 mb-4 md:mb-6 border-l-4 border-purple-600 pl-4">Terms of Service</h3>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Welcome to my app, a solo developer's labor of love, powered by coffee and late-night coding binges. By using this app, you agree to these Terms of Service—think of them as the house rules for our digital playground.
          </p>
          <div className="md:grid md:grid-cols-2 md:gap-6">
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">1. Using the App</h4>
              <p className="text-gray-600 leading-relaxed">
                Enjoy the app’s features, but don’t try to hack it or use it for world domination. I’m just one coder, and my debugger is already overworked. You must be 13+, or I’ll send you to play with virtual crayons.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">2. Your Account</h4>
              <p className="text-gray-600 leading-relaxed">
                Protect your password like it’s your secret cookie recipe. If it’s “password123,” I’m judging you silently. You’re responsible for your account’s actions, unless a rogue AI takes over.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">3. Behavior Rules</h4>
              <p className="text-gray-600 leading-relaxed">
                Keep it friendly—no spamming, trolling, or posting anything that’d make my grandma gasp. I’ll delete naughty content faster than I down my morning latte.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">4. My Liability</h4>
              <p className="text-gray-600 leading-relaxed">
                The app is “as is,” like a thrift store treasure. I’m not liable if it crashes, loses your data, or sends your grocery list to Narnia. Use it wisely, and maybe keep a backup.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">5. Kicking You Out</h4>
              <p className="text-gray-600 leading-relaxed">
                Break the rules, and I might have to yeet your account. I can suspend or delete it if you misbehave or if my coffee supply runs dry. You can leave anytime, too—no drama.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">6. Changing the Rules</h4>
              <p className="text-gray-600 leading-relaxed">
                I might update these terms between coding marathons. I’ll try to email you, but check back here. Keep using the app, and you’re giving me a virtual high-five.
              </p>
            </div>
          </div>
          <p className="text-gray-600 leading-relaxed">
            Questions? Email me at{' '}
            <a href="mailto:samuelbempah@sbmintechnologies.com" className="text-purple-600 hover:underline hover:bg-purple-50 px-1 rounded">
            samuelbempah@sbmintechnologies.com
            </a>
            . I’ll reply unless I’m wrestling with a bug.
          </p>
        </section>

        {/* Privacy Policy */}
        <section>
          <h3 className="text-xl sm:text-2xl font-semibold text-purple-600 mb-4 md:mb-6 border-l-4 border-purple-600 pl-4">Privacy Policy</h3>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Your privacy matters more than my sacred coffee stash. This Privacy Policy explains how I handle your data while keeping this app alive on a diet of code and chaos.
          </p>
          <div className="md:grid md:grid-cols-2 md:gap-6">
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">1. What I Collect</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li><strong>Account Info</strong>: Name, email, and your (hopefully strong) password. Google sign-in shares your name and email.</li>
                <li><strong>Usage Data</strong>: How you use the app, like button clicks. Helps me figure out what’s awesome or broken.</li>
                <li><strong>Device Info</strong>: Browser or device type, so I don’t crash your retro Nokia.</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">2. How I Use It</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li>Keep your account running without a meltdown.</li>
                <li>Improve the app, fix bugs, and avoid digital tantrums.</li>
                <li>Send updates, but I won’t spam you with GIFs (tempting, though).</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">3. Sharing Your Data</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li><strong>Service Providers</strong>: Like Firebase for logins. They’re sworn to secrecy.</li>
                <li><strong>Legal Needs</strong>: If the law demands data, I’ll comply but grumble loudly.</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">4. Keeping It Safe</h4>
              <p className="text-gray-600 leading-relaxed">
                Data’s stored in secure cloud servers, with encryption and techy locks. Nothing’s 100% hack-proof, but I’ll scream and notify you if there’s a breach.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">5. Your Control</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li>Email{' '}
                  <a href="mailto:samuelbempah@sbmintechnologies.com" className="text-purple-600 hover:underline hover:bg-purple-50 px-1 rounded">
                  samuelbempah@sbmintechnologies.com
                  </a>{' '}
                  to delete your account. I’ll miss you.</li>
                <li>Opt out of emails—your inbox deserves peace.</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">6. Cookies</h4>
              <p className="text-gray-600 leading-relaxed">
                I use cookies (not the edible kind) to remember you. Block them if you want, but the app might act like it has amnesia.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">7. Policy Updates</h4>
              <p className="text-gray-600 leading-relaxed">
                I might tweak this policy during a coding frenzy. I’ll try to email you, but check here. Keep using the app, and you’re on board.
              </p>
            </div>
          </div>
          <p className="text-gray-600 leading-relaxed">
            Got questions? Reach out at{' '}
            <a href="mailto:samuelbempah@sbmintechnologies.com" className="text-purple-600 hover:underline hover:bg-purple-50 px-1 rounded">
              samuelbempah@sbmintechnologies.com
            </a>
            . I’ll answer unless I’m untangling code or my headphones.
          </p>
        </section>

        <div className="text-center mt-6 md:mt-8">
          <Link
            to="/signup"
            className="text-purple-600 hover:underline hover:bg-purple-50 px-2 py-1 rounded"
          >
            Back to Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Legal;