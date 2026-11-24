const DB_NAME = 'CCS_CRM_OfflineDB';
const STORE_NAME = 'mock_calls';
const getServerBase = () => (localStorage.getItem('ccs_server_url') || '').replace(/\/+$/, '');
const getAuthHeaders = (extra = {}) => {
  const token = localStorage.getItem('ccs_token') || '';
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains(STORE_NAME)) e.target.result.createObjectStore(STORE_NAME, { keyPath: 'clientCallId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCallLocally(callRecord) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(callRecord);
    tx.oncomplete = () => resolve(callRecord);
    tx.onerror = () => reject(tx.error);
  });
}

async function getLocalCalls(studentEmail) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result || []).filter(c => c.studentEmail.toLowerCase() === studentEmail.toLowerCase()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    req.onerror = () => reject(req.error);
  });
}

async function syncPendingCalls(studentEmail) {
  const pending = (await getLocalCalls(studentEmail)).filter(c => !c.synced);
  if (!navigator.onLine || pending.length === 0) return { synced: 0, pending: pending.length };
  try {
    const res = await fetch(`${getServerBase()}/api/calls/sync`, {
      method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ calls: pending })
    });
    if (!res.ok) throw new Error();
    const { syncedIds } = await res.json();
    for (const call of pending) {
      if (syncedIds.includes(call.clientCallId)) { call.synced = true; await saveCallLocally(call); }
    }
    return { synced: syncedIds.length, pending: 0 };
  } catch { return { synced: 0, pending: pending.length }; }
}

async function deleteLocalCall(clientCallId) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(clientCallId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function clearPendingLocalCalls(studentEmail) {
  const pending = (await getLocalCalls(studentEmail)).filter(c => !c.synced);
  for (const c of pending) await deleteLocalCall(c.clientCallId);
  return pending.length;
}
