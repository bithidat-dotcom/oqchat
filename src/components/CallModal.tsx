import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCallStore } from '../store/callStore';
import { Avatar } from './ui/Avatar';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

export default function CallModal() {
  const { user } = useAuthStore();
  const { activeCall, isCalling, incomingCall, setActiveCall, setCalling, setIncomingCall, localStream, remoteStream, setStreams } = useCallStore();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (activeCall?.status === 'initiating' && activeCall?.caller === user?.uid && !isCalling) {
      startCall(activeCall.receiver, activeCall.type === 'video');
    }
  }, [activeCall, user, isCalling]);

  const startCall = async (otherUserId: string, isVideo: boolean) => {
    if (!user) return;
    
    setCalling(true);
    setActiveCall({ caller: user.uid, receiver: otherUserId, type: isVideo ? 'video' : 'voice', status: 'ringing' });
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
      setStreams(stream, null);
      
      // Simulate answering after 3 seconds for local mock demo
      setTimeout(() => {
        if (useCallStore.getState().isCalling) {
          setActiveCall({ caller: user.uid, receiver: otherUserId, type: isVideo ? 'video' : 'voice', status: 'connected' });
        }
      }, 3000);
      
    } catch (error) {
      console.error('Error starting call', error);
      endCall();
    }
  };

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    setCalling(false);
    setActiveCall(null);
    setIncomingCall(null);
    setStreams(null, null);
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

  if (!isCalling) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-white overflow-hidden">
      {/* Remote Video / Background */}
      <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
        {activeCall?.type === 'video' ? (
          <div className="flex flex-col items-center justify-center h-full w-full">
            <Avatar size="xl" />
            <p className="text-zinc-400 mt-4 text-sm animate-pulse">Waiting for video...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-zinc-800 flex items-center justify-center mb-6 ring-4 ring-zinc-800/50">
               <Phone size={48} className="text-zinc-500" />
            </div>
            <h2 className="text-2xl font-semibold">Voice Call</h2>
            <p className="text-zinc-400 mt-2">
              {activeCall?.status === 'ringing' ? 'Calling...' : '00:00'}
            </p>
          </div>
        )}
      </div>

      {/* Local Video Picture-in-Picture */}
      {activeCall?.type === 'video' && (
        <div className="absolute top-12 right-4 w-28 h-40 bg-black rounded-2xl overflow-hidden shadow-xl ring-2 ring-zinc-800 z-10 cursor-move">
          <video ref={localVideoRef} autoPlay playsInline muted className={cn("h-full w-full object-cover", !cameraOn && "hidden")} />
          {!cameraOn && (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800">
               <Avatar size="sm" />
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-safe bg-gradient-to-t from-black/80 to-transparent flex justify-center gap-6">
        <button onClick={toggleMic} className={cn("flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-colors", micOn ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white text-zinc-900")}>
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
        
        {activeCall?.type === 'video' && (
          <>
            <button onClick={toggleCamera} className={cn("flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-colors", cameraOn ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white text-zinc-900")}>
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
                } else {
                  toast.success('Camera orientation switched');
                }
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-colors text-white"
            >
              <SwitchCamera size={24} />
            </button>
          </>
        )}
        
        <button onClick={endCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 transition-colors shadow-lg">
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}
