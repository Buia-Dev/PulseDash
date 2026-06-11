'use strict';
import { toast } from './utils.js';

const DB_NAME = 'PulseDashDB';
const STORE_NAME = 'custom_images';
let db;

export function initDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve();
    
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (e) => {
      const _db = e.target.result;
      if (!_db.objectStoreNames.contains(STORE_NAME)) {
        _db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve();
    };
    
    request.onerror = (e) => {
      console.error('IndexedDB error:', e);
      reject(e);
    };
  });
}

export function saveCustomImage(id, name, base64Data) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not initialized');
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      
      tx.onabort = (e) => {
        const error = e.target.error;
        if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          toast('⚠️ MEMÓRIA CHEIA! APAGUE IMAGENS ANTIGAS');
        }
        reject(error || e);
      };
      
      const store = tx.objectStore(STORE_NAME);
      const obj = { id, name, data: base64Data, ts: Date.now() };
      const request = store.put(obj);
      
      request.onsuccess = () => resolve(obj);
      request.onerror = (e) => {
        const error = e.target.error;
        if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          toast('⚠️ MEMÓRIA CHEIA! APAGUE IMAGENS ANTIGAS');
        }
        reject(e);
      };
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        toast('⚠️ MEMÓRIA CHEIA! APAGUE IMAGENS ANTIGAS');
      }
      reject(err);
    }
  });
}

export function getAllCustomImages() {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not initialized');
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const items = request.result || [];
      items.sort((a, b) => b.ts - a.ts);
      resolve(items);
    };
    request.onerror = (e) => reject(e);
  });
}

export function getCustomImage(id) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not initialized');
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e);
  });
}

export function renameCustomImage(id, newName) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not initialized');
    
    getCustomImage(id).then(item => {
      if (!item) return reject('Item not found');
      item.name = newName;
      
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(item);
      
      request.onsuccess = () => resolve(item);
      request.onerror = (e) => reject(e);
    }).catch(reject);
  });
}

export function deleteCustomImage(id) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not initialized');
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}
