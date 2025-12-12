import React, { useEffect, useRef } from 'react';
import { Message } from '../types';

interface TranscriptProps {
  messages: Message[];
  status: string;
}

export const Transcript: React.FC<TranscriptProps> = ({ messages, status }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700 bg-gray-800/80 flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span className="material-icons text-brand-500">record_voice_over</span>
          Interpretation Log
        </h2>
        <span className="text-xs text-gray-400 uppercase tracking-widest">{status}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center opacity-60">
            <span className="material-icons text-4xl mb-2">gesture</span>
            <p>Start signing to see translation...</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.role === 'model' ? 'items-start' : 'items-end'}`}
            >
              <div 
                className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${
                  msg.role === 'model' 
                    ? 'bg-gray-700 text-white rounded-tl-none' 
                    : 'bg-brand-600 text-white rounded-tr-none'
                }`}
              >
                <p className="text-sm leading-relaxed">{msg.text}</p>
              </div>
              <span className="text-[10px] text-gray-500 mt-1 px-1">
                {msg.role === 'model' ? 'Interpreter' : 'User'} • {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};