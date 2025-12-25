import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ExerciseCard from "./components/ExerciseCard";
import WorkoutPlayer from "./components/WorkoutPlayer";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("categories");
    if (saved) {
      const parsed = JSON.parse(saved);
      setCategories(parsed);
      if (parsed.length > 0 && !activeCategoryId) {
        setActiveCategoryId(parsed[0].id);
      }
    } else {
      const seed = [
        {
          id: 1, name: "Upper Body", exercises: [
            { id: 101, name: "Push-ups", youtubeUrl: "https://www.youtube.com/watch?v=IODxDxX7oi4", sets: 3, reps: 12 },
            { id: 102, name: "Pull-ups", youtubeUrl: "https://www.youtube.com/watch?v=eGo4IYlbE5g", sets: 3, reps: 10 }
          ]
        },
        { id: 2, name: "Lower Body", exercises: [] },
        { id: 3, name: "Core", exercises: [] },
        { id: 4, name: "Cardio", exercises: [] },
        { id: 5, name: "Stretching", exercises: [] }
      ];
      setCategories(seed);
      setActiveCategoryId(1);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("categories", JSON.stringify(categories));
  }, [categories]);

  const addCategory = () => {
    const name = prompt("Category name?");
    if (!name) return;
    const newCategory = { id: Date.now(), name, exercises: [] };
    setCategories([...categories, newCategory]);
    setActiveCategoryId(newCategory.id);
  };

  const deleteCategory = (id) => {
    if (!confirm("Are you sure you want to delete this category?")) return;
    const nextCategories = categories.filter(c => c.id !== id);
    setCategories(nextCategories);
    if (activeCategoryId === id) {
      setActiveCategoryId(nextCategories.length > 0 ? nextCategories[0].id : null);
    }
  };

  const addExercise = () => {
    const name = prompt("Exercise name?");
    if (!name) return;
    const youtubeUrl = prompt("YouTube URL?");
    if (!youtubeUrl) return;
    const sets = prompt("Sets (optional)?") || "";
    const reps = prompt("Reps (optional)?") || "";

    const newExercise = {
      id: Date.now(),
      name,
      youtubeUrl,
      sets: sets ? parseInt(sets) : null,
      reps: reps ? parseInt(reps) : null
    };

    setCategories(categories.map(c => {
      if (c.id === activeCategoryId) {
        return { ...c, exercises: [...c.exercises, newExercise] };
      }
      return c;
    }));
  };

  const deleteExercise = (exId) => {
    if (!confirm("Delete this exercise?")) return;
    setCategories(categories.map(c => {
      if (c.id === activeCategoryId) {
        return { ...c, exercises: c.exercises.filter(ex => ex.id !== exId) };
      }
      return c;
    }));
  };

  const activeCategory = categories.find(c => c.id === activeCategoryId);

  const startWorkout = () => {
    if (activeCategory?.exercises.length > 0) {
      setCurrentExerciseIndex(0);
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar Container */}
      <div
        className={`sidebar-transition flex-shrink-0 bg-zinc-950 border-r border-zinc-900/50 ${sidebarOpen ? "w-64" : "w-0"
          } relative z-40`}
      >
        <Sidebar
          categories={categories}
          activeCategoryId={activeCategoryId}
          setActiveCategory={(id) => {
            setActiveCategoryId(id);
            setIsPlaying(false);
          }}
          addCategory={addCategory}
          deleteCategory={deleteCategory}
          open={sidebarOpen}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-900/10 relative">
        {/* Header */}
        <header className="h-14 border-b border-zinc-900/50 flex items-center px-4 sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-md">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors mr-3"
            aria-label="Toggle Sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium text-zinc-300">
              {activeCategory ? activeCategory.name : "Select a category"}
            </h1>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
          <div className="max-w-3xl mx-auto w-full px-4 py-8 pb-32">
            {!activeCategory ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-700 py-20">
                <p className="text-center font-medium">Select a category to view exercises</p>
              </div>
            ) : isPlaying ? (
              <WorkoutPlayer
                exercises={activeCategory.exercises}
                currentIndex={currentExerciseIndex}
                onNext={() => setCurrentExerciseIndex(prev => Math.min(prev + 1, activeCategory.exercises.length - 1))}
                onPrev={() => setCurrentExerciseIndex(prev => Math.max(prev - 1, 0))}
                onExit={() => setIsPlaying(false)}
              />
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Exercises</h2>
                  <button
                    onClick={addExercise}
                    className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Exercise
                  </button>
                </div>

                <div className="space-y-4">
                  {activeCategory.exercises.length === 0 ? (
                    <p className="text-center text-zinc-700 py-10 text-sm italic">No exercises yet. Click "Add Exercise" to start.</p>
                  ) : (
                    <div className="grid gap-3">
                      {activeCategory.exercises.map((ex, idx) => (
                        <ExerciseCard
                          key={ex.id}
                          exercise={ex}
                          index={idx}
                          onDelete={() => deleteExercise(ex.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Play Button */}
        {activeCategory && activeCategory.exercises.length > 0 && !isPlaying && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20">
            <button
              onClick={startWorkout}
              className="bg-zinc-100 text-zinc-950 px-8 py-3 rounded-full font-semibold shadow-2xl hover:bg-white transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play Workout
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
