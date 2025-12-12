import React, { useEffect, useRef } from 'react';

interface VideoPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ videoRef, isActive }) => {
  useEffect(() => {
    const startVideo = async () => {
      if (isActive && videoRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user"
            }
          });
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        } catch (err) {
          console.error("Error accessing camera:", err);
        }
      } else if (!isActive && videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };

    startVideo();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive, videoRef]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl bg-black border border-gray-800 shadow-2xl">
      <video
        ref={videoRef}
        className="w-full h-full object-cover transform -scale-x-100" // Mirror effect
        muted
        playsInline
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 text-gray-400">
          <div className="text-center">
            <span className="material-icons text-6xl mb-4">videocam_off</span>
            <p>Camera is inactive</p>
          </div>
        </div>
      )}
      
      {/* Overlay UI */}
      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div>
        <span className="text-xs font-medium uppercase tracking-wider">{isActive ? 'Live' : 'Offline'}</span>
      </div>
    </div>
  );
};