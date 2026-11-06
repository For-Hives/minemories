// Adaptation CLI du stockage S3 des JAR du mod. Toute la logique (clés, index, rétention, idempotence) vit dans le
// paquet partagé `@minemories/mod-storage`, aussi utilisé par l'API : l'outil local et l'envoi via l'API écrivent
// donc exactement les mêmes objets. Cette interface est celle qu'utilisent `release.mjs` et les commandes.
export {
	DEFAULT_MOD_BUCKET,
	emptyIndex,
	INDEX_KEY,
	jarName,
	latestKey,
	PART_SIZE,
	pruneStorage,
	readIndex,
	setPinned,
	setPublished,
	storageReport,
	storageSettings,
	storeRelease,
	validateIndex,
	versionKey,
	versionPrefix,
} from '@minemories/mod-storage'
