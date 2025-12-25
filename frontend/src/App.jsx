import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ExerciseCard from "./components/ExerciseCard";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  // Load categories from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("categories");
    if (saved) setCategories(JSON.parse(saved));
  }, []);

  // Save categories to localStorage
  useEffect(() => {
    localStorage.setItem("categories", JSON.stringify(categories));
  }, [categories]);

  const addCategory = () => {
    const name = prompt("Enter category name");
    if (!name) return;

    setCategories([
      ...categories,
      { id: Date.now(), name, exercises: [] }
    ]);
  };

  const addExercise = () => {
    const name = prompt("Exercise name?");
    const youtubeUrl = prompt("YouTube link?");
    const start = Number(prompt("Start time (seconds)?"));
    const end = Number(prompt("End time (seconds)?"));

    if (!name || !youtubeUrl || isNaN(start) || isNaN(end)) return;

    setCategories(categories.map(cat => {
      if (cat.id !== activeCategoryId) return cat;

      return {
        ...cat,
        exercises: [
          ...cat.exercises,
          {
            id: Date.now(),
            name,
            youtubeUrl,
            start,
            end,
            loop: true
          }
        ]
      };
    }));
  };

  const activeCategory = categories.find(
    c => c.id === activeCategoryId
  );

  return (
    <div className="h-screen w-screen flex bg-neutral-900 text-gray-100">

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        categories={categories}
        addCategory={addCategory}
        setActiveCategory={setActiveCategoryId}
      />

      {/* Main Area */}
      <div className="flex-1 flex flex-col">

        {/* Top Bar */}
        <div className="h-14 flex items-center px-4 border-b border-neutral-800">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mr-3 text-xl hover:bg-neutral-800 p-2 rounded"
          >
            ☰
          </button>
          <h1 className="text-lg font-semibold">Workout App</h1>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-8">

            {!activeCategory ? (
              <p className="text-neutral-400">
                Select or create a category
              </p>
            ) : (
              <>
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold">
                    {activeCategory.name}
                  </h2>

                  <button
                    onClick={addExercise}
                    className="px-4 py-2 bg-green-600 rounded-lg
                               hover:bg-green-700 transition"
                  >
                    ➕ Add Exercise
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {activeCategory.exercises.map(ex => (
                    <ExerciseCard key={ex.id} exercise={ex} />
                  ))}
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
