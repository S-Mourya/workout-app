export default function Sidebar({
  open,
  categories,
  addCategory,
  setActiveCategory
}) {
  if (!open) return null;

  return (
    <div className="w-72 h-screen bg-neutral-950 border-r border-neutral-800
                    flex flex-col p-4">

      {/* Title */}
      <h2 className="text-lg font-semibold mb-4">
        Categories
      </h2>

      {/* Add Category */}
      <button
        onClick={addCategory}
        className="mb-4 px-3 py-2 bg-neutral-800 rounded-lg
                   hover:bg-neutral-700 transition text-sm"
      >
        ➕ Add Category
      </button>

      {/* Category List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {categories.map(cat => (
          <div
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="px-3 py-2 rounded-lg cursor-pointer
                       hover:bg-neutral-800 transition"
          >
            {cat.name}
          </div>
        ))}
      </div>
    </div>
  );
}
