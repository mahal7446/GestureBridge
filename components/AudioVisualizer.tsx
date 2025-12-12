import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
  color?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isActive, color = '#0ea5e9' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive || !stream) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const init = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; // Low resolution for simple bars
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const draw = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height;
          
          ctx2d.fillStyle = color;
          // Rounded bars
          if (barHeight > 0) {
              ctx2d.beginPath();
              ctx2d.roundRect(x, canvas.height - barHeight, barWidth, barHeight, 2);
              ctx2d.fill();
          }

          x += barWidth + 1;
        }

        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    };

    init();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      sourceRef.current?.disconnect();
      // Do not close AudioContext here as it might be shared or reused rapidly
    };
  }, [isActive, stream, color]);

  return <canvas ref={canvasRef} width={60} height={24} className="opacity-80" />;
};