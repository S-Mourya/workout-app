/**
 * Web Crypto API utilities for AES-GCM encryption and PBKDF2 key derivation.
 */

const ALGORITHM = 'AES-GCM';
const KDF_ALGORITHM = 'PBKDF2';
const HASH = 'SHA-256';
const ITERATIONS = 100000;
const KEY_LENGTH = 256;

/**
 * Derives a CryptoKey from a passphrase and salt using PBKDF2.
 * @param {string} passphrase 
 * @param {Uint8Array} salt 
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        { name: KDF_ALGORITHM },
        false,
        ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: KDF_ALGORITHM,
            salt: salt,
            iterations: ITERATIONS,
            hash: HASH,
        },
        keyMaterial,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a string (JSON) using AES-GCM.
 * @param {string} data 
 * @param {CryptoKey} key 
 * @returns {Promise<{ ciphertext: ArrayBuffer, iv: Uint8Array }>}
 */
export async function encryptData(data, key) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv: iv },
        key,
        enc.encode(data)
    );

    return { ciphertext, iv };
}

/**
 * Decrypts an ArrayBuffer using AES-GCM.
 * @param {ArrayBuffer} ciphertext 
 * @param {Uint8Array} iv 
 * @param {CryptoKey} key 
 * @returns {Promise<string>}
 */
export async function decryptData(ciphertext, iv, key) {
    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv: iv },
        key,
        ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
}

/**
 * Generates a random salt.
 * @returns {Uint8Array}
 */
export function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Converts an ArrayBuffer to a Base64 string.
 */
export function bufToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Converts a Base64 string to an ArrayBuffer.
 */
export function base64ToBuf(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

