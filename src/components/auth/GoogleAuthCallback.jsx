import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

function GoogleAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      toast.error('Google sign-in failed. Please try again.');
      navigate('/login');
      return;
    }

    if (token) {
      console.log('✅ Token received from Google OAuth');
      localStorage.setItem('token', token);
      
      // Fetch user data
      fetch('http://localhost:5050/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => res.json())
        .then(user => {
          login({ token, user });
          toast.success(`Welcome back, ${user.name}!`);
          navigate('/dashboard');
        })
        .catch(err => {
          console.error('Error fetching user:', err);
          toast.error('Failed to load user data');
          navigate('/login');
        });
    } else {
      toast.error('No token received');
      navigate('/login');
    }
  }, [searchParams, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}

export default GoogleAuthCallback;