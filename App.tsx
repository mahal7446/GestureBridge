import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { Transcript } from './components/Transcript';
import { AudioVisualizer } from './components/AudioVisualizer';
import { ConnectionStatus, Message } from './types';
import { 
  base64ToBytes, 
  pcmToAudioBuffer, 
  blobToBase64, 
  float32To16BitPCM 
} from './services/audioUtils';

// Constants
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const SYSTEM_INSTRUCTION = `
You are an expert Sign Language Interpreter.
1. When the session starts, briefly say "I am watching. Please sign."
2. CONTINUOUSLY MONITOR the video feed.
3. If you see hand signs (ASL, etc.), translate them immediately to spoken English.
4. If the user is speaking (audio), reply normally.
5. If the video is moving but you don't recognize a sign, say nothing or ask "Could you repeat that?".
6. Your goal is to be a voice for the person signing. Speak clearly.
`;

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const frameIntervalRef = useRef<number | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  // Initialize Audio Context (Singleton)
  const ensureAudioContext = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Matching Gemini output
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const connectToGemini = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      setError(null);

      // 1. Setup Audio Input
      const ctx = await ensureAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream); // For visualizer

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      // 2. Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Connected");
            setStatus(ConnectionStatus.CONNECTED);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Text Transcription
            if (msg.serverContent?.outputTranscription?.text) {
              const text = msg.serverContent.outputTranscription.text;
              setMessages(prev => {
                 // Append to last message if it is from model and recent, otherwise new
                 const lastMsg = prev[prev.length - 1];
                 const isRecent = lastMsg && (new Date().getTime() - lastMsg.timestamp.getTime() < 2000);
                 
                 if (lastMsg && lastMsg.role === 'model' && isRecent) {
                   return [
                     ...prev.slice(0, -1),
                     { ...lastMsg, text: lastMsg.text + text }
                   ];
                 }
                 return [...prev, {
                  id: Date.now().toString(),
                  role: 'model',
                  text: text,
                  timestamp: new Date()
                }];
              });
            }

            // Handle Audio Output
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              try {
                const audioCtx = audioContextRef.current;
                if (!audioCtx) return;

                const audioData = base64ToBytes(base64Audio);
                const audioBuffer = await pcmToAudioBuffer(audioData, audioCtx, 24000);
                
                // Scheduler
                const now = audioCtx.currentTime;
                // If drift is too large, reset
                if (nextStartTimeRef.current < now || nextStartTimeRef.current > now + 0.5) {
                  nextStartTimeRef.current = now;
                }
                
                const sourceNode = audioCtx.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(audioCtx.destination);
                
                sourceNode.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                
                sourcesRef.current.add(sourceNode);
                sourceNode.onended = () => {
                  sourcesRef.current.delete(sourceNode);
                };
              } catch (err) {
                console.error("Audio decoding error:", err);
              }
            }
            
            // Handle Interruption
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(node => {
                try { node.stop(); } catch(e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Gemini Closed");
            setStatus(ConnectionStatus.DISCONNECTED);
          },
          onerror: (err) => {
            console.error("Gemini Error", err);
            setError("Connection error. Please try again.");
            setStatus(ConnectionStatus.ERROR);
            stopEverything();
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

      // Audio Input Handler
      processor.onaudioprocess = (e) => {
        // Only send audio if Mic is On
        if (!isMicOn) return; 

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = float32To16BitPCM(inputData);
        
        blobToBase64(pcmBlob).then(base64Data => {
           sessionPromise.then(session => {
             session.sendRealtimeInput({
               media: {
                 mimeType: 'audio/pcm;rate=16000',
                 data: base64Data
               }
             });
           });
        });
      };
      
      source.connect(processor);
      processor.connect(inputCtx.destination);

      // 3. Start Video Streaming Loop
      startVideoStreaming(sessionPromise);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect");
      setStatus(ConnectionStatus.ERROR);
      stopEverything();
    }
  };

  const startVideoStreaming = (sessionPromise: Promise<any>) => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);

    // 5 FPS (200ms)
    frameIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx || video.readyState < 2) return;

      canvas.width = 640; 
      canvas.height = 360; 
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64 = await new Promise<string>((resolve) => {
        canvas.toBlob(blob => {
          if (blob) {
            blobToBase64(blob).then(resolve);
          }
        }, 'image/jpeg', 0.6);
      });

      sessionPromise.then(session => {
        try {
          session.sendRealtimeInput({
            media: {
              mimeType: 'image/jpeg',
              data: base64
            }
          });
        } catch (e) {
          console.error("Error sending frame:", e);
        }
      });

    }, 200);
  };

  const stopEverything = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    sourcesRef.current.forEach(node => node.stop());
    sourcesRef.current.clear();
    sessionPromiseRef.current = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
  };

  const disconnect = () => {
    stopEverything();
    setStatus(ConnectionStatus.DISCONNECTED);
  };

  useEffect(() => {
    return () => stopEverything();
  }, []);

  const handleToggle = () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      disconnect();
    } else {
      connectToGemini();
    }
  };

  const handleTestConnection = () => {
    if (sessionPromiseRef.current) {
       sessionPromiseRef.current.then(session => {
         // Send a text trigger to verify connection
         session.sendRealtimeInput({
           content: {
             role: 'user',
             parts: [{ text: "Hello! Confirm you can hear and see me." }]
           }
         });
       });
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-brand-500 selection:text-white">
      <Header />
      
      {/* Hidden Canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto h-[calc(100vh-1rem)] flex flex-col gap-6">
        
        {/* Error Banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-xl flex items-center gap-3">
            <span className="material-icons">error_outline</span>
            <p>{error}</p>
          </div>
        )}

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0 pb-6">
          
          {/* Left Column: Video Feed */}
          <div className="flex flex-col gap-4 h-full min-h-0">
            <div className="relative flex-1 bg-black rounded-3xl overflow-hidden border border-gray-800 shadow-2xl ring-1 ring-white/10">
              <VideoPreview 
                videoRef={videoRef} 
                isActive={status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING} 
              />
              
              {/* Top Controls Overlay */}
              <div className="absolute top-4 left-4 z-20 flex gap-2">
                 <button 
                    onClick={() => setIsMicOn(!isMicOn)}
                    className={`p-2 rounded-full backdrop-blur-md border border-white/10 transition-colors ${isMicOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/80 text-white'}`}
                    title={isMicOn ? "Mute Microphone (Prioritize Video)" : "Unmute Microphone"}
                 >
                    <span className="material-icons text-xl">{isMicOn ? 'mic' : 'mic_off'}</span>
                 </button>
                 {status === ConnectionStatus.CONNECTED && (
                   <button
                     onClick={handleTestConnection}
                     className="px-3 py-1 rounded-full bg-brand-500/20 hover:bg-brand-500/40 border border-brand-500/30 text-brand-300 text-xs font-semibold backdrop-blur-md transition-colors"
                   >
                     Test Connection
                   </button>
                 )}
              </div>

              {/* Bottom Controls */}
              <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-4 z-10 pointer-events-none">
                {/* Audio Visualizer */}
                {status === ConnectionStatus.CONNECTED && (
                   <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5 flex items-center gap-3">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Mic Input</span>
                      <AudioVisualizer stream={mediaStream} isActive={status === ConnectionStatus.CONNECTED && isMicOn} />
                   </div>
                )}

                <button
                  onClick={handleToggle}
                  className={`
                    pointer-events-auto
                    flex items-center gap-3 px-8 py-4 rounded-full font-bold text-lg shadow-xl transition-all duration-300 transform hover:scale-105
                    ${status === ConnectionStatus.CONNECTED 
                      ? 'bg-red-500 hover:bg-red-600 text-white ring-4 ring-red-500/30' 
                      : status === ConnectionStatus.CONNECTING
                        ? 'bg-yellow-500 text-white cursor-wait'
                        : 'bg-brand-500 hover:bg-brand-400 text-white ring-4 ring-brand-500/30'
                    }
                  `}
                >
                  <span className="material-icons text-2xl">
                    {status === ConnectionStatus.CONNECTED ? 'stop' : status === ConnectionStatus.CONNECTING ? 'hourglass_empty' : 'videocam'}
                  </span>
                  {status === ConnectionStatus.CONNECTED ? 'Stop Interpreter' : status === ConnectionStatus.CONNECTING ? 'Connecting...' : 'Start Interpreter'}
                </button>
              </div>
            </div>

            {/* Instructions / Status */}
            <div className="bg-gray-800/40 p-4 rounded-2xl border border-gray-700/50">
               <div className="flex items-start gap-3">
                 <span className="material-icons text-brand-400 mt-1">info</span>
                 <div>
                   <h3 className="font-semibold text-white">Tips for best results</h3>
                   <ul className="text-sm text-gray-400 mt-1 space-y-1 list-disc pl-4">
                     <li>Ensure you are in a well-lit environment.</li>
                     <li>Keep your hands visible within the frame.</li>
                     <li>If the interpreter is silent, try muting your microphone.</li>
                   </ul>
                 </div>
               </div>
            </div>
          </div>

          {/* Right Column: Transcription */}
          <div className="h-full min-h-0 flex flex-col">
            <Transcript messages={messages} status={status} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;