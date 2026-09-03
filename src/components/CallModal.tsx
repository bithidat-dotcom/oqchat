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
  { name: 'Sky Anime Glow (9:16)', url: 'https://i.pinimg.com/736x/4c/b3/a1/4cb3a11088f8031e28885a89426efea2.jpg' },
  { name: 'Aesthetic Sunset (9:16)', url: 'https://i.pinimg.com/1200x/a2/c7/62/a2c762f9f30248a255b08c51c020cbf5.jpg' },
  { name: 'Anime Sky Glow (9:16)', url: 'https://i.pinimg.com/736x/86/82/ac/8682ac3264f7b7210e92b4963ec73a82.jpg' },
  { name: 'Purple Night Clouds (9:16)', url: 'https://i.pinimg.com/1200x/3b/4f/9c/3b4f9cd70c8878e2677d57990c039015.jpg' },
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
    const targetCall = activeCall || incomingCall;
    if (!targetCall || !user) {
      setReceiverProfile(null);
      return;
    }

    const otherUserId = targetCall.caller === user.uid ? targetCall.receiver : targetCall.caller;
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
  }, [activeCall, incomingCall, user]);

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
      const videoConstraints = isVideo ? {
        width: { ideal: 720 },
        height: { ideal: 1280 },
        aspectRatio: { ideal: 9 / 16 },
        facingMode
      } : false;
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
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
        callerName: profile?.display_name || (user as any)?.displayName || (user as any)?.phone || 'Caller',
        callerAvatar: profile?.avatar_url || '',
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

        {/* Center Info & Call Status */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-4 my-auto">
          <div className="relative flex items-center justify-center">
            {/* Pulsating Radar Aura Rings */}
            <div className="absolute w-36 h-36 rounded-full bg-brand-500/20 animate-ping duration-1000" />
            <div className="w-24 h-24 rounded-full bg-brand-500/20 border-2 border-brand-500/50 flex items-center justify-center relative z-10 shadow-[0_0_50px_rgba(136,255,0,0.3)] backdrop-blur-md">
              <Phone size={40} className="text-brand-400 animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-md">
              {receiverProfile?.display_name || incomingCall.callerName || (incomingCall.isGroupCall ? incomingCall.groupName : 'Caller')}
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
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-red-600 to-rose-600 text-white flex items-center justify-center group-hover:from-red-700 group-hover:to-rose-700 transition-all shadow-2xl shadow-red-500/60 ring-4 ring-red-500/30 active:scale-95">
              <PhoneOff size={32} className="text-white" />
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
      {/* Background Layer (Only for Voice Calls) */}
      {activeCall?.type !== 'video' && (
        <div className="absolute inset-0 z-0 bg-zinc-950">
          <img src={currentBg} alt="Call Background" className="w-full h-full object-cover opacity-95 transition-all duration-500" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />
        </div>
      )}
      {activeCall?.type === 'video' && (
        <div className="absolute inset-0 z-0 bg-black" />
      )}

      {/* Call Header */}
      <div className="relative z-20 pt-10 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-white drop-shadow-md">
              {isGroupCall ? (activeCall?.groupName || 'Group Call') : (receiverProfile?.display_name || 'Call')}
            </h2>
            <p className="text-xs text-zinc-300 font-medium">
              {activeCall?.status === 'connected' ? 'Connected' : (activeCall?.status === 'ringing' ? 'Ringing...' : 'Calling...')}
            </p>
          </div>
        </div>

            {/* Fullscreen & Background Quick Actions (Only for Voice Calls) */}
        {activeCall?.type !== 'video' && (
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
        )}
        {activeCall?.type === 'video' && (
          <div className="flex items-center gap-2">
            <button 
              onClick={switchCameraFacingMode}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25 text-white transition-all ring-1 ring-white/20 active:scale-95"
              title="Flip Camera"
            >
              <SwitchCamera size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Live Video / Main Content Grid (Strict 9:16 Portrait Ratio Layout) */}
      <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden w-full h-full">
        {isGroupCall ? (
          /* Multi-Participant Group Call Grid (9:16 Aspect Ratio Tiles) */
          <div className="w-full max-w-4xl grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 h-full max-h-[75vh] items-center justify-center z-10">
            {/* User Tile */}
            <div className="relative aspect-[9/16] rounded-3xl overflow-hidden bg-zinc-900/80 ring-2 ring-brand-500/50 shadow-2xl flex flex-col items-center justify-center">
              {activeCall?.type === 'video' && cameraOn ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-4">
                  <span className="text-xs font-semibold text-white">You (Host)</span>
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-medium text-white flex items-center gap-1.5">
                {micOn ? <Mic size={12} className="text-green-400" /> : <MicOff size={12} className="text-red-400" />}
                <span>You</span>
              </div>
            </div>

            {/* Other Members Tiles */}
            {groupMembers.filter((m: any) => m.id !== user?.uid).map((member: any, idx: number) => (
              <div key={member.id || idx} className="relative aspect-[9/16] rounded-3xl overflow-hidden bg-zinc-900/60 ring-1 ring-white/20 backdrop-blur-md shadow-xl flex flex-col items-center justify-center">
                {idx === 0 && remoteStream && activeCall?.type === 'video' ? (
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4">
                    <span className="text-xs font-semibold text-white truncate max-w-[100px]">{member.display_name || 'Member'}</span>
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
          /* Single 1-on-1 Call View (Full Screen Video + Floating Self-View PIP) */
          <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black overflow-hidden">
            {activeCall?.type === 'video' ? (
              <div className="absolute inset-0 w-full h-full">
                {/* Remote Video Stream (True Full Screen Cover) */}
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className="absolute inset-0 w-full h-full object-cover" 
                />
                
                {/* Floating Self Camera View PIP */}
                {cameraOn && (
                  <div className="absolute top-24 right-4 w-28 h-48 sm:w-36 sm:h-64 aspect-[9/16] rounded-2xl overflow-hidden ring-2 ring-white/30 shadow-2xl z-30 bg-zinc-900/80 backdrop-blur-md transition-all">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-semibold text-white flex items-center gap-1">
                      {micOn ? <Mic size={10} className="text-emerald-400" /> : <MicOff size={10} className="text-red-400" />}
                      <span>You</span>
                    </div>
                  </div>
                )}

                {!remoteStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40 backdrop-blur-md">
                    <h3 className="text-3xl font-extrabold text-white mb-3 tracking-tight drop-shadow-lg">
                      {receiverProfile?.display_name || 'User'}
                    </h3>
                    <p className="text-sm font-semibold text-white animate-pulse bg-black/60 px-6 py-2 rounded-full backdrop-blur-md border border-white/20 shadow-xl">
                      {activeCall?.status === 'ringing' ? 'Ringing...' : 'Calling...'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Voice Call Screen - New UX Design with Pulsating Avatar */
              <div className="flex flex-col items-center justify-center text-center z-10 p-6 space-y-12">
                <div className="relative">
                  {/* Multiple Pulsating Rings */}
                  <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping duration-[3000ms]" />
                  <div className="absolute inset-0 rounded-full bg-brand-500/10 animate-ping duration-[2000ms] delay-700" />
                  
                  {/* Large User Avatar */}
                  <div className="relative z-10 w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden border-4 border-white/20 shadow-[0_0_80px_rgba(136,255,0,0.25)] ring-4 ring-brand-500/30">
                    {receiverProfile?.avatar_url ? (
                      <img src={receiverProfile.avatar_url} alt="User" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-brand-500 to-emerald-500 flex items-center justify-center">
                        <span className="text-6xl font-bold text-white uppercase">
                          {(receiverProfile?.display_name || 'U').charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-xl">
                      {receiverProfile?.display_name || 'User'}
                    </h3>
                    <div className="flex items-center justify-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        activeCall?.status === 'connected' ? "bg-emerald-400 animate-pulse" : "bg-zinc-400"
                      )} />
                      <span className="text-base font-semibold text-zinc-300">
                        {activeCall?.status === 'connected' ? 'Connected' : (activeCall?.status === 'ringing' ? 'Ringing...' : 'Calling...')}
                      </span>
                    </div>
                  </div>

                  {activeCall?.status === 'connected' && (
                    <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/15 shadow-2xl">
                      <Volume2 size={18} className="text-brand-400 animate-bounce" />
                      <div className="flex gap-1 items-end h-3">
                        <div className="w-1 h-2 bg-brand-400 rounded-full animate-[voice-wave_1s_ease-in-out_infinite]" />
                        <div className="w-1 h-3 bg-brand-400 rounded-full animate-[voice-wave_1.2s_ease-in-out_infinite_0.2s]" />
                        <div className="w-1 h-1.5 bg-brand-400 rounded-full animate-[voice-wave_0.8s_ease-in-out_infinite_0.4s]" />
                        <div className="w-1 h-2.5 bg-brand-400 rounded-full animate-[voice-wave_1.1s_ease-in-out_infinite_0.1s]" />
                      </div>
                      <span className="text-sm font-bold text-white tabular-nums tracking-wider">
                        {/* Timer could be added here if we had duration state */}
                        HD Audio
                      </span>
                    </div>
                  )}
                </div>

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

      {/* Full-screen Call Action Control Bar (Perfect Single Row Layout) */}
      <div className="relative z-50 w-full max-w-lg mx-auto p-4 pb-8 bg-gradient-to-t from-black via-black/80 to-transparent flex items-center justify-center gap-2.5 sm:gap-4 pointer-events-auto">
        {/* Mic Toggle */}
        <button 
          onClick={toggleMic} 
          title={micOn ? "Mute Mic" : "Unmute Mic"}
          className={cn(
            "flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full backdrop-blur-xl transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto shrink-0",
            micOn ? "bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/30" : "bg-white text-zinc-950 font-bold"
          )}
        >
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Video Camera Toggle */}
        <button 
          onClick={toggleCamera} 
          title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
          className={cn(
            "flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full backdrop-blur-xl transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto shrink-0",
            cameraOn ? "bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/30" : "bg-white text-zinc-950 font-bold"
          )}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Flip Camera */}
        {activeCall?.type === 'video' && (
          <button 
            onClick={switchCameraFacingMode}
            title={`Flip Camera (Current: ${facingMode === 'user' ? 'Front' : 'Back'})`}
            className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xl text-white ring-1 ring-white/30 transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto shrink-0"
          >
            <SwitchCamera size={20} />
          </button>
        )}

        {/* Speaker Mode Toggle */}
        <button 
          onClick={toggleSpeaker} 
          title={speakerOn ? "Mute Speaker" : "Enable Speaker"}
          className={cn(
            "flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full backdrop-blur-xl transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto shrink-0",
            speakerOn ? "bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/30" : "bg-amber-500 text-zinc-950 font-bold"
          )}
        >
          {speakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>

        {/* Background Quick Switcher (Only for Voice Calls) */}
        {activeCall?.type !== 'video' && (
          <button 
            onClick={() => setShowBgPicker(prev => !prev)} 
            title="Choose Call Background Image"
            className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xl text-white ring-1 ring-white/30 transition-all active:scale-95 shadow-xl cursor-pointer pointer-events-auto shrink-0"
          >
            <ImageIcon size={20} />
          </button>
        )}

        {/* End Call / Cancel Call Button */}
        <button 
          onClick={() => endCall()} 
          title="Cancel / End Call" 
          className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-red-500 hover:brightness-110 text-white transition-all active:scale-95 shadow-2xl shadow-red-600/70 ring-4 ring-red-500/40 cursor-pointer pointer-events-auto shrink-0"
        >
          <PhoneOff size={28} className="text-white" />
        </button>
      </div>
    </div>
  );
}
