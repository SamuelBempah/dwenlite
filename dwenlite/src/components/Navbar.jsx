import { Link } from 'react-router-dom';

function Navbar() {
  return (
    <nav className="bg-gray-900 p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-white text-2xl font-bold">
          AI Study Helper <span className="text-purple-400 text-sm">Beta</span>
        </Link>
        <div className="space-x-4">
        </div>
      </div>
    </nav>
  );
}

export default Navbar;