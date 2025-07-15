import { Link } from 'react-router-dom';

function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 flex items-center justify-center py-8">
      <div className="bg-white p-6 sm:p-8 md:p-12 rounded-lg shadow-lg w-full max-w-md sm:max-w-lg md:max-w-3xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 md:mb-8 text-center">Terms & Privacy</h2>

        {/* Terms of Service */}
        <section className="mb-8 md:mb-12 border-b border-gray-200 pb-6">
          <h3 className="text-xl sm:text-2xl font-semibold text-purple-600 mb-4 md:mb-6 border-l-4 border-purple-600 pl-4">Terms of Service</h3>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Welcome to DwenLite, an AI-powered study tool designed to enhance your learning experience. By accessing or using DwenLite, you agree to comply with these Terms of Service, which govern your use of our platform and services.
          </p>
          <div className="md:grid md:grid-cols-2 md:gap-6">
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">1. Use of the Platform</h4>
              <p className="text-gray-600 leading-relaxed">
                DwenLite is provided for personal, non-commercial educational use. You may not use the platform for unlawful purposes, to infringe intellectual property rights, or to engage in activities that disrupt the platform’s functionality, such as attempting to reverse-engineer or access its AI algorithms.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">2. Account Responsibilities</h4>
              <p className="text-gray-600 leading-relaxed">
                You are responsible for maintaining the confidentiality of your account credentials. Any activity conducted under your account is your responsibility. You must be at least 13 years old to use DwenLite, and users under 18 require parental consent.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">3. Acceptable Conduct</h4>
              <p className="text-gray-600 leading-relaxed">
                Users must engage with DwenLite respectfully. Prohibited actions include posting harmful, offensive, or misleading content, spamming, or attempting to manipulate the AI to generate inappropriate outputs. We reserve the right to remove content that violates these terms.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">4. Intellectual Property</h4>
              <p className="text-gray-600 leading-relaxed">
                All content, AI models, and materials provided by DwenLite are owned by SBMind Technologies or its licensors. You may not copy, modify, distribute, or create derivative works from our content without prior written consent.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">5. AI-Generated Content</h4>
              <p className="text-gray-600 leading-relaxed">
                DwenLite’s AI generates study materials based on user inputs. While we strive for accuracy, you are responsible for verifying the correctness of AI-generated content before use. DwenLite is not liable for errors or omissions in AI outputs.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">6. Limitation of Liability</h4>
              <p className="text-gray-600 leading-relaxed">
                DwenLite is provided “as is” without warranties of any kind. SBMind Technologies is not liable for any damages, including loss of data or academic setbacks, arising from your use of the platform.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">7. Termination</h4>
              <p className="text-gray-600 leading-relaxed">
                We may suspend or terminate your access to DwenLite for violations of these terms or for any reason at our discretion. You may delete your account at any time by contacting us.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">8. Updates to Terms</h4>
              <p className="text-gray-600 leading-relaxed">
                We may revise these Terms of Service periodically. You will be notified of significant changes via email or through the platform. Continued use of DwenLite after changes constitutes your acceptance of the updated terms.
              </p>
            </div>
          </div>
          <p className="text-gray-600 leading-relaxed">
            For inquiries, please contact us at{' '}
            <a href="mailto:info@sbmindtechnologies.com" className="text-purple-600 hover:underline hover:bg-purple-50 px-1 rounded">
              info@sbmindtechnologies.com
            </a>.
          </p>
        </section>

        {/* Privacy Policy */}
        <section>
          <h3 className="text-xl sm:text-2xl font-semibold text-purple-600 mb-4 md:mb-6 border-l-4 border-purple-600 pl-4">Privacy Policy</h3>
          <p className="text-gray-600 mb-6 leading-relaxed">
            At SBMind Technologies, we are committed to protecting your privacy. This Privacy Policy outlines how we collect, use, share, and safeguard your personal information while you use DwenLite, our AI-powered study tool.
          </p>
          <div className="md:grid md:grid-cols-2 md:gap-6">
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">1. Information We Collect</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li><strong>Account Information</strong>: Your name, email address, and password when you create an account. If you use Google sign-in, we collect your name and email provided by Google.</li>
                <li><strong>Usage Data</strong>: Information about your interactions with DwenLite, such as study sessions, queries submitted to the AI, and feature usage, to improve platform functionality and user experience.</li>
                <li><strong>Device Information</strong>: Technical details such as browser type, operating system, and device identifiers to ensure compatibility and optimize performance.</li>
                <li><strong>User-Generated Content</strong>: Study notes, questions, or other inputs you provide to the AI for generating educational materials.</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">2. How We Use Your Information</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li>Provide and maintain DwenLite’s services, including account management and AI-generated study materials.</li>
                <li>Analyze usage patterns to enhance platform performance, fix issues, and develop new features.</li>
                <li>Communicate with you about updates, new features, or important notices, with the option to opt out of non-essential communications.</li>
                <li>Monitor for misuse or unauthorized activities to ensure a safe and reliable user experience.</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">3. Sharing Your Information</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li><strong>Service Providers</strong>: We share data with trusted third-party providers (e.g., Firebase for authentication) who assist in operating DwenLite, bound by strict confidentiality agreements.</li>
                <li><strong>Legal Obligations</strong>: We may disclose information if required by law, such as in response to a court order or regulatory request, while taking steps to protect your privacy.</li>
                <li><strong>Business Transfers</strong>: In the event of a merger or acquisition, your data may be transferred as part of the business assets, with prior notice where feasible.</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">4. Data Security</h4>
              <p className="text-gray-600 leading-relaxed">
                We use industry-standard encryption and security measures to protect your data on secure cloud servers. While we strive to safeguard your information, no system is entirely immune to breaches. In the event of a data breach, we will notify affected users promptly as required by law.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">5. Your Rights and Choices</h4>
              <ul className="list-disc pl-6 text-gray-600 leading-relaxed">
                <li>Request access, correction, or deletion of your personal data by contacting{' '}
                  <a href="mailto:info@sbmindtechnologies.com" className="text-purple-600 hover:underline hover:bg-purple-50 px-1 rounded">
                    info@sbmindtechnologies.com
                  </a>.</li>
                <li>Opt out of non-essential communications, such as promotional emails, via your account settings or by contacting us.</li>
                <li>Users in certain jurisdictions (e.g., EU/EEA) may have additional rights under applicable data protection laws, such as data portability.</li>
              </ul>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">6. Cookies and Tracking</h4>
              <p className="text-gray-600 leading-relaxed">
                We use cookies and similar technologies to enhance your experience, such as remembering your preferences. You may disable cookies through your browser settings, but this may affect DwenLite’s functionality.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">7. Data Retention</h4>
              <p className="text-gray-600 leading-relaxed">
                We retain your data only as long as necessary to provide DwenLite’s services or comply with legal obligations. Upon account deletion, we will remove your personal information, except where retention is required by law.
              </p>
            </div>
            <div className="mb-6">
              <h4 className="text-lg sm:text-xl font-medium text-gray-800 mb-2">8. Updates to This Policy</h4>
              <p className="text-gray-600 leading-relaxed">
                We may update this Privacy Policy to reflect changes in our practices or legal requirements. We will notify you of significant changes via email or through the platform. Continued use of DwenLite after updates indicates your acceptance of the revised policy.
              </p>
            </div>
          </div>
          <p className="text-gray-600 leading-relaxed">
            For questions or concerns about this Privacy Policy, please contact us at{' '}
            <a href="mailto:info@sbmindtechnologies.com" className="text-purple-600 hover:underline hover:bg-purple-50 px-1 rounded">
              info@sbmindtechnologies.com
            </a>.
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

export default Terms;