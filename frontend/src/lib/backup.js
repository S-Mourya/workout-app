import { bufToBase64, base64ToBuf, encryptData, decryptData, deriveKey } from './crypto';
import { saveCategoriesEncrypted, saveSetting } from './db';

const BACKUP_VERSION = 2;

/**
 * Creates an encrypted backup of the application state.
 * @param {Array} categories 
 * @param {CryptoKey} encryptionKey 
 * @param {Uint8Array} salt 
 * @returns {Promise<string>} JSON string of the backup
 */
export async function createBackup(categories, encryptionKey, salt) {
    const dataToEncrypt = JSON.stringify({
        categories,
        timestamp: new Date().toISOString()
    });

    const { ciphertext, iv } = await encryptData(dataToEncrypt, encryptionKey);

    const backup = {
        version: BACKUP_VERSION,
        salt: bufToBase64(salt),
        iv: bufToBase64(iv),
        ciphertext: bufToBase64(ciphertext)
    };

    return JSON.stringify(backup, null, 2);
}

/**
 * Downloads a backup as a file.
 */
export function downloadBackupFile(jsonString) {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workout-backup-${new Date().toISOString().split('T')[0]}.enc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Validates and restores a backup from a JSON string.
 */
export async function restoreFromBackup(backupJson, passphrase) {
    const backup = JSON.parse(backupJson);

    if (backup.version !== BACKUP_VERSION) {
        throw new Error('UNSUPPORTED_VERSION');
    }

    const salt = new Uint8Array(base64ToBuf(backup.salt));
    const iv = new Uint8Array(base64ToBuf(backup.iv));
    const ciphertext = base64ToBuf(backup.ciphertext);

    // Derive key from the backup's salt and provided passphrase
    const key = await deriveKey(passphrase, salt);

    try {
        const decryptedData = await decryptData(ciphertext, iv, key);
        const parsed = JSON.parse(decryptedData);

        if (!parsed.categories || !Array.isArray(parsed.categories)) {
            throw new Error('INVALID_BACKUP_FORMAT');
        }

        // Atomic update: only if decryption and parsing succeeded
        await saveCategoriesEncrypted(parsed.categories, key, encryptData);
        await saveSetting('salt', salt);

        return {
            categories: parsed.categories,
            encryptionKey: key,
            salt: salt
        };
    } catch (e) {
        console.error('Backup restoration failed:', e);
        throw new Error('DECRYPTION_FAILED');
    }
}
