import React, { useState, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Camera } from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { compressImage } from '../lib/imageUtils';

export default function ProfileSetupScreen() {
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If already set up, redirect
  React.useEffect(() => {
    if (profile) {
      navigate('/', { replace: true });
    }
  }, [profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // basic validation
    if (!username.trim() || !displayName.trim()) {
      return toast.error('Username and display name are required');
    }
    
    // check username format
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return toast.error('Username must be 3-20 chars, letters/numbers/underscores only');
    }

    setLoading(true);
    try {
      const newProfile = {
        id: user.uid,
        username: username.toLowerCase(),
        display_name: displayName,
        bio,
        is_online: true,
        last_seen: new Date().toISOString(),
        avatar_url: avatarUrl
      };
      
      const { db } = await import('../lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');
      
      await setDoc(doc(db, 'users', user.uid), newProfile);
      
      useAuthStore.getState().setProfile(newProfile as any);
      
      toast.success('Profile created successfully!');
      navigate('/', { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 sm:p-12 overflow-y-auto">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Complete your profile</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Let others know who you are
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex justify-center">
            <div className="relative">
              <Avatar src={avatarUrl} size="2xl" />
              <input 
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      const compressed = await compressImage(file);
                      setAvatarUrl(compressed);
                    } catch (error) {
                      toast.error('Failed to process image');
                    }
                  }
                }}
              />
              <button
                type="button"
                className="absolute bottom-0 right-0 p-2 bg-brand-500 text-white rounded-full shadow-lg hover:bg-brand-600 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={18} />
              </button>
            </div>
          </div>

          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="John Doe"
            required
            maxLength={50}
          />
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="johndoe"
            required
            maxLength={20}
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Bio (Optional)
            </label>
            <textarea
              className="flex w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-base shadow-sm transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 min-h-[100px] resize-none"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A little about yourself..."
              maxLength={150}
            />
          </div>
          
          <Button type="submit" className="w-full" isLoading={loading}>
            Save Profile
          </Button>
        </form>
      </div>
    </div>
  );
}
