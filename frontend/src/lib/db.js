import { openDB } from 'idb';

const DB_NAME = 'workout-app-db';
const DB_VERSION = 2; // Incremented for schema change
const CATEGORIES_STORE = 'categories';
const SETTINGS_STORE = 'settings';

/**
 * Initializes the IndexedDB database.
 */
export async function initDB() {
    const db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            if (oldVersion < 1) {
                db.createObjectStore(CATEGORIES_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE);
            }

            // If we are upgrading from v1 (plaintext) to v2 (encrypted),
            // we might want to clear or handle the data. 
            // For this implementation, we will keep the store but expectations will change.
        },
    });
    return db;
}

/**
 * Checks if a vault has been initialized (salt exists).
 */
export async function hasVault() {
    const db = await initDB();
    const salt = await db.get(SETTINGS_STORE, 'salt');
    return !!salt;
}


/**
 * Gets the salt from the database or creates a new one.
 * @returns {Promise<Uint8Array>}
 */
export async function getOrSettings(key, defaultValue) {
    const db = await initDB();
    const value = await db.get(SETTINGS_STORE, key);
    if (value) return value;
    if (defaultValue !== undefined) {
        await db.put(SETTINGS_STORE, defaultValue, key);
        return defaultValue;
    }
    return null;
}

/**
 * Saves a setting.
 */
export async function saveSetting(key, value) {
    const db = await initDB();
    await db.put(SETTINGS_STORE, value, key);
}

/**
 * Loads and decrypts all categories.
 * @param {CryptoKey} encryptionKey 
 * @param {Function} decryptFn (ciphertext, iv, key) => string
 */
export async function loadCategoriesEncrypted(encryptionKey, decryptFn) {
    const db = await initDB();
    const encryptedRecords = await db.getAll(CATEGORIES_STORE);

    const categories = [];
    for (const record of encryptedRecords) {
        // If the record is plaintext (from v1), we handle it or skip it.
        // For a clean transition, if it doesn't have iv/ciphertext, it's old data.
        if (record.iv && record.ciphertext) {
            try {
                const decryptedJson = await decryptFn(record.ciphertext, record.iv, encryptionKey);
                categories.push(JSON.parse(decryptedJson));
            } catch (e) {
                console.error("Failed to decrypt record:", record.id, e);
                // If decryption fails, we might have a wrong key. 
                // We'll throw so the UI can handle it.
                throw new Error("DECRYPTION_FAILED");
            }
        } else {
            // Old plaintext data - we could return it to allow migration, 
            // but the requirement is "encrypted at rest".
            // We'll ignore it for now or return it as-is if we want to migrate.
            // Let's return it but mark it as plaintext.
            categories.push(record);
        }
    }
    return categories;
}

/**
 * Encrypts and saves all categories.
 * @param {Array} categories 
 * @param {CryptoKey} encryptionKey 
 * @param {Function} encryptFn (data, key) => { ciphertext, iv }
 */
export async function saveCategoriesEncrypted(categories, encryptionKey, encryptFn) {
    const db = await initDB();
    const tx = db.transaction(CATEGORIES_STORE, 'readwrite');
    const store = tx.objectStore(CATEGORIES_STORE);

    await store.clear();

    for (const category of categories) {
        const { ciphertext, iv } = await encryptFn(JSON.stringify(category), encryptionKey);
        await store.put({
            id: category.id,
            iv: iv,
            ciphertext: ciphertext
        });
    }

    await tx.done;
}

/**
 * Atomic passphrase rotation (re-keying).
 * Decrypts all data with the old key, generates a new salt, re-derives a key,
 * re-encrypts all data, and commits both the new salt and data in a single transaction.
 */
export async function rotateVaultPassphrase(
    oldPassphrase,
    newPassphrase,
    deriveKeyFn,
    encryptFn,
    decryptFn,
    genSaltFn
) {
    const db = await initDB();
    const oldSalt = await db.get(SETTINGS_STORE, 'salt');
    if (!oldSalt) throw new Error("VAULT_NOT_INITIALIZED");

    // 1. Verify old passphrase by deriving key and attempting to decrypt data
    const oldKey = await deriveKeyFn(oldPassphrase, oldSalt);

    // Fetch all records to decrypt them into memory
    const encryptedRecords = await db.getAll(CATEGORIES_STORE);
    const decryptedCategories = [];

    // If there is data, we must be able to decrypt it to rotate keys
    for (const record of encryptedRecords) {
        if (record.iv && record.ciphertext) {
            try {
                const decryptedJson = await decryptFn(record.ciphertext, record.iv, oldKey);
                decryptedCategories.push(JSON.parse(decryptedJson));
            } catch (e) {
                // If decryption fails, the old passphrase provided is likely incorrect
                throw new Error("INVALID_CURRENT_PASSPHRASE");
            }
        }
    }

    // 2. Generate new cryptographic salt and derive new key
    const newSalt = genSaltFn();
    const newKey = await deriveKeyFn(newPassphrase, newSalt);

    // 3. Re-encrypt all data with the new key in memory
    const newEncryptedRecords = [];
    for (const category of decryptedCategories) {
        const { ciphertext, iv } = await encryptFn(JSON.stringify(category), newKey);
        newEncryptedRecords.push({
            id: category.id,
            iv: iv,
            ciphertext: ciphertext
        });
    }

    // 4. Atomic transaction to update both salt and categories
    // This ensures that we never have a mismatch between the salt on disk and the encrypted data
    const tx = db.transaction([CATEGORIES_STORE, SETTINGS_STORE], 'readwrite');
    const categoriesStore = tx.objectStore(CATEGORIES_STORE);
    const settingsStore = tx.objectStore(SETTINGS_STORE);

    // Clear old data and put new data
    await categoriesStore.clear();
    for (const record of newEncryptedRecords) {
        await categoriesStore.put(record);
    }

    // Update salt in the same transaction
    await settingsStore.put(newSalt, 'salt');

    await tx.done;

    return { newKey, newSalt };
}

/**
 * Securely and atomically wipes the entire vault data from IndexedDB.
 */
export async function factoryResetStore() {
    const db = await initDB();
    const tx = db.transaction([CATEGORIES_STORE, SETTINGS_STORE], 'readwrite');
    await tx.objectStore(CATEGORIES_STORE).clear();
    await tx.objectStore(SETTINGS_STORE).clear();
    await tx.done;
}

/**
 * Calculates approximately how many bytes are stored in the encrypted stores.
 * This looks at the raw binary size of IVs, Ciphertexts, and Salt.
 */
export async function getVaultSize() {
    const db = await initDB();
    const categories = await db.getAll(CATEGORIES_STORE);
    const salt = await db.get(SETTINGS_STORE, 'salt');

    let totalBytes = 0;
    if (salt) totalBytes += salt.byteLength;

    for (const record of categories) {
        if (record.iv) totalBytes += record.iv.byteLength;
        if (record.ciphertext) totalBytes += record.ciphertext.byteLength;
    }

    return totalBytes;
}
