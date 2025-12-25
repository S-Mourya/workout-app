import { useRef, useEffect } from "react";

function getYouTubeId(url) {
    const match = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s]+)/
    );
    return match ? match[1] : null;
}

export default function WorkoutPlayer({ exercises, currentIndex, onNext, onPrev, onExit }) {
    const exercise = exercises[currentIndex];
    const playerRef = useRef(null);
    const ytPlayer = useRef(null);

    useEffect(() => {
        const videoId = getYouTubeId(exercise.youtubeUrl);

        if (ytPlayer.current) {
            ytPlayer.current.destroy();
            ytPlayer.current = null;
        }

        if (!videoId || !window.YT) return;

        const initPlayer = () => {
            ytPlayer.current = new window.YT.Player(playerRef.current, {
                videoId,
                playerVars: {
                    start: exercise.start || 0,
                    end: exercise.end || undefined,
                    controls: 1,
                    modestbranding: 1,
                    rel: 0
                }
            });
        };

        if (window.YT && window.YT.Player) {
            initPlayer();
        } else {
            const interval = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    initPlayer();
                    clearInterval(interval);
                }
            }, 100);
            return () => clearInterval(interval);
        }

        return () => {
            if (ytPlayer.current) {
                ytPlayer.current.destroy();
                ytPlayer.current = null;
            }
        };
    }, [currentIndex, exercise]);

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-100">{exercise.name}</h2>
                    <p className="text-zinc-500 text-sm mt-1">
                        Exercise {currentIndex + 1} of {exercises.length}
                    </p>
                </div>
                <button
                    onClick={onExit}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors p-2"
                    aria-label="Exit Play Mode"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 relative group">
                <div ref={playerRef} className="w-full h-full" />
            </div>

            <div className="mt-auto pt-12 flex items-center justify-between">
                <button
                    onClick={onPrev}
                    disabled={currentIndex === 0}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-800 transition-all ${currentIndex === 0
                        ? "opacity-30 cursor-not-allowed text-zinc-600"
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
                        }`}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Previous
                </button>

                <div className="flex gap-1.5">
                    {exercises.map((_, idx) => (
                        <div
                            key={idx}
                            className={`h-1 rounded-full transition-all duration-300 ${idx === currentIndex ? "w-8 bg-zinc-100" : "w-2 bg-zinc-800"
                                }`}
                        />
                    ))}
                </div>

                <button
                    onClick={onNext}
                    disabled={currentIndex === exercises.length - 1}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-800 transition-all ${currentIndex === exercises.length - 1
                        ? "opacity-30 cursor-not-allowed text-zinc-600"
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
                        }`}
                >
                    Next
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
