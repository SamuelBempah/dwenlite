import { useEffect, useState } from 'react';
     import { Navigate } from 'react-router-dom';
     import { auth } from '../firebase';
     import { onAuthStateChanged } from 'firebase/auth';

     function ProtectedRoute({ children }) {
       const [user, setUser] = useState(null);
       const [loading, setLoading] = useState(true);

       useEffect(() => {
         const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
           setUser(currentUser);
           setLoading(false);
         });
         return () => unsubscribe();
       }, []);

       if (loading) {
         return (
           <div className="min-h-screen flex items-center justify-center">
             <svg className="animate-spin h-8 w-8 text-purple-600" viewBox="0 0 24 24">
               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
             </svg>
           </div>
         );
       }

       if (!user) {
         return <Navigate to="/login" />;
       }

       if (!user.emailVerified && user.providerData[0].providerId === 'password') {
         return <Navigate to="/verify-email" />;
       }

       return children;
     }

     export default ProtectedRoute;