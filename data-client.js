// Shared data layer for the Short Form Learning tracker, backed by
// Firebase Firestore. Wraps Firestore so both pages talk to the database
// the same way, using per-document reads/writes instead of one big blob —
// safer when more than one person is editing at the same time.
//
// Firestore stores JSON-like documents, so — unlike the Postgres/Supabase
// version — no field-name mapping is needed. The JS object shape is the
// document shape.

(function () {
  if (!window.firebase || !window.FIREBASE_CONFIG) {
    console.error('Firebase SDK or config missing. Check firebase-config.js and script order.');
    return;
  }

  firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.firestore();
  const col = db.collection('builds');
  const activityCol = db.collection('activity');

  function fromDoc(doc) {
    return { id: doc.id, ...doc.data() };
  }

  function whoAmI() {
    try { return (window.Identity && window.Identity.get()) || 'Unknown'; }
    catch (e) { return 'Unknown'; }
  }

  async function logActivity(action, buildId, buildTitle, details) {
    try {
      await activityCol.add({
        action, buildId, buildTitle: buildTitle || '',
        by: whoAmI(), at: new Date().toISOString(),
        details: details || ''
      });
    } catch (e) {
      // Activity logging should never block the actual save/edit.
      console.error('Could not log activity:', e);
    }
  }

  window.BuildsAPI = {
    async fetchAll() {
      const snap = await col.orderBy('createdAt', 'asc').get();
      return snap.docs.map(fromDoc);
    },

    async fetchOne(id) {
      const doc = await col.doc(id).get();
      return doc.exists ? fromDoc(doc) : null;
    },

    async insert(build) {
      const { id, ...rest } = build;
      if (!rest.createdAt) rest.createdAt = new Date().toISOString();
      rest.createdBy = whoAmI();
      rest.lastEditedBy = whoAmI();
      rest.lastEditedAt = new Date().toISOString();
      await col.doc(id).set(rest);
      logActivity('created', id, rest.title);
    },

    async update(id, patch, detailMsg) {
      const stampedPatch = { ...patch, lastEditedBy: whoAmI(), lastEditedAt: new Date().toISOString() };
      await col.doc(id).update(stampedPatch);
      logActivity('updated', id, patch.title, detailMsg || 'updated details');
    },

    async remove(id, titleForLog) {
      await col.doc(id).delete();
      logActivity('deleted', id, titleForLog);
    },

    // Calls `callback` whenever any document changes (added/modified/removed),
    // from this browser or anyone else's. Returns the unsubscribe function.
    subscribeToChanges(callback) {
      return col.onSnapshot(callback, (err) => console.error('Realtime subscription error:', err));
    },

    // Returns the most recent activity entries, newest first.
    async fetchActivity(limit) {
      const snap = await activityCol.orderBy('at', 'desc').limit(limit || 40).get();
      return snap.docs.map(fromDoc);
    }
  };
})();
