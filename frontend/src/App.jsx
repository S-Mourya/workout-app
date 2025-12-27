import { useEffect, useState, useRef } from "react";
import Sidebar from "./components/Sidebar";
import ExerciseCard from "./components/ExerciseCard";
import WorkoutPlayer from "./components/WorkoutPlayer";
import {
  loadCategoriesEncrypted,
  saveCategoriesEncrypted,
  getOrSettings,
  saveSetting,
  hasVault,
  rotateVaultPassphrase,
  factoryResetStore,
  getVaultSize
} from "./lib/db";
import {
  deriveKey,
  encryptData,
  decryptData,
  generateSalt
} from "./lib/crypto";
import {
  createBackup,
  downloadBackupFile,
  restoreFromBackup
} from "./lib/backup";
import { createInactivityTracker } from "./lib/sessionLock";
import { useFocusTrap, useFocusReturn } from "./hooks/useAccessibility";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const isLoaded = useRef(false);
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [vaultState, setVaultState] = useState("LOADING"); // LOADING, UNINITIALIZED, LOCKED, UNLOCKED
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [currentSalt, setCurrentSalt] = useState(null);
  const fileInputRef = useRef(null);

  // Change Passphrase States
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [currentChangePass, setCurrentChangePass] = useState("");
  const [newChangePass, setNewChangePass] = useState("");
  const [confirmNewChangePass, setConfirmNewChangePass] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Factory Reset States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: Warning, 2: Passphrase, 3: Phrase match
  const [resetPassphrase, setResetPassphrase] = useState("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // UX Polish States
  const [vaultSizeBytes, setVaultSizeBytes] = useState(0);
  const [hasExportedBackup, setHasExportedBackup] = useState(false);
  const [dismissedBackupReminder, setDismissedBackupReminder] = useState(false);

  // Focus Management Hooks
  useFocusReturn(showSettings || showChangePassModal || showResetModal || (sidebarOpen && window.innerWidth < 768));
  const settingsRef = useFocusTrap(showSettings, () => setShowSettings(false));
  const changePassRef = useFocusTrap(showChangePassModal, () => setShowChangePassModal(false));
  const resetRef = useFocusTrap(showResetModal, () => setShowResetModal(false));
  const vaultRef = useFocusTrap(vaultState === "LOCKED" || vaultState === "UNINITIALIZED" || vaultState === "RESET_SUCCESS");
  const mobileSidebarRef = useFocusTrap(sidebarOpen && window.innerWidth < 768, () => setSidebarOpen(false));

  useEffect(() => {
    async function checkVault() {
      const exists = await hasVault();
      setVaultState(exists ? "LOCKED" : "UNINITIALIZED");

      if (exists) {
        const exported = await getOrSettings('backup_exported', false);
        setHasExportedBackup(exported);
      }
    }
    checkVault();
  }, []);

  useEffect(() => {
    if (showSettings && vaultState === "UNLOCKED") {
      getVaultSize().then(setVaultSizeBytes);
    }
  }, [showSettings, vaultState, categories]);

  const lockVault = () => {
    setEncryptionKey(null);
    setCategories([]);
    setPassphrase("");
    setConfirmPassphrase("");
    setVaultState("LOCKED");
    setShowSettings(false);
    setIsPlaying(false);
    isLoaded.current = false;
  };

  useEffect(() => {
    if (vaultState === "UNLOCKED" && !isPlaying) {
      const tracker = createInactivityTracker(lockVault, 10 * 60 * 1000); // 10 minutes
      tracker.start();
      return () => tracker.stop();
    }
  }, [vaultState, isPlaying]);

  const handleCreateVault = async (e) => {
    if (e) e.preventDefault();
    if (!passphrase || passphrase !== confirmPassphrase) {
      setError("Passphrases do not match.");
      return;
    }
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }

    try {
      setError("");
      const salt = generateSalt();
      await saveSetting('salt', salt);
      setCurrentSalt(salt);

      const key = await deriveKey(passphrase, salt);
      setEncryptionKey(key);

      // New vaults start completely empty
      const emptyData = [];
      setCategories(emptyData);
      setActiveCategoryId(null);
      await saveCategoriesEncrypted(emptyData, key, encryptData);

      isLoaded.current = true;
      setVaultState("UNLOCKED");
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (err) {
      console.error(err);
      setError("Failed to create vault. Please try again.");
    }
  };


  const handleUnlock = async (e) => {
    if (e) e.preventDefault();
    if (!passphrase) return;

    try {
      setError("");
      const salt = await getOrSettings('salt');
      if (!salt) {
        setVaultState("UNINITIALIZED");
        return;
      }
      setCurrentSalt(salt);

      const key = await deriveKey(passphrase, salt);
      setEncryptionKey(key);

      let data = await loadCategoriesEncrypted(key, decryptData);

      if (data.length > 0) {
        setCategories(data);
        if (!activeCategoryId) {
          setActiveCategoryId(data[0].id);
        }
      } else {
        setCategories([]);
      }

      isLoaded.current = true;
      setVaultState("UNLOCKED");
      setPassphrase("");
    } catch (err) {
      console.error(err);
      if (err.message === "DECRYPTION_FAILED" || err.name === "OperationError") {
        setError("Invalid passphrase. Please try again.");
      } else {
        setError("An error occurred during decryption.");
      }
    }
  };

  const handleFactoryReset = async (e) => {
    if (e) e.preventDefault();

    if (resetStep === 1) {
      setResetStep(2);
      setError("");
      return;
    }

    if (resetStep === 2) {
      try {
        setError("");
        const salt = await getOrSettings('salt');
        const key = await deriveKey(resetPassphrase, salt);
        // Attempt decryption to verify passphrase
        await loadCategoriesEncrypted(key, decryptData);
        setResetStep(3);
      } catch (err) {
        setError("Invalid passphrase. Authentication failed.");
      }
      return;
    }

    if (resetStep === 3) {
      if (resetConfirmText !== "DELETE MY VAULT") {
        setError("Please type the confirmation phrase exactly.");
        return;
      }

      try {
        setIsResetting(true);
        setError("");

        // Atomic wipe of all vault data
        await factoryResetStore();

        // Wipe sensitive in-memory data
        setEncryptionKey(null);
        setCurrentSalt(null);
        setCategories([]);
        setPassphrase("");
        setConfirmPassphrase("");
        setResetPassphrase("");
        setResetConfirmText("");

        // Success! Go to completion screen instead of immediate redirect
        setVaultState("RESET_SUCCESS");
        setShowResetModal(false);
        setResetStep(1);
        setIsPlaying(false);
        isLoaded.current = false;
        setShowSettings(false);
      } catch (err) {
        console.error(err);
        setError("Reset failed. Critical database error.");
      } finally {
        setIsResetting(false);
      }
    }
  };

  const handleChangePassphrase = async (e) => {
    if (e) e.preventDefault();
    if (!currentChangePass || !newChangePass || newChangePass !== confirmNewChangePass) {
      setError("Please fill all fields correctly.");
      return;
    }
    if (newChangePass.length < 8) {
      setError("New passphrase must be at least 8 characters.");
      return;
    }

    try {
      setIsChangingPass(true);
      setError("");
      // Transition to a protective state to avoid auto-saves or interruptions
      const previousState = vaultState;
      setVaultState("REKEYING");

      const { newKey, newSalt } = await rotateVaultPassphrase(
        currentChangePass,
        newChangePass,
        deriveKey,
        encryptData,
        decryptData,
        generateSalt
      );

      // Successfully rotated
      setEncryptionKey(newKey);
      setCurrentSalt(newSalt);
      setPassphrase(""); // Clear master memory

      // Clear intermediate re-keying states
      setCurrentChangePass("");
      setNewChangePass("");
      setConfirmNewChangePass("");
      setShowChangePassModal(false);

      setVaultState("UNLOCKED");
      alert("Passphrase changed successfully! All data has been re-encrypted with your new key.");
    } catch (err) {
      console.error(err);
      setVaultState("UNLOCKED");
      if (err.message === "INVALID_CURRENT_PASSPHRASE") {
        setError("Current passphrase is incorrect.");
      } else {
        setError("Failed to rotate keys. Your data remains safe with the old passphrase.");
      }
    } finally {
      setIsChangingPass(false);
    }
  };

  useEffect(() => {
    if (isLoaded.current && encryptionKey) {
      saveCategoriesEncrypted(categories, encryptionKey, encryptData).catch(err =>
        console.error("Failed to save categories to IndexedDB:", err)
      );
    }
  }, [categories, encryptionKey]);

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

  const handleExport = async () => {
    try {
      const backupJson = await createBackup(categories, encryptionKey, currentSalt);
      downloadBackupFile(backupJson);

      // Track that the user has exported at least once
      await saveSetting('backup_exported', true);
      setHasExportedBackup(true);
    } catch (err) {
      alert("Export failed: " + err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const backupJson = event.target.result;
      const importPassphrase = prompt("Enter the passphrase for this backup:");
      if (!importPassphrase) return;

      if (!confirm("This will overwrite all current workout data. Are you sure?")) return;

      try {
        const restored = await restoreFromBackup(backupJson, importPassphrase);

        // Update state to reflect restored data
        setCategories(restored.categories);
        setEncryptionKey(restored.encryptionKey);
        setCurrentSalt(restored.salt);
        setPassphrase(importPassphrase);

        // If we were locked, we might need to update that - though usually we are unlocked when settings are accessible.
        alert("Backup restored successfully!");
        setShowSettings(false);
      } catch (err) {
        alert("Import failed: " + (err.message === "DECRYPTION_FAILED" ? "Invalid passphrase" : err.message));
      }
    };
    reader.readAsText(file);
    // Clear the input so the same file can be selected again
    e.target.value = null;
  };

  const activeCategory = categories.find(c => c.id === activeCategoryId);

  const startWorkout = () => {
    if (activeCategory?.exercises.length > 0) {
      setCurrentExerciseIndex(0);
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      {/* Mobile Scrim */}
      <div
        className={`fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Vault State Overlays */}
      {(vaultState !== "UNLOCKED" || isChangingPass || isResetting) && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vault-overlay-title"
          ref={vaultRef}
        >
          {vaultState === "LOADING" || vaultState === "REKEYING" || isResetting ? (
            <div className="text-center p-6">
              <div className="w-12 h-12 border-2 border-zinc-800 border-t-zinc-400 rounded-full animate-spin mx-auto mb-4" role="status" aria-label="Loading"></div>
              <p id="vault-overlay-title" className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
                {isResetting ? "Securely Wiping Vault..." : vaultState === "REKEYING" ? "Re-encrypting Vault..." : "Checking secure storage..."}
              </p>
              {(vaultState === "REKEYING" || isResetting) && (
                <p className="text-[10px] text-red-500/80 mt-2 animate-pulse" aria-live="assertive">DO NOT CLOSE APP</p>
              )}
            </div>
          ) : vaultState === "UNINITIALIZED" ? (
            <div className="w-full max-w-md p-6 md:p-8 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-zinc-950" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </div>
                <h2 id="vault-overlay-title" className="text-2xl font-bold text-white mb-2">Create Your Vault</h2>
                <p className="text-zinc-400 text-sm leading-relaxed">Set a master passphrase to encrypt your data. This is 100% private and stays on this device.</p>
              </div>

              <form onSubmit={handleCreateVault} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="master-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Master Passphrase</label>
                  <input
                    id="master-pass"
                    type="password"
                    placeholder="Create a strong passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all font-mono text-lg md:text-base"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirm-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Confirm Passphrase</label>
                  <input
                    id="confirm-pass"
                    type="password"
                    placeholder="Repeat passphrase"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all font-mono text-lg md:text-base"
                  />
                </div>

                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <p className="text-[11px] leading-relaxed text-red-400 font-medium">
                    <span className="font-bold uppercase tracking-wider block mb-1">Critical Warning:</span>
                    This passphrase cannot be recovered. If you forget it, you will lose access to all your workout data permanently.
                  </p>
                </div>

                {error && (
                  <p className="text-red-400 text-xs font-medium px-1">{error}</p>
                )}
                <button
                  type="submit"
                  className="w-full bg-white text-zinc-950 font-bold py-4 rounded-xl hover:bg-zinc-200 transition-all active:scale-95 transform mt-2 min-h-[56px]"
                >
                  Confirm & Create Vault
                </button>
              </form>

              <p className="mt-8 text-[10px] text-zinc-600 text-center uppercase tracking-widest font-bold">
                Zero Knowledge • Offline-Only • AES-256
              </p>
            </div>
          ) : vaultState === "RESET_SUCCESS" ? (
            <div className="w-full max-w-md p-6 md:p-8 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl text-center">
              <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Vault successfully wiped</h2>
              <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                All encrypted data has been securely deleted from this device.
                The storage is now clean.
              </p>
              <button
                onClick={() => setVaultState("UNINITIALIZED")}
                className="w-full bg-white text-zinc-950 font-bold py-4 rounded-xl hover:bg-zinc-200 transition-all active:scale-95 transform min-h-[56px]"
              >
                Create New Vault
              </button>
            </div>
          ) : (
            <div className="w-full max-w-md p-6 md:p-8 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <h2 id="vault-overlay-title" className="text-2xl font-bold text-white mb-2">Vault Locked</h2>
                <p className="text-zinc-400 text-sm">Enter your passphrase to decrypt your data.</p>
              </div>

              <form onSubmit={handleUnlock} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="unlock-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Passphrase</label>
                  <input
                    id="unlock-pass"
                    type="password"
                    placeholder="Passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all font-mono text-lg md:text-base"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-red-400 text-xs font-medium px-1" role="alert">{error}</p>
                )}
                <button
                  type="submit"
                  className="w-full bg-white text-zinc-950 font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors active:scale-95 transform min-h-[56px]"
                >
                  Unlock Vault
                </button>
              </form>

              <p className="mt-8 text-[10px] text-zinc-600 text-center uppercase tracking-widest font-bold">
                Zero Knowledge • Offline-Only • AES-256
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sidebar Container */}
      <nav
        aria-label="Main Navigation"
        className={`fixed inset-y-0 left-0 z-50 w-72 md:relative md:inset-auto md:w-64 transform transition-transform duration-300 ease-in-out bg-zinc-950 border-r border-zinc-900/40 backdrop-blur-sm flex flex-col shadow-2xl overflow-hidden ${sidebarOpen
          ? "translate-x-0 md:w-64"
          : "-translate-x-full md:translate-x-0 md:w-0"
          }`}
        ref={mobileSidebarRef}
      >
        <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
          <Sidebar
            categories={categories}
            activeCategoryId={activeCategoryId}
            setActiveCategory={(id) => {
              setActiveCategoryId(id);
              setIsPlaying(false);
              // Close on mobile when selecting
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            addCategory={addCategory}
            deleteCategory={deleteCategory}
            open={true} // Inside drawer, always show content if container is open
          />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-900/20 relative">
        {/* Header - Sticky App Bar */}
        <header className="h-14 border-b border-zinc-900/50 flex items-center px-4 sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-md shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-3 -ml-2 text-zinc-500 hover:text-zinc-300 transition-colors mr-2 md:mr-3"
            aria-label={sidebarOpen ? "Close Sidebar" : "Open Sidebar"}
            aria-expanded={sidebarOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-zinc-300 truncate pr-4">
              {activeCategory ? activeCategory.name : "Workout Vault"}
            </h1>
          </div>

          <div className="flex items-center gap-1 -mr-1">
            <button
              onClick={lockVault}
              className="p-2.5 text-zinc-500 hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Lock Vault"
              title="Lock Vault"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="p-2.5 text-zinc-500 hover:text-zinc-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </header>

        {/* Settings Modal - Optimized as Full Screen Sheet on Mobile */}
        {showSettings && (
          <div
            className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-0 md:p-4 text-zinc-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            ref={settingsRef}
          >
            <div className="w-full h-[94%] md:h-auto md:max-w-md bg-zinc-900 border-t md:border border-zinc-800 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-transform duration-300 transform translate-y-0">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <h2 id="settings-title" className="text-xl font-bold">Security & Backups</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors bg-zinc-800/50 rounded-full"
                  aria-label="Close settings"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Vault Actions</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => {
                        setShowSettings(false);
                        setShowChangePassModal(true);
                      }}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3L15.5 7.5z"></path>
                      </svg>
                      Change Master Passphrase
                    </button>
                    <button
                      onClick={() => {
                        setShowSettings(false);
                        setShowResetModal(true);
                        setResetStep(1);
                        setError("");
                      }}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm border border-red-500/20"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                      Factory Reset Vault
                    </button>
                    <button
                      onClick={lockVault}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm border border-red-500/20"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                      Lock Vault Now
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Storage & Privacy</h3>

                  {/* Backup Reminder Card */}
                  {!hasExportedBackup && categories.length > 0 && !dismissedBackupReminder && (
                    <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-2xl p-4 relative group">
                      <button
                        onClick={() => setDismissedBackupReminder(true)}
                        className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 p-1"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-zinc-700 text-zinc-300 rounded-lg flex items-center justify-center shrink-0">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                        </div>
                        <div className="pr-6">
                          <p className="text-xs font-semibold text-zinc-100">Protect your data</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                            You haven't created an encrypted backup yet.
                            We recommend exporting one to avoid accidental data loss.
                          </p>
                          <button
                            onClick={handleExport}
                            className="text-[11px] text-zinc-300 font-bold mt-2 hover:text-white transition-colors flex items-center gap-1"
                          >
                            Export Backup Now
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-zinc-800/40 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500/5 text-green-500/80 rounded-xl flex items-center justify-center border border-green-500/10">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold">Vault Security Active</p>
                      <p className="text-[11px] text-zinc-500">
                        Zero-Knowledge • AES-256-GCM
                      </p>
                    </div>
                  </div>

                  <div className="bg-zinc-800/20 border border-zinc-800 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Encrypted Vault Size</p>
                      <span className="text-xs font-mono text-zinc-300">
                        {vaultSizeBytes < 1024
                          ? `${vaultSizeBytes} B`
                          : `${(vaultSizeBytes / 1024).toFixed(1)} KB`}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-600">Stored locally on this device. Total size of encrypted blobs + keys.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Portable Backups</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Export your workout data to an encrypted file. You can import this file on any device by entering the backup's passphrase.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleExport}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Export
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-zinc-100 hover:bg-white text-zinc-950 font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      Import
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".enc,application/json"
                      onChange={handleImport}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  <p className="text-[10px] text-zinc-600 text-center uppercase tracking-widest font-bold">
                    Privacy Guarantee: No Servers • No Tracking • You Own Your Data
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Change Passphrase Modal - Optimized as Full Screen Sheet on Mobile */}
        {showChangePassModal && (
          <div
            className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-0 md:p-4 text-zinc-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-pass-title"
            ref={changePassRef}
          >
            <div className="w-full h-[94%] md:h-auto md:max-w-md bg-zinc-900 border-t md:border border-zinc-800 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-transform duration-300 transform translate-y-0">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <h2 id="change-pass-title" className="text-xl font-bold">Change Passphrase</h2>
                <button
                  onClick={() => { setShowChangePassModal(false); setError(""); }}
                  className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors bg-zinc-800/50 rounded-full"
                  aria-label="Close change passphrase modal"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <form onSubmit={handleChangePassphrase} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="current-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Current Passphrase</label>
                    <input
                      id="current-pass"
                      type="password"
                      placeholder="Confirm current passphrase"
                      value={currentChangePass}
                      onChange={(e) => setCurrentChangePass(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all font-mono text-lg md:text-base"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="new-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">New Passphrase</label>
                    <input
                      id="new-pass"
                      type="password"
                      placeholder="Min. 8 characters"
                      value={newChangePass}
                      onChange={(e) => setNewChangePass(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all font-mono text-lg md:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="confirm-new-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Confirm New Passphrase</label>
                    <input
                      id="confirm-new-pass"
                      type="password"
                      placeholder="Repeat new passphrase"
                      value={confirmNewChangePass}
                      onChange={(e) => setConfirmNewChangePass(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all font-mono text-lg md:text-base"
                    />
                  </div>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                  <p className="text-[11px] leading-relaxed text-yellow-500 font-medium">
                    <span className="font-bold uppercase tracking-wider block mb-1">Rotation Notice:</span>
                    This process will re-encrypt all your data with a new cryptographic key. Your old passphrase will no longer work.
                  </p>
                </div>

                <div className="px-1 flex items-start gap-4">
                  <input
                    type="checkbox"
                    id="confirmRotate"
                    className="mt-1 w-5 h-5 accent-zinc-500 shrink-0"
                    required
                  />
                  <label htmlFor="confirmRotate" className="text-xs text-zinc-400 select-none">
                    I understand that my data will be re-encrypted and I must remember my new passphrase.
                  </label>
                </div>

                {error && (
                  <p className="text-red-400 text-xs font-medium px-1">{error}</p>
                )}

                <div className="flex flex-col md:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowChangePassModal(false); setError(""); }}
                    className="order-2 md:order-1 bg-zinc-800 text-white font-bold py-4 rounded-xl hover:bg-zinc-700 transition-all min-h-[56px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="order-1 md:order-2 bg-white text-zinc-950 font-bold py-4 rounded-xl hover:bg-zinc-200 transition-all active:scale-95 transform min-h-[56px]"
                  >
                    Update Vault
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Factory Reset Modal - Optimized as Full Screen Sheet on Mobile */}
        {showResetModal && (
          <div
            className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-0 md:p-4 text-zinc-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            ref={resetRef}
          >
            <div className="w-full h-[94%] md:h-auto md:max-w-md bg-zinc-900 border-t md:border border-zinc-800 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-red-950/20 shrink-0">
                <h2 id="reset-title" className="text-xl font-bold flex items-center gap-2 text-red-500">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  Danger Zone
                </h2>
                <button
                  onClick={() => { setShowResetModal(false); setError(""); }}
                  className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors bg-zinc-800/50 rounded-full"
                  aria-label="Close factory reset modal"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <form onSubmit={handleFactoryReset} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                {resetStep === 1 && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h3 id="reset-warning" className="text-2xl font-bold text-white leading-tight">Factory Reset Vault?</h3>
                      <p className="text-zinc-400 leading-relaxed">
                        You are about to permanently delete your entire workout vault. This include all categories,
                        exercises, and settings.
                      </p>
                    </div>
                    <ul className="space-y-3 bg-red-500/5 p-4 rounded-xl border border-red-500/10">
                      <li className="text-xs text-red-400 flex items-center gap-2 font-medium">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                        Unrecoverable data loss
                      </li>
                      <li className="text-xs text-red-400 flex items-center gap-2 font-medium">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                        Passphrase cannot restore this
                      </li>
                    </ul>
                    <button
                      type="submit"
                      className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-all active:scale-95 transform shadow-lg shadow-red-900/20 min-h-[56px]"
                    >
                      I Understand, Continue
                    </button>
                  </div>
                )}

                {resetStep === 2 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="reset-pass" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Verify Passphrase</label>
                      <p className="text-sm text-zinc-500 mb-2">Enter your current master passphrase to authorize the reset.</p>
                      <input
                        id="reset-pass"
                        type="password"
                        placeholder="Master Passphrase"
                        value={resetPassphrase}
                        onChange={(e) => setResetPassphrase(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-red-600 transition-all font-mono text-lg md:text-base"
                        autoFocus
                      />
                    </div>
                    {error && <p className="text-red-400 text-xs font-medium px-1" role="alert">{error}</p>}
                    <button
                      type="submit"
                      className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-all active:scale-95 transform min-h-[56px]"
                    >
                      Verify & Proceed
                    </button>
                  </div>
                )}

                {resetStep === 3 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="reset-confirm" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Final Confirmation</label>
                      <p className="text-sm text-zinc-500 mb-2 leading-relaxed">
                        To confirm permanent deletion, type <span className="text-red-500 font-bold select-all">DELETE MY VAULT</span> below.
                      </p>
                      <input
                        id="reset-confirm"
                        type="text"
                        placeholder="Type the confirmation phrase"
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-red-600 transition-all text-lg md:text-base"
                        autoFocus
                      />
                    </div>
                    {error && <p className="text-red-400 text-xs font-medium px-1" role="alert">{error}</p>}
                    <button
                      type="submit"
                      disabled={resetConfirmText !== "DELETE MY VAULT"}
                      className={`w-full font-bold py-4 rounded-xl transition-all transform min-h-[56px] ${resetConfirmText === "DELETE MY VAULT"
                        ? "bg-red-600 hover:bg-red-500 text-white active:scale-95 shadow-lg shadow-red-900/20"
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                        }`}
                    >
                      Securely Wipe Vault
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => { setShowResetModal(false); setResetStep(1); setError(""); }}
                  className="w-full h-12 text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center pt-2"
                >
                  Cancel Reset
                </button>
              </form>
            </div>
          </div>
        )}


        {/* Content */}
        <section aria-label="Exercises" className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
          <div className="w-full md:max-w-3xl md:mx-auto px-4 md:px-0 py-8 pb-40">
            {!activeCategory ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-700 py-20" role="status">
                <p className="text-center font-medium">Your vault is empty.</p>
                <p className="text-center text-sm text-zinc-800 mt-1">Create a category to start building your workouts.</p>
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
                <div className="flex items-center justify-between px-2 mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Exercises</h2>
                  <button
                    onClick={addExercise}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors bg-zinc-800/50 md:bg-transparent rounded-lg min-h-[40px]"
                    aria-label="Add new exercise"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Exercise
                  </button>
                </div>

                <div className="space-y-4">
                  {activeCategory.exercises.length === 0 ? (
                    <p className="text-center text-zinc-700 py-10 text-sm italic" role="status">No exercises yet. Click "Add Exercise" to start.</p>
                  ) : (
                    <div className="grid gap-3" role="list">
                      {activeCategory.exercises.map((ex, idx) => (
                        <div key={ex.id} role="listitem">
                          <ExerciseCard
                            exercise={ex}
                            index={idx}
                            onDelete={() => deleteExercise(ex.id)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Floating Play Button */}
        {activeCategory && activeCategory.exercises.length > 0 && !isPlaying && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 w-full max-w-xs px-4">
            <button
              onClick={startWorkout}
              className="w-full bg-white text-zinc-950 px-8 py-4 rounded-2xl font-bold shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:bg-zinc-100 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 min-h-[64px]"
              aria-label={`Start play mode for ${activeCategory.name}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
