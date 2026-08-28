import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera } from 'lucide-react';
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

export default function CallModal() {
  const { user } = useAuthStore();
  const { activeCall, isCalling, incomingCall, setActiveCall, setCalling, setIncomingCall, localStream, remoteStream, setStreams } = useCallStore();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  
  const callUnsubRef = useRef<(() => void) | null>(null);
  const candidatesUnsubRef = useRef<(() => void) | null>(null);
  
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  // Audio elements for ringtones
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const dialtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    ringtoneRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg');
    ringtoneRef.current.loop = true;
    dialtoneRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/phone_ringing.ogg');
    dialtoneRef.current.loop = true;
    return () => {
       ringtoneRef.current?.pause();
       dialtoneRef.current?.pause();
    }
  }, []);

  // Update video elements when streams or activeCall change
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

  // Listen for incoming calls globally
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'calls'), where('receiver', '==', user.uid), where('status', '==', 'ringing'));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const callDoc = snapshot.docs[0];
        const callData = { id: callDoc.id, ...callDoc.data() };
        if (!useCallStore.getState().isCalling && !useCallStore.getState().incomingCall) {
          setIncomingCall(callData);
        }
      } else {
        // If we had an incoming call but it's no longer ringing (cancelled or answered elsewhere)
        if (!useCallStore.getState().isCalling) {
           setIncomingCall(null);
           ringtoneRef.current?.pause();
        }
      }
    });
    return () => unsub();
  }, [user, setIncomingCall]);

  // Handle ringtones
  useEffect(() => {
    if (incomingCall && !isCalling) {
      ringtoneRef.current?.play().catch(e => console.log("Audio play blocked by browser:", e));
    } else {
      ringtoneRef.current?.pause();
      if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
    }
  }, [incomingCall, isCalling]);

  useEffect(() => {
    if (activeCall?.status === 'ringing') {
      dialtoneRef.current?.play().catch(e => console.log("Audio play blocked by browser:", e));
    } else {
      dialtoneRef.current?.pause();
      if (dialtoneRef.current) dialtoneRef.current.currentTime = 0;
    }
  }, [activeCall?.status]);


  // Handle initiation from CallsListScreen
  useEffect(() => {
    if (activeCall?.status === 'initiating' && activeCall?.caller === user?.uid) {
      startCall(activeCall.receiver, activeCall.type === 'video');
    }
  }, [activeCall?.status]); 

  const setupWebRTC = async (callId: string, isVideo: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
      setStreams(stream, null);
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        setStreams(useCallStore.getState().localStream, event.streams[0]);
      };

      return { pc, stream };
    } catch (e) {
      console.error("Error getting media", e);
      toast.error("Could not access camera/microphone");
      endCall(callId);
      throw e;
    }
  };

  const startCall = async (otherUserId: string, isVideo: boolean) => {
    if (!user) return;
    
    const callRef = doc(collection(db, 'calls'));
    const callId = callRef.id;

    setActiveCall({ id: callId, caller: user.uid, receiver: otherUserId, type: isVideo ? 'video' : 'voice', status: 'ringing' });
    setCalling(true);
    setIncomingCall(null);

    try {
      const { pc } = await setupWebRTC(callId, isVideo);

      const callerCandidatesCollection = collection(db, 'calls', callId, 'callerCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(callerCandidatesCollection, event.candidate.toJSON());
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await setDoc(callRef, {
        caller: user.uid,
        receiver: otherUserId,
        type: isVideo ? 'video' : 'voice',
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: new Date().toISOString()
      });

      callUnsubRef.current = onSnapshot(callRef, (docSnap) => {
        const data = docSnap.data();
        if (!data) return;
        
        if (data.status === 'rejected' || data.status === 'ended') {
          toast(data.status === 'rejected' ? "Call declined" : "Call ended");
          endCall(callId, false);
        } else if (data.status === 'connected' && data.answer && !pc.currentRemoteDescription) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription);
          setActiveCall(useCallStore.getState().activeCall ? { ...useCallStore.getState().activeCall, status: 'connected' } : null);
        }
      });

      const receiverCandidatesCollection = collection(db, 'calls', callId, 'receiverCandidates');
      candidatesUnsubRef.current = onSnapshot(receiverCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate).catch(e => console.error("Error adding candidate", e));
          }
        });
      });

    } catch (error) {
      console.error('Error starting call', error);
      endCall(callId);
    }
  };

  const acceptCall = async () => {
    if (!user || !incomingCall) return;
    const callId = incomingCall.id;
    const isVideo = incomingCall.type === 'video';
    
    setCalling(true);
    setActiveCall({ ...incomingCall, status: 'connected' });
    setIncomingCall(null);
    ringtoneRef.current?.pause();

    try {
      const { pc } = await setupWebRTC(callId, isVideo);

      const receiverCandidatesCollection = collection(db, 'calls', callId, 'receiverCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(receiverCandidatesCollection, event.candidate.toJSON());
        }
      };

      const offerDescription = new RTCSessionDescription(incomingCall.offer);
      await pc.setRemoteDescription(offerDescription);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await updateDoc(doc(db, 'calls', callId), {
        status: 'connected',
        answer: { type: answer.type, sdp: answer.sdp }
      });

      const callerCandidatesCollection = collection(db, 'calls', callId, 'callerCandidates');
      candidatesUnsubRef.current = onSnapshot(callerCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate).catch(e => console.error("Error adding candidate", e));
          }
        });
      });

      callUnsubRef.current = onSnapshot(doc(db, 'calls', callId), (docSnap) => {
        const data = docSnap.data();
        if (data?.status === 'ended') {
          endCall(callId, false);
        }
      });

    } catch (e) {
      console.error("Failed to accept call", e);
      endCall(callId);
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    const callId = incomingCall.id;
    await updateDoc(doc(db, 'calls', callId), { status: 'rejected' });
    setIncomingCall(null);
    ringtoneRef.current?.pause();
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
    
    ringtoneRef.current?.pause();
    dialtoneRef.current?.pause();
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !micOn);
      setMicOn(!micOn);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !cameraOn);
      setCameraOn(!cameraOn);
    }
  };

  if (!isCalling && !incomingCall) return null;

  if (incomingCall && !isCalling) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] flex flex-col items-center w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-brand-500 rounded-full animate-ping opacity-20"></div>
            <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center relative z-10 border-4 border-zinc-900">
               <Phone size={32} className="text-brand-500 animate-pulse" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Incoming Call</h2>
          <p className="text-zinc-400 mb-8 capitalize">{incomingCall.type} call</p>
          
          <div className="flex gap-8 w-full justify-center">
             <button onClick={rejectCall} className="flex flex-col items-center gap-2 group">
               <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-all">
                  <PhoneOff size={28} />
               </div>
               <span className="text-sm font-medium text-red-500 group-hover:text-red-400 transition-colors">Decline</span>
             </button>
             <button onClick={acceptCall} className="flex flex-col items-center gap-2 group">
               <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-all">
                  <Phone size={28} className="animate-bounce" />
               </div>
               <span className="text-sm font-medium text-green-500 group-hover:text-green-400 transition-colors">Accept</span>
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-white overflow-hidden animate-in fade-in duration-200">
      {/* Remote Video / Background */}
      <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
        {activeCall?.type === 'video' ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            {!remoteStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 backdrop-blur-md">
                <Avatar size="xl" />
                <p className="text-zinc-400 mt-4 text-sm animate-pulse">Connecting to video...</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-zinc-800 flex items-center justify-center mb-6 ring-4 ring-zinc-800/50">
               <Phone size={48} className="text-zinc-500" />
            </div>
            <h2 className="text-2xl font-semibold">Voice Call</h2>
            <p className="text-zinc-400 mt-2">
              {activeCall?.status === 'ringing' ? 'Calling...' : (activeCall?.status === 'connected' ? 'Connected' : 'Connecting...')}
            </p>
            {activeCall?.status === 'connected' && (
              <audio ref={remoteVideoRef} autoPlay />
            )}
          </div>
        )}
      </div>

      {/* Local Video Picture-in-Picture */}
      {activeCall?.type === 'video' && (
        <div className="absolute top-12 right-4 w-28 h-40 bg-black rounded-2xl overflow-hidden shadow-xl ring-2 ring-zinc-800 z-10 cursor-move transition-all active:scale-95">
          <video ref={localVideoRef} autoPlay playsInline muted className={cn("h-full w-full object-cover", !cameraOn && "hidden")} />
          {!cameraOn && (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800">
               <Avatar size="sm" />
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-safe bg-gradient-to-t from-black/80 to-transparent flex justify-center gap-6 z-20">
        <button onClick={toggleMic} className={cn("flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95", micOn ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white text-zinc-900")}>
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
        
        {activeCall?.type === 'video' && (
          <>
            <button onClick={toggleCamera} className={cn("flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95", cameraOn ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white text-zinc-900")}>
              {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
            </button>
            <button 
              onClick={() => {
                if (localStream) {
                  const videoTrack = localStream.getVideoTracks()[0];
                  if (videoTrack) {
                    toast.success('Camera switched (Front/Back)');
                  } else {
                    toast('No secondary camera detected');
                  }
                }
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all active:scale-95 text-white"
            >
              <SwitchCamera size={24} />
            </button>
          </>
        )}
        
        <button onClick={() => endCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 transition-all active:scale-95 shadow-lg">
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}
