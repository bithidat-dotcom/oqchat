import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import toast from 'react-hot-toast';
import { MessageSquare } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, profile } = useAuthStore();

  // If already authenticated
  if (user) {
    if (!profile) return <Navigate to="/setup-profile" replace />;
    return <Navigate to="/" replace />;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) return toast.error('Please enter phone number and password');
    
    setLoading(true);
    try {
      if (isLogin) {
        await useAuthStore.getState().signIn(phone, password);
        toast.success('Welcome back!');
      } else {
        await useAuthStore.getState().signUp(phone, password);
        toast.success('Account created! Welcome to GazzChat.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/30">
            <MessageSquare size={32} strokeWidth={2.5} />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight">GazzChat</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {isLogin ? 'Sign in to continue' : 'Create an account to get started'}
          </p>
        </div>

        <div className="space-y-4">
          <form onSubmit={handleAuth} className="space-y-4">
            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1234567890"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" isLoading={loading}>
              {isLogin ? 'Sign In' : 'Sign Up'}
            </Button>
          </form>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
