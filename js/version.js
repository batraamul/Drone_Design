/**
 * Application identity and version information.
 *
 * APP_VERSION follows semantic versioning and must match package.json,
 * service-worker.js (VERSION) and the top entry of CHANGELOG.md.
 * scripts/check-structure.mjs enforces this.
 */
export const APP_NAME = 'AEROLAB X';
export const APP_TAGLINE = 'Drone Design, Intelligence & Simulation Studio';
export const APP_VERSION = '0.2.2';
export const BUILD_NUMBER = 1;
export const BUILD_NAME = 'Foundation';
export const TOTAL_BUILDS = 12;

/** Canonical hosted location (GitHub Pages project site). */
export const CANONICAL_URL = 'https://batraamul.github.io/Drone_Design/';
export const REPOSITORY_URL = 'https://github.com/batraamul/Drone_Design';

/** Identifiers used in exported files so imports can be recognised and migrated. */
export const PROJECT_FILE_FORMAT = 'aerolab-x/project';
export const BACKUP_FILE_FORMAT = 'aerolab-x/backup';
export const FILE_FORMAT_VERSION = 1;
