import React, { useState, useEffect } from 'react';
import { X, LogOut, User, Shield, Bell, Moon, Monitor, EyeOff, FileText, Ban, Check, ChevronRight, Lock, Smartphone, Volume2, ShieldCheck, Mail, Phone, Calendar, Info } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { signOut, user, profile, updateProfile } = useAuthStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [activeSubModal, setActiveSubModal] = useState<'personal' | 'privacy' | 'notifications' | 'blocked' | 'terms' | null>(null);

  // Settings states stored locally
  const [readReceipts, setReadReceipts] = useState(() => {
    const val = localStorage.getItem('setting_read_receipts');
    return val !== null ? JSON.parse(val) : true;
  });

  const [systemTheme, setSystemTheme] = useState(() => {
    const val = localStorage.getItem('setting_system_theme');
    return val !== null ? JSON.parse(val) : false;
  });

  const [lastSeen, setLastSeen] = useState<'everyone' | 'contacts' | 'nobody'>(() => {
    return (localStorage.getItem('setting_last_seen') as any) || 'everyone';
  });

  const [profileVisibility, setProfileVisibility] = useState<'everyone' | 'contacts' | 'nobody'>(() => {
    return (localStorage.getItem('setting_profile_vis') as any) || 'everyone';
  });

  const [passcodeLock, setPasscodeLock] = useState(() => {
    return localStorage.getItem('setting_passcode_lock') === 'true';
  });

  const [msgSounds, setMsgSounds] = useState(() => {
    return localStorage.getItem('setting_msg_sounds') !== 'false';
  });
  const [callAlerts, setCallAlerts] = useState(() => {
    return localStorage.getItem('setting_call_alerts') !== 'false';
  });
  const [desktopPush, setDesktopPush] = useState(true);

  const [msgSoundType, setMsgSoundType] = useState(() => {
    return localStorage.getItem('setting_msg_sound_type') || 'standard';
  });

  const [ringtoneType, setRingtoneType] = useState(() => {
    return localStorage.getItem('setting_ringtone_type') || 'classic';
  });

  const [isPlayingRingtone, setIsPlayingRingtone] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState<string[]>(() => {
    const val = localStorage.getItem('setting_blocked_users');
    return val ? JSON.parse(val) : ['spammer_bot_99'];
  });

  // Personal Info edit form
  const [editDisplayName, setEditDisplayName] = useState(profile?.display_name || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');

  useEffect(() => {
    if (profile) {
      setEditDisplayName(profile.display_name);
      setEditBio(profile.bio || '');
    }
  }, [profile]);

  // Handle system theme syncing
  useEffect(() => {
    if (!systemTheme) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(mediaQuery);
    const listener = (e: MediaQueryListEvent) => applyTheme(e);
    mediaQuery.addEventListener('change', listener);

    return () => mediaQuery.removeEventListener('change', listener);
  }, [systemTheme]);

  useEffect(() => {
    if (!isOpen) {
      import('../../lib/audioManager').then(({ stopRingtoneSound }) => {
        stopRingtoneSound();
      });
      setIsPlayingRingtone(false);
    }
    return () => {
      import('../../lib/audioManager').then(({ stopRingtoneSound }) => {
        stopRingtoneSound();
      });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogout = () => {
    signOut();
  };

  const toggleTheme = () => {
    setSystemTheme(false);
    localStorage.setItem('setting_system_theme', 'false');
    document.documentElement.classList.toggle('dark');
    toast.success('Theme toggled');
  };

  const toggleSystemTheme = () => {
    const next = !systemTheme;
    setSystemTheme(next);
    localStorage.setItem('setting_system_theme', JSON.stringify(next));
    if (next) {
      toast.success('System theme sync enabled');
    } else {
      toast('System theme sync disabled');
    }
  };

  const toggleReadReceipts = () => {
    const next = !readReceipts;
    setReadReceipts(next);
    localStorage.setItem('setting_read_receipts', JSON.stringify(next));
    toast.success(next ? 'Read receipts enabled' : 'Read receipts disabled');
  };

  const handleSavePersonalInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDisplayName.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }
    updateProfile({
      display_name: editDisplayName.trim(),
      bio: editBio.trim()
    });
    toast.success('Personal information updated');
    setActiveSubModal(null);
  };

  const unblockUser = (username: string) => {
    const next = blockedUsers.filter(u => u !== username);
    setBlockedUsers(next);
    localStorage.setItem('setting_blocked_users', JSON.stringify(next));
    toast.success(`Unblocked @${username}`);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X size={24} />
            </button>
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar space-y-6 max-w-2xl mx-auto w-full">
          
          <section>
            <h3 className="px-2 text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">Account</h3>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
              <SettingsRow 
                icon={User} 
                label="Personal Information" 
                value={profile?.display_name}
                onClick={() => setActiveSubModal('personal')} 
              />
              <SettingsRow 
                icon={Shield} 
                label="Privacy & Security" 
                value={`Last Seen: ${lastSeen}`}
                onClick={() => setActiveSubModal('privacy')} 
              />
            </div>
          </section>

          <section>
            <h3 className="px-2 text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">Preferences</h3>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
              <SettingsRow 
                icon={Bell} 
                label="Notifications & Sounds" 
                value={msgSounds ? 'Enabled' : 'Muted'}
                onClick={() => setActiveSubModal('notifications')} 
              />
            </div>
          </section>

          <section>
            <h3 className="px-2 text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">Safety & Privacy</h3>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
              <SettingsRow 
                icon={Ban} 
                label="Blocked Profiles" 
                value={`${blockedUsers.length} blocked`}
                onClick={() => setActiveSubModal('blocked')} 
              />
              <SettingsToggleRow 
                icon={EyeOff} 
                label="Read Receipts (Blue Ticks)" 
                checked={readReceipts} 
                onChange={toggleReadReceipts} 
              />
            </div>
          </section>

          <section>
            <h3 className="px-2 text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">Support & Info</h3>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
              <SettingsRow 
                icon={FileText} 
                label="Terms of Service & Privacy Policy" 
                value="v2.4.0"
                onClick={() => setActiveSubModal('terms')} 
              />
            </div>
          </section>

          <div className="pt-4 pb-8">
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Modal: Personal Information */}
      {activeSubModal === 'personal' && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
            <button onClick={() => setActiveSubModal(null)} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X size={24} />
            </button>
            <h2 className="text-lg font-semibold">Personal Information</h2>
          </div>
          <form onSubmit={handleSavePersonalInfo} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-xl mx-auto w-full">
            <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Display Name</label>
                <input 
                  type="text" 
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-base focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">About / Status</label>
                <input 
                  type="text" 
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Hey there! I am using OQChat."
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-base focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Username</label>
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100/60 px-4 py-2.5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60">
                  <User size={18} />
                  <span>@{profile?.username}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Account ID</label>
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100/60 px-4 py-2 text-xs font-mono text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60 break-all">
                  <span>{user?.uid}</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 shadow-md transition-colors"
            >
              Save Changes
            </button>
          </form>
        </div>
      )}

      {/* Sub-Modal: Privacy & Security */}
      {activeSubModal === 'privacy' && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
            <button onClick={() => setActiveSubModal(null)} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X size={24} />
            </button>
            <h2 className="text-lg font-semibold">Privacy & Security</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-xl mx-auto w-full">
            <section className="space-y-2">
              <h3 className="px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Who can see my Last Seen</h3>
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
                {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setLastSeen(opt);
                      localStorage.setItem('setting_last_seen', opt);
                      toast.success(`Last seen set to ${opt}`);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-b border-zinc-100 last:border-0 dark:border-zinc-800 capitalize"
                  >
                    <span className="font-medium text-sm">{opt}</span>
                    {lastSeen === opt && <Check size={18} className="text-brand-500" />}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Who can see Profile Photo</h3>
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
                {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setProfileVisibility(opt);
                      localStorage.setItem('setting_profile_vis', opt);
                      toast.success(`Profile photo visible to ${opt}`);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-b border-zinc-100 last:border-0 dark:border-zinc-800 capitalize"
                  >
                    <span className="font-medium text-sm">{opt}</span>
                    {profileVisibility === opt && <Check size={18} className="text-brand-500" />}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">App Security</h3>
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
                <SettingsToggleRow 
                  icon={Lock} 
                  label="Passcode & Biometric Lock" 
                  checked={passcodeLock} 
                  onChange={() => {
                    const next = !passcodeLock;
                    setPasscodeLock(next);
                    localStorage.setItem('setting_passcode_lock', String(next));
                    toast.success(next ? 'App Passcode Enabled' : 'App Passcode Disabled');
                  }} 
                />
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Sub-Modal: Notifications */}
      {activeSubModal === 'notifications' && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
            <button onClick={() => setActiveSubModal(null)} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X size={24} />
            </button>
            <h2 className="text-lg font-semibold">Notifications & Sounds</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-xl mx-auto w-full">
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
              <SettingsToggleRow 
                icon={Volume2} 
                label="Message Sound Alerts" 
                checked={msgSounds} 
                onChange={() => {
                  const next = !msgSounds;
                  setMsgSounds(next);
                  localStorage.setItem('setting_msg_sounds', String(next));
                  toast.success(next ? 'Message sound enabled' : 'Message sound muted');
                  if (next) {
                    import('../../lib/audioManager').then(({ playNotificationSound }) => {
                      playNotificationSound(msgSoundType as any);
                    });
                  }
                }} 
              />
              <SettingsToggleRow 
                icon={Bell} 
                label="In-App Call Ringing" 
                checked={callAlerts} 
                onChange={() => {
                  const next = !callAlerts;
                  setCallAlerts(next);
                  localStorage.setItem('setting_call_alerts', String(next));
                  toast.success(next ? 'Call ringtone enabled' : 'Call ringtone muted');
                }} 
              />
              <SettingsToggleRow 
                icon={Smartphone} 
                label="Desktop & Push Alerts" 
                checked={desktopPush} 
                onChange={() => {
                  setDesktopPush(!desktopPush);
                  toast.success(!desktopPush ? 'Push notifications enabled' : 'Push notifications disabled');
                }} 
              />
            </div>

            {/* Premium Message Notification Sound Picker */}
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Message Notification Tone</h4>
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'chime', 'digital', 'bubble'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setMsgSoundType(type);
                      localStorage.setItem('setting_msg_sound_type', type);
                      import('../../lib/audioManager').then(({ playNotificationSound }) => {
                        playNotificationSound(type);
                      });
                    }}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium capitalize transition-all ${
                      msgSoundType === type
                        ? 'border-brand-500 bg-brand-50/50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                        : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  import('../../lib/audioManager').then(({ playNotificationSound }) => {
                    playNotificationSound(msgSoundType as any);
                  });
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-100 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-200 transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <span>🔊 Preview System Alert ({msgSoundType})</span>
              </button>
            </div>

            {/* Premium Call Ringtone Picker */}
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">In-App Call Ringtone</h4>
              <div className="grid grid-cols-2 gap-2">
                {(['classic', 'marimba', 'melody', 'electronic'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setRingtoneType(type);
                      localStorage.setItem('setting_ringtone_type', type);
                      if (isPlayingRingtone) {
                        import('../../lib/audioManager').then(({ startRingtoneSound }) => {
                          startRingtoneSound(type);
                        });
                      }
                    }}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium capitalize transition-all ${
                      ringtoneType === type
                        ? 'border-brand-500 bg-brand-50/50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                        : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const targetState = !isPlayingRingtone;
                  setIsPlayingRingtone(targetState);
                  import('../../lib/audioManager').then(({ startRingtoneSound, stopRingtoneSound }) => {
                    if (targetState) {
                      startRingtoneSound(ringtoneType as any);
                    } else {
                      stopRingtoneSound();
                    }
                  });
                }}
                className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-colors ${
                  isPlayingRingtone
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                <span>{isPlayingRingtone ? '⏹️ Stop Ringing Sound' : `🎵 Preview Ringtone (${ringtoneType})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Blocked Profiles */}
      {activeSubModal === 'blocked' && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
            <button onClick={() => setActiveSubModal(null)} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X size={24} />
            </button>
            <h2 className="text-lg font-semibold">Blocked Profiles</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-xl mx-auto w-full">
            {blockedUsers.length > 0 ? (
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden dark:bg-zinc-900 dark:ring-zinc-800">
                {blockedUsers.map((u) => (
                  <div key={u} className="flex items-center justify-between p-4 border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-500 dark:bg-red-500/20">
                        <Ban size={20} />
                      </div>
                      <span className="font-semibold text-sm">@{u}</span>
                    </div>
                    <button 
                      onClick={() => unblockUser(u)}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-400">
                <ShieldCheck size={48} className="mb-2 opacity-50 text-emerald-500" />
                <p className="font-medium text-zinc-900 dark:text-zinc-100">No blocked users</p>
                <p className="text-xs mt-1">Users you block will appear here</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Modal: Terms & Legal */}
      {activeSubModal === 'terms' && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
            <button onClick={() => setActiveSubModal(null)} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X size={24} />
            </button>
            <h2 className="text-lg font-semibold">Terms & Privacy</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-xl mx-auto w-full text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 space-y-4">
              <div className="flex items-center gap-3 text-brand-500 font-bold text-base">
                <Info size={20} />
                <span>OQChat Terms of Service</span>
              </div>
              <p>
                Welcome to OQChat. By accessing or using our real-time messaging platform, you agree to be bound by these terms. All communication, audio/video streams, and images shared in your personal storage remain encrypted and private to your account.
              </p>

              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">1. Data Protection & Encryption</h4>
              <p>
                Your messages and image attachments are securely cached in localized client state. We do not sell or monetize personal chat records.
              </p>

              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">2. User Conduct</h4>
              <p>
                You agree not to transmit illegal content, spam, or malicious software through the messaging network.
              </p>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-400">
                OQChat Messenger • Version 2.4.0 (Build 2026.08)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-zinc-900 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20 text-red-500">
              <LogOut size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Sign Out</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">
              Are you sure you want to sign out of your account?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl bg-zinc-100 px-4 py-3 font-semibold text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
              >
                No, Cancel
              </button>
              <button 
                onClick={handleLogout}
                className="flex-1 rounded-xl bg-red-500 px-4 py-3 font-semibold text-white hover:bg-red-600"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsRow({ icon: Icon, label, value, onClick }: { icon: any, label: string, value?: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100 border-b border-zinc-100 last:border-0 dark:border-zinc-800 dark:hover:bg-zinc-800/50 dark:active:bg-zinc-800"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        <Icon size={18} />
      </div>
      <span className="flex-1 font-medium text-sm">{label}</span>
      {value && <span className="text-xs text-zinc-400 mr-1">{value}</span>}
      <ChevronRight size={16} className="text-zinc-400" />
    </button>
  );
}

function SettingsToggleRow({ icon: Icon, label, checked, onChange }: { icon: any, label: string, checked: boolean, onChange: () => void }) {
  return (
    <div className="flex w-full items-center justify-between px-4 py-3.5 border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          <Icon size={18} />
        </div>
        <span className="font-medium text-sm">{label}</span>
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-brand-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

