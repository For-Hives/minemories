// CLI adapter of the S3 storage of the mod JARs. All the logic (keys, index, retention, idempotence) lives in the
// shared `@minemories/mod-storage` package, also used by the API: the local tool and uploads through the API therefore
// write exactly the same objects. This is the interface used by `release.mjs` and the commands.
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
