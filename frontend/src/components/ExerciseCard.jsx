import { useRef } from "react";

function getYouTubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s]+)/
  );
  return match ? match[1] : null;
}

export default function ExerciseCard({ exercise }) {
  const playerRef = useRef(null);
  const ytPlayer = useRef(null);

  const playVideo = () => {
    const videoId = getYouTubeId(exercise.youtubeUrl);
    if (!videoId || !window.YT) return;

    if (!ytPlayer.current) {
      ytPlayer.current = new window.YT.Player(playerRef.current, {
        videoId,
        playerVars: {
          start: exercise.start,
          end: exercise.end,
          controls: 1
        },
        events: {
          onStateChange: (event) => {
            if (
              event.data === window.YT.PlayerState.ENDED &&
              exercise.loop
            ) {
              ytPlayer.current.seekTo(exercise.start);
              ytPlayer.current.playVideo();
            }
          }
        }
      });
    } else {
      ytPlayer.current.seekTo(exercise.start);
      ytPlayer.current.playVideo();
    }
  };

  return (
    <div
      className="bg-neutral-800 rounded-xl p-4 space-y-3
                 border border-neutral-700"
    >
      <h3 className="text-lg font-semibold">
        {exercise.name}
      </h3>

      <div
        ref={playerRef}
        className="w-full aspect-video rounded-lg
                   overflow-hidden bg-black"
      />

      <button
        onClick={playVideo}
        className="w-full py-2 bg-blue-600 rounded-lg
                   hover:bg-blue-700 transition"
      >
        ▶ Play
      </button>
    </div>
  );
}
