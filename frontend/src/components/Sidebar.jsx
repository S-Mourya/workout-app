export default function Sidebar({
  categories,
  activeCategoryId,
  setActiveCategory,
  addCategory,
  deleteCategory,
  open
}) {
  return (
    <div className={`h-full flex flex-col transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 invisible"}`}>
      {/* Sidebar Header */}
      <div className="h-14 flex items-center px-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-100">
            <path d="M4 12V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8" />
            <path d="M12 2v20" />
            <path d="M4 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H4Z" />
            <path d="M20 12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h4Z" />
          </svg>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            Workout App
          </span>
        </div>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="px-3 mb-6">
          <button
            onClick={addCategory}
            className="w-full h-11 flex items-center gap-2.5 px-3 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800 text-sm text-zinc-300 transition-all duration-200 active:scale-[0.98] group"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-zinc-300 transition-colors">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Category
          </button>
        </div>

        <div className="px-5 mb-2">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-900/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Categories
            </span>
          </div>
        </div>

        <nav className="px-2 space-y-1">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="group relative"
            >
              <button
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center justify-between ${activeCategoryId === cat.id
                  ? "bg-zinc-800 text-zinc-100 font-medium shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
              >
                <span className="truncate pr-6">{cat.name}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCategory(cat.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-md"
                aria-label="Delete Category"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-600 italic">
              No categories yet
            </div>
          )}
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 text-[10px] font-medium text-zinc-700 uppercase tracking-widest text-center">
        v1.0.0 Alpha
      </div>
    </div>
  );
}
