import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ExerciseCard from "./components/ExerciseCard";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("categories");
    if (saved) setCategories(JSON.parse(saved));
  }, []);

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
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        open={sidebarOpen}
        categories={categories}
        addCategory={addCategory}
        setActiveCategory={setActiveCategoryId}
      />

      <div className="flex-1 flex flex-col">
        <div className="bg-white shadow px-4 py-3 flex items-center">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-2xl mr-4"
          >
            ☰
          </button>
          <h1 className="text-xl font-semibold">Workout App</h1>
        </div>

        <div className="p-6">
          {!activeCategory ? (
            <p className="text-gray-600">
              Select or create a category
            </p>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                  {activeCategory.name}
                </h2>
                <button
                  onClick={addExercise}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  ➕ Add Exercise
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeCategory.exercises.map(ex => (
                  <ExerciseCard key={ex.id} exercise={ex} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
