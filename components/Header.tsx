import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <span className="material-icons text-white text-lg">hands_connect</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            Gesture<span className="text-brand-500">Bridge</span>
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <a 
            href="https://ai.google.dev" 
            target="_blank" 
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <span>Powered by Gemini</span>
            <span className="material-icons text-[14px]">open_in_new</span>
          </a>
        </div>
      </div>
    </header>
  );
};