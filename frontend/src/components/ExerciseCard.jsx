import { useRef, useState } from "react";

function getYouTubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s]+)/
  );
  return match ? match[1] : null;
}

export default function ExerciseCard({ exercise, index, onDelete }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef(null);
  const ytPlayer = useRef(null);

  const togglePreview = () => {
    if (isPlaying) {
      if (ytPlayer.current) {
        ytPlayer.current.destroy();
        ytPlayer.current = null;
      }
      setIsPlaying(false);
      return;
    }

    const videoId = getYouTubeId(exercise.youtubeUrl);
    if (!videoId || !window.YT) return;

    setIsPlaying(true);

    setTimeout(() => {
      ytPlayer.current = new window.YT.Player(playerRef.current, {
        videoId,
        playerVars: {
          start: exercise.start || 0,
          end: exercise.end || undefined,
          controls: 1,
          autoplay: 1,
          mute: 1
        },
      });
    }, 50);
  };

  const metadata = exercise.metadata || (exercise.sets && exercise.reps ? `${exercise.sets} sets × ${exercise.reps} reps` : null);

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl overflow-hidden shadow-sm hover:border-zinc-700/60 transition-colors group/card relative">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-500">
              {index + 1}
            </div>
            <h3 className="text-base font-semibold text-zinc-200">
              {exercise.name}
            </h3>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-zinc-700 hover:text-red-400 opacity-0 group-hover/card:opacity-100 transition-all rounded-md"
            aria-label="Delete Exercise"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>

        <div
          onClick={!isPlaying ? togglePreview : undefined}
          className={`relative aspect-video bg-zinc-800/20 rounded-lg overflow-hidden border border-zinc-800/40 group/play transition-all ${!isPlaying ? 'cursor-pointer hover:border-zinc-700/60' : ''}`}
        >
          {isPlaying ? (
            <div ref={playerRef} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-900/80 border border-zinc-800 transition-transform group-hover/play:scale-105">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-600 group-hover/play:text-zinc-400 transition-colors">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <span className="text-[11px] text-zinc-600 font-medium">Video placeholder</span>
            </div>
          )}

          {isPlaying && (
            <button
              onClick={(e) => { e.stopPropagation(); togglePreview(); }}
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-all opacity-0 group-hover/play:opacity-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {metadata && (
          <div className="mt-4 text-[11px] font-medium text-zinc-600">
            {metadata}
          </div>
        )}
      </div>
    </div>
  );
}
