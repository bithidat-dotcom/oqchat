import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera, Volume2, VolumeX, Image as ImageIcon, Maximize2, Minimize2, Users, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCallStore } from '../store/callStore';
import { Avatar } from './ui/Avatar';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, onSnapshot, updateDoc, query, where, addDoc } from 'firebase/firestore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const CALL_BACKGROUNDS = [
  { name: 'Aesthetic Sunset (9:16)', url: 'https://i.pinimg.com/1200x/a2/c7/62/a2c762f9f30248a255b08c51c020cbf5.jpg' },
  { name: 'Sky Anime Glow (9:16)', url: 'https://i.pinimg.com/736x/4c/b3/a1/4cb3a11088f8031e28885a89426efea2.jpg' },
  { name: 'Purple Night Clouds (9:16)', url: 'https://i.pinimg.com/1200x/3b/4f/9c/3b4f9cd70c8878e2677d57990c039015.jpg' },
  { name: 'Cloud Aesthetic', url: '/b591a35959ec10ab5079ba55b1d02d59.jpg' },
  { name: 'Deep Blue Horizon', url: '/7c77a6d897ab20299f621a8d316df795.jpg' },
  { name: 'Dark Minimal', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop' },
  { name: 'Abstract Pink/Blue', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1964&auto=format&fit=crop' },
  { name: 'Colorful Gradient', url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=2070&auto=format&fit=crop' },
  { name: 'Dark Blue Gradient', url: 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2029&auto=format&fit=crop' },
];

// Fallback stream creator when browser/iframe restricts camera/microphone access
const createFallbackStream = (isVideo: boolean): MediaStream => {
  const tracks: MediaStreamTrack[] = [];

  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const dst = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // subtle silent tone to satisfy WebRTC audio track requirement
    osc.connect(gain);
    gain.connect(dst);
    osc.start();

    const audioTrack = dst.stream.getAudioTracks()[0];
    if (audioTrack) tracks.push(audioTrack);
  } catch (e) {
    console.warn("Could not create WebAudio fallback:", e);
  }

  if (isVideo) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) {
        ctx2d.fillStyle = '#18181b';
        ctx2d.fillRect(0, 0, 640, 480);
        ctx2d.font = '24px sans-serif';
        ctx2d.fillStyle = '#a1a1aa';
        ctx2d.textAlign = 'center';
        ctx2d.fillText('Camera Simulated', 320, 240);
      }
      const canvasStream = canvas.captureStream(15);
      const videoTrack = canvasStream.getVideoTracks()[0];
      if (videoTrack) tracks.push(videoTrack);
    } catch (e) {
      console.warn("Could not create Canvas video fallback:", e);
    }
  }

  return new MediaStream(tracks);
};

