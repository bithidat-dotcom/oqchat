import { create } from 'zustand';

interface CallState {
  isCalling: boolean;
  incomingCall: any | null;
  activeCall: any | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  setCalling: (isCalling: boolean) => void;
  setIncomingCall: (call: any | null) => void;
  setActiveCall: (call: any | null) => void;
  setStreams: (local: MediaStream | null, remote: MediaStream | null) => void;
}

export const useCallStore = create<CallState>((set) => ({
  isCalling: false,
  incomingCall: null,
  activeCall: null,
  localStream: null,
  remoteStream: null,
  setCalling: (isCalling) => set({ isCalling }),
  setIncomingCall: (call) => set({ incomingCall: call }),
  setActiveCall: (call) => set({ activeCall: call }),
  setStreams: (local, remote) => set({ localStream: local, remoteStream: remote }),
}));
