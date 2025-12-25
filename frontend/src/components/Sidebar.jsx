export default function Sidebar({
  open,
  categories,
  addCategory,
  setActiveCategory
}) {
  return (
    <div
      className={`bg-gray-900 text-white w-64 p-4 transition-all duration-300
      ${open ? "block" : "hidden"}`}
    >
      <h2 className="text-lg font-semibold mb-4">Categories</h2>

      <button
        onClick={addCategory}
        className="w-full mb-4 py-2 bg-green-600 rounded hover:bg-green-700"
      >
        ➕ Add Category
      </button>

      <ul className="space-y-2">
        {categories.map(cat => (
          <li
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="p-2 rounded hover:bg-gray-700 cursor-pointer"
          >
            {cat.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
