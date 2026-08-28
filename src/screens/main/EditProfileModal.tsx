import React, { useState, useEffect, useRef } from 'react';
import { X, Camera } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { Avatar } from '../../components/ui/Avatar';
import { compressImage } from '../../lib/imageUtils';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { profile, updateProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!username.trim() || !displayName.trim()) {
      return toast.error('Username and display name are required');
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return toast.error('Username must be 3-20 chars, letters/numbers/underscores only');
    }

    setLoading(true);
    try {
      await updateProfile({
        display_name: displayName,
        username: username.toLowerCase(),
        bio: bio,
        avatar_url: avatarUrl || null
      });
      toast.success('Profile updated successfully');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={24} />
          </button>
          <h2 className="text-lg font-semibold">Edit Profile</h2>
        </div>
        <Button onClick={handleSubmit} isLoading={loading} size="sm">Save</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar">
        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Avatar src={avatarUrl} size="xl" />
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
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 bg-brand-500 text-white rounded-full shadow-lg hover:bg-brand-600 transition-colors"
              >
                <Camera size={18} />
              </button>
            </div>
            <p className="text-xs text-zinc-500">Tap icon to upload image</p>
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
              Bio
            </label>
            <textarea
              className="flex w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-base shadow-sm transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 min-h-[100px] resize-none"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A little about yourself..."
              maxLength={150}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