export default function CallModal() {
  const { user, profile } = useAuthStore();
  const { activeCall, isCalling, incomingCall, setActiveCall, setCalling, setIncomingCall, localStream, remoteStream, setStreams } = useCallStore();
  
  const [bgUrl, setBgUrl] = useState(() => {
    return localStorage.getItem('setting_call_bg_url') || 'https://i.pinimg.com/1200x/a2/c7/62/a2c762f9f30248a255b08c51c020cbf5.jpg';
  });

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [receiverProfile, setReceiverProfile] = useState<{ display_name?: string; avatar_url?: string } | null>(null);

  useEffect(() => {
    if (!activeCall || !user) {
      setReceiverProfile(null);
      return;
    }

    const otherUserId = activeCall.caller === user.uid ? activeCall.receiver : activeCall.caller;
    if (!otherUserId) return;

    try {
      const allUsersStr = localStorage.getItem('oqchat_all_users');
      if (allUsersStr) {
        const allUsers = JSON.parse(allUsersStr);
        const found = allUsers.find((u: any) => u.id === otherUserId || u.uid === otherUserId);
        if (found) {
          setReceiverProfile(found);
        }
      }
    } catch (e) {}

    const unsub = onSnapshot(doc(db, 'users', otherUserId), (snap) => {
      if (snap.exists()) {
        setReceiverProfile(snap.data() as any);
      }
    }, () => {});

    return () => unsub();
  }, [activeCall, user]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dialtoneRef = useRef<HTMLAudioElement | null>(null);

  const callUnsubRef = useRef<(() => void) | null>(null);
  const candidatesUnsubRef = useRef<(() => void) | null>(null);

  const currentBg = bgUrl || 'https://i.pinimg.com/1200x/a2/c7/62/a2c762f9f30248a255b08c51c020cbf5.jpg';

  // Sync background URL from localStorage
  useEffect(() => {
    const handleStorage = () => {
      const stored = localStorage.getItem('setting_call_bg_url');
      if (stored) setBgUrl(stored);
    };
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 1000);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  // Dialtone sound effect
  useEffect(() => {
    dialtoneRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-84.wav');
    dialtoneRef.current.loop = true;
    return () => {
      dialtoneRef.current?.pause();
      import('../lib/audioManager').then(({ stopRingtoneSound }) => {
        stopRingtoneSound();
      });
    };
  }, []);

  // Sync Video Streams
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeCall?.type, isCalling]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, activeCall?.type, isCalling]);

  // Global Incoming Call Listener (listening for direct user calls & group calls)
  useEffect(() => {
    if (!user) return;
    
    // Query direct calls to this user where status is 'calling' or 'ringing'
    const qDirect = query(
      collection(db, 'calls'),
      where('receiver', '==', user.uid),
      where('status', 'in', ['calling', 'ringing'])
    );

    // Query group calls where status is 'calling' or 'ringing'
    const qGroup = query(
      collection(db, 'calls'),
      where('isGroupCall', '==', true),
      where('status', 'in', ['calling', 'ringing'])
    );

    let directCalls: any[] = [];
    let groupCalls: any[] = [];

    const handleCallSnapshots = () => {
      const allIncoming = [...directCalls, ...groupCalls];
      
      if (allIncoming.length > 0) {
        const callData = allIncoming[0];
        
        // Don't trigger incoming call overlay if user is already actively in the caller state
        const isCurrentCaller = useCallStore.getState().isCalling && useCallStore.getState().activeCall?.caller === user.uid;
        
        if (!isCurrentCaller) {
          setIncomingCall(callData);
          
          // Play ringtone if not already playing
          const selectedRingtone = localStorage.getItem('setting_ringtone_type') || 'classic';
          import('../lib/audioManager').then(({ startRingtoneSound }) => {
            startRingtoneSound(selectedRingtone as any);
          });

          // Transition call status from 'calling' to 'ringing' in Firestore
          if (callData.status === 'calling') {
            updateDoc(doc(db, 'calls', callData.id), { status: 'ringing' }).catch(() => {});
          }
        }
      } else {
        // No active incoming calls
        if (!useCallStore.getState().isCalling) {
          setIncomingCall(null);
          import('../lib/audioManager').then(({ stopRingtoneSound }) => {
            stopRingtoneSound();
          });
        }
      }
    };

    const unsubDirect = onSnapshot(qDirect, (snapshot) => {
      directCalls = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      handleCallSnapshots();
    }, (err) => console.error("Error listening direct calls:", err));

    const unsubGroup = onSnapshot(qGroup, (snapshot) => {
      groupCalls = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((c: any) => c.caller !== user.uid && Array.isArray(c.members) && c.members.some((m: any) => m.id === user.uid));
      handleCallSnapshots();
    }, (err) => console.error("Error listening group calls:", err));

    return () => {
      unsubDirect();
      unsubGroup();
    };
  }, [user, setIncomingCall]);

  // Ringtone handling when incoming call modal is active
  useEffect(() => {
    if (incomingCall && !isCalling) {
      const selectedRingtone = localStorage.getItem('setting_ringtone_type') || 'classic';
      import('../lib/audioManager').then(({ startRingtoneSound }) => {
        startRingtoneSound(selectedRingtone as any);
      });
    } else {
      import('../lib/audioManager').then(({ stopRingtoneSound }) => {
        stopRingtoneSound();
      });
    }
  }, [incomingCall, isCalling]);

  // Dialtone / Ringback audio feedback for caller while waiting
  useEffect(() => {
    if (isCalling && (activeCall?.status === 'calling' || activeCall?.status === 'ringing')) {
      dialtoneRef.current?.play().catch(() => {});
    } else {
      dialtoneRef.current?.pause();
      if (dialtoneRef.current) dialtoneRef.current.currentTime = 0;
    }
  }, [isCalling, activeCall?.status]);

  // Handle call initiation when activeCall status is 'initiating'
  useEffect(() => {
    if (activeCall?.status === 'initiating' && activeCall?.caller === user?.uid) {
      startCall(activeCall.receiver, activeCall.type === 'video');
    }
  }, [activeCall?.status, user?.uid]);

  const setupWebRTC = async (callId: string, isVideo: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
    } catch (e) {
      console.warn("Primary getUserMedia failed, attempting audio only or fallback stream:", e);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      } catch (e2) {
        console.warn("Hardware media blocked or unavailable, using synthetic stream fallback:", e2);
        stream = createFallbackStream(isVideo);
      }
    }

    setStreams(stream, null);
    
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      setStreams(useCallStore.getState().localStream, event.streams[0]);
    };

    return { pc, stream };
  };

  const startCall = async (otherUserId: string, isVideo: boolean) => {
    if (!user) return;
    
    const callRef = doc(collection(db, 'calls'));
    const callId = callRef.id;

    setActiveCall({
      ...activeCall,
      id: callId,
      caller: user.uid,
      receiver: otherUserId,
      type: isVideo ? 'video' : 'voice',
      status: 'calling'
    });
    setCalling(true);
    setIncomingCall(null);

    try {
      const { pc } = await setupWebRTC(callId, isVideo);

      const callerCandidatesCollection = collection(db, 'calls', callId, 'callerCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(callerCandidatesCollection, event.candidate.toJSON()).catch(() => {});
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await setDoc(doc(db, 'calls', callId), {
        offer: { type: offer.type, sdp: offer.sdp },
        caller: user.uid,
        receiver: otherUserId,
        status: 'calling',
        type: isVideo ? 'video' : 'voice',
        isGroupCall: activeCall?.isGroupCall || false,
        groupName: activeCall?.groupName || '',
        members: activeCall?.members || [],
        createdAt: new Date().toISOString()
      });

      // Listen for receiver answer & status changes
      callUnsubRef.current = onSnapshot(doc(db, 'calls', callId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        if (data.status === 'ringing') {
          setActiveCall({ ...useCallStore.getState().activeCall, status: 'ringing' });
        }
        if (data.answer && !pc.currentRemoteDescription) {
          const answer = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answer).catch(console.error);
          setActiveCall({ ...useCallStore.getState().activeCall, status: 'connected' });
        }
        if (data.status === 'rejected') {
          toast.error("Call declined");
          endCall(callId, false);
        }
        if (data.status === 'ended') {
          endCall(callId, false);
        }
      });

      // Listen for remote ICE candidates
      const calleeCandidatesCollection = collection(db, 'calls', callId, 'calleeCandidates');
      candidatesUnsubRef.current = onSnapshot(calleeCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate).catch(() => {});
          }
        });
      });

    } catch (e) {
      console.error("Call start failed:", e);
      toast.error("Could not send call");
      endCall(callId);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall || !user) return;

    const callId = incomingCall.id;
    const isVideo = incomingCall.type === 'video';

    setActiveCall({ id: callId, caller: incomingCall.caller, receiver: user.uid, type: incomingCall.type, status: 'connected' });
    setCalling(true);
    setIncomingCall(null);

    import('../lib/audioManager').then(({ stopRingtoneSound }) => {
      stopRingtoneSound();
    });

    try {
      const { pc } = await setupWebRTC(callId, isVideo);

      const calleeCandidatesCollection = collection(db, 'calls', callId, 'calleeCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(calleeCandidatesCollection, event.candidate.toJSON()).catch(() => {});
        }
      };

      const callDocRef = doc(db, 'calls', callId);
      const unsubCallDoc = onSnapshot(callDocRef, async (snapshot) => {
        const data = snapshot.data();
        if (data?.offer && !pc.currentRemoteDescription) {
          const offer = new RTCSessionDescription(data.offer);
          await pc.setRemoteDescription(offer).catch(console.error);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await updateDoc(callDocRef, {
            answer: { type: answer.type, sdp: answer.sdp },
            status: 'connected'
          }).catch(console.error);
        }
        if (data?.status === 'ended') {
          endCall(callId, false);
        }
      });

      callUnsubRef.current = unsubCallDoc;

      const callerCandidatesCollection = collection(db, 'calls', callId, 'callerCandidates');
      candidatesUnsubRef.current = onSnapshot(callerCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate).catch(() => {});
          }
        });
      });

    } catch (e) {
      console.error("Accept call failed:", e);
      endCall(callId);
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    const callId = incomingCall.id;
    await updateDoc(doc(db, 'calls', callId), { status: 'rejected' }).catch(() => {});
    setIncomingCall(null);
    import('../lib/audioManager').then(({ stopRingtoneSound }) => {
      stopRingtoneSound();
    });
  };

  const endCall = async (callIdToend?: string, updateDb: boolean = true) => {
    const currentLocalStream = useCallStore.getState().localStream;
    if (currentLocalStream) {
      currentLocalStream.getTracks().forEach(track => track.stop());
    }
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    callUnsubRef.current?.();
    candidatesUnsubRef.current?.();
    callUnsubRef.current = null;
    candidatesUnsubRef.current = null;
    
    const cId = callIdToend || useCallStore.getState().activeCall?.id;
    if (cId && updateDb) {
      try {
        await updateDoc(doc(db, 'calls', cId), { status: 'ended' });
      } catch(e) {}
    }
        
    setCalling(false);
    setActiveCall(null);
    setIncomingCall(null);
    setStreams(null, null);
    setMicOn(true);
    setCameraOn(true);
    setShowBgPicker(false);
    
    import('../lib/audioManager').then(({ stopRingtoneSound }) => {
      stopRingtoneSound();
    });
    dialtoneRef.current?.pause();
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !micOn);
      setMicOn(!micOn);
      toast.success(micOn ? "Microphone muted" : "Microphone unmuted");
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !cameraOn);
      setCameraOn(!cameraOn);
      toast.success(cameraOn ? "Camera turned off" : "Camera turned on");
    }
  };

  const toggleSpeaker = () => {
    setSpeakerOn(prev => {
      const next = !prev;
      toast.success(next ? "Speaker enabled" : "Speaker muted");
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const switchCameraFacingMode = async () => {
    if (!localStream) {
      toast.error("No active camera stream");
      return;
    }
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (currentVideoTrack) {
        currentVideoTrack.stop();
        localStream.removeTrack(currentVideoTrack);
      }

      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: nextFacingMode } },
          audio: false
        });
      } catch (err) {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextFacingMode },
          audio: false
        });
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        localStream.addTrack(newVideoTrack);
        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack);
          }
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        setFacingMode(nextFacingMode);
        toast.success(`Switched to ${nextFacingMode === 'user' ? 'Front' : 'Back'} Camera`);
      }
    } catch (e) {
      console.error("Failed to switch camera:", e);
      toast.error("Could not flip camera mode");
    }
  };

  if (!isCalling && !incomingCall) return null;

  // Incoming Call Full-Screen Overlay
  if (incomingCall && !isCalling) {
    return (
      <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-between bg-zinc-950 text-white p-6 pt-16 pb-14 select-none pointer-events-auto animate-in fade-in duration-300">
        {/* Background Layer with Blur & Wallpaper */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img src={currentBg} alt="Call BG" className="w-full h-full object-cover opacity-30 blur-2xl scale-110" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-zinc-950/80 to-black" />
        </div>

        {/* Top Header */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/20 border border-brand-500/30 backdrop-blur-md">
            <Phone size={16} className="text-brand-400 animate-pulse" />
            <span className="text-xs font-bold text-brand-300 uppercase tracking-widest">
              Incoming {incomingCall.type === 'video' ? 'Video' : 'Voice'} Call
            </span>
          </div>
          <span className="text-xs text-zinc-400 font-medium">End-to-End Encrypted</span>
        </div>

        {/* Center Profile & Glowing Ring Avatar */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-4 my-auto">
          <div className="relative flex items-center justify-center">
            {/* Pulsating Radar Aura Rings */}
            <div className="absolute w-44 h-44 rounded-full bg-brand-500/20 animate-ping duration-1000" />
            <div className="absolute w-56 h-56 rounded-full bg-brand-500/10 animate-pulse duration-1000" />
            <Avatar 
              size="2xl" 
              src={receiverProfile?.avatar_url} 
              className="relative z-10 ring-4 ring-brand-500/80 shadow-[0_0_50px_rgba(136,255,0,0.4)]" 
            />
          </div>
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-md">
              {receiverProfile?.display_name || incomingCall.callerName || 'Incoming Call'}
            </h2>
            <p className="text-sm font-semibold text-zinc-300 animate-pulse bg-white/10 px-5 py-1.5 rounded-full backdrop-blur-md border border-white/15">
              Ringing...
            </p>
          </div>
        </div>

        {/* Bottom Call Accept / Cancel Action Buttons */}
        <div className="relative z-10 flex items-center justify-around w-full max-w-xs gap-8">
          {/* Decline / Cancel Call Button */}
          <button 
            onClick={rejectCall} 
            className="flex flex-col items-center gap-2 group cursor-pointer" 
            title="Decline / Cancel Call"
          >
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 text-white flex items-center justify-center group-hover:from-red-700 group-hover:to-rose-600 transition-all shadow-2xl shadow-red-500/60 ring-4 ring-red-500/30 active:scale-95">
              <PhoneOff size={32} className="rotate-[135deg]" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 group-hover:text-red-300 transition-colors">
              Decline
            </span>
          </button>

          {/* Accept Call Button */}
          <button 
            onClick={acceptCall} 
            className="flex flex-col items-center gap-2 group cursor-pointer" 
            title="Accept Call"
          >
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-green-500 text-white flex items-center justify-center group-hover:from-emerald-600 group-hover:to-green-600 transition-all shadow-2xl shadow-green-500/60 ring-4 ring-green-500/30 active:scale-95">
              <Phone size={32} className="animate-bounce" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-green-400 group-hover:text-green-300 transition-colors">
              Accept
            </span>
          </button>
        </div>
      </div>
    );
  }

  const isGroupCall = activeCall?.isGroupCall || false;
  const groupMembers = activeCall?.members || [];

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col bg-zinc-950 text-white overflow-hidden animate-in fade-in duration-200 select-none pointer-events-auto">
      {/* Background Layer (Clear 9:16 ratio display) */}
      <div className="absolute inset-0 z-0 bg-zinc-950">
        <img src={currentBg} alt="Call Background" className="w-full h-full object-cover opacity-95 transition-all duration-500" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />
      </div>

      {/* Group Call Header / Single Call Header */}
      <div className="relative z-20 pt-10 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isGroupCall ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/30 backdrop-blur-md ring-2 ring-brand-500/50">
              <Users size={24} className="text-brand-400" />
            </div>
          ) : (
            <Avatar size="md" src={receiverProfile?.avatar_url} className="ring-2 ring-white/30" />
          )}
          <div>
            <h2 className="text-xl font-bold text-white drop-shadow-md">
              {isGroupCall ? (activeCall?.groupName || 'Group Call') : (receiverProfile?.display_name || 'Call')}
            </h2>
            <p className="text-xs text-zinc-300 font-medium flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              {activeCall?.status === 'connected' ? 'Connected' : (activeCall?.status === 'ringing' ? 'Ringing...' : 'Calling...')}
            </p>
          </div>
        </div>

        {/* Fullscreen & Background Quick Actions */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowBgPicker(prev => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25 text-white transition-all ring-1 ring-white/20 active:scale-95"
            title="Change Background"
          >
            <ImageIcon size={20} />
          </button>
          <button 
            onClick={toggleFullscreen}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25 text-white transition-all ring-1 ring-white/20 active:scale-95"
            title="Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
      </div>

      {/* Live Video / Main Content Grid */}
      <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden w-full h-full">
        {isGroupCall ? (
          /* Multi-Participant Group Call Grid */
          <div className="w-full max-w-4xl grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 h-full max-h-[75vh] items-center justify-center z-10">
            {/* User Tile */}
            <div className="relative aspect-square sm:aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-900/80 ring-2 ring-brand-500/50 shadow-2xl flex flex-col items-center justify-center">
              {activeCall?.type === 'video' && cameraOn ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-4">
                  <Avatar size="lg" src={profile?.avatar_url} />
                  <span className="text-xs font-semibold text-white mt-2">You (Host)</span>
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-medium text-white flex items-center gap-1.5">
                {micOn ? <Mic size={12} className="text-green-400" /> : <MicOff size={12} className="text-red-400" />}
                <span>You</span>
              </div>
            </div>

            {/* Other Members Tiles */}
            {groupMembers.filter((m: any) => m.id !== user?.uid).map((member: any, idx: number) => (
              <div key={member.id || idx} className="relative aspect-square sm:aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-900/60 ring-1 ring-white/20 backdrop-blur-md shadow-xl flex flex-col items-center justify-center">
                {idx === 0 && remoteStream && activeCall?.type === 'video' ? (
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4">
                    <Avatar size="lg" src={member.avatar_url} />
                    <span className="text-xs font-semibold text-white mt-2 truncate max-w-[100px]">{member.display_name || 'Member'}</span>
                    <span className="text-[10px] text-zinc-400 mt-0.5">In Call</span>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-medium text-white flex items-center gap-1.5">
                  <Mic size={12} className="text-green-400" />
                  <span className="truncate max-w-[80px]">{member.display_name || 'Member'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Single 1-on-1 Call View (Full Screen - No floating side box) */
          <div className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden">
            {activeCall?.type === 'video' ? (
              <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                {!remoteStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40 backdrop-blur-md">
                    <Avatar size="2xl" src={receiverProfile?.avatar_url} className="ring-4 ring-white/40 shadow-2xl mb-4" />
                    <h3 className="text-3xl font-extrabold text-white mb-2 tracking-tight drop-shadow-lg">
                      {receiverProfile?.display_name || 'User'}
                    </h3>
                    <p className="text-sm font-semibold text-white animate-pulse bg-black/60 px-6 py-2 rounded-full backdrop-blur-md border border-white/20 shadow-xl">
                      {activeCall?.status === 'ringing' ? 'Ringing...' : 'Calling...'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center z-10 p-6">
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full bg-brand-500/30 animate-ping" />
                  <Avatar size="2xl" src={receiverProfile?.avatar_url} className="ring-4 ring-white/40 shadow-2xl relative z-10" />
                </div>
                <h3 className="text-3xl font-extrabold text-white mb-2 tracking-tight drop-shadow-lg">
                  {receiverProfile?.display_name || 'User'}
                </h3>
                <span className="px-5 py-2 rounded-full bg-black/60 backdrop-blur-md text-sm font-semibold text-zinc-100 border border-white/20 shadow-xl">
                  {activeCall?.status === 'connected' ? 'Voice Call Connected' : (activeCall?.status === 'ringing' ? 'Ringing...' : 'Calling...')}
                </span>
                {activeCall?.status === 'connected' && <audio ref={remoteVideoRef} autoPlay />}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Call Background Picker Drawer */}
      {showBgPicker && (
        <div className="absolute bottom-28 left-4 right-4 z-50 bg-zinc-900/95 border border-zinc-800 backdrop-blur-2xl p-4 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-4 duration-200 pointer-events-auto">
          <div className="flex items-center justify-between mb-3 px-1">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Select 9:16 Clear Background</h4>
            <button onClick={() => setShowBgPicker(false)} className="text-zinc-400 hover:text-white text-xs font-semibold">Done</button>
          </div>
          <div className="grid grid-cols-5 gap-2 overflow-x-auto pb-1 no-scrollbar">
            {CALL_BACKGROUNDS.map((bg, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setBgUrl(bg.url);
                  localStorage.setItem('setting_call_bg_url', bg.url);
                  toast.success(`Background set: ${bg.name}`);
                }}
                className={cn(
                  "relative aspect-[9/16] rounded-xl overflow-hidden ring-offset-2 ring-offset-zinc-950 transition-all cursor-pointer",
                  bgUrl === bg.url ? "ring-2 ring-brand-500 scale-[1.03]" : "hover:scale-[1.02] opacity-80 hover:opacity-100"
                )}
              >
                <img src={bg.url} alt={bg.name} className="h-full w-full object-cover" />
                {bgUrl === bg.url && (
                  <div className="absolute inset-0 bg-brand-500/30 flex items-center justify-center">
                    <Check size={16} className="text-white drop-shadow-md" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full-screen Call Action Control Bar */}
      <div className="relative z-50 p-4 sm:p-6 pb-8 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-wrap items-center justify-center gap-3 sm:gap-5 pointer-events-auto">
        {/* Mic Toggle */}
        <button 
          onClick={toggleMic} 
          title={micOn ? "Mute Mic" : "Unmute Mic"}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-xl transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto",
            micOn ? "bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/30" : "bg-white text-zinc-950 font-bold"
          )}
        >
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        {/* Video Camera Toggle */}
        <button 
          onClick={toggleCamera} 
          title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-xl transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto",
            cameraOn ? "bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/30" : "bg-white text-zinc-950 font-bold"
          )}
        >
          {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        {/* Flip Camera */}
        {activeCall?.type === 'video' && (
          <button 
            onClick={switchCameraFacingMode}
            title={`Flip Camera (Current: ${facingMode === 'user' ? 'Front' : 'Back'})`}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xl text-white ring-1 ring-white/30 transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto"
          >
            <SwitchCamera size={24} />
          </button>
        )}

        {/* Speaker Mode Toggle */}
        <button 
          onClick={toggleSpeaker} 
          title={speakerOn ? "Mute Speaker" : "Enable Speaker"}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-xl transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto",
            speakerOn ? "bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/30" : "bg-amber-500 text-zinc-950 font-bold"
          )}
        >
          {speakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
        </button>

        {/* Background Quick Switcher */}
        <button 
          onClick={() => setShowBgPicker(prev => !prev)} 
          title="Choose Call Background Image"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xl text-white ring-1 ring-white/30 transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto"
        >
          <ImageIcon size={24} />
        </button>

        {/* End Call / Cancel Call Button */}
        <button 
          onClick={() => endCall()} 
          title="Cancel / End Call" 
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-red-500 hover:brightness-110 text-white transition-all active:scale-95 shadow-2xl shadow-red-600/70 ring-4 ring-red-500/40 cursor-pointer pointer-events-auto"
        >
          <PhoneOff size={30} className="rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}
